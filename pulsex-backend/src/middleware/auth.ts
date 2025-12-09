import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../utils/jwt';
import { redisClient } from '../config/redis';
import { database } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';
import { APIResponse } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  requestId?: string;
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  req.requestId = requestId;

  try {
    const authHeader = req.headers.authorization;
    const token = jwtService.extractTokenFromHeader(authHeader);

    if (!token) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_TOKEN_MISSING',
          message: 'Authentication token is required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    // Check if token is blacklisted
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_TOKEN_BLACKLISTED',
          message: 'Token has been invalidated',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    const decoded = jwtService.verifyAccessToken(token);

    // Verify user exists and is active
    const userQuery = `
      SELECT id, email, is_active
      FROM users
      WHERE id = $1 AND is_active = true
    `;
    const userResult = await database.query(userQuery, [decoded.sub]);

    if (userResult.rows.length === 0) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_USER_NOT_FOUND',
          message: 'User not found or inactive',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email,
    };

    logger.info('User authenticated successfully', {
      userId: decoded.sub,
      email: decoded.email,
      requestId,
    });

    next();
  } catch (error) {
    logger.error('Authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });

    const response: APIResponse = {
      success: false,
      error: {
        code: 'AUTH_TOKEN_INVALID',
        message: error instanceof Error ? error.message : 'Authentication failed',
      },
      requestId,
    };

    res.status(401).json(response);
  }
};

export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  req.requestId = requestId;

  try {
    const authHeader = req.headers.authorization;
    const token = jwtService.extractTokenFromHeader(authHeader);

    if (!token) {
      next();
      return;
    }

    // Check if token is blacklisted
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);
    if (isBlacklisted) {
      next();
      return;
    }

    const decoded = jwtService.verifyAccessToken(token);

    // Verify user exists and is active
    const userQuery = `
      SELECT id, email, is_active
      FROM users
      WHERE id = $1 AND is_active = true
    `;
    const userResult = await database.query(userQuery, [decoded.sub]);

    if (userResult.rows.length > 0) {
      req.user = {
        id: decoded.sub,
        email: decoded.email,
      };
    }

    next();
  } catch (error) {
    // Optional auth shouldn't block the request
    logger.debug('Optional authentication failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });
    next();
  }
};

export const authorize = (roles: string[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId: req.requestId,
      };
      res.status(401).json(response);
      return;
    }

    try {
      const userRoleQuery = `
        SELECT role FROM user_roles WHERE user_id = $1
      `;
      const userRoleResult = await database.query(userRoleQuery, [req.user.id]);

      const userRoles = userRoleResult.rows.map(row => row.role);
      const hasRequiredRole = roles.some(role => userRoles.includes(role));

      if (!hasRequiredRole) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'AUTH_INSUFFICIENT_PERMISSIONS',
            message: 'Insufficient permissions to access this resource',
          },
          requestId: req.requestId,
        };
        res.status(403).json(response);
        return;
      }

      next();
    } catch (error) {
      logger.error('Authorization check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: req.user.id,
        requestId: req.requestId,
      });

      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTHORIZATION_FAILED',
          message: 'Authorization check failed',
        },
        requestId: req.requestId,
      };
      res.status(500).json(response);
    }
  };
};

export const logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const requestId = req.requestId || uuidv4();

  try {
    const authHeader = req.headers.authorization;
    const token = jwtService.extractTokenFromHeader(authHeader);

    if (token) {
      // Add token to blacklist with expiration time
      const expirationTime = jwtService.getTokenExpirationTime(token);
      if (expirationTime) {
        const ttl = Math.floor((expirationTime.getTime() - Date.now()) / 1000);
        if (ttl > 0) {
          await redisClient.set(`blacklist:${token}`, 'true', ttl);
        }
      }
    }

    const response: APIResponse = {
      success: true,
      data: { message: 'Successfully logged out' },
      requestId,
    };

    res.json(response);
  } catch (error) {
    logger.error('Logout failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId,
    });

    const response: APIResponse = {
      success: false,
      error: {
        code: 'LOGOUT_FAILED',
        message: 'Failed to logout',
      },
      requestId,
    };

    res.status(500).json(response);
  }
};