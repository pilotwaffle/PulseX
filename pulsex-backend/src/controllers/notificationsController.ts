import { Request, Response } from 'express';
import { notificationService } from '../services/notificationService';
import { userService } from '../services/userService';
import { validateRequest, DeviceToken, NotificationPreferences } from '../utils/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';
import { APIResponse } from '../types';
import { v4 as uuidv4 } from 'uuid';

class NotificationsController {
  registerDeviceToken = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    const validatedData = validateRequest(DeviceToken, req.body);

    const deviceToken = await userService.addDeviceToken(req.user.id, {
      token: validatedData.token,
      deviceType: validatedData.deviceType,
      deviceInfo: validatedData.deviceInfo || {},
    });

    const response: APIResponse = {
      success: true,
      data: { deviceToken },
      requestId,
    };

    res.status(201).json(response);
  });

  removeDeviceToken = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    const { token } = req.body;

    if (!token) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'TOKEN_REQUIRED',
          message: 'Device token is required',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    await userService.removeDeviceToken(req.user.id, token);

    const response: APIResponse = {
      success: true,
      data: { message: 'Device token removed successfully' },
      requestId,
    };

    res.json(response);
  });

  getDeviceTokens = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    const deviceTokens = await userService.getActiveDeviceTokens(req.user.id);

    const response: APIResponse = {
      success: true,
      data: { deviceTokens },
      requestId,
    };

    res.json(response);
  });

  sendTestNotification = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    const { title, body } = req.body;

    if (!title || !body) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'MISSING_NOTIFICATION_CONTENT',
          message: 'Title and body are required',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const success = await notificationService.sendPushNotification({
      userId: req.user.id,
      title,
      body,
      data: {
        type: 'test_notification',
        action: 'open_app',
      },
      priority: 'normal',
    });

    const response: APIResponse = {
      success: true,
      data: {
        message: 'Test notification sent',
        success,
      },
      requestId,
    };

    res.json(response);
  });

  getNotificationSettings = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    const settings = await notificationService.getUserNotificationSettings(req.user.id);

    if (!settings) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'NOTIFICATION_SETTINGS_NOT_FOUND',
          message: 'Notification settings not found',
        },
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    const response: APIResponse = {
      success: true,
      data: { settings },
      requestId,
    };

    res.json(response);
  });

  updateNotificationSettings = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    const validatedData = validateRequest(NotificationPreferences, req.body);

    await notificationService.updateUserNotificationSettings(req.user.id, validatedData);

    const response: APIResponse = {
      success: true,
      data: { message: 'Notification settings updated successfully' },
      requestId,
    };

    res.json(response);
  });

  getNotificationAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'MISSING_DATE_RANGE',
          message: 'startDate and endDate query parameters are required',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    // Validate date format
    const startDateObj = new Date(startDate as string);
    const endDateObj = new Date(endDate as string);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_DATE_FORMAT',
          message: 'Dates must be in YYYY-MM-DD format',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    if (startDateObj > endDateObj) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_DATE_RANGE',
          message: 'startDate must be before or equal to endDate',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const analytics = await notificationService.getNotificationAnalytics(
      req.user.id,
      startDate as string,
      endDate as string
    );

    const response: APIResponse = {
      success: true,
      data: { analytics },
      requestId,
    };

    res.json(response);
  });

  scheduleNotification = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    const { title, body, scheduledAt, data, priority } = req.body;

    if (!title || !body || !scheduledAt) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Title, body, and scheduledAt are required',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const scheduledDate = new Date(scheduledAt);

    if (isNaN(scheduledDate.getTime())) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_SCHEDULED_DATE',
          message: 'scheduledAt must be a valid ISO date string',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    if (scheduledDate <= new Date()) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'SCHEDULED_DATE_IN_PAST',
          message: 'scheduledAt must be in the future',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    await notificationService.scheduleNotification({
      userId: req.user.id,
      title,
      body,
      data: data || {},
      priority: priority || 'normal',
      scheduledAt: scheduledDate,
    });

    const response: APIResponse = {
      success: true,
      data: {
        message: 'Notification scheduled successfully',
        scheduledAt: scheduledDate.toISOString(),
      },
      requestId,
    };

    res.status(201).json(response);
  });

  // Admin endpoint to trigger scheduled briefings
  triggerScheduledBriefings = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    if (!req.user) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        },
        requestId,
      };
      res.status(401).json(response);
      return;
    }

    await notificationService.sendScheduledBriefings();

    const response: APIResponse = {
      success: true,
      data: { message: 'Scheduled briefings processed' },
      requestId,
    };

    res.json(response);
  });

  // Health check endpoint for notification service
  healthCheck = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    const health = await notificationService.healthCheck();

    const response: APIResponse = {
      success: true,
      data: { health },
      requestId,
    };

    res.json(response);
  });
}

export const notificationsController = new NotificationsController();