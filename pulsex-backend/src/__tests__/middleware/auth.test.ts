import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireAuth, AuthenticatedRequest } from '../../middleware/auth';

// Mock jsonwebtoken
jest.mock('jsonwebtoken');
jest.mock('../../config/database', () => ({
  database: {
    query: jest.fn(),
  },
}));

describe('Authentication Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticateToken', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      isActive: true,
    };

    it('should authenticate valid JWT token', async () => {
      // Arrange
      const validToken = 'valid-jwt-token';
      const payload = { sub: 'user-123', email: 'test@example.com' };

      mockRequest.headers = { authorization: `Bearer ${validToken}` };
      (jwt.verify as jest.Mock).mockReturnValue(payload);
      const { database } = require('../../config/database');
      database.query.mockResolvedValue({ rows: [mockUser] });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(validToken, expect.any(String));
      expect(database.query).toHaveBeenCalledWith(
        'SELECT id, email, is_active FROM users WHERE id = $1',
        ['user-123']
      );
      expect(mockRequest.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
      });
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject requests without authorization header', async () => {
      // Arrange
      mockRequest.headers = {};

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'MISSING_AUTH_TOKEN',
          message: 'Access token is required',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject malformed authorization header', async () => {
      // Arrange
      mockRequest.headers = { authorization: 'InvalidFormat token' };

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_AUTH_FORMAT',
          message: 'Authorization header format is invalid',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject invalid JWT token', async () => {
      // Arrange
      const invalidToken = 'invalid-jwt-token';
      mockRequest.headers = { authorization: `Bearer ${invalidToken}` };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(invalidToken, expect.any(String));
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid access token',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject expired JWT token', async () => {
      // Arrange
      const expiredToken = 'expired-jwt-token';
      mockRequest.headers = { authorization: `Bearer ${expiredToken}` };

      const expiredError = new Error('Token expired');
      expiredError.name = 'TokenExpiredError';
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw expiredError;
      });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Access token has expired',
        },
      });
    });

    it('should reject inactive users', async () => {
      // Arrange
      const validToken = 'valid-jwt-token';
      const payload = { sub: 'user-123', email: 'test@example.com' };
      const inactiveUser = { ...mockUser, isActive: false };

      mockRequest.headers = { authorization: `Bearer ${validToken}` };
      (jwt.verify as jest.Mock).mockReturnValue(payload);
      const { database } = require('../../config/database');
      database.query.mockResolvedValue({ rows: [inactiveUser] });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Account has been deactivated',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject when user not found in database', async () => {
      // Arrange
      const validToken = 'valid-jwt-token';
      const payload = { sub: 'user-123', email: 'test@example.com' };

      mockRequest.headers = { authorization: `Bearer ${validToken}` };
      (jwt.verify as jest.Mock).mockReturnValue(payload);
      const { database } = require('../../config/database');
      database.query.mockResolvedValue({ rows: [] });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
        },
      });
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const validToken = 'valid-jwt-token';
      const payload = { sub: 'user-123', email: 'test@example.com' };

      mockRequest.headers = { authorization: `Bearer ${validToken}` };
      (jwt.verify as jest.Mock).mockReturnValue(payload);
      const { database } = require('../../config/database');
      database.query.mockRejectedValue(new Error('Database connection failed'));

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        },
      });
    });
  });

  describe('requireAuth', () => {
    it('should call next function when user is authenticated', () => {
      // Arrange
      mockRequest.user = {
        id: 'user-123',
        email: 'test@example.com',
      };

      // Act
      requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(nextFunction).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', () => {
      // Arrange
      mockRequest.user = undefined;

      // Act
      requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication is required',
        },
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should handle missing user object gracefully', () => {
      // Arrange - user property doesn't exist
      delete (mockRequest as any).user;

      // Act
      requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('Token Refresh Handling', () => {
    it('should handle token refresh errors appropriately', async () => {
      // Arrange
      const validToken = 'valid-jwt-token';
      mockRequest.headers = { authorization: `Bearer ${validToken}` };

      const tokenError = new Error('Token refresh required');
      tokenError.name = 'NotBeforeError';
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw tokenError;
      });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'TOKEN_NOT_ACTIVE',
          message: 'Token is not active yet',
        },
      });
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle empty authorization header', async () => {
      // Arrange
      mockRequest.headers = { authorization: '' };

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should handle authorization header with only whitespace', async () => {
      // Arrange
      mockRequest.headers = { authorization: '   ' };

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should handle authorization header with multiple spaces', async () => {
      // Arrange
      mockRequest.headers = { authorization: 'Bearer  token-with-extra-spaces  ' };
      const token = 'token-with-extra-spaces';
      const payload = { sub: 'user-123', email: 'test@example.com' };

      (jwt.verify as jest.Mock).mockReturnValue(payload);
      const { database } = require('../../config/database');
      database.query.mockResolvedValue({ rows: [mockUser] });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(jwt.verify).toHaveBeenCalledWith(token, expect.any(String));
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should handle null authorization header', async () => {
      // Arrange
      mockRequest.headers = { authorization: null as any };

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should handle undefined authorization header', async () => {
      // Arrange
      mockRequest.headers = {};
      // Manually set undefined to test explicit undefined handling
      Object.defineProperty(mockRequest.headers, 'authorization', {
        value: undefined,
        enumerable: true,
      });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });
  });

  describe('User Data Validation', () => {
    it('should validate user object structure', async () => {
      // Arrange
      const validToken = 'valid-jwt-token';
      const payload = { sub: 'user-123', email: 'test@example.com' };
      const invalidUser = { id: null, email: undefined }; // Invalid user data

      mockRequest.headers = { authorization: `Bearer ${validToken}` };
      (jwt.verify as jest.Mock).mockReturnValue(payload);
      const { database } = require('../../config/database');
      database.query.mockResolvedValue({ rows: [invalidUser] });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        },
      });
    });

    it('should handle malformed user data from database', async () => {
      // Arrange
      const validToken = 'valid-jwt-token';
      const payload = { sub: 'user-123', email: 'test@example.com' };
      const malformedUser = null; // Database returned null

      mockRequest.headers = { authorization: `Bearer ${validToken}` };
      (jwt.verify as jest.Mock).mockReturnValue(payload);
      const { database } = require('../../config/database');
      database.query.mockResolvedValue({ rows: [malformedUser] });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });
  });

  describe('Request Augmentation', () => {
    it('should properly augment request with user data', async () => {
      // Arrange
      const validToken = 'valid-jwt-token';
      const payload = { sub: 'user-123', email: 'test@example.com', role: 'user' };
      const fullUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        isActive: true,
        createdAt: new Date(),
      };

      mockRequest.headers = { authorization: `Bearer ${validToken}` };
      (jwt.verify as jest.Mock).mockReturnValue(payload);
      const { database } = require('../../config/database');
      database.query.mockResolvedValue({ rows: [fullUser] });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockRequest.user).toEqual({
        id: fullUser.id,
        email: fullUser.email,
        role: fullUser.role,
      });
      expect(mockRequest.user).not.toHaveProperty('password');
      expect(mockRequest.user).not.toHaveProperty('isActive');
    });

    it('should preserve existing request properties', async () => {
      // Arrange
      const validToken = 'valid-jwt-token';
      const payload = { sub: 'user-123', email: 'test@example.com' };

      mockRequest.headers = { authorization: `Bearer ${validToken}` };
      mockRequest.body = { test: 'data' };
      mockRequest.params = { id: '123' };
      mockRequest.query = { search: 'test' };

      (jwt.verify as jest.Mock).mockReturnValue(payload);
      const { database } = require('../../config/database');
      database.query.mockResolvedValue({ rows: [mockUser] });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(mockRequest.body).toEqual({ test: 'data' });
      expect(mockRequest.params).toEqual({ id: '123' });
      expect(mockRequest.query).toEqual({ search: 'test' });
      expect(mockRequest.user).toBeDefined();
    });
  });

  describe('Error Logging', () => {
    it('should log authentication errors appropriately', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const validToken = 'valid-jwt-token';
      mockRequest.headers = { authorization: `Bearer ${validToken}` };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      // Act
      await authenticateToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Assert
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

export {};