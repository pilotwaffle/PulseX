import { Request, Response } from 'express';
import { userService } from '../services/userService';
import { validateRequest, UserPreferences } from '../utils/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';
import { APIResponse } from '../types';
import { v4 as uuidv4 } from 'uuid';

class UserPreferencesController {
  getUserPreferences = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const preferences = await userService.getUserPreferences(req.user.id);

    if (!preferences) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'PREFERENCES_NOT_FOUND',
          message: 'User preferences not found',
        },
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    const response: APIResponse = {
      success: true,
      data: {
        preferences: {
          ...preferences,
          preferred_topics: typeof preferences.preferred_topics === 'string'
            ? JSON.parse(preferences.preferred_topics)
            : preferences.preferred_topics,
          notification_preferences: typeof preferences.notification_preferences === 'string'
            ? JSON.parse(preferences.notification_preferences)
            : preferences.notification_preferences,
        },
      },
      requestId,
    };

    res.json(response);
  });

  createUserPreferences = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const validatedData = validateRequest(UserPreferences, req.body);

    // Check if preferences already exist
    const existingPreferences = await userService.getUserPreferences(req.user.id);
    if (existingPreferences) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'PREFERENCES_ALREADY_EXIST',
          message: 'User preferences already exist. Use PUT to update them.',
        },
        requestId,
      };
      res.status(409).json(response);
      return;
    }

    const preferences = await userService.createUserPreferences(req.user.id, {
      preferredTopics: validatedData.preferredTopics,
      briefingTime: validatedData.briefingTime,
      timezone: validatedData.timezone,
      language: validatedData.language,
      notificationPreferences: validatedData.notificationPreferences,
    });

    const response: APIResponse = {
      success: true,
      data: {
        preferences: {
          ...preferences,
          preferred_topics: typeof preferences.preferred_topics === 'string'
            ? JSON.parse(preferences.preferred_topics)
            : preferences.preferred_topics,
          notification_preferences: typeof preferences.notification_preferences === 'string'
            ? JSON.parse(preferences.notification_preferences)
            : preferences.notification_preferences,
        },
      },
      requestId,
    };

    res.status(201).json(response);
  });

  updateUserPreferences = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const validatedData = validateRequest(UserPreferences, req.body);

    const preferences = await userService.updateUserPreferences(req.user.id, {
      preferredTopics: validatedData.preferredTopics,
      briefingTime: validatedData.briefingTime,
      timezone: validatedData.timezone,
      language: validatedData.language,
      notificationPreferences: validatedData.notificationPreferences,
    });

    const response: APIResponse = {
      success: true,
      data: {
        preferences: {
          ...preferences,
          preferred_topics: typeof preferences.preferred_topics === 'string'
            ? JSON.parse(preferences.preferred_topics)
            : preferences.preferred_topics,
          notification_preferences: typeof preferences.notification_preferences === 'string'
            ? JSON.parse(preferences.notification_preferences)
            : preferences.notification_preferences,
        },
      },
      requestId,
    };

    res.json(response);
  });

  updatePartialPreferences = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { preferredTopics, briefingTime, timezone, language, notificationPreferences } = req.body;

    // Validate that at least one field is provided
    if (preferredTopics === undefined && briefingTime === undefined &&
        timezone === undefined && language === undefined && notificationPreferences === undefined) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'NO_FIELDS_TO_UPDATE',
          message: 'At least one field must be provided for update',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    // Validate partial update
    const updateData: any = {};
    if (preferredTopics !== undefined) {
      if (!Array.isArray(preferredTopics) || preferredTopics.length === 0) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'INVALID_TOPICS',
            message: 'Preferred topics must be a non-empty array',
          },
          requestId,
        };
        res.status(400).json(response);
        return;
      }
      updateData.preferredTopics = preferredTopics;
    }

    if (briefingTime !== undefined) {
      if (!/^[0-2][0-9]:[0-5][0-9]$/.test(briefingTime)) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'INVALID_TIME_FORMAT',
            message: 'Briefing time must be in HH:MM format',
          },
          requestId,
        };
        res.status(400).json(response);
        return;
      }
      updateData.briefingTime = briefingTime;
    }

    if (timezone !== undefined) {
      if (typeof timezone !== 'string' || timezone.trim() === '') {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'INVALID_TIMEZONE',
            message: 'Timezone must be a non-empty string',
          },
          requestId,
        };
        res.status(400).json(response);
        return;
      }
      updateData.timezone = timezone;
    }

    if (language !== undefined) {
      if (typeof language !== 'string' || language.length < 2) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'INVALID_LANGUAGE',
            message: 'Language must be a string with at least 2 characters',
          },
          requestId,
        };
        res.status(400).json(response);
        return;
      }
      updateData.language = language;
    }

    if (notificationPreferences !== undefined) {
      if (typeof notificationPreferences !== 'object' || notificationPreferences === null) {
        const response: APIResponse = {
          success: false,
          error: {
            code: 'INVALID_NOTIFICATION_PREFERENCES',
            message: 'Notification preferences must be an object',
          },
          requestId,
        };
        res.status(400).json(response);
        return;
      }
      updateData.notificationPreferences = notificationPreferences;
    }

    const preferences = await userService.updateUserPreferences(req.user.id, updateData);

    const response: APIResponse = {
      success: true,
      data: {
        preferences: {
          ...preferences,
          preferred_topics: typeof preferences.preferred_topics === 'string'
            ? JSON.parse(preferences.preferred_topics)
            : preferences.preferred_topics,
          notification_preferences: typeof preferences.notification_preferences === 'string'
            ? JSON.parse(preferences.notification_preferences)
            : preferences.notification_preferences,
        },
      },
      requestId,
    };

    res.json(response);
  });

  getAvailableTopics = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    // Available topics that users can select from
    const availableTopics = [
      {
        id: 'technology',
        name: 'Technology',
        description: 'Latest tech news, AI, startups, and innovations',
        category: 'tech',
      },
      {
        id: 'business',
        name: 'Business',
        description: 'Corporate news, markets, and economy',
        category: 'business',
      },
      {
        id: 'science',
        name: 'Science',
        description: 'Scientific discoveries and research',
        category: 'science',
      },
      {
        id: 'health',
        name: 'Health',
        description: 'Medical news and wellness',
        category: 'health',
      },
      {
        id: 'sports',
        name: 'Sports',
        description: 'Sports news and highlights',
        category: 'sports',
      },
      {
        id: 'entertainment',
        name: 'Entertainment',
        description: 'Movies, music, and celebrity news',
        category: 'entertainment',
      },
      {
        id: 'politics',
        name: 'Politics',
        description: 'Political news and government updates',
        category: 'politics',
      },
      {
        id: 'world',
        name: 'World News',
        description: 'International news and global events',
        category: 'world',
      },
      {
        id: 'crypto',
        name: 'Cryptocurrency',
        description: 'Bitcoin, blockchain, and digital assets',
        category: 'finance',
      },
      {
        id: 'stocks',
        name: 'Stocks',
        description: 'Stock market updates and financial news',
        category: 'finance',
      },
      {
        id: 'climate',
        name: 'Climate & Environment',
        description: 'Climate change and environmental news',
        category: 'environment',
      },
      {
        id: 'education',
        name: 'Education',
        description: 'Education news and learning resources',
        category: 'education',
      },
    ];

    const response: APIResponse = {
      success: true,
      data: { topics: availableTopics },
      requestId,
    };

    res.json(response);
  });

  getTimezones = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    // Common timezones
    const timezones = [
      { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
      { value: 'America/New_York', label: 'Eastern Time (ET)' },
      { value: 'America/Chicago', label: 'Central Time (CT)' },
      { value: 'America/Denver', label: 'Mountain Time (MT)' },
      { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
      { value: 'Europe/London', label: 'London (GMT/BST)' },
      { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
      { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
      { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
      { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
      { value: 'Asia/Dubai', label: 'Dubai (GST)' },
      { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
      { value: 'America/Toronto', label: 'Toronto (EST/EDT)' },
      { value: 'America/Mexico_City', label: 'Mexico City (CST/CDT)' },
      { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
      { value: 'Asia/Kolkata', label: 'Mumbai (IST)' },
      { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)' },
      { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
    ];

    const response: APIResponse = {
      success: true,
      data: { timezones },
      requestId,
    };

    res.json(response);
  });

  getLanguages = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const requestId = req.requestId || uuidv4();

    const languages = [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'it', name: 'Italian', nativeName: 'Italiano' },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' },
      { code: 'ko', name: 'Korean', nativeName: '한국어' },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
    ];

    const response: APIResponse = {
      success: true,
      data: { languages },
      requestId,
    };

    res.json(response);
  });

  resetPreferences = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    // Reset to default preferences
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

    const preferences = await userService.updateUserPreferences(req.user.id, defaultPreferences);

    const response: APIResponse = {
      success: true,
      data: {
        message: 'Preferences reset to defaults',
        preferences: {
          ...preferences,
          preferred_topics: typeof preferences.preferred_topics === 'string'
            ? JSON.parse(preferences.preferred_topics)
            : preferences.preferred_topics,
          notification_preferences: typeof preferences.notification_preferences === 'string'
            ? JSON.parse(preferences.notification_preferences)
            : preferences.notification_preferences,
        },
      },
      requestId,
    };

    res.json(response);
  });
}

export const userPreferencesController = new UserPreferencesController();