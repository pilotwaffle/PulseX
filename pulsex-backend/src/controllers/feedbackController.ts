import { Request, Response } from 'express';
import { feedbackService } from '../services/feedbackService';
import { validateRequest, Feedback } from '../utils/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';
import { APIResponse } from '../types';
import { v4 as uuidv4 } from 'uuid';

class FeedbackController {
  submitFeedback = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const validatedData = validateRequest(Feedback, req.body);

    const feedback = await feedbackService.submitFeedback(req.user.id, {
      briefingId: validatedData.briefingId,
      cardId: validatedData.cardId,
      type: validatedData.type,
      topic: validatedData.topic,
      reason: validatedData.reason,
    });

    const response: APIResponse = {
      success: true,
      data: { feedback },
      requestId,
    };

    res.status(201).json(response);
  });

  getFeedbackAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    if (startDate && endDate) {
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
    }

    const analytics = await feedbackService.getFeedbackAnalytics(
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

  getFeedbackHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Validate pagination parameters
    if (limit < 1 || limit > 100) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_LIMIT',
          message: 'Limit must be between 1 and 100',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    if (offset < 0) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_OFFSET',
          message: 'Offset must be non-negative',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const { feedback, total } = await feedbackService.getUserFeedbackHistory(req.user.id, limit, offset);

    const response: APIResponse = {
      success: true,
      data: {
        feedback,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total,
        },
      },
      requestId,
    };

    res.json(response);
  });

  deleteFeedback = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { feedbackId } = req.params;

    await feedbackService.deleteFeedback(req.user.id, feedbackId);

    const response: APIResponse = {
      success: true,
      data: { message: 'Feedback deleted successfully' },
      requestId,
    };

    res.json(response);
  });

  getFeedbackByTopic = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { topic } = req.params;

    if (!topic) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'MISSING_TOPIC',
          message: 'Topic parameter is required',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const feedback = await feedbackService.getFeedbackByTopic(req.user.id, topic);

    const response: APIResponse = {
      success: true,
      data: { feedback },
      requestId,
    };

    res.json(response);
  });

  getFeedbackTrends = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const days = parseInt(req.query.days as string) || 30;

    // Validate days parameter
    if (days < 1 || days > 365) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_DAYS_RANGE',
          message: 'Days must be between 1 and 365',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const trends = await feedbackService.getFeedbackTrends(req.user.id, days);

    const response: APIResponse = {
      success: true,
      data: { trends },
      requestId,
    };

    res.json(response);
  });

  // Admin endpoint for global feedback analytics
  getGlobalFeedbackAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    // Check if user has admin privileges (this would need role-based access control)
    // For now, we'll assume all authenticated users can access this
    const limit = parseInt(req.query.limit as string) || 10;

    if (limit < 1 || limit > 50) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_LIMIT',
          message: 'Limit must be between 1 and 50',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const analytics = await feedbackService.getGlobalFeedbackAnalytics(limit);

    const response: APIResponse = {
      success: true,
      data: { analytics },
      requestId,
    };

    res.json(response);
  });
}

export const feedbackController = new FeedbackController();