// Common Types for All Integrations

export interface BaseApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    requestId: string;
    timestamp: string;
    processingTime: number;
    cached?: boolean;
  };
}

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  key: string;
  enabled: boolean;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number; // Base delay in milliseconds
  maxDelay: number; // Maximum delay in milliseconds
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit?: number;
}

export interface CostTracking {
  requestCost: number;
  tokensUsed?: number;
  model?: string;
  provider: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastCheck: string;
  errorRate: number;
  details?: Record<string, any>;
}

export interface ServiceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalCost: number;
  lastReset: string;
}

export interface IntegrationConfig {
  name: string;
  enabled: boolean;
  apiKey: string;
  baseUrl?: string;
  timeout: number;
  cache?: CacheConfig;
  retry?: RetryConfig;
  rateLimit?: RateLimitConfig;
  costTracking?: boolean;
  healthCheck?: {
    enabled: boolean;
    interval: number;
    endpoint?: string;
  };
}

export interface ContentFilter {
  enabled: boolean;
  prohibitedWords: string[];
  politicalBiasThreshold: number;
  sentimentAnalysis: boolean;
  financialDisclaimer: boolean;
}

export interface QualityMetrics {
  relevanceScore: number;
  freshnessScore: number;
  credibilityScore: number;
  biasScore: number;
  overallQuality: number;
}

export interface ContentItem {
  id: string;
  title: string;
  content: string;
  source: string;
  url?: string;
  publishedAt: string;
  category: string;
  tags: string[];
  metadata: Record<string, any>;
  qualityMetrics?: QualityMetrics;
}

export interface PersonalizationSignal {
  userId: string;
  topic: string;
  weight: number;
  lastUpdated: string;
  source: 'explicit' | 'implicit';
}

export interface NotificationPayload {
  userId: string;
  type: 'daily_briefing' | 'breaking_news' | 'weekly_digest';
  title: string;
  body: string;
  data?: Record<string, any>;
  priority: 'high' | 'normal' | 'low';
  scheduledTime?: string;
}

// Error types
export class IntegrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public retryable: boolean = false,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

export class RateLimitError extends IntegrationError {
  constructor(provider: string, retryAfter?: number) {
    super(
      `Rate limit exceeded for ${provider}`,
      'RATE_LIMIT_EXCEEDED',
      provider,
      true,
      429,
      { retryAfter }
    );
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends IntegrationError {
  constructor(provider: string) {
    super(
      `Authentication failed for ${provider}`,
      'AUTHENTICATION_ERROR',
      provider,
      false,
      401
    );
    this.name = 'AuthenticationError';
  }
}

export class QuotaExceededError extends IntegrationError {
  constructor(provider: string, quotaType: string) {
    super(
      `Quota exceeded for ${provider}: ${quotaType}`,
      'QUOTA_EXCEEDED',
      provider,
      false,
      429,
      { quotaType }
    );
    this.name = 'QuotaExceededError';
  }
}

// Utility types
export type ProviderStatus = 'active' | 'degraded' | 'inactive' | 'maintenance';

export interface ProviderInfo {
  name: string;
  status: ProviderStatus;
  lastHealthCheck: string;
  responseTime: number;
  errorRate: number;
  costEfficiency: number;
  features: string[];
}