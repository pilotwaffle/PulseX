import Redis from 'ioredis';
import { CacheOptions } from '@/types';
import config from '@/config';
import logger from './logger';

export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  clear(pattern?: string): Promise<void>;
  ttl(key: string): Promise<number>;
  increment(key: string, amount?: number): Promise<number>;
  getMany<T>(keys: string[]): Promise<(T | null)[]>;
  setMany<T>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<void>;
}

export class RedisCacheService implements CacheService {
  private redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis || new Redis(config.redis.url);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;

      // Try to parse as JSON, fallback to string
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      logger.error('Cache get error:', error, { key });
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
      const ttl = options?.ttl || config.cache.ttlMedium;

      if (ttl > 0) {
        await this.redis.setex(key, ttl, serializedValue);
      } else {
        await this.redis.set(key, serializedValue);
      }

      // Add tags if provided
      if (options?.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          await this.redis.sadd(`tag:${tag}`, key);
          await this.redis.expire(`tag:${tag}`, ttl);
        }
      }

      logger.debug('Cache set successful', { key, ttl, tags: options?.tags });
    } catch (error) {
      logger.error('Cache set error:', error, { key });
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      logger.debug('Cache delete successful', { key });
    } catch (error) {
      logger.error('Cache delete error:', error, { key });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error, { key });
      return false;
    }
  }

  async clear(pattern?: string): Promise<void> {
    try {
      if (pattern) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          logger.debug('Cache clear by pattern', { pattern, keysCount: keys.length });
        }
      } else {
        await this.redis.flushdb();
        logger.debug('Cache clear all');
      }
    } catch (error) {
      logger.error('Cache clear error:', error, { pattern });
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      logger.error('Cache TTL error:', error, { key });
      return -1;
    }
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, amount);
    } catch (error) {
      logger.error('Cache increment error:', error, { key, amount });
      return 0;
    }
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.redis.mget(...keys);
      return values.map(value => {
        if (!value) return null;

        try {
          return JSON.parse(value) as T;
        } catch {
          return value as unknown as T;
        }
      });
    } catch (error) {
      logger.error('Cache get many error:', error, { keys });
      return keys.map(() => null);
    }
  }

  async setMany<T>(
    entries: Array<{ key: string; value: T; options?: CacheOptions }>
  ): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();

      for (const entry of entries) {
        const serializedValue = typeof entry.value === 'string'
          ? entry.value
          : JSON.stringify(entry.value);
        const ttl = entry.options?.ttl || config.cache.ttlMedium;

        if (ttl > 0) {
          pipeline.setex(entry.key, ttl, serializedValue);
        } else {
          pipeline.set(entry.key, serializedValue);
        }

        // Add tags if provided
        if (entry.options?.tags) {
          for (const tag of entry.options.tags) {
            pipeline.sadd(`tag:${tag}`, entry.key);
            pipeline.expire(`tag:${tag}`, ttl);
          }
        }
      }

      await pipeline.exec();
      logger.debug('Cache set many successful', { entriesCount: entries.length });
    } catch (error) {
      logger.error('Cache set many error:', error, { entriesCount: entries.length });
    }
  }

  // Clear cache by tag
  async clearByTag(tag: string): Promise<void> {
    try {
      const keys = await this.redis.smembers(`tag:${tag}`);
      if (keys.length > 0) {
        await this.redis.del(...keys, `tag:${tag}`);
        logger.debug('Cache clear by tag', { tag, keysCount: keys.length });
      }
    } catch (error) {
      logger.error('Cache clear by tag error:', error, { tag });
    }
  }

  // Get cache statistics
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate?: number;
  }> {
    try {
      const info = await this.redis.info('memory');
      const keyCount = await this.redis.dbsize();

      // Parse memory usage from info
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'unknown';

      return {
        totalKeys: keyCount,
        memoryUsage,
        hitRate: undefined, // Would need to implement hit rate tracking
      };
    } catch (error) {
      logger.error('Cache get stats error:', error);
      return {
        totalKeys: 0,
        memoryUsage: 'unknown',
      };
    }
  }

  // Health check for cache
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Cache health check error:', error);
      return false;
    }
  }
}

// Memory-based cache for development/testing
export class MemoryCacheService implements CacheService {
  private cache: Map<string, { value: any; expiry?: number; tags?: string[] }>;
  private tagIndex: Map<string, Set<string>>;

  constructor() {
    this.cache = new Map();
    this.tagIndex = new Map();
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpired();
    }, 60000); // Clean up every minute
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry && entry.expiry < now) {
        this.cache.delete(key);
      }
    }
  }

  private isExpired(entry: { expiry?: number }): boolean {
    return entry.expiry ? entry.expiry < Date.now() : false;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry || this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const ttl = options?.ttl || config.cache.ttlMedium;
    const expiry = ttl > 0 ? Date.now() + (ttl * 1000) : undefined;

    this.cache.set(key, { value, expiry, tags: options?.tags });

    // Update tag index
    if (options?.tags) {
      for (const tag of options.tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(key);
      }
    }
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  async clear(pattern?: string): Promise<void> {
    if (pattern) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      for (const key of this.cache.keys()) {
        if (regex.test(key)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
      this.tagIndex.clear();
    }
  }

  async ttl(key: string): Promise<number> {
    const entry = this.cache.get(key);
    if (!entry || !entry.expiry) return -1;

    const remaining = Math.floor((entry.expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -1;
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    const current = await this.get<number>(key) || 0;
    const newValue = current + amount;
    await this.set(key, newValue);
    return newValue;
  }

  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)));
  }

  async setMany<T>(
    entries: Array<{ key: string; value: T; options?: CacheOptions }>
  ): Promise<void> {
    await Promise.all(entries.map(entry => this.set(entry.key, entry.value, entry.options)));
  }

  async clearByTag(tag: string): Promise<void> {
    const keys = this.tagIndex.get(tag);
    if (keys) {
      for (const key of keys) {
        this.cache.delete(key);
      }
      this.tagIndex.delete(tag);
    }
  }

  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate?: number;
  }> {
    return {
      totalKeys: this.cache.size,
      memoryUsage: 'unknown', // Would need to implement memory calculation
    };
  }

  async healthCheck(): Promise<boolean> {
    return true; // Memory cache is always healthy
  }
}

// Create cache service instance
let cacheService: CacheService;

export const getCacheService = (redis?: Redis): CacheService => {
  if (!cacheService) {
    if (config.app.env === 'test' || !redis) {
      cacheService = new MemoryCacheService();
    } else {
      cacheService = new RedisCacheService(redis);
    }
  }
  return cacheService;
};

// Helper functions for common cache operations
export const cacheHelpers = {
  // Cache user data
  async cacheUser(userId: string, userData: any, ttl: number = 3600): Promise<void> {
    const cache = getCacheService();
    await cache.set(`user:${userId}`, userData, { ttl, tags: ['user'] });
  },

  // Get cached user data
  async getCachedUser(userId: string): Promise<any | null> {
    const cache = getCacheService();
    return cache.get(`user:${userId}`);
  },

  // Cache briefing data
  async cacheBriefing(
    briefingId: string,
    briefingData: any,
    ttl: number = 7200
  ): Promise<void> {
    const cache = getCacheService();
    await cache.set(`briefing:${briefingId}`, briefingData, { ttl, tags: ['briefing'] });
  },

  // Get cached briefing data
  async getCachedBriefing(briefingId: string): Promise<any | null> {
    const cache = getCacheService();
    return cache.get(`briefing:${briefingId}`);
  },

  // Cache content aggregation results
  async cacheContent(
    key: string,
    content: any,
    ttl: number = 1800
  ): Promise<void> {
    const cache = getCacheService();
    await cache.set(`content:${key}`, content, { ttl, tags: ['content'] });
  },

  // Get cached content
  async getCachedContent(key: string): Promise<any | null> {
    const cache = getCacheService();
    return cache.get(`content:${key}`);
  },

  // Clear all user-related cache
  async clearUserCache(userId: string): Promise<void> {
    const cache = getCacheService();
    await cache.clearByTag('user');
    await cache.del(`user:${userId}`);
  },

  // Clear all briefing-related cache
  async clearBriefingCache(): Promise<void> {
    const cache = getCacheService();
    await cache.clearByTag('briefing');
  },

  // Clear all content-related cache
  async clearContentCache(): Promise<void> {
    const cache = getCacheService();
    await cache.clearByTag('content');
  },
};

export default getCacheService;