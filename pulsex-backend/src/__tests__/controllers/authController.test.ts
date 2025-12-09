import { Request, Response } from 'express';
import { AuthController } from '../../controllers/authController';
import { userService } from '../../services/userService';
import { jwtService } from '../../utils/jwt';
import { validateRequest } from '../../utils/validation';
import { passwordService } from '../../utils/password';
import {
  createMockRequest,
  createMockResponse,
  createMockUser,
  createMockJWTPayload
} from '../../../tests/setup';

// Mock all dependencies
jest.mock('../../services/userService');
jest.mock('../../utils/jwt');
jest.mock('../../utils/validation');
jest.mock('../../utils/password', () => ({
  passwordService: {
    validatePasswordStrength: jest.fn(),
  },
}));

describe('AuthController', () => {
  let authController: AuthController;
  let mockRequest: Request;
  let mockResponse: Response;

  beforeEach(() => {
    authController = new AuthController();
    mockRequest = createMockRequest();
    mockResponse = createMockResponse();
    jest.clearAllMocks();
  });

  describe('register', () => {
    const validUserData = {
      email: 'test@example.com',
      password: 'SecurePass123!',
      firstName: 'Test',
      lastName: 'User',
      phoneNumber: '+1234567890',
    };

    it('should successfully register a new user', async () => {
      // Arrange
      mockRequest.body = validUserData;
      const mockUser = createMockUser();
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      };

      (validateRequest as jest.Mock).mockReturnValue(validUserData);
      (passwordService.validatePasswordStrength as jest.Mock).mockResolvedValue({
        isValid: true,
        errors: [],
      });
      (userService.createUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });

      // Act
      await authController.register(mockRequest, mockResponse);

      // Assert
      expect(validateRequest).toHaveBeenCalled();
      expect(passwordService.validatePasswordStrength).toHaveBeenCalledWith(validUserData.password);
      expect(userService.createUser).toHaveBeenCalledWith(validUserData);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: {
            id: mockUser.id,
            email: mockUser.email,
            firstName: mockUser.first_name,
            lastName: mockUser.last_name,
            phoneNumber: mockUser.phone_number,
            avatarUrl: mockUser.avatar_url,
            isActive: mockUser.is_active,
            createdAt: mockUser.created_at,
          },
          tokens: mockTokens,
        },
        requestId: expect.any(String),
      });
    });

    it('should return 400 for weak password', async () => {
      // Arrange
      mockRequest.body = { ...validUserData, password: 'weak' };

      (validateRequest as jest.Mock).mockReturnValue(mockRequest.body);
      (passwordService.validatePasswordStrength as jest.Mock).mockResolvedValue({
        isValid: false,
        errors: ['Password must be at least 8 characters long'],
      });

      // Act
      await authController.register(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'PASSWORD_TOO_WEAK',
          message: 'Password does not meet security requirements',
          details: {
            errors: ['Password must be at least 8 characters long'],
          },
        },
        requestId: expect.any(String),
      });
    });

    it('should handle duplicate email error', async () => {
      // Arrange
      mockRequest.body = validUserData;

      (validateRequest as jest.Mock).mockReturnValue(validUserData);
      (passwordService.validatePasswordStrength as jest.Mock).mockResolvedValue({
        isValid: true,
        errors: [],
      });
      (userService.createUser as jest.Mock).mockRejectedValue(
        new Error('User with this email already exists')
      );

      // Act
      await authController.register(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(409);
    });

    it('should handle validation errors', async () => {
      // Arrange
      mockRequest.body = { email: 'invalid-email' };

      (validateRequest as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid email format');
      });

      // Act
      await authController.register(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'SecurePass123!',
    };

    it('should successfully login a user', async () => {
      // Arrange
      mockRequest.body = validLoginData;
      const mockUser = createMockUser();
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      };

      (validateRequest as jest.Mock).mockReturnValue(validLoginData);
      (userService.authenticateUser as jest.Mock).mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });

      // Act
      await authController.login(mockRequest, mockResponse);

      // Assert
      expect(validateRequest).toHaveBeenCalled();
      expect(userService.authenticateUser).toHaveBeenCalledWith(
        validLoginData.email,
        validLoginData.password
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          user: {
            id: mockUser.id,
            email: mockUser.email,
            firstName: mockUser.first_name,
            lastName: mockUser.last_name,
            phoneNumber: mockUser.phone_number,
            avatarUrl: mockUser.avatar_url,
            isActive: mockUser.is_active,
            createdAt: mockUser.created_at,
          },
          tokens: mockTokens,
        },
        requestId: expect.any(String),
      });
    });

    it('should return 401 for invalid credentials', async () => {
      // Arrange
      mockRequest.body = validLoginData;

      (validateRequest as jest.Mock).mockReturnValue(validLoginData);
      (userService.authenticateUser as jest.Mock).mockRejectedValue(
        new Error('Invalid credentials')
      );

      // Act
      await authController.login(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 for inactive user', async () => {
      // Arrange
      mockRequest.body = validLoginData;
      const inactiveUser = { ...createMockUser(), is_active: false };

      (validateRequest as jest.Mock).mockReturnValue(validLoginData);
      (userService.authenticateUser as jest.Mock).mockRejectedValue(
        new Error('Account is deactivated')
      );

      // Act
      await authController.login(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('refresh', () => {
    it('should successfully refresh tokens', async () => {
      // Arrange
      const refreshToken = 'valid-refresh-token';
      const newTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      mockRequest.body = { refreshToken };
      mockRequest.headers = { ...mockRequest.headers, 'x-request-id': 'test-id' };

      (jwtService.verifyRefreshToken as jest.Mock).mockReturnValue(createMockJWTPayload());
      (userService.refreshToken as jest.Mock).mockResolvedValue(newTokens);

      // Act
      await authController.refresh(mockRequest, mockResponse);

      // Assert
      expect(jwtService.verifyRefreshToken).toHaveBeenCalledWith(refreshToken);
      expect(userService.refreshToken).toHaveBeenCalledWith(refreshToken);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: newTokens,
        requestId: 'test-id',
      });
    });

    it('should return 401 for invalid refresh token', async () => {
      // Arrange
      mockRequest.body = { refreshToken: 'invalid-token' };

      (jwtService.verifyRefreshToken as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act
      await authController.refresh(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for expired refresh token', async () => {
      // Arrange
      mockRequest.body = { refreshToken: 'expired-token' };

      (jwtService.verifyRefreshToken as jest.Mock).mockImplementation(() => {
        throw new Error('Token expired');
      });

      // Act
      await authController.refresh(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      // Arrange
      const userId = 'user-123';
      mockRequest.user = { id: userId, email: 'test@example.com' };
      mockRequest.headers = { ...mockRequest.headers, 'x-request-id': 'test-id' };

      (userService.logout as jest.Mock).mockResolvedValue(undefined);

      // Act
      await authController.logout(mockRequest, mockResponse);

      // Assert
      expect(userService.logout).toHaveBeenCalledWith(userId);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Logged out successfully' },
        requestId: 'test-id',
      });
    });

    it('should handle logout errors', async () => {
      // Arrange
      const userId = 'user-123';
      mockRequest.user = { id: userId, email: 'test@example.com' };

      (userService.logout as jest.Mock).mockRejectedValue(
        new Error('Failed to logout')
      );

      // Act
      await authController.logout(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });
  });

  describe('verifyEmail', () => {
    it('should successfully verify email', async () => {
      // Arrange
      const token = 'verification-token';
      mockRequest.body = { token };

      (jwtService.verifyEmailToken as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
      });
      (userService.verifyEmail as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        isVerified: true,
      });

      // Act
      await authController.verifyEmail(mockRequest, mockResponse);

      // Assert
      expect(jwtService.verifyEmailToken).toHaveBeenCalledWith(token);
      expect(userService.verifyEmail).toHaveBeenCalledWith('user-123');
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 for invalid verification token', async () => {
      // Arrange
      mockRequest.body = { token: 'invalid-token' };

      (jwtService.verifyEmailToken as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act
      await authController.verifyEmail(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('changePassword', () => {
    it('should successfully change password', async () => {
      // Arrange
      const userId = 'user-123';
      const passwordData = {
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass123!',
      };

      mockRequest.user = { id: userId, email: 'test@example.com' };
      mockRequest.body = passwordData;

      (validateRequest as jest.Mock).mockReturnValue(passwordData);
      (passwordService.validatePasswordStrength as jest.Mock).mockResolvedValue({
        isValid: true,
        errors: [],
      });
      (userService.changePassword as jest.Mock).mockResolvedValue(undefined);

      // Act
      await authController.changePassword(mockRequest, mockResponse);

      // Assert
      expect(userService.changePassword).toHaveBeenCalledWith(
        userId,
        passwordData.currentPassword,
        passwordData.newPassword
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 for weak new password', async () => {
      // Arrange
      const userId = 'user-123';
      const passwordData = {
        currentPassword: 'OldPass123!',
        newPassword: 'weak',
      };

      mockRequest.user = { id: userId, email: 'test@example.com' };
      mockRequest.body = passwordData;

      (validateRequest as jest.Mock).mockReturnValue(passwordData);
      (passwordService.validatePasswordStrength as jest.Mock).mockResolvedValue({
        isValid: false,
        errors: ['Password is too weak'],
      });

      // Act
      await authController.changePassword(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should return 401 for incorrect current password', async () => {
      // Arrange
      const userId = 'user-123';
      const passwordData = {
        currentPassword: 'WrongPass123!',
        newPassword: 'NewPass123!',
      };

      mockRequest.user = { id: userId, email: 'test@example.com' };
      mockRequest.body = passwordData;

      (validateRequest as jest.Mock).mockReturnValue(passwordData);
      (passwordService.validatePasswordStrength as jest.Mock).mockResolvedValue({
        isValid: true,
        errors: [],
      });
      (userService.changePassword as jest.Mock).mockRejectedValue(
        new Error('Current password is incorrect')
      );

      // Act
      await authController.changePassword(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });
  });

  describe('forgotPassword', () => {
    it('should successfully send password reset email', async () => {
      // Arrange
      const email = 'test@example.com';
      mockRequest.body = { email };

      (validateRequest as jest.Mock).mockReturnValue({ email });
      (userService.initiatePasswordReset as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Password reset email sent',
      });

      // Act
      await authController.forgotPassword(mockRequest, mockResponse);

      // Assert
      expect(userService.initiatePasswordReset).toHaveBeenCalledWith(email);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should handle non-existent email gracefully', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      mockRequest.body = { email };

      (validateRequest as jest.Mock).mockReturnValue({ email });
      (userService.initiatePasswordReset as jest.Mock).mockResolvedValue({
        success: true,
        message: 'If email exists, reset link sent',
      });

      // Act
      await authController.forgotPassword(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });
  });

  describe('resetPassword', () => {
    it('should successfully reset password', async () => {
      // Arrange
      const resetData = {
        token: 'valid-reset-token',
        newPassword: 'NewPass123!',
      };

      mockRequest.body = resetData;

      (validateRequest as jest.Mock).mockReturnValue(resetData);
      (passwordService.validatePasswordStrength as jest.Mock).mockResolvedValue({
        isValid: true,
        errors: [],
      });
      (userService.completePasswordReset as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Password reset successful',
      });

      // Act
      await authController.resetPassword(mockRequest, mockResponse);

      // Assert
      expect(userService.completePasswordReset).toHaveBeenCalledWith(
        resetData.token,
        resetData.newPassword
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 for invalid reset token', async () => {
      // Arrange
      const resetData = {
        token: 'invalid-token',
        newPassword: 'NewPass123!',
      };

      mockRequest.body = resetData;

      (validateRequest as jest.Mock).mockReturnValue(resetData);
      (passwordService.validatePasswordStrength as jest.Mock).mockResolvedValue({
        isValid: true,
        errors: [],
      });
      (userService.completePasswordReset as jest.Mock).mockRejectedValue(
        new Error('Invalid or expired reset token')
      );

      // Act
      await authController.resetPassword(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });
});

export {};