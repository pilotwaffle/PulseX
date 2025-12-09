import { Request, Response } from 'express';
import { briefingService } from '../services/briefingService';
import { validateRequest, BriefingGeneration } from '../utils/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';
import { APIResponse } from '../types';
import { v4 as uuidv4 } from 'uuid';

class BriefingController {
  generateDailyBriefing = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { topics, date } = validateRequest(BriefingGeneration, req.body);

    const briefing = await briefingService.generateDailyBriefing(req.user.id, date);

    const response: APIResponse = {
      success: true,
      data: { briefing },
      requestId,
    };

    res.status(201).json(response);
  });

  getTodayBriefing = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const briefing = await briefingService.getTodayBriefing(req.user.id);

    if (!briefing) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'BRIEFING_NOT_FOUND',
          message: 'No briefing available for today',
        },
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    const response: APIResponse = {
      success: true,
      data: { briefing },
      requestId,
    };

    res.json(response);
  });

  getBriefingByDate = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { date } = req.params;
    const briefing = await briefingService.getBriefingByDate(req.user.id, date);

    if (!briefing) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'BRIEFING_NOT_FOUND',
          message: `No briefing found for date: ${date}`,
        },
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    const response: APIResponse = {
      success: true,
      data: { briefing },
      requestId,
    };

    res.json(response);
  });

  getBriefingHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const limit = parseInt(req.query.limit as string) || 30;
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

    const { briefings, total } = await briefingService.getBriefingHistory(req.user.id, limit, offset);

    const response: APIResponse = {
      success: true,
      data: {
        briefings,
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

  markBriefingAsRead = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { briefingId } = req.params;

    await briefingService.markBriefingAsRead(req.user.id, briefingId);

    const response: APIResponse = {
      success: true,
      data: { message: 'Briefing marked as read' },
      requestId,
    };

    res.json(response);
  });

  regenerateBriefing = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { date } = req.params;
    const briefing = await briefingService.regenerateBriefing(req.user.id, date);

    const response: APIResponse = {
      success: true,
      data: { briefing },
      requestId,
    };

    res.json(response);
  });

  getBriefingAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    // Limit date range to 1 year
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() - 1);

    if (startDateObj < maxDate) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'DATE_RANGE_TOO_LARGE',
          message: 'Date range cannot exceed 1 year',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const analytics = await briefingService.getBriefingAnalytics(
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

  getBriefingById = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { briefingId } = req.params;
    const briefing = await briefingService.getBriefingById(briefingId);

    if (!briefing) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'BRIEFING_NOT_FOUND',
          message: 'Briefing not found',
        },
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    // Verify user owns the briefing
    if (briefing.user_id !== req.user.id) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'Access denied to this briefing',
        },
        requestId,
      };
      res.status(403).json(response);
      return;
    }

    const response: APIResponse = {
      success: true,
      data: { briefing },
      requestId,
    };

    res.json(response);
  });
}

export const briefingController = new BriefingController();