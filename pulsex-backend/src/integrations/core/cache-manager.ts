import Redis from 'ioredis';
import { CacheConfig } from '../types/common';
import { Logger } from '../../utils/logger';
import { createHash } from 'crypto';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class CacheManager {
  private config: Required<CacheConfig>;
  private redis?: Redis;
  private memoryCache: Map<string, CacheEntry<any>>;
  private logger: Logger;
  private isRedisAvailable: boolean = false;

  constructor(config?: CacheConfig) {
    this.config = {
      ttl: config?.ttl || 300, // 5 minutes default
      key: config?.key || 'pulsex:cache',
      enabled: config?.enabled ?? true,
    };

    this.memoryCache = new Map();
    this.logger = new Logger('CacheManager');

    // Initialize Redis if configured
    if (process.env.REDIS_URL && this.config.enabled) {
      this.initializeRedis();
    }
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis(process.env.REDIS_URL, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keyPrefix: `${this.config.key}:`,
      });

      // Test connection
      await this.redis.ping();
      this.isRedisAvailable = true;

      this.logger.info('Redis cache initialized successfully');

      // Handle Redis events
      this.redis.on('error', (error) => {
        this.logger.error('Redis connection error', { error: error.message });
        this.isRedisAvailable = false;
      });

      this.redis.on('reconnecting', () => {
        this.logger.info('Redis reconnecting');
      });

      this.redis.on('connect', () => {
        this.logger.info('Redis connected');
        this.isRedisAvailable = true;
      });

    } catch (error) {
      this.logger.warn('Failed to initialize Redis, falling back to memory cache', {
        error: error.message,
      });
      this.isRedisAvailable = false;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.config.enabled) {
      return null;
    }

    const cacheKey = this.hashKey(key);
    const now = Date.now();

    try {
      // Try Redis first
      if (this.isRedisAvailable && this.redis) {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const entry: CacheEntry<T> = JSON.parse(cached);

          // Check if entry is still valid
          if (now - entry.timestamp < entry.ttl * 1000) {
            this.logger.debug('Cache hit (Redis)', { key: cacheKey });
            return entry.data;
          } else {
            // Remove expired entry
            await this.redis.del(cacheKey);
          }
        }
      }

      // Fallback to memory cache
      const memoryEntry = this.memoryCache.get(cacheKey);
      if (memoryEntry) {
        // Check if entry is still valid
        if (now - memoryEntry.timestamp < memoryEntry.ttl * 1000) {
          this.logger.debug('Cache hit (Memory)', { key: cacheKey });
          return memoryEntry.data;
        } else {
          // Remove expired entry
          this.memoryCache.delete(cacheKey);
        }
      }

      this.logger.debug('Cache miss', { key: cacheKey });
      return null;

    } catch (error) {
      this.logger.error('Cache get error', { key: cacheKey, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const cacheKey = this.hashKey(key);
    const effectiveTtl = ttl || this.config.ttl;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: effectiveTtl,
    };

    try {
      // Set in Redis if available
      if (this.isRedisAvailable && this.redis) {
        await this.redis.setex(cacheKey, effectiveTtl, JSON.stringify(entry));
      }

      // Always set in memory cache as backup
      this.memoryCache.set(cacheKey, entry);

      // Schedule memory cache cleanup
      setTimeout(() => {
        this.memoryCache.delete(cacheKey);
      }, effectiveTtl * 1000);

      this.logger.debug('Cache set', { key: cacheKey, ttl: effectiveTtl });

    } catch (error) {
      this.logger.error('Cache set error', { key: cacheKey, error: error.message });
      // Fallback to memory only
      this.memoryCache.set(cacheKey, entry);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const cacheKey = this.hashKey(key);

    try {
      if (this.isRedisAvailable && this.redis) {
        await this.redis.del(cacheKey);
      }

      this.memoryCache.delete(cacheKey);

      this.logger.debug('Cache delete', { key: cacheKey });

    } catch (error) {
      this.logger.error('Cache delete error', { key: cacheKey, error: error.message });
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      if (this.isRedisAvailable && this.redis) {
        const pattern = `${this.config.key}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }

      this.memoryCache.clear();

      this.logger.info('Cache cleared');

    } catch (error) {
      this.logger.error('Cache clear error', { error: error.message });
      this.memoryCache.clear();
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const cacheKey = this.hashKey(key);
    const now = Date.now();

    try {
      // Check Redis
      if (this.isRedisAvailable && this.redis) {
        const exists = await this.redis.exists(cacheKey);
        if (exists) {
          // Verify entry is not expired
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            const entry = JSON.parse(cached);
            if (now - entry.timestamp < entry.ttl * 1000) {
              return true;
            } else {
              await this.redis.del(cacheKey);
            }
          }
        }
      }

      // Check memory cache
      const memoryEntry = this.memoryCache.get(cacheKey);
      if (memoryEntry) {
        return now - memoryEntry.timestamp < memoryEntry.ttl * 1000;
      }

      return false;

    } catch (error) {
      this.logger.error('Cache exists error', { key: cacheKey, error: error.message });
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    memorySize: number;
    redisConnected: boolean;
    redisKeyCount?: number;
  }> {
    const stats = {
      memorySize: this.memoryCache.size,
      redisConnected: this.isRedisAvailable,
      redisKeyCount: undefined as number | undefined,
    };

    try {
      if (this.isRedisAvailable && this.redis) {
        const pattern = `${this.config.key}:*`;
        const keys = await this.redis.keys(pattern);
        stats.redisKeyCount = keys.length;
      }
    } catch (error) {
      this.logger.error('Cache stats error', { error: error.message });
    }

    return stats;
  }

  /**
   * Set multiple values at once
   */
  async mset<T>(entries: Array<{ key: string; data: T; ttl?: number }>): Promise<void> {
    if (!this.config.enabled || entries.length === 0) {
      return;
    }

    const promises = entries.map(entry =>
      this.set(entry.key, entry.data, entry.ttl)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Get multiple values at once
   */
  async mget<T>(keys: string[]): Promise<Array<{ key: string; value: T | null }>> {
    if (!this.config.enabled || keys.length === 0) {
      return [];
    }

    const promises = keys.map(async key => ({
      key,
      value: await this.get<T>(key),
    }));

    return Promise.all(promises);
  }

  /**
   * Create cache key hash
   */
  private hashKey(key: string): string {
    return createHash('md5').update(key).digest('hex');
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.isRedisAvailable = false;
    }
  }

  /**
   * Check cache health
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    try {
      const stats = await this.getStats();

      // Test cache operations
      const testKey = `health_check_${Date.now()}`;
      await this.set(testKey, { test: true }, 10);
      const testValue = await this.get(testKey);
      await this.delete(testKey);

      const isWorking = testValue?.test === true;

      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (isWorking && stats.redisConnected) {
        status = 'healthy';
      } else if (isWorking) {
        status = 'degraded'; // Memory only
      } else {
        status = 'unhealthy';
      }

      return {
        status,
        details: {
          ...stats,
          testPassed: isWorking,
          enabled: this.config.enabled,
        },
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          enabled: this.config.enabled,
        },
      };
    }
  }

  /**
   * Get cache configuration
   */
  getConfig(): Required<CacheConfig> {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Cache configuration updated', { config: this.config });
  }
}