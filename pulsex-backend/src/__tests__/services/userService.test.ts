import { userService } from '../../services/userService';
import { database } from '../../config/database';
import { redisClient } from '../../config/redis';
import { jwtService } from '../../utils/jwt';
import { passwordService } from '../../utils/password';
import { createMockUser, createMockJWTPayload } from '../../../tests/setup';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../config/redis');
jest.mock('../../utils/jwt');
jest.mock('../../utils/password');

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    const userData = {
      email: 'test@example.com',
      password: 'SecurePass123!',
      firstName: 'Test',
      lastName: 'User',
      phoneNumber: '+1234567890',
    };

    it('should create a new user successfully', async () => {
      // Arrange
      const mockUser = createMockUser();
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      };

      (database.query as jest.Mock).mockResolvedValue({ rows: [] }); // No existing user
      (passwordService.hashPassword as jest.Mock).mockResolvedValue('hashed-password');
      (database.query as jest.Mock).mockResolvedValue({ rows: [mockUser] });
      (jwtService.generateTokenPair as jest.Mock).mockReturnValue(mockTokens);

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM users WHERE email = $1'),
        [userData.email]
      );
      expect(passwordService.hashPassword).toHaveBeenCalledWith(userData.password);
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([
          userData.email,
          'hashed-password',
          userData.firstName,
          userData.lastName,
          userData.phoneNumber,
        ])
      );
      expect(jwtService.generateTokenPair).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: userData.email,
      });
      expect(result).toEqual({ user: mockUser, tokens: mockTokens });
    });

    it('should throw error for duplicate email', async () => {
      // Arrange
      (database.query as jest.Mock).mockResolvedValue({
        rows: [{ id: 'existing-user-id' }],
      });

      // Act & Assert
      await expect(userService.createUser(userData)).rejects.toThrow(
        'User with this email already exists'
      );
    });

    it('should handle database errors', async () => {
      // Arrange
      (database.query as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act & Assert
      await expect(userService.createUser(userData)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should validate required fields', async () => {
      // Arrange
      const invalidUserData = { ...userData, email: '' };

      // Act & Assert
      await expect(userService.createUser(invalidUserData)).rejects.toThrow();
    });
  });

  describe('authenticateUser', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'SecurePass123!',
    };

    it('should authenticate user with valid credentials', async () => {
      // Arrange
      const mockUser = createMockUser();
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      };

      (database.query as jest.Mock).mockResolvedValue({ rows: [mockUser] });
      (passwordService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (jwtService.generateTokenPair as jest.Mock).mockReturnValue(mockTokens);

      // Act
      const result = await userService.authenticateUser(
        loginData.email,
        loginData.password
      );

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM users WHERE email = $1'),
        [loginData.email]
      );
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        loginData.password,
        mockUser.password_hash
      );
      expect(result).toEqual({ user: mockUser, tokens: mockTokens });
    });

    it('should throw error for non-existent user', async () => {
      // Arrange
      (database.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act & Assert
      await expect(
        userService.authenticateUser(loginData.email, loginData.password)
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for invalid password', async () => {
      // Arrange
      const mockUser = createMockUser();
      (database.query as jest.Mock).mockResolvedValue({ rows: [mockUser] });
      (passwordService.verifyPassword as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(
        userService.authenticateUser(loginData.email, loginData.password)
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw error for inactive user', async () => {
      // Arrange
      const inactiveUser = { ...createMockUser(), is_active: false };
      (database.query as jest.Mock).mockResolvedValue({ rows: [inactiveUser] });
      (passwordService.verifyPassword as jest.Mock).mockResolvedValue(true);

      // Act & Assert
      await expect(
        userService.authenticateUser(loginData.email, loginData.password)
      ).rejects.toThrow('Account is deactivated');
    });
  });

  describe('getUserById', () => {
    it('should return user by ID', async () => {
      // Arrange
      const userId = 'user-123';
      const mockUser = createMockUser();

      (database.query as jest.Mock).mockResolvedValue({ rows: [mockUser] });

      // Act
      const result = await userService.getUserById(userId);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, email, first_name, last_name'),
        [userId]
      );
      expect(result).toEqual(mockUser);
    });

    it('should return null for non-existent user', async () => {
      // Arrange
      const userId = 'nonexistent-user';
      (database.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act
      const result = await userService.getUserById(userId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    const userId = 'user-123';
    const updateData = {
      firstName: 'Updated',
      lastName: 'Name',
      phoneNumber: '+9876543210',
    };

    it('should update user successfully', async () => {
      // Arrange
      const updatedUser = { ...createMockUser(), first_name: 'Updated', last_name: 'Name' };
      (database.query as jest.Mock).mockResolvedValue({ rows: [updatedUser] });

      // Act
      const result = await userService.updateUser(userId, updateData);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        expect.arrayContaining([
          updateData.firstName,
          updateData.lastName,
          updateData.phoneNumber,
          userId,
        ])
      );
      expect(result).toEqual(updatedUser);
    });

    it('should handle partial updates', async () => {
      // Arrange
      const partialUpdate = { firstName: 'Updated' };
      const mockUser = createMockUser();
      (database.query as jest.Mock).mockResolvedValue({ rows: [mockUser] });

      // Act
      await userService.updateUser(userId, partialUpdate);

      // Assert
      expect(database.query).toHaveBeenCalled();
    });

    it('should throw error for non-existent user', async () => {
      // Arrange
      (database.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act & Assert
      await expect(userService.updateUser(userId, updateData)).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('refreshToken', () => {
    const refreshToken = 'test-refresh-token';

    it('should refresh tokens with valid refresh token', async () => {
      // Arrange
      const mockPayload = createMockJWTPayload();
      const newTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };

      (jwtService.verifyRefreshToken as jest.Mock).mockReturnValue(mockPayload);
      (redisClient.get as jest.Mock).mockResolvedValue(refreshToken);
      (jwtService.generateTokenPair as jest.Mock).mockReturnValue(newTokens);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      // Act
      const result = await userService.refreshToken(refreshToken);

      // Assert
      expect(jwtService.verifyRefreshToken).toHaveBeenCalledWith(refreshToken);
      expect(redisClient.get).toHaveBeenCalledWith(`refresh_token:${mockPayload.sub}`);
      expect(jwtService.generateTokenPair).toHaveBeenCalledWith({
        sub: mockPayload.sub,
        email: mockPayload.email,
      });
      expect(result).toEqual(newTokens);
    });

    it('should throw error for invalid refresh token', async () => {
      // Arrange
      (jwtService.verifyRefreshToken as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act & Assert
      await expect(userService.refreshToken(refreshToken)).rejects.toThrow(
        'Invalid refresh token'
      );
    });

    it('should throw error when refresh token not found in Redis', async () => {
      // Arrange
      const mockPayload = createMockJWTPayload();
      (jwtService.verifyRefreshToken as jest.Mock).mockReturnValue(mockPayload);
      (redisClient.get as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(userService.refreshToken(refreshToken)).rejects.toThrow(
        'Refresh token not found'
      );
    });
  });

  describe('logout', () => {
    const userId = 'user-123';

    it('should logout user successfully', async () => {
      // Arrange
      (redisClient.del as jest.Mock).mockResolvedValue(1);

      // Act
      await userService.logout(userId);

      // Assert
      expect(redisClient.del).toHaveBeenCalledWith(`refresh_token:${userId}`);
    });

    it('should handle logout when user not logged in', async () => {
      // Arrange
      (redisClient.del as jest.Mock).mockResolvedValue(0);

      // Act - Should not throw error
      await expect(userService.logout(userId)).resolves.not.toThrow();
    });
  });

  describe('changePassword', () => {
    const userId = 'user-123';
    const passwordData = {
      currentPassword: 'OldPass123!',
      newPassword: 'NewPass123!',
    };

    it('should change password successfully', async () => {
      // Arrange
      const mockUser = createMockUser();
      (database.query as jest.Mock).mockResolvedValue({ rows: [mockUser] });
      (passwordService.verifyPassword as jest.Mock).mockResolvedValue(true);
      (passwordService.hashPassword as jest.Mock).mockResolvedValue('new-hashed-password');
      (database.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      // Act
      await userService.changePassword(userId, passwordData.currentPassword, passwordData.newPassword);

      // Assert
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        passwordData.currentPassword,
        mockUser.password_hash
      );
      expect(passwordService.hashPassword).toHaveBeenCalledWith(passwordData.newPassword);
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET password_hash = $1'),
        expect.arrayContaining(['new-hashed-password', userId])
      );
    });

    it('should throw error for incorrect current password', async () => {
      // Arrange
      const mockUser = createMockUser();
      (database.query as jest.Mock).mockResolvedValue({ rows: [mockUser] });
      (passwordService.verifyPassword as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(
        userService.changePassword(userId, passwordData.currentPassword, passwordData.newPassword)
      ).rejects.toThrow('Current password is incorrect');
    });
  });

  describe('verifyEmail', () => {
    const userId = 'user-123';

    it('should verify email successfully', async () => {
      // Arrange
      (database.query as jest.Mock).mockResolvedValue({ rows: [{ id: userId }] });

      // Act
      const result = await userService.verifyEmail(userId);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET email_verified = true'),
        [userId]
      );
      expect(result).toEqual({ id: userId, emailVerified: true });
    });

    it('should throw error for non-existent user', async () => {
      // Arrange
      (database.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act & Assert
      await expect(userService.verifyEmail(userId)).rejects.toThrow('User not found');
    });
  });

  describe('initiatePasswordReset', () => {
    const email = 'test@example.com';
    const mockUser = createMockUser();

    it('should initiate password reset for existing user', async () => {
      // Arrange
      (database.query as jest.Mock).mockResolvedValue({ rows: [mockUser] });
      (jwtService.generatePasswordResetToken as jest.Mock).mockReturnValue('reset-token');
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      // Act
      const result = await userService.initiatePasswordReset(email);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, email FROM users WHERE email = $1'),
        [email]
      );
      expect(jwtService.generatePasswordResetToken).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
      });
      expect(redisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('password_reset:'),
        expect.any(String),
        expect.stringContaining('EX'),
        expect.any(Function)
      );
      expect(result).toEqual({ success: true, message: 'Password reset email sent' });
    });

    it('should handle non-existent email gracefully', async () => {
      // Arrange
      (database.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act
      const result = await userService.initiatePasswordReset(email);

      // Assert
      expect(result).toEqual({
        success: true,
        message: 'If email exists, reset link sent',
      });
    });
  });

  describe('completePasswordReset', () => {
    const resetToken = 'valid-reset-token';
    const newPassword = 'NewPass123!';
    const mockPayload = createMockJWTPayload();

    it('should complete password reset successfully', async () => {
      // Arrange
      (jwtService.verifyPasswordResetToken as jest.Mock).mockReturnValue(mockPayload);
      (redisClient.get as jest.Mock).mockResolvedValue(resetToken);
      (passwordService.hashPassword as jest.Mock).mockResolvedValue('new-hashed-password');
      (database.query as jest.Mock).mockResolvedValue({ rows: [{ id: mockPayload.sub }] });
      (redisClient.del as jest.Mock).mockResolvedValue(1);

      // Act
      const result = await userService.completePasswordReset(resetToken, newPassword);

      // Assert
      expect(jwtService.verifyPasswordResetToken).toHaveBeenCalledWith(resetToken);
      expect(redisClient.get).toHaveBeenCalledWith(`password_reset:${mockPayload.sub}`);
      expect(passwordService.hashPassword).toHaveBeenCalledWith(newPassword);
      expect(result).toEqual({ success: true, message: 'Password reset successful' });
    });

    it('should throw error for invalid reset token', async () => {
      // Arrange
      (jwtService.verifyPasswordResetToken as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act & Assert
      await expect(
        userService.completePasswordReset(resetToken, newPassword)
      ).rejects.toThrow('Invalid or expired reset token');
    });
  });

  describe('updateLastLogin', () => {
    const userId = 'user-123';

    it('should update last login timestamp', async () => {
      // Arrange
      (database.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      // Act
      await userService.updateLastLogin(userId);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET last_login'),
        expect.any(Array)
      );
    });
  });
});

export {};