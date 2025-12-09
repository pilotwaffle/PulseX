import jwt from 'jsonwebtoken';
import { JWTPayload, APIResponse } from '../types';
import { logger } from '../config/logger';

export class JWTService {
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;

  constructor() {
    this.accessTokenSecret = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-change-in-production';
    this.accessTokenExpiry = process.env.JWT_EXPIRES_IN || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
      logger.warn('JWT secrets not configured, using fallback values (not recommended for production)');
    }
  }

  generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'type'>): string {
    try {
      const tokenPayload = {
        ...payload,
        type: 'access' as const,
      };

      return jwt.sign(tokenPayload, this.accessTokenSecret, {
        expiresIn: this.accessTokenExpiry,
        issuer: 'pulsex-daily-briefing',
        audience: 'pulsex-users',
      });
    } catch (error) {
      logger.error('Failed to generate access token', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Token generation failed');
    }
  }

  generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'type'>): string {
    try {
      const tokenPayload = {
        ...payload,
        type: 'refresh' as const,
      };

      return jwt.sign(tokenPayload, this.refreshTokenSecret, {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'pulsex-daily-briefing',
        audience: 'pulsex-users',
      });
    } catch (error) {
      logger.error('Failed to generate refresh token', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Refresh token generation failed');
    }
  }

  generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp' | 'type'>): { accessToken: string; refreshToken: string } {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    logger.info('Token pair generated successfully', { userId: payload.sub });

    return { accessToken, refreshToken };
  }

  verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'pulsex-daily-briefing',
        audience: 'pulsex-users',
      }) as JWTPayload;

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.warn('Access token expired', { error: error.message });
        throw new Error('Access token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid access token', { error: error.message });
        throw new Error('Invalid access token');
      } else {
        logger.error('Token verification failed', { error: error instanceof Error ? error.message : 'Unknown error' });
        throw new Error('Token verification failed');
      }
    }
  }

  verifyRefreshToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        issuer: 'pulsex-daily-briefing',
        audience: 'pulsex-users',
      }) as JWTPayload;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.warn('Refresh token expired', { error: error.message });
        throw new Error('Refresh token expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid refresh token', { error: error.message });
        throw new Error('Invalid refresh token');
      } else {
        logger.error('Refresh token verification failed', { error: error instanceof Error ? error.message : 'Unknown error' });
        throw new Error('Refresh token verification failed');
      }
    }
  }

  decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch (error) {
      logger.error('Token decode failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded) return true;

      const now = Math.floor(Date.now() / 1000);
      return decoded.exp < now;
    } catch (error) {
      return true;
    }
  }

  refreshToken(refreshToken: string): { accessToken: string; refreshToken: string } {
    const decoded = this.verifyRefreshToken(refreshToken);

    const payload = {
      sub: decoded.sub,
      email: decoded.email,
    };

    return this.generateTokenPair(payload);
  }

  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  getTokenExpirationTime(token: string): Date | null {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded) return null;

      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  validateTokenFormat(token: string): boolean {
    const tokenRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
    return tokenRegex.test(token);
  }
}

export const jwtService = new JWTService();