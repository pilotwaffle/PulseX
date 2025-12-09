import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';
import { APIResponse } from '../types';
import { v4 as uuidv4 } from 'uuid';

const getRedisKey = (req: Request): string => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const userId = (req as any).user?.id || 'anonymous';

  // Create a unique key based on IP, user agent, and user ID
  return `rate_limit:${Buffer.from(`${ip}:${userAgent}:${userId}`).toString('base64')}`;
};

const customRateLimiter = async (req: Request, res: Response, next: any) => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  const key = getRedisKey(req);

  try {
    const current = await redisClient.incr(key);

    if (current === 1) {
      // Set expiration on first request
      await redisClient.expire(key, 900); // 15 minutes
    }

    const ttl = await redisClient.client.ttl(key);
    const limit = 100; // Default limit
    const remaining = Math.max(0, limit - current);

    res.set({
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(Date.now() + ttl * 1000).toISOString(),
    });

    if (current > limit) {
      logger.warn('Rate limit exceeded', {
        key,
        current,
        limit,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId,
      });

      const response: APIResponse = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
          details: {
            limit,
            windowMs: 900000, // 15 minutes
            retryAfter: ttl,
          },
        },
        requestId,
      };

      res.status(429).json(response);
      return;
    }

    next();
  } catch (error) {
    logger.error('Rate limiter error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      key,
      requestId,
    });

    // If Redis fails, allow the request to proceed
    next();
  }
};

export const createRateLimiter = (options: {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100,
    message = 'Too many requests from this IP, please try again later',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message,
        details: { limit: max, windowMs },
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,
    keyGenerator: (req) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const userId = (req as any).user?.id;
      return userId ? `user:${userId}` : `ip:${ip}`;
    },
    handler: (req, res) => {
      const requestId = req.headers['x-request-id'] as string || uuidv4();

      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userId: (req as any).user?.id,
        path: req.path,
        method: req.method,
        requestId,
      });

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          details: { limit: max, windowMs },
        },
        requestId,
      });
    },
  });
};

// Different rate limits for different endpoints
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit auth attempts
  message: 'Too many authentication attempts, please try again later',
});

export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // General API limit
});

export const contentGenerationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit content generation
  message: 'Too many content generation requests, please try again later',
});

export const notificationLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit notification sends
  message: 'Too many notification requests, please try again later',
});

// Custom Redis-based rate limiter for more granular control
export const redisRateLimiter = customRateLimiter;