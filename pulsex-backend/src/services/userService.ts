import { database } from '../config/database';
import { passwordService } from '../utils/password';
import { jwtService } from '../utils/jwt';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';
import { User, UserPreferences, DeviceToken } from '../types';
import { handleDatabaseError } from '../middleware/errorHandler';

export class UserService {
  async createUser(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
  }): Promise<{ user: User; tokens: { accessToken: string; refreshToken: string } }> {
    const startTime = Date.now();

    try {
      // Check if user already exists
      const existingUserQuery = 'SELECT id FROM users WHERE email = $1';
      const existingUser = await database.query(existingUserQuery, [userData.email]);

      if (existingUser.rows.length > 0) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const passwordHash = await passwordService.hash(userData.password);

      // Create user
      const createUserQuery = `
        INSERT INTO users (email, password_hash, first_name, last_name, phone_number, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
        RETURNING id, email, first_name, last_name, phone_number, is_active, created_at, updated_at
      `;

      const newUserResult = await database.query(createUserQuery, [
        userData.email,
        passwordHash,
        userData.firstName,
        userData.lastName,
        userData.phoneNumber || null,
      ]);

      const user = newUserResult.rows[0];

      // Create default preferences
      await this.createDefaultPreferences(user.id);

      // Generate tokens
      const tokens = jwtService.generateTokenPair({
        sub: user.id,
        email: user.email,
      });

      logger.info('User created successfully', {
        userId: user.id,
        email: user.email,
        processingTimeMs: Date.now() - startTime,
      });

      return { user, tokens };
    } catch (error) {
      logger.error('Failed to create user', {
        email: userData.email,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
      });

      if (error instanceof Error && error.message === 'User with this email already exists') {
        throw error;
      }

      throw handleDatabaseError(error);
    }
  }

  async authenticateUser(email: string, password: string): Promise<{ user: User; tokens: { accessToken: string; refreshToken: string } }> {
    const startTime = Date.now();

    try {
      // Find user by email
      const userQuery = `
        SELECT id, email, password_hash, first_name, last_name, phone_number, is_active, created_at, updated_at
        FROM users
        WHERE email = $1 AND is_active = true
      `;
      const userResult = await database.query(userQuery, [email]);

      if (userResult.rows.length === 0) {
        throw new Error('Invalid credentials');
      }

      const user = userResult.rows[0];

      // Verify password
      const isPasswordValid = await passwordService.compare(password, user.password_hash);
      if (!isPasswordValid) {
        throw new Error('Invalid credentials');
      }

      // Generate tokens
      const tokens = jwtService.generateTokenPair({
        sub: user.id,
        email: user.email,
      });

      // Remove password hash from user object
      const { password_hash, ...userWithoutPassword } = user;

      logger.info('User authenticated successfully', {
        userId: user.id,
        email: user.email,
        processingTimeMs: Date.now() - startTime,
      });

      return { user: userWithoutPassword as User, tokens };
    } catch (error) {
      logger.error('User authentication failed', {
        email,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
      });

      if (error instanceof Error && error.message === 'Invalid credentials') {
        throw error;
      }

      throw handleDatabaseError(error);
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    try {
      const userQuery = `
        SELECT id, email, first_name, last_name, phone_number, avatar_url, is_active, created_at, updated_at
        FROM users
        WHERE id = $1 AND is_active = true
      `;
      const userResult = await database.query(userQuery, [userId]);

      return userResult.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user by ID', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async updateUser(userId: string, updateData: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    avatarUrl?: string;
  }): Promise<User> {
    try {
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (updateData.firstName !== undefined) {
        updateFields.push(`first_name = $${paramIndex++}`);
        updateValues.push(updateData.firstName);
      }
      if (updateData.lastName !== undefined) {
        updateFields.push(`last_name = $${paramIndex++}`);
        updateValues.push(updateData.lastName);
      }
      if (updateData.phoneNumber !== undefined) {
        updateFields.push(`phone_number = $${paramIndex++}`);
        updateValues.push(updateData.phoneNumber);
      }
      if (updateData.avatarUrl !== undefined) {
        updateFields.push(`avatar_url = $${paramIndex++}`);
        updateValues.push(updateData.avatarUrl);
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      updateValues.push(userId);

      const updateQuery = `
        UPDATE users
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex} AND is_active = true
        RETURNING id, email, first_name, last_name, phone_number, avatar_url, is_active, created_at, updated_at
      `;

      const updateResult = await database.query(updateQuery, updateValues);

      if (updateResult.rows.length === 0) {
        throw new Error('User not found');
      }

      logger.info('User updated successfully', { userId, fields: Object.keys(updateData) });

      return updateResult.rows[0];
    } catch (error) {
      logger.error('Failed to update user', {
        userId,
        updateData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && (error.message === 'User not found' || error.message === 'No fields to update')) {
        throw error;
      }

      throw handleDatabaseError(error);
    }
  }

  async createUserPreferences(userId: string, preferences: {
    preferredTopics: string[];
    briefingTime: string;
    timezone: string;
    language: string;
    notificationPreferences: any;
  }): Promise<UserPreferences> {
    try {
      const insertQuery = `
        INSERT INTO user_preferences (
          user_id, preferred_topics, briefing_time, timezone, language,
          notification_preferences, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *
      `;

      const result = await database.query(insertQuery, [
        userId,
        JSON.stringify(preferences.preferredTopics),
        preferences.briefingTime,
        preferences.timezone,
        preferences.language,
        JSON.stringify(preferences.notificationPreferences),
      ]);

      logger.info('User preferences created', { userId });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create user preferences', {
        userId,
        preferences,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async updateUserPreferences(userId: string, preferences: {
    preferredTopics?: string[];
    briefingTime?: string;
    timezone?: string;
    language?: string;
    notificationPreferences?: any;
  }): Promise<UserPreferences> {
    try {
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (preferences.preferredTopics !== undefined) {
        updateFields.push(`preferred_topics = $${paramIndex++}`);
        updateValues.push(JSON.stringify(preferences.preferredTopics));
      }
      if (preferences.briefingTime !== undefined) {
        updateFields.push(`briefing_time = $${paramIndex++}`);
        updateValues.push(preferences.briefingTime);
      }
      if (preferences.timezone !== undefined) {
        updateFields.push(`timezone = $${paramIndex++}`);
        updateValues.push(preferences.timezone);
      }
      if (preferences.language !== undefined) {
        updateFields.push(`language = $${paramIndex++}`);
        updateValues.push(preferences.language);
      }
      if (preferences.notificationPreferences !== undefined) {
        updateFields.push(`notification_preferences = $${paramIndex++}`);
        updateValues.push(JSON.stringify(preferences.notificationPreferences));
      }

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      updateValues.push(userId);

      const updateQuery = `
        UPDATE user_preferences
        SET ${updateFields.join(', ')}
        WHERE user_id = $${paramIndex}
        RETURNING *
      `;

      const result = await database.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        throw new Error('User preferences not found');
      }

      logger.info('User preferences updated', { userId, fields: Object.keys(preferences) });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update user preferences', {
        userId,
        preferences,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && (error.message === 'User preferences not found' || error.message === 'No fields to update')) {
        throw error;
      }

      throw handleDatabaseError(error);
    }
  }

  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    try {
      const query = 'SELECT * FROM user_preferences WHERE user_id = $1';
      const result = await database.query(query, [userId]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user preferences', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async createDefaultPreferences(userId: string): Promise<void> {
    const defaultPreferences = {
      preferredTopics: ['technology', 'business', 'science'],
      briefingTime: '09:00',
      timezone: 'UTC',
      language: 'en',
      notificationPreferences: {
        pushEnabled: true,
        emailEnabled: false,
        categories: {
          news: true,
          crypto: true,
          stocks: true,
          tech: true,
        },
      },
    };

    try {
      await this.createUserPreferences(userId, defaultPreferences);
    } catch (error) {
      // If preferences already exist, that's okay
      if (error instanceof Error && !error.message.includes('already exists')) {
        throw error;
      }
    }
  }

  async addDeviceToken(userId: string, tokenData: {
    token: string;
    deviceType: 'ios' | 'android';
    deviceInfo?: Record<string, any>;
  }): Promise<DeviceToken> {
    try {
      // Check if token already exists for this user
      const existingTokenQuery = 'SELECT id FROM device_tokens WHERE user_id = $1 AND token = $2';
      const existingToken = await database.query(existingTokenQuery, [userId, tokenData.token]);

      if (existingToken.rows.length > 0) {
        // Update existing token
        const updateQuery = `
          UPDATE device_tokens
          SET device_type = $1, device_info = $2, is_active = true, updated_at = NOW()
          WHERE user_id = $3 AND token = $4
          RETURNING *
        `;
        const result = await database.query(updateQuery, [
          tokenData.deviceType,
          JSON.stringify(tokenData.deviceInfo || {}),
          userId,
          tokenData.token,
        ]);
        return result.rows[0];
      } else {
        // Create new token
        const insertQuery = `
          INSERT INTO device_tokens (user_id, token, device_type, device_info, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, true, NOW(), NOW())
          RETURNING *
        `;
        const result = await database.query(insertQuery, [
          userId,
          tokenData.token,
          tokenData.deviceType,
          JSON.stringify(tokenData.deviceInfo || {}),
        ]);
        return result.rows[0];
      }
    } catch (error) {
      logger.error('Failed to add device token', {
        userId,
        deviceType: tokenData.deviceType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async removeDeviceToken(userId: string, token: string): Promise<void> {
    try {
      const query = 'UPDATE device_tokens SET is_active = false, updated_at = NOW() WHERE user_id = $1 AND token = $2';
      await database.query(query, [userId, token]);

      logger.info('Device token removed', { userId });
    } catch (error) {
      logger.error('Failed to remove device token', {
        userId,
        token,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async getActiveDeviceTokens(userId: string): Promise<DeviceToken[]> {
    try {
      const query = 'SELECT * FROM device_tokens WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC';
      const result = await database.query(query, [userId]);

      return result.rows.map(row => ({
        ...row,
        device_info: typeof row.device_info === 'string' ? JSON.parse(row.device_info) : row.device_info,
      }));
    } catch (error) {
      logger.error('Failed to get active device tokens', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async deactivateUser(userId: string): Promise<void> {
    try {
      await database.transaction(async (client) => {
        // Deactivate user
        await client.query('UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1', [userId]);

        // Deactivate all device tokens
        await client.query('UPDATE device_tokens SET is_active = false, updated_at = NOW() WHERE user_id = $1', [userId]);
      });

      logger.info('User deactivated', { userId });
    } catch (error) {
      logger.error('Failed to deactivate user', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }
}

export const userService = new UserService();