// Core Infrastructure
export { BaseClient } from './core/base-client';
export { RetryHandler } from './core/retry-handler';
export { CacheManager } from './core/cache-manager';
export { RateLimiter } from './core/rate-limiter';
export { ErrorHandler } from './core/error-handler';
export { ConfigManager } from './core/config';

// LLM Integrations
export { OpenAIClient } from './llm/openai/client';
export { AnthropicClient } from './llm/anthropic/client';
export { LLMManager } from './llm/llm-manager';

// News Integrations
export { NewsAPIClient } from './news/news-api/client';
export { NewsAggregator } from './news/news-aggregator';

// Crypto Integrations (would implement similar to news)
// export { CoinGeckoClient } from './crypto/coingecko/client';
// export { CoinMarketCapClient } from './crypto/coinmarketcap/client';
// export { CryptoAggregator } from './crypto/crypto-aggregator';

// Notification Integrations (would implement)
// export { APNSClient } from './notifications/apns/client';
// export { NotificationService } from './notifications/notification-service';

// Analytics Integrations (would implement)
// export { PostHogClient } from './analytics/posthog/client';
// export { AmplitudeClient } from './analytics/amplitude/client';
// export { AnalyticsManager } from './analytics/analytics-manager';

// Monitoring
export { CostTracker } from './monitoring/cost-tracker';
export { HealthChecker } from './monitoring/health-checker';

// Security (would implement)
// export { ContentFilter } from './security/content-filter';
// export { BiasDetector } from './security/bias-detector';

// Types
export * from './types/common';
export * from './types/llm';
export * from './types/news';
export * from './types/crypto';
export * from './types/analytics';

// Main Integration Manager
export { IntegrationManager } from './integration-manager';