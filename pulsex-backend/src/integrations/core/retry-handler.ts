import { sleep } from '../../utils/helpers';
import { RetryConfig } from '../types/common';
import { Logger } from '../../utils/logger';

export interface RetryOptions {
  shouldRetry?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
  maxAttempts?: number;
}

export class RetryHandler {
  private config: Required<RetryConfig>;
  private logger: Logger;

  constructor(config?: RetryConfig) {
    this.config = {
      maxAttempts: config?.maxAttempts || 3,
      baseDelay: config?.baseDelay || 1000,
      maxDelay: config?.maxDelay || 30000,
      backoffMultiplier: config?.backoffMultiplier || 2,
      retryableErrors: config?.retryableErrors || [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'RATE_LIMIT_EXCEEDED',
        'TIMEOUT',
        'NETWORK_ERROR',
      ],
    };

    this.logger = new Logger('RetryHandler');
  }

  /**
   * Execute function with retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const maxAttempts = options.maxAttempts || this.config.maxAttempts;
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Check if we should retry this error
        const shouldRetry = options.shouldRetry
          ? options.shouldRetry(error)
          : this.isRetryableError(error);

        if (!shouldRetry || attempt === maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt);

        this.logger.debug(`Retrying attempt ${attempt}/${maxAttempts} after ${delay}ms`, {
          error: error.message,
          code: error.code,
        });

        // Call onRetry callback if provided
        if (options.onRetry) {
          options.onRetry(attempt, error);
        }

        // Wait before retrying
        await sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (error?.code && this.config.retryableErrors.includes(error.code)) {
      return true;
    }

    if (error?.message && this.config.retryableErrors.some(code =>
      error.message.toUpperCase().includes(code)
    )) {
      return true;
    }

    // Check for specific HTTP status codes
    if (error?.response?.status) {
      const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
      return retryableStatusCodes.includes(error.response.status);
    }

    return false;
  }

  /**
   * Calculate delay with exponential backoff
   */
  private calculateDelay(attempt: number): number {
    const delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;

    return Math.min(delay + jitter, this.config.maxDelay);
  }

  /**
   * Execute with circuit breaker pattern
   */
  async executeWithCircuitBreaker<T>(
    fn: () => Promise<T>,
    circuitBreaker: {
      failureThreshold: number;
      timeout: number;
      halfOpenMaxCalls: number;
    },
    options: RetryOptions = {}
  ): Promise<T> {
    const state = {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed' as 'closed' | 'open' | 'half-open',
      halfOpenCalls: 0,
    };

    return new Promise(async (resolve, reject) => {
      const checkAndExecute = async () => {
        // Check circuit breaker state
        const now = Date.now();

        if (state.state === 'open') {
          if (now - state.lastFailureTime > circuitBreaker.timeout) {
            state.state = 'half-open';
            state.halfOpenCalls = 0;
            this.logger.debug('Circuit breaker transitioning to half-open');
          } else {
            reject(new Error('Circuit breaker is open'));
            return;
          }
        }

        if (state.state === 'half-open' && state.halfOpenCalls >= circuitBreaker.halfOpenMaxCalls) {
          reject(new Error('Circuit breaker half-open limit reached'));
          return;
        }

        try {
          state.halfOpenCalls++;
          const result = await this.execute(fn, options);

          // Success - reset circuit breaker
          if (state.state === 'half-open') {
            state.state = 'closed';
            state.failures = 0;
            this.logger.debug('Circuit breaker closing after successful call');
          }

          resolve(result);

        } catch (error) {
          state.failures++;
          state.lastFailureTime = now;

          // Check if we should open the circuit breaker
          if (state.failures >= circuitBreaker.failureThreshold) {
            state.state = 'open';
            this.logger.warn(`Circuit breaker opened after ${state.failures} failures`, {
              error: error.message,
            });
          }

          reject(error);
        }
      };

      await checkAndExecute();
    });
  }

  /**
   * Create a retryable version of any function
   */
  wrap<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    options: RetryOptions = {}
  ): T {
    return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      return this.execute(() => fn(...args), options);
    }) as T;
  }

  /**
   * Get retry configuration
   */
  getConfig(): Required<RetryConfig> {
    return { ...this.config };
  }

  /**
   * Update retry configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Retry configuration updated', { config: this.config });
  }
}