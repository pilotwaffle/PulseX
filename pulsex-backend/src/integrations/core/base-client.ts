import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  IntegrationConfig,
  BaseApiResponse,
  RetryConfig,
  CacheConfig,
  RateLimitConfig,
  ServiceMetrics,
  HealthCheckResult,
  IntegrationError,
  RateLimitError,
  AuthenticationError,
  QuotaExceededError
} from '../types/common';
import { CacheManager } from './cache-manager';
import { RetryHandler } from './retry-handler';
import { RateLimiter } from './rate-limiter';
import { ErrorHandler } from './error-handler';
import { CostTracker } from '../monitoring/cost-tracker';
import { Logger } from '../../utils/logger';

export abstract class BaseClient {
  protected axios: AxiosInstance;
  protected config: IntegrationConfig;
  protected cache: CacheManager;
  protected retryHandler: RetryHandler;
  protected rateLimiter: RateLimiter;
  protected errorHandler: ErrorHandler;
  protected costTracker: CostTracker;
  protected logger: Logger;
  protected metrics: ServiceMetrics;

  constructor(config: IntegrationConfig) {
    this.config = config;
    this.logger = new Logger(`${config.name}-client`);

    // Initialize axios instance
    this.axios = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `PulseX/1.0 (${config.name}-client)`,
      },
    });

    // Setup request interceptor for API key
    this.axios.interceptors.request.use(
      (config) => {
        config.headers['X-API-Key'] = this.config.apiKey;
        config.headers['X-Request-ID'] = uuidv4();
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Initialize components
    this.cache = new CacheManager(config.cache);
    this.retryHandler = new RetryHandler(config.retry);
    this.rateLimiter = new RateLimiter(config.rateLimit);
    this.errorHandler = new ErrorHandler(config.name);
    this.costTracker = new CostTracker(config.name);

    // Initialize metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      totalCost: 0,
      lastReset: new Date().toISOString(),
    };

    this.logger.info(`Initialized ${config.name} client`, {
      enabled: config.enabled,
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      cacheEnabled: !!config.cache?.enabled,
      retryEnabled: !!config.retry,
      rateLimitEnabled: !!config.rateLimit,
    });
  }

  /**
   * Make HTTP request with retry, caching, and rate limiting
   */
  protected async request<T = any>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      params?: Record<string, any>;
      data?: any;
      headers?: Record<string, string>;
      useCache?: boolean;
      cacheKey?: string;
      skipRateLimit?: boolean;
    } = {}
  ): Promise<BaseApiResponse<T>> {
    const {
      method = 'GET',
      params,
      data,
      headers,
      useCache = true,
      cacheKey,
      skipRateLimit = false,
    } = options;

    const requestId = uuidv4();
    const startTime = Date.now();

    try {
      // Check cache first
      if (useCache && method === 'GET') {
        const cacheResult = await this.checkCache<T>(cacheKey || `${method}:${endpoint}:${JSON.stringify(params)}`);
        if (cacheResult) {
          this.logger.debug('Cache hit', { requestId, endpoint });
          return {
            ...cacheResult,
            metadata: {
              ...cacheResult.metadata,
              cached: true,
            },
          };
        }
      }

      // Check rate limits
      if (!skipRateLimit) {
        await this.rateLimiter.checkLimit();
      }

      // Update metrics
      this.metrics.totalRequests++;

      // Make request with retry logic
      const response = await this.retryHandler.execute(
        () => this.makeRequest<T>(endpoint, method, params, data, headers, requestId),
        {
          shouldRetry: (error) => this.shouldRetryError(error),
          onRetry: (attempt, error) => {
            this.logger.warn(`Request retry attempt ${attempt}`, {
              requestId,
              endpoint,
              error: error.message,
            });
          },
        }
      );

      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, true);

      // Cache successful GET requests
      if (useCache && method === 'GET' && response.success) {
        await this.cache.set(
          cacheKey || `${method}:${endpoint}:${JSON.stringify(params)}`,
          response,
          this.config.cache?.ttl || 300
        );
      }

      // Log success
      this.logger.debug('Request successful', {
        requestId,
        endpoint,
        responseTime,
        cached: false,
      });

      return response;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, false);

      // Handle and log errors
      const handledError = this.errorHandler.handle(error, requestId, endpoint);

      this.logger.error('Request failed', {
        requestId,
        endpoint,
        responseTime,
        error: handledError.message,
        code: handledError.code,
      });

      // Return error response or throw
      if (handledError instanceof IntegrationError) {
        throw handledError;
      }

      throw handledError;
    }
  }

  /**
   * Make actual HTTP request
   */
  private async makeRequest<T>(
    endpoint: string,
    method: string,
    params?: Record<string, any>,
    data?: any,
    headers?: Record<string, string>,
    requestId?: string
  ): Promise<BaseApiResponse<T>> {
    try {
      const response: AxiosResponse = await this.axios.request({
        url: endpoint,
        method,
        params,
        data,
        headers: {
          ...headers,
          'X-Request-ID': requestId,
        },
      });

      // Track costs if applicable
      if (this.config.costTracking) {
        await this.costTracker.trackRequest(response);
      }

      return {
        success: true,
        data: response.data,
        metadata: {
          requestId: requestId!,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - Date.now(),
          cached: false,
        },
      };

    } catch (error) {
      if (error instanceof AxiosError) {
        const statusCode = error.response?.status;
        const errorData = error.response?.data;

        // Handle specific HTTP status codes
        switch (statusCode) {
          case 401:
            throw new AuthenticationError(this.config.name);
          case 429:
            const retryAfter = error.response?.headers['retry-after'];
            throw new RateLimitError(this.config.name, retryAfter ? parseInt(retryAfter) : undefined);
          case 402:
            throw new QuotaExceededError(this.config.name, 'payment_required');
        }

        return {
          success: false,
          error: {
            code: errorData?.code || `HTTP_${statusCode}` || 'UNKNOWN_ERROR',
            message: errorData?.message || error.message || 'Unknown error',
            details: errorData,
          },
          metadata: {
            requestId: requestId!,
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - Date.now(),
          },
        };
      }
      throw error;
    }
  }

  /**
   * Check cache for response
   */
  private async checkCache<T>(key: string): Promise<BaseApiResponse<T> | null> {
    if (!this.config.cache?.enabled) {
      return null;
    }

    try {
      return await this.cache.get<BaseApiResponse<T>>(key);
    } catch (error) {
      this.logger.warn('Cache check failed', { key, error: error.message });
      return null;
    }
  }

  /**
   * Determine if error should be retried
   */
  private shouldRetryError(error: any): boolean {
    if (error instanceof RateLimitError) {
      return true;
    }

    if (error instanceof AuthenticationError || error instanceof QuotaExceededError) {
      return false;
    }

    if (error instanceof AxiosError) {
      const statusCode = error.response?.status;
      return [408, 429, 500, 502, 503, 504].includes(statusCode || 0);
    }

    return this.config.retry?.retryableErrors?.includes(error.code) || false;
  }

  /**
   * Update service metrics
   */
  private updateMetrics(responseTime: number, success: boolean): void {
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Update average response time
    const totalRequests = this.metrics.totalRequests;
    const currentAvg = this.metrics.averageResponseTime;
    this.metrics.averageResponseTime = (currentAvg * (totalRequests - 1) + responseTime) / totalRequests;
  }

  /**
   * Get service health status
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Implement basic health check - override in subclasses for specific endpoints
      await this.axios.get('/health', { timeout: 5000 });

      return {
        status: 'healthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        errorRate: this.metrics.totalRequests > 0
          ? this.metrics.failedRequests / this.metrics.totalRequests
          : 0,
      };

    } catch (error) {
      const errorRate = this.metrics.totalRequests > 0
        ? this.metrics.failedRequests / this.metrics.totalRequests
        : 0;

      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (errorRate < 0.1) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        status,
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        errorRate,
        details: {
          error: error.message,
          totalRequests: this.metrics.totalRequests,
          failedRequests: this.metrics.failedRequests,
        },
      };
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): ServiceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      totalCost: 0,
      lastReset: new Date().toISOString(),
    };
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    if (this.cache) {
      await this.cache.clear();
    }
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable/disable service
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.logger.info(`${this.config.name} client ${enabled ? 'enabled' : 'disabled'}`);
  }
}