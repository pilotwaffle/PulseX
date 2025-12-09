import { RateLimitConfig } from '../types/common';
import { Logger } from '../../utils/logger';

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;
}

export interface RateLimitResult {
  allowed: boolean;
  tokensRemaining: number;
  resetTime: number;
  retryAfter?: number;
}

export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private buckets: Map<string, TokenBucket>;
  private logger: Logger;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config?: RateLimitConfig) {
    this.config = {
      requestsPerSecond: config?.requestsPerSecond || 10,
      requestsPerMinute: config?.requestsPerMinute || 600,
      requestsPerHour: config?.requestsPerHour || 36000,
      requestsPerDay: config?.requestsPerDay || 864000,
      burstLimit: config?.burstLimit || 20,
    };

    this.buckets = new Map();
    this.logger = new Logger('RateLimiter');

    // Start cleanup interval to remove old buckets
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      5 * 60 * 1000 // Every 5 minutes
    );

    this.logger.info('Rate limiter initialized', { config: this.config });
  }

  /**
   * Check rate limit for a specific key
   */
  async checkLimit(key: string = 'default'): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = this.getOrCreateBucket(key);

    // Refill tokens
    this.refillBucket(bucket, now);

    // Check if request is allowed
    const allowed = bucket.tokens >= 1;

    if (allowed) {
      bucket.tokens -= 1;
    }

    const resetTime = this.calculateResetTime(bucket, now);
    const retryAfter = allowed ? undefined : resetTime - now;

    this.logger.debug('Rate limit check', {
      key,
      allowed,
      tokensRemaining: bucket.tokens,
      resetTime,
      retryAfter,
    });

    return {
      allowed,
      tokensRemaining: Math.max(0, bucket.tokens),
      resetTime,
      retryAfter,
    };
  }

  /**
   * Get or create token bucket for key
   */
  private getOrCreateBucket(key: string): TokenBucket {
    if (!this.buckets.has(key)) {
      // Use burst capacity for token bucket
      const bucket: TokenBucket = {
        tokens: this.config.burstLimit || this.config.requestsPerSecond,
        lastRefill: Date.now(),
        capacity: this.config.burstLimit || this.config.requestsPerSecond,
        refillRate: this.config.requestsPerSecond / 1000, // tokens per millisecond
      };

      this.buckets.set(key, bucket);
    }

    return this.buckets.get(key)!;
  }

  /**
   * Refill tokens in bucket based on time elapsed
   */
  private refillBucket(bucket: TokenBucket, now: number): void {
    const timeDelta = now - bucket.lastRefill;
    const tokensToAdd = timeDelta * bucket.refillRate;

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  /**
   * Calculate when bucket will be reset
   */
  private calculateResetTime(bucket: TokenBucket, now: number): number {
    const tokensNeeded = bucket.capacity - bucket.tokens;
    const timeToFull = tokensNeeded / bucket.refillRate;
    return now + timeToFull;
  }

  /**
   * Check all rate limits (second, minute, hour, day)
   */
  async checkAllLimits(key: string = 'default'): Promise<{
    allowed: boolean;
    limits: {
      type: string;
      allowed: boolean;
      tokensRemaining: number;
      resetTime: number;
    }[];
  }> {
    const limits = [
      { type: 'second', max: this.config.requestsPerSecond, window: 1000 },
      { type: 'minute', max: this.config.requestsPerMinute, window: 60 * 1000 },
      { type: 'hour', max: this.config.requestsPerHour, window: 60 * 60 * 1000 },
      { type: 'day', max: this.config.requestsPerDay, window: 24 * 60 * 60 * 1000 },
    ];

    const results = await Promise.all(
      limits.map(limit => this.checkSlidingWindowLimit(key, limit.type, limit.max, limit.window))
    );

    const overallAllowed = results.every(result => result.allowed);

    return {
      allowed: overallAllowed,
      limits: results,
    };
  }

  /**
   * Check sliding window rate limit
   */
  private async checkSlidingWindowLimit(
    key: string,
    type: string,
    maxRequests: number,
    windowMs: number
  ): Promise<{ type: string; allowed: boolean; tokensRemaining: number; resetTime: number }> {
    const windowKey = `${key}:${type}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get current requests in window
    const requests = await this.getRequestsInWindow(windowKey, windowStart, now);

    // Remove expired requests
    await this.removeExpiredRequests(windowKey, windowStart);

    const tokensRemaining = Math.max(0, maxRequests - requests.length);
    const allowed = tokensRemaining > 0;

    if (allowed) {
      await this.addRequest(windowKey, now);
    }

    const resetTime = windowStart + windowMs;

    return {
      type,
      allowed,
      tokensRemaining,
      resetTime,
    };
  }

  /**
   * Get requests in sliding window
   */
  private async getRequestsInWindow(key: string, windowStart: number, windowEnd: number): Promise<number[]> {
    // This would typically use Redis sorted sets
    // For now, using in-memory implementation
    const requests = this.buckets.get(key)?.tokens || [];
    return requests.filter((timestamp: number) => timestamp >= windowStart && timestamp <= windowEnd);
  }

  /**
   * Add request to sliding window
   */
  private async addRequest(key: string, timestamp: number): Promise<void> {
    // This would typically use Redis sorted sets
    const bucket = this.getOrCreateBucket(key);
    if (Array.isArray(bucket.tokens)) {
      bucket.tokens.push(timestamp);
    }
  }

  /**
   * Remove expired requests from sliding window
   */
  private async removeExpiredRequests(key: string, cutoffTime: number): Promise<void> {
    // This would typically use Redis sorted sets
    const bucket = this.buckets.get(key);
    if (bucket && Array.isArray(bucket.tokens)) {
      bucket.tokens = bucket.tokens.filter((timestamp: number) => timestamp >= cutoffTime);
    }
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetLimit(key: string): Promise<void> {
    this.buckets.delete(key);
    this.logger.debug('Rate limit reset', { key });
  }

  /**
   * Get current status for a key
   */
  async getStatus(key: string = 'default'): Promise<{
    tokensRemaining: number;
    resetTime: number;
    isRateLimited: boolean;
  }> {
    const result = await this.checkLimit(key);

    return {
      tokensRemaining: result.tokensRemaining,
      resetTime: result.resetTime,
      isRateLimited: !result.allowed,
    };
  }

  /**
   * Get overall statistics
   */
  getStats(): {
    activeBuckets: number;
    config: Required<RateLimitConfig>;
  } {
    return {
      activeBuckets: this.buckets.size,
      config: { ...this.config },
    };
  }

  /**
   * Cleanup old buckets
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoffTime = now - (5 * 60 * 1000); // 5 minutes ago

    for (const [key, bucket] of this.buckets.entries()) {
      // Refill to check if bucket is active
      this.refillBucket(bucket, now);

      // Remove buckets that haven't been used recently
      if (now - bucket.lastRefill > cutoffTime) {
        this.buckets.delete(key);
      }
    }

    this.logger.debug('Rate limiter cleanup completed', {
      activeBuckets: this.buckets.size,
    });
  }

  /**
   * Check if request would be allowed without consuming a token
   */
  async peekLimit(key: string = 'default'): Promise<boolean> {
    const bucket = this.getOrCreateBucket(key);
    const now = Date.now();

    // Refill tokens
    this.refillBucket(bucket, now);

    return bucket.tokens >= 1;
  }

  /**
   * Reserve tokens for future use
   */
  async reserveTokens(key: string = 'default', tokens: number = 1): Promise<boolean> {
    const bucket = this.getOrCreateBucket(key);
    const now = Date.now();

    // Refill tokens
    this.refillBucket(bucket, now);

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Release reserved tokens back to bucket
   */
  async releaseTokens(key: string = 'default', tokens: number = 1): Promise<void> {
    const bucket = this.buckets.get(key);
    if (bucket) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokens);
    }
  }

  /**
   * Get rate limit configuration
   */
  getConfig(): Required<RateLimitConfig> {
    return { ...this.config };
  }

  /**
   * Update rate limit configuration
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Rate limit configuration updated', { config: this.config });
  }

  /**
   * Destroy rate limiter and cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.buckets.clear();
    this.logger.info('Rate limiter destroyed');
  }
}