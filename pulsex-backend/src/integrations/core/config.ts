import { IntegrationConfig, RateLimitConfig, RetryConfig, CacheConfig } from '../types/common';

export interface GlobalConfig {
  environment: 'development' | 'staging' | 'production';
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  defaultTimeout: number;
  enableMetrics: boolean;
  enableHealthChecks: boolean;
  costTracking: {
    enabled: boolean;
    alertThreshold: number;
    dailyBudget?: number;
  };
}

export class ConfigManager {
  private static instance: ConfigManager;
  private globalConfig: GlobalConfig;
  private integrationConfigs: Map<string, IntegrationConfig> = new Map();

  private constructor() {
    this.initializeGlobalConfig();
    this.initializeIntegrationConfigs();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Initialize global configuration
   */
  private initializeGlobalConfig(): void {
    this.globalConfig = {
      environment: (process.env.NODE_ENV as any) || 'development',
      logLevel: (process.env.LOG_LEVEL as any) || 'info',
      defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '30000'),
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
      enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
      costTracking: {
        enabled: process.env.ENABLE_COST_TRACKING !== 'false',
        alertThreshold: parseFloat(process.env.COST_ALERT_THRESHOLD || '100'),
        dailyBudget: process.env.DAILY_BUDGET ? parseFloat(process.env.DAILY_BUDGET) : undefined,
      },
    };
  }

  /**
   * Initialize integration-specific configurations
   */
  private initializeIntegrationConfigs(): void {
    // OpenAI Configuration
    this.integrationConfigs.set('openai', {
      name: 'openai',
      enabled: process.env.OPENAI_ENABLED !== 'false',
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: 'https://api.openai.com/v1',
      timeout: parseInt(process.env.OPENAI_TIMEOUT || '60000'),
      cache: {
        enabled: process.env.OPENAI_CACHE_ENABLED !== 'false',
        ttl: parseInt(process.env.OPENAI_CACHE_TTL || '300'),
        key: 'openai',
      },
      retry: {
        maxAttempts: parseInt(process.env.OPENAI_RETRY_ATTEMPTS || '3'),
        baseDelay: parseInt(process.env.OPENAI_RETRY_BASE_DELAY || '1000'),
        maxDelay: parseInt(process.env.OPENAI_RETRY_MAX_DELAY || '30000'),
        backoffMultiplier: parseFloat(process.env.OPENAI_RETRY_BACKOFF_MULTIPLIER || '2'),
        retryableErrors: ['rate_limit_exceeded', 'timeout', 'server_error'],
      },
      rateLimit: {
        requestsPerSecond: parseInt(process.env.OPENAI_RPS || '10'),
        requestsPerMinute: parseInt(process.env.OPENAI_RPM || '600'),
        requestsPerHour: parseInt(process.env.OPENAI_RPH || '36000'),
        requestsPerDay: parseInt(process.env.OPENAI_RPD || '864000'),
        burstLimit: parseInt(process.env.OPENAI_BURST_LIMIT || '20'),
      },
      costTracking: true,
      healthCheck: {
        enabled: true,
        interval: parseInt(process.env.OPENAI_HEALTH_CHECK_INTERVAL || '60000'),
        endpoint: '/models',
      },
    });

    // Anthropic Configuration
    this.integrationConfigs.set('anthropic', {
      name: 'anthropic',
      enabled: process.env.ANTHROPIC_ENABLED !== 'false',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      baseUrl: 'https://api.anthropic.com',
      timeout: parseInt(process.env.ANTHROPIC_TIMEOUT || '60000'),
      cache: {
        enabled: process.env.ANTHROPIC_CACHE_ENABLED !== 'false',
        ttl: parseInt(process.env.ANTHROPIC_CACHE_TTL || '300'),
        key: 'anthropic',
      },
      retry: {
        maxAttempts: parseInt(process.env.ANTHROPIC_RETRY_ATTEMPTS || '3'),
        baseDelay: parseInt(process.env.ANTHROPIC_RETRY_BASE_DELAY || '1000'),
        maxDelay: parseInt(process.env.ANTHROPIC_RETRY_MAX_DELAY || '30000'),
        backoffMultiplier: parseFloat(process.env.ANTHROPIC_RETRY_BACKOFF_MULTIPLIER || '2'),
        retryableErrors: ['rate_limit_exceeded', 'timeout', 'server_error'],
      },
      rateLimit: {
        requestsPerSecond: parseInt(process.env.ANTHROPIC_RPS || '5'),
        requestsPerMinute: parseInt(process.env.ANTHROPIC_RPM || '300'),
        requestsPerHour: parseInt(process.env.ANTHROPIC_RPH || '18000'),
        requestsPerDay: parseInt(process.env.ANTHROPIC_RPD || '432000'),
        burstLimit: parseInt(process.env.ANTHROPIC_BURST_LIMIT || '10'),
      },
      costTracking: true,
      healthCheck: {
        enabled: true,
        interval: parseInt(process.env.ANTHROPIC_HEALTH_CHECK_INTERVAL || '60000'),
        endpoint: '/v1/messages',
      },
    });

    // NewsAPI Configuration
    this.integrationConfigs.set('newsapi', {
      name: 'newsapi',
      enabled: process.env.NEWSAPI_ENABLED !== 'false',
      apiKey: process.env.NEWSAPI_API_KEY || '',
      baseUrl: 'https://newsapi.org/v2',
      timeout: parseInt(process.env.NEWSAPI_TIMEOUT || '30000'),
      cache: {
        enabled: process.env.NEWSAPI_CACHE_ENABLED !== 'false',
        ttl: parseInt(process.env.NEWSAPI_CACHE_TTL || '600'),
        key: 'newsapi',
      },
      retry: {
        maxAttempts: parseInt(process.env.NEWSAPI_RETRY_ATTEMPTS || '3'),
        baseDelay: parseInt(process.env.NEWSAPI_RETRY_BASE_DELAY || '1000'),
        maxDelay: parseInt(process.env.NEWSAPI_RETRY_MAX_DELAY || '30000'),
        backoffMultiplier: parseFloat(process.env.NEWSAPI_RETRY_BACKOFF_MULTIPLIER || '2'),
        retryableErrors: ['rateLimited', 'timeout', 'server_error'],
      },
      rateLimit: {
        requestsPerSecond: parseInt(process.env.NEWSAPI_RPS || '5'),
        requestsPerMinute: parseInt(process.env.NEWSAPI_RPM || '300'),
        requestsPerHour: parseInt(process.env.NEWSAPI_RPH || '18000'),
        requestsPerDay: parseInt(process.env.NEWSAPI_RPD || '1000'),
        burstLimit: parseInt(process.env.NEWSAPI_BURST_LIMIT || '10'),
      },
      costTracking: true,
      healthCheck: {
        enabled: true,
        interval: parseInt(process.env.NEWSAPI_HEALTH_CHECK_INTERVAL || '300000'),
        endpoint: '/top-headlines',
      },
    });

    // Guardian API Configuration
    this.integrationConfigs.set('guardian', {
      name: 'guardian',
      enabled: process.env.GUARDIAN_ENABLED !== 'false',
      apiKey: process.env.GUARDIAN_API_KEY || '',
      baseUrl: 'https://content.guardianapis.com',
      timeout: parseInt(process.env.GUARDIAN_TIMEOUT || '30000'),
      cache: {
        enabled: process.env.GUARDIAN_CACHE_ENABLED !== 'false',
        ttl: parseInt(process.env.GUARDIAN_CACHE_TTL || '600'),
        key: 'guardian',
      },
      retry: {
        maxAttempts: parseInt(process.env.GUARDIAN_RETRY_ATTEMPTS || '3'),
        baseDelay: parseInt(process.env.GUARDIAN_RETRY_BASE_DELAY || '1000'),
        maxDelay: parseInt(process.env.GUARDIAN_RETRY_MAX_DELAY || '30000'),
        backoffMultiplier: parseFloat(process.env.GUARDIAN_RETRY_BACKOFF_MULTIPLIER || '2'),
        retryableErrors: ['rateLimited', 'timeout', 'server_error'],
      },
      rateLimit: {
        requestsPerSecond: parseInt(process.env.GUARDIAN_RPS || '5'),
        requestsPerMinute: parseInt(process.env.GUARDIAN_RPM || '300'),
        requestsPerHour: parseInt(process.env.GUARDIAN_RPH || '18000'),
        requestsPerDay: parseInt(process.env.GUARDIAN_RPD || '5000'),
        burstLimit: parseInt(process.env.GUARDIAN_BURST_LIMIT || '10'),
      },
      costTracking: true,
      healthCheck: {
        enabled: true,
        interval: parseInt(process.env.GUARDIAN_HEALTH_CHECK_INTERVAL || '300000'),
        endpoint: '/search',
      },
    });

    // CoinGecko Configuration
    this.integrationConfigs.set('coingecko', {
      name: 'coingecko',
      enabled: process.env.COINGECKO_ENABLED !== 'false',
      apiKey: process.env.COINGECKO_API_KEY || '',
      baseUrl: 'https://api.coingecko.com/api/v3',
      timeout: parseInt(process.env.COINGECKO_TIMEOUT || '30000'),
      cache: {
        enabled: process.env.COINGECKO_CACHE_ENABLED !== 'false',
        ttl: parseInt(process.env.COINGECKO_CACHE_TTL || '60'),
        key: 'coingecko',
      },
      retry: {
        maxAttempts: parseInt(process.env.COINGECKO_RETRY_ATTEMPTS || '3'),
        baseDelay: parseInt(process.env.COINGECKO_RETRY_BASE_DELAY || '1000'),
        maxDelay: parseInt(process.env.COINGECKO_RETRY_MAX_DELAY || '30000'),
        backoffMultiplier: parseFloat(process.env.COINGECKO_RETRY_BACKOFF_MULTIPLIER || '2'),
        retryableErrors: ['rate_limit_exceeded', 'timeout', 'server_error'],
      },
      rateLimit: {
        requestsPerSecond: parseInt(process.env.COINGECKO_RPS || '10'),
        requestsPerMinute: parseInt(process.env.COINGECKO_RPM || '600'),
        requestsPerHour: parseInt(process.env.COINGECKO_RPH || '36000'),
        requestsPerDay: parseInt(process.env.COINGECKO_RPD || '10000'),
        burstLimit: parseInt(process.env.COINGECKO_BURST_LIMIT || '20'),
      },
      costTracking: true,
      healthCheck: {
        enabled: true,
        interval: parseInt(process.env.COINGECKO_HEALTH_CHECK_INTERVAL || '300000'),
        endpoint: '/ping',
      },
    });

    // CoinMarketCap Configuration
    this.integrationConfigs.set('coinmarketcap', {
      name: 'coinmarketcap',
      enabled: process.env.COINMARKETCAP_ENABLED !== 'false',
      apiKey: process.env.COINMARKETCAP_API_KEY || '',
      baseUrl: 'https://pro-api.coinmarketcap.com/v1',
      timeout: parseInt(process.env.COINMARKETCAP_TIMEOUT || '30000'),
      cache: {
        enabled: process.env.COINMARKETCAP_CACHE_ENABLED !== 'false',
        ttl: parseInt(process.env.COINMARKETCAP_CACHE_TTL || '60'),
        key: 'coinmarketcap',
      },
      retry: {
        maxAttempts: parseInt(process.env.COINMARKETCAP_RETRY_ATTEMPTS || '3'),
        baseDelay: parseInt(process.env.COINMARKETCAP_RETRY_BASE_DELAY || '1000'),
        maxDelay: parseInt(process.env.COINMARKETCAP_RETRY_MAX_DELAY || '30000'),
        backoffMultiplier: parseFloat(process.env.COINMARKETCAP_RETRY_BACKOFF_MULTIPLIER || '2'),
        retryableErrors: ['rate_limit_exceeded', 'timeout', 'server_error'],
      },
      rateLimit: {
        requestsPerSecond: parseInt(process.env.COINMARKETCAP_RPS || '5'),
        requestsPerMinute: parseInt(process.env.COINMARKETCAP_RPM || '300'),
        requestsPerHour: parseInt(process.env.COINMARKETCAP_RPH || '18000'),
        requestsPerDay: parseInt(process.env.COINMARKETCAP_RPD || '5000'),
        burstLimit: parseInt(process.env.COINMARKETCAP_BURST_LIMIT || '10'),
      },
      costTracking: true,
      healthCheck: {
        enabled: true,
        interval: parseInt(process.env.COINMARKETCAP_HEALTH_CHECK_INTERVAL || '300000'),
        endpoint: '/cryptocurrency/map',
      },
    });

    // PostHog Configuration
    this.integrationConfigs.set('posthog', {
      name: 'posthog',
      enabled: process.env.POSTHOG_ENABLED !== 'false',
      apiKey: process.env.POSTHOG_API_KEY || '',
      baseUrl: process.env.POSTHOG_HOST || 'https://app.posthog.com',
      timeout: parseInt(process.env.POSTHOG_TIMEOUT || '10000'),
      cache: {
        enabled: false, // Analytics usually shouldn't be cached
        ttl: 0,
        key: 'posthog',
      },
      retry: {
        maxAttempts: parseInt(process.env.POSTHOG_RETRY_ATTEMPTS || '2'),
        baseDelay: parseInt(process.env.POSTHOG_RETRY_BASE_DELAY || '1000'),
        maxDelay: parseInt(process.env.POSTHOG_RETRY_MAX_DELAY || '10000'),
        backoffMultiplier: parseFloat(process.env.POSTHOG_RETRY_BACKOFF_MULTIPLIER || '2'),
        retryableErrors: ['timeout', 'server_error'],
      },
      costTracking: false,
      healthCheck: {
        enabled: true,
        interval: parseInt(process.env.POSTHOG_HEALTH_CHECK_INTERVAL || '600000'),
      },
    });

    // Amplitude Configuration
    this.integrationConfigs.set('amplitude', {
      name: 'amplitude',
      enabled: process.env.AMPLITUDE_ENABLED !== 'false',
      apiKey: process.env.AMPLITUDE_API_KEY || '',
      baseUrl: 'https://api.amplitude.com',
      timeout: parseInt(process.env.AMPLITUDE_TIMEOUT || '10000'),
      cache: {
        enabled: false, // Analytics usually shouldn't be cached
        ttl: 0,
        key: 'amplitude',
      },
      retry: {
        maxAttempts: parseInt(process.env.AMPLITUDE_RETRY_ATTEMPTS || '2'),
        baseDelay: parseInt(process.env.AMPLITUDE_RETRY_BASE_DELAY || '1000'),
        maxDelay: parseInt(process.env.AMPLITUDE_RETRY_MAX_DELAY || '10000'),
        backoffMultiplier: parseFloat(process.env.AMPLITUDE_RETRY_BACKOFF_MULTIPLIER || '2'),
        retryableErrors: ['timeout', 'server_error'],
      },
      costTracking: false,
      healthCheck: {
        enabled: true,
        interval: parseInt(process.env.AMPLITUDE_HEALTH_CHECK_INTERVAL || '600000'),
      },
    });
  }

  /**
   * Get global configuration
   */
  getGlobalConfig(): GlobalConfig {
    return { ...this.globalConfig };
  }

  /**
   * Update global configuration
   */
  updateGlobalConfig(config: Partial<GlobalConfig>): void {
    this.globalConfig = { ...this.globalConfig, ...config };
  }

  /**
   * Get integration configuration
   */
  getIntegrationConfig(name: string): IntegrationConfig | undefined {
    return this.integrationConfigs.get(name);
  }

  /**
   * Update integration configuration
   */
  updateIntegrationConfig(name: string, config: Partial<IntegrationConfig>): void {
    const existing = this.integrationConfigs.get(name);
    if (existing) {
      this.integrationConfigs.set(name, { ...existing, ...config });
    }
  }

  /**
   * Get all integration configurations
   */
  getAllIntegrationConfigs(): Map<string, IntegrationConfig> {
    return new Map(this.integrationConfigs);
  }

  /**
   * Check if integration is enabled
   */
  isIntegrationEnabled(name: string): boolean {
    const config = this.integrationConfigs.get(name);
    return config?.enabled || false;
  }

  /**
   * Enable/disable integration
   */
  setIntegrationEnabled(name: string, enabled: boolean): void {
    const config = this.integrationConfigs.get(name);
    if (config) {
      config.enabled = enabled;
    }
  }

  /**
   * Get enabled integrations
   */
  getEnabledIntegrations(): string[] {
    return Array.from(this.integrationConfigs.entries())
      .filter(([_, config]) => config.enabled)
      .map(([name, _]) => name);
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate global config
    if (this.globalConfig.defaultTimeout <= 0) {
      errors.push('Default timeout must be positive');
    }

    // Validate integration configs
    for (const [name, config] of this.integrationConfigs.entries()) {
      if (config.enabled) {
        if (!config.apiKey && config.name !== 'coingecko') { // CoinGecko has free tier
          errors.push(`API key required for ${name}`);
        }

        if (config.timeout <= 0) {
          errors.push(`Timeout must be positive for ${name}`);
        }

        if (config.retry?.maxAttempts && config.retry.maxAttempts < 1) {
          errors.push(`Retry attempts must be at least 1 for ${name}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export configuration as JSON
   */
  exportConfig(): string {
    return JSON.stringify({
      global: this.globalConfig,
      integrations: Object.fromEntries(this.integrationConfigs),
    }, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  importConfig(configJson: string): void {
    try {
      const config = JSON.parse(configJson);

      if (config.global) {
        this.globalConfig = { ...this.globalConfig, ...config.global };
      }

      if (config.integrations) {
        for (const [name, integrationConfig] of Object.entries(config.integrations)) {
          const existing = this.integrationConfigs.get(name);
          if (existing) {
            this.integrationConfigs.set(name, { ...existing, ...integrationConfig });
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error.message}`);
    }
  }
}