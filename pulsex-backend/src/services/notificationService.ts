import { database } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';
import { userService } from './userService';
import { NotificationPayload } from '../types';
import { handleDatabaseError } from '../middleware/errorHandler';
import { APNS } from 'apn2';
import * as fs from 'fs';
import * as path from 'path';

export class NotificationService {
  private apnsProvider: APNS | null = null;

  constructor() {
    this.initializeAPNS();
  }

  private initializeAPNS(): void {
    try {
      const keyId = process.env.APN_KEY_ID;
      const teamId = process.env.APN_TEAM_ID;
      const keyFile = process.env.APN_KEY_FILE;
      const bundleId = process.env.APN_BUNDLE_ID;

      if (keyId && teamId && keyFile && bundleId) {
        const keyPath = path.resolve(keyFile);
        if (fs.existsSync(keyPath)) {
          this.apnsProvider = new APNS({
            token: {
              key: fs.readFileSync(keyPath),
              keyId,
              teamId,
            },
            production: process.env.NODE_ENV === 'production',
          });

          this.apnsProvider.on('error', (err) => {
            logger.error('APNS error', { error: err.message });
          });

          this.apnsProvider.on('transmissionError', (err, device) => {
            logger.error('APNS transmission error', { error: err.message, device });
          });

          logger.info('APNS provider initialized successfully');
        } else {
          logger.warn('APNS key file not found, push notifications disabled');
        }
      } else {
        logger.warn('APNS configuration incomplete, push notifications disabled');
      }
    } catch (error) {
      logger.error('Failed to initialize APNS provider', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async sendPushNotification(payload: NotificationPayload): Promise<boolean> {
    if (!this.apnsProvider) {
      logger.warn('APNS provider not initialized, skipping push notification');
      return false;
    }

    try {
      // Get user's active device tokens
      const deviceTokens = await userService.getActiveDeviceTokens(payload.userId);
      const iosTokens = deviceTokens.filter(token => token.device_type === 'ios');

      if (iosTokens.length === 0) {
        logger.debug('No iOS device tokens found for user', { userId: payload.userId });
        return false;
      }

      const notification = {
        aps: {
          alert: {
            title: payload.title,
            body: payload.body,
          },
          badge: 1,
          sound: 'default',
          'content-available': 1,
          'mutable-content': 1,
        },
        ...payload.data,
      };

      let successCount = 0;
      let failureCount = 0;

      for (const deviceToken of iosTokens) {
        try {
          await this.apnsProvider.send(notification, deviceToken.token);
          successCount++;
          logger.debug('Push notification sent successfully', {
            userId: payload.userId,
            deviceTokenId: deviceToken.id,
          });
        } catch (error) {
          failureCount++;
          logger.error('Failed to send push notification to device', {
            userId: payload.userId,
            deviceTokenId: deviceToken.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          // If token is invalid, deactivate it
          if (error instanceof Error && (error.message.includes('BadDeviceToken') || error.message.includes('Unregistered'))) {
            await userService.removeDeviceToken(payload.userId, deviceToken.token);
            logger.info('Deactivated invalid device token', {
              userId: payload.userId,
              deviceTokenId: deviceToken.id,
            });
          }
        }
      }

      logger.info('Push notification campaign completed', {
        userId: payload.userId,
        title: payload.title,
        successCount,
        failureCount,
        totalDevices: iosTokens.length,
      });

      // Log notification to database
      await this.logNotification(payload, successCount, failureCount);

      return successCount > 0;
    } catch (error) {
      logger.error('Failed to send push notification', {
        userId: payload.userId,
        payload,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async scheduleNotification(payload: NotificationPayload, scheduledAt: Date): Promise<void> {
    try {
      const notificationKey = `scheduled_notification:${payload.userId}:${Date.now()}`;
      const notificationData = {
        ...payload,
        scheduledAt: scheduledAt.toISOString(),
      };

      // Store in Redis with expiration
      const ttl = Math.floor((scheduledAt.getTime() - Date.now()) / 1000);
      if (ttl > 0) {
        await redisClient.set(notificationKey, JSON.stringify(notificationData), ttl);
        logger.info('Notification scheduled', {
          userId: payload.userId,
          title: payload.title,
          scheduledAt,
        });
      } else {
        // Scheduled time is in the past, send immediately
        await this.sendPushNotification(payload);
      }
    } catch (error) {
      logger.error('Failed to schedule notification', {
        userId: payload.userId,
        payload,
        scheduledAt,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async sendBriefingNotification(userId: string, briefingId: string, briefingTitle: string): Promise<boolean> {
    const payload: NotificationPayload = {
      userId,
      title: 'Your Daily Briefing is Ready',
      body: briefingTitle,
      data: {
        type: 'daily_briefing',
        briefingId,
        action: 'open_briefing',
      },
      priority: 'high',
    };

    return await this.sendPushNotification(payload);
  }

  async sendFeedbackConfirmationNotification(userId: string): Promise<boolean> {
    const payload: NotificationPayload = {
      userId,
      title: 'Thank You!',
      body: 'Your feedback helps us improve your daily briefings.',
      data: {
        type: 'feedback_confirmation',
        action: 'view_preferences',
      },
      priority: 'normal',
    };

    return await this.sendPushNotification(payload);
  }

  async sendScheduledBriefings(): Promise<void> {
    try {
      // Get users who should receive briefings now
      const currentTime = new Date().toTimeString().slice(0, 5); // HH:MM format
      const currentDate = new Date().toISOString().split('T')[0];

      const query = `
        SELECT DISTINCT u.id, u.email, up.briefing_time, up.timezone, up.notification_preferences
        FROM users u
        JOIN user_preferences up ON u.id = up.user_id
        WHERE u.is_active = true
        AND up.briefing_time = $1
        AND up.notification_preferences->>'pushEnabled' = 'true'
      `;

      const result = await database.query(query, [currentTime]);
      const users = result.rows;

      logger.info('Found users for scheduled briefings', {
        count: users.length,
        time: currentTime,
      });

      for (const user of users) {
        try {
          // Check if today's briefing already exists
          const briefingExistsQuery = `
            SELECT id, title FROM daily_briefings
            WHERE user_id = $1 AND date = $2
          `;
          const briefingResult = await database.query(briefingExistsQuery, [user.id, currentDate]);

          if (briefingResult.rows.length > 0) {
            const briefing = briefingResult.rows[0];
            await this.sendBriefingNotification(user.id, briefing.id, briefing.title);
          } else {
            // Briefing doesn't exist yet, schedule notification generation
            logger.info('Briefing not yet generated, scheduling notification', {
              userId: user.id,
              date: currentDate,
            });
          }
        } catch (error) {
          logger.error('Failed to send scheduled briefing to user', {
            userId: user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      logger.error('Failed to process scheduled briefings', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async processScheduledNotifications(): Promise<void> {
    try {
      // Get all scheduled notifications that are due
      const pattern = 'scheduled_notification:*';
      const keys = await redisClient.getClient().keys(pattern);

      for (const key of keys) {
        try {
          const notificationData = await redisClient.get(key);
          if (notificationData) {
            const notification = JSON.parse(notificationData);
            const scheduledAt = new Date(notification.scheduledAt);

            if (scheduledAt <= new Date()) {
              // Notification is due, send it
              const payload: NotificationPayload = {
                userId: notification.userId,
                title: notification.title,
                body: notification.body,
                data: notification.data,
                priority: notification.priority || 'normal',
              };

              await this.sendPushNotification(payload);
              await redisClient.del(key); // Remove from scheduled queue
            }
          }
        } catch (error) {
          logger.error('Failed to process scheduled notification', {
            key,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      logger.error('Failed to process scheduled notifications', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getUserNotificationSettings(userId: string): Promise<any> {
    try {
      const query = `
        SELECT notification_preferences FROM user_preferences WHERE user_id = $1
      `;
      const result = await database.query(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0].notification_preferences;
    } catch (error) {
      logger.error('Failed to get user notification settings', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async updateUserNotificationSettings(userId: string, settings: any): Promise<void> {
    try {
      const query = `
        UPDATE user_preferences
        SET notification_preferences = $1, updated_at = NOW()
        WHERE user_id = $2
      `;
      await database.query(query, [JSON.stringify(settings), userId]);

      logger.info('User notification settings updated', { userId });
    } catch (error) {
      logger.error('Failed to update user notification settings', {
        userId,
        settings,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async getNotificationAnalytics(userId: string, startDate: string, endDate: string): Promise<any> {
    try {
      const query = `
        SELECT
          COUNT(*) as total_sent,
          COUNT(CASE WHEN success_count > 0 THEN 1 END) as successful_notifications,
          SUM(success_count) as total_successes,
          SUM(failure_count) as total_failures
        FROM notification_logs
        WHERE user_id = $1 AND created_at BETWEEN $2 AND $3
      `;
      const result = await database.query(query, [userId, startDate, endDate]);

      const analytics = result.rows[0];

      return {
        totalSent: parseInt(analytics.total_sent),
        successfulNotifications: parseInt(analytics.successful_notifications),
        totalSuccesses: parseInt(analytics.total_successes) || 0,
        totalFailures: parseInt(analytics.total_failures) || 0,
        successRate: analytics.total_sent > 0 ? ((analytics.total_successes || 0) / (analytics.total_successes + analytics.total_failures)) * 100 : 0,
      };
    } catch (error) {
      logger.error('Failed to get notification analytics', {
        userId,
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  private async logNotification(payload: NotificationPayload, successCount: number, failureCount: number): Promise<void> {
    try {
      const query = `
        INSERT INTO notification_logs (
          user_id, title, data, success_count, failure_count, created_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
      `;
      await database.query(query, [
        payload.userId,
        payload.title,
        JSON.stringify(payload.data || {}),
        successCount,
        failureCount,
      ]);
    } catch (error) {
      logger.error('Failed to log notification', {
        userId: payload.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw here, as this is not critical
    }
  }

  async healthCheck(): Promise<{ apns: boolean; redis: boolean }> {
    const health = {
      apns: this.apnsProvider !== null,
      redis: await redisClient.healthCheck(),
    };

    return health;
  }
}

export const notificationService = new NotificationService();