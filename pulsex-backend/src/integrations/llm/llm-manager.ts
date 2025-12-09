import { OpenAIClient } from './openai/client';
import { AnthropicClient } from './anthropic/client';
import {
  LLMProvider,
  LLMModel,
  LLMRequest,
  LLMResponse,
  LoadBalancingConfig,
  ProviderConfig,
  ContentGenerationRequest,
  ContentGenerationResult,
  LLMPerformanceMetrics,
} from '../types/llm';
import { Logger } from '../../utils/logger';
import { ConfigManager } from '../core/config';

export interface LLMManagerConfig {
  primaryProvider: LLMProvider;
  fallbackProviders: LLMProvider[];
  loadBalancing?: LoadBalancingConfig;
  costOptimization: {
    enabled: boolean;
    maxCostPerRequest: number;
    preferCheaperForSimpleTasks: boolean;
  };
  performanceOptimization: {
    enabled: boolean;
    cacheResults: boolean;
    useFastModelForDrafts: boolean;
  };
}

export class LLMManager {
  private config: LLMManagerConfig;
  private clients: Map<LLMProvider, OpenAIClient | AnthropicClient>;
  private metrics: Map<LLMProvider, LLMPerformanceMetrics>;
  private circuitBreakers: Map<LLMProvider, {
    failures: number;
    lastFailure: number;
    state: 'closed' | 'open' | 'half-open';
  }>;
  private logger: Logger;

  constructor(config?: Partial<LLMManagerConfig>) {
    this.logger = new Logger('LLMManager');
    this.clients = new Map();
    this.metrics = new Map();
    this.circuitBreakers = new Map();

    // Initialize configuration
    const configManager = ConfigManager.getInstance();
    this.config = {
      primaryProvider: 'openai',
      fallbackProviders: ['anthropic'],
      loadBalancing: {
        strategy: 'cost_optimized',
        providers: [
          {
            provider: 'openai',
            model: 'gpt-4-turbo-preview',
            weight: 0.5,
            maxRequestsPerMinute: 600,
            maxCostPerHour: 10,
            enabled: configManager.isIntegrationEnabled('openai'),
          },
          {
            provider: 'anthropic',
            model: 'claude-3-sonnet-20240229',
            weight: 0.5,
            maxRequestsPerMinute: 300,
            maxCostPerHour: 10,
            enabled: configManager.isIntegrationEnabled('anthropic'),
          },
        ],
        healthCheck: {
          enabled: true,
          interval: 60000,
          timeout: 5000,
          unhealthyThreshold: 3,
          healthyThreshold: 2,
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          timeout: 60000,
          halfOpenMaxCalls: 3,
        },
      },
      costOptimization: {
        enabled: true,
        maxCostPerRequest: 0.1,
        preferCheaperForSimpleTasks: true,
      },
      performanceOptimization: {
        enabled: true,
        cacheResults: true,
        useFastModelForDrafts: true,
      },
      ...config,
    };

    this.initializeClients();
    this.initializeMetrics();
    this.startHealthChecks();
  }

  /**
   * Initialize LLM clients
   */
  private initializeClients(): void {
    // Initialize OpenAI client
    if (this.isProviderEnabled('openai')) {
      this.clients.set('openai', new OpenAIClient());
      this.logger.info('OpenAI client initialized');
    }

    // Initialize Anthropic client
    if (this.isProviderEnabled('anthropic')) {
      this.clients.set('anthropic', new AnthropicClient());
      this.logger.info('Anthropic client initialized');
    }

    // Initialize circuit breakers
    const allProviders = [this.config.primaryProvider, ...this.config.fallbackProviders];
    for (const provider of allProviders) {
      this.circuitBreakers.set(provider, {
        failures: 0,
        lastFailure: 0,
        state: 'closed',
      });
    }
  }

  /**
   * Initialize performance metrics
   */
  private initializeMetrics(): void {
    const allProviders = [this.config.primaryProvider, ...this.config.fallbackProviders];
    for (const provider of allProviders) {
      this.metrics.set(provider, {
        provider,
        model: '',
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        totalTokens: 0,
        averageTokensPerRequest: 0,
        totalCost: 0,
        averageCostPerRequest: 0,
        errorRate: 0,
        lastReset: new Date().toISOString(),
      });
    }
  }

  /**
   * Start health check monitoring
   */
  private startHealthChecks(): void {
    if (!this.config.loadBalancing?.healthCheck?.enabled) {
      return;
    }

    const interval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.loadBalancing.healthCheck.interval);

    // Prevent interval from keeping process alive
    interval.unref();
  }

  /**
   * Perform health checks on all providers
   */
  private async performHealthChecks(): Promise<void> {
    for (const [provider, client] of this.clients.entries()) {
      try {
        const health = await client.healthCheck();
        const circuitBreaker = this.circuitBreakers.get(provider)!;

        if (health.status === 'healthy') {
          // Reset failures if provider is healthy
          if (circuitBreaker.state === 'open') {
            circuitBreaker.state = 'half-open';
          } else if (circuitBreaker.state === 'half-open') {
            circuitBreaker.failures = 0;
            circuitBreaker.state = 'closed';
          }
        } else {
          // Increment failures for unhealthy provider
          circuitBreaker.failures++;
          circuitBreaker.lastFailure = Date.now();

          if (circuitBreaker.failures >= (this.config.loadBalancing?.circuitBreaker?.failureThreshold || 5)) {
            circuitBreaker.state = 'open';
          }
        }

      } catch (error) {
        this.logger.warn(`Health check failed for ${provider}`, { error: error.message });
        const circuitBreaker = this.circuitBreakers.get(provider)!;
        circuitBreaker.failures++;
        circuitBreaker.lastFailure = Date.now();
      }
    }
  }

  /**
   * Generate text with load balancing and fallback
   */
  async generateText(request: LLMRequest): Promise<LLMResponse> {
    const providers = this.getProviderOrder(request);

    let lastError: any;

    for (const provider of providers) {
      if (!this.isProviderAvailable(provider)) {
        this.logger.debug(`Skipping unavailable provider: ${provider}`);
        continue;
      }

      try {
        const client = this.clients.get(provider);
        if (!client) {
          continue;
        }

        // Update request with provider-specific model if needed
        const providerRequest = this.adaptRequestForProvider(request, provider);

        const startTime = Date.now();
        const response = await client.generateText(providerRequest);
        const responseTime = Date.now() - startTime;

        // Update metrics
        this.updateMetrics(provider, responseTime, true, response);

        this.logger.info(`Text generation successful with ${provider}`, {
          model: response.data.model,
          tokens: response.data.usage.totalTokens,
          cost: response.data.costTracking.requestCost,
        });

        return response;

      } catch (error) {
        lastError = error;
        this.updateMetrics(provider, 0, false, undefined, error);
        this.logger.warn(`Text generation failed with ${provider}`, {
          error: error.message,
        });

        // Update circuit breaker
        this.handleProviderFailure(provider);
      }
    }

    this.logger.error('All providers failed for text generation', {
      providersTried: providers,
      lastError: lastError?.message,
    });

    throw lastError || new Error('All LLM providers failed');
  }

  /**
   * Generate content with cost optimization
   */
  async generateContent(request: ContentGenerationRequest): Promise<ContentGenerationResult> {
    // Choose optimal provider based on content type and cost constraints
    const optimalProvider = this.selectOptimalProvider(request);

    const providers = [optimalProvider, ...this.config.fallbackProviders.filter(p => p !== optimalProvider)];

    let lastError: any;

    for (const provider of providers) {
      if (!this.isProviderAvailable(provider)) {
        continue;
      }

      try {
        const client = this.clients.get(provider);
        if (!client) {
          continue;
        }

        const startTime = Date.now();
        const result = await client.generateContent(request);
        const responseTime = Date.now() - startTime;

        this.logger.info(`Content generation successful with ${provider}`, {
          type: request.type,
          generationTime: responseTime,
          cost: result.metadata.cost,
        });

        return result;

      } catch (error) {
        lastError = error;
        this.logger.warn(`Content generation failed with ${provider}`, {
          error: error.message,
        });
        this.handleProviderFailure(provider);
      }
    }

    throw lastError || new Error('All LLM providers failed for content generation');
  }

  /**
   * Get optimal provider order based on strategy
   */
  private getProviderOrder(request: LLMRequest): LLMProvider[] {
    if (!this.config.loadBalancing) {
      return [this.config.primaryProvider, ...this.config.fallbackProviders];
    }

    switch (this.config.loadBalancing.strategy) {
      case 'round_robin':
        return this.getRoundRobinOrder();
      case 'weighted':
        return this.getWeightedOrder();
      case 'cost_optimized':
        return this.getCostOptimizedOrder(request);
      case 'performance_based':
        return this.getPerformanceBasedOrder();
      default:
        return [this.config.primaryProvider, ...this.config.fallbackProviders];
    }
  }

  /**
   * Get round-robin provider order
   */
  private getRoundRobinOrder(): LLMProvider[] {
    const providers = [this.config.primaryProvider, ...this.config.fallbackProviders];
    const index = Date.now() % providers.length;
    return [...providers.slice(index), ...providers.slice(0, index)];
  }

  /**
   * Get weighted provider order
   */
  private getWeightedOrder(): LLMProvider[] {
    const providers = this.config.loadBalancing.providers
      .filter(p => p.enabled && this.isProviderAvailable(p.provider))
      .sort((a, b) => b.weight - a.weight);

    return providers.map(p => p.provider);
  }

  /**
   * Get cost-optimized provider order
   */
  private getCostOptimizedOrder(request: LLMRequest): LLMProvider[] {
    const providers = this.config.loadBalancing.providers
      .filter(p => p.enabled && this.isProviderAvailable(p.provider))
      .sort((a, b) => {
        const costA = this.getEstimatedCost(a.provider, request);
        const costB = this.getEstimatedCost(b.provider, request);
        return costA - costB;
      });

    return providers.map(p => p.provider);
  }

  /**
   * Get performance-based provider order
   */
  private getPerformanceBasedOrder(): LLMProvider[] {
    const providers = this.config.loadBalancing.providers
      .filter(p => p.enabled && this.isProviderAvailable(p.provider))
      .sort((a, b) => {
        const metricsA = this.metrics.get(a.provider);
        const metricsB = this.metrics.get(b.provider);

        if (!metricsA) return 1;
        if (!metricsB) return -1;

        // Sort by success rate and average response time
        const scoreA = (metricsA.successfulRequests / metricsA.totalRequests) - (metricsA.averageResponseTime / 10000);
        const scoreB = (metricsB.successfulRequests / metricsB.totalRequests) - (metricsB.averageResponseTime / 10000);

        return scoreB - scoreA;
      });

    return providers.map(p => p.provider);
  }

  /**
   * Select optimal provider for content generation
   */
  private selectOptimalProvider(request: ContentGenerationRequest): LLMProvider {
    // Use cost optimization for simple tasks
    if (this.config.costOptimization.preferCheaperForSimpleTasks && request.type === 'news_summary') {
      return 'anthropic'; // Claude is typically cheaper for simple summaries
    }

    // Use performance optimization for complex tasks
    if (request.type === 'crypto_analysis' || request.type === 'political_briefing') {
      return 'openai'; // GPT-4 typically better for complex analysis
    }

    return this.config.primaryProvider;
  }

  /**
   * Adapt request for specific provider
   */
  private adaptRequestForProvider(request: LLMRequest, provider: LLMProvider): LLMRequest {
    const adapted = { ...request };

    // Adjust model if needed
    if (!request.model || !this.isModelAvailableForProvider(request.model, provider)) {
      adapted.model = this.getDefaultModelForProvider(provider);
    }

    return adapted;
  }

  /**
   * Check if provider is available
   */
  private isProviderAvailable(provider: LLMProvider): boolean {
    const circuitBreaker = this.circuitBreakers.get(provider);
    if (!circuitBreaker) return false;

    if (circuitBreaker.state === 'open') {
      // Check if circuit breaker should reset
      const timeout = this.config.loadBalancing?.circuitBreaker?.timeout || 60000;
      if (Date.now() - circuitBreaker.lastFailure > timeout) {
        circuitBreaker.state = 'half-open';
        return true;
      }
      return false;
    }

    return this.clients.has(provider);
  }

  /**
   * Check if provider is enabled
   */
  private isProviderEnabled(provider: LLMProvider): boolean {
    const configManager = ConfigManager.getInstance();
    return configManager.isIntegrationEnabled(provider);
  }

  /**
   * Check if model is available for provider
   */
  private isModelAvailableForProvider(model: string, provider: LLMProvider): boolean {
    // This would be expanded with actual model availability checking
    return true;
  }

  /**
   * Get default model for provider
   */
  private getDefaultModelForProvider(provider: LLMProvider): LLMModel {
    const defaults = {
      openai: 'gpt-4-turbo-preview' as LLMModel,
      anthropic: 'claude-3-sonnet-20240229' as LLMModel,
    };

    return defaults[provider] || defaults.openai;
  }

  /**
   * Get estimated cost for request
   */
  private getEstimatedCost(provider: LLMProvider, request: LLMRequest): number {
    // Rough estimation based on provider pricing
    const costs = {
      openai: 0.00003, // ~$0.03 per 1K tokens
      anthropic: 0.00002, // ~$0.02 per 1K tokens
    };

    const estimatedTokens = this.estimateTokens(request);
    return (estimatedTokens / 1000) * (costs[provider] || 0);
  }

  /**
   * Estimate token count for request
   */
  private estimateTokens(request: LLMRequest): number {
    let totalChars = 0;

    for (const message of request.messages) {
      if (typeof message.content === 'string') {
        totalChars += message.content.length;
      }
    }

    // Rough estimation: ~4 chars per token
    return Math.ceil(totalChars / 4);
  }

  /**
   * Update provider metrics
   */
  private updateMetrics(
    provider: LLMProvider,
    responseTime: number,
    success: boolean,
    response?: LLMResponse,
    error?: any
  ): void {
    const metrics = this.metrics.get(provider);
    if (!metrics) return;

    metrics.totalRequests++;

    if (success && response) {
      metrics.successfulRequests++;
      metrics.averageResponseTime =
        (metrics.averageResponseTime * (metrics.successfulRequests - 1) + responseTime) /
        metrics.successfulRequests;

      if (response.data.usage) {
        metrics.totalTokens += response.data.usage.totalTokens;
        metrics.averageTokensPerRequest = metrics.totalTokens / metrics.successfulRequests;
      }

      if (response.data.costTracking) {
        metrics.totalCost += response.data.costTracking.requestCost;
        metrics.averageCostPerRequest = metrics.totalCost / metrics.successfulRequests;
      }
    } else {
      metrics.failedRequests++;
    }

    metrics.errorRate = metrics.failedRequests / metrics.totalRequests;
  }

  /**
   * Handle provider failure
   */
  private handleProviderFailure(provider: LLMProvider): void {
    const circuitBreaker = this.circuitBreakers.get(provider);
    if (!circuitBreaker) return;

    circuitBreaker.failures++;
    circuitBreaker.lastFailure = Date.now();

    const threshold = this.config.loadBalancing?.circuitBreaker?.failureThreshold || 5;
    if (circuitBreaker.failures >= threshold) {
      circuitBreaker.state = 'open';
      this.logger.warn(`Circuit breaker opened for ${provider}`, {
        failures: circuitBreaker.failures,
      });
    }
  }

  /**
   * Get performance metrics for all providers
   */
  getMetrics(): Map<LLMProvider, LLMPerformanceMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Get provider health status
   */
  getProviderHealth(): Record<string, {
    available: boolean;
    circuitBreakerState: string;
    metrics?: LLMPerformanceMetrics;
  }> {
    const health: Record<string, any> = {};

    for (const provider of [this.config.primaryProvider, ...this.config.fallbackProviders]) {
      health[provider] = {
        available: this.isProviderAvailable(provider),
        circuitBreakerState: this.circuitBreakers.get(provider)?.state || 'closed',
        metrics: this.metrics.get(provider),
      };
    }

    return health;
  }

  /**
   * Reset metrics for all providers
   */
  resetMetrics(): void {
    for (const metrics of this.metrics.values()) {
      metrics.totalRequests = 0;
      metrics.successfulRequests = 0;
      metrics.failedRequests = 0;
      metrics.averageResponseTime = 0;
      metrics.totalTokens = 0;
      metrics.averageTokensPerRequest = 0;
      metrics.totalCost = 0;
      metrics.averageCostPerRequest = 0;
      metrics.errorRate = 0;
      metrics.lastReset = new Date().toISOString();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LLMManagerConfig>): void {
    this.config = { ...this.config, ...config };

    // Reinitialize clients if needed
    if (config.primaryProvider || config.fallbackProviders) {
      this.initializeClients();
    }
  }
}