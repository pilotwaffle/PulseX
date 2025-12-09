import { Request, Response } from 'express';
import { savedCardsService } from '../services/savedCardsService';
import { validateRequest, SavedCard } from '../utils/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';
import { APIResponse } from '../types';
import { v4 as uuidv4 } from 'uuid';

class SavedCardsController {
  saveCard = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const validatedData = validateRequest(SavedCard, req.body);

    const savedCard = await savedCardsService.saveCard(req.user.id, {
      briefingId: validatedData.briefingId,
      cardId: validatedData.cardId,
      title: validatedData.title,
      summary: validatedData.summary,
      tags: validatedData.tags || [],
    });

    const response: APIResponse = {
      success: true,
      data: { savedCard },
      requestId,
    };

    res.status(201).json(response);
  });

  getSavedCards = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { cards, total } = await savedCardsService.getSavedCards(req.user.id, limit, offset);

    const response: APIResponse = {
      success: true,
      data: {
        cards,
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

  getSavedCardById = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { cardId } = req.params;
    const card = await savedCardsService.getSavedCardById(req.user.id, cardId);

    if (!card) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'SAVED_CARD_NOT_FOUND',
          message: 'Saved card not found',
        },
        requestId,
      };
      res.status(404).json(response);
      return;
    }

    const response: APIResponse = {
      success: true,
      data: { card },
      requestId,
    };

    res.json(response);
  });

  deleteSavedCard = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { cardId } = req.params;

    await savedCardsService.deleteSavedCard(req.user.id, cardId);

    const response: APIResponse = {
      success: true,
      data: { message: 'Saved card deleted successfully' },
      requestId,
    };

    res.json(response);
  });

  searchSavedCards = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { searchTerm, tags } = req.query;

    if (!searchTerm && !tags) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'MISSING_SEARCH_PARAMETERS',
          message: 'Either searchTerm or tags parameter is required',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    let tagsArray: string[] = [];
    if (tags) {
      if (typeof tags === 'string') {
        tagsArray = tags.split(',').map(tag => tag.trim());
      } else if (Array.isArray(tags)) {
        tagsArray = tags.map(tag => String(tag).trim());
      }
    }

    const cards = await savedCardsService.searchSavedCards(
      req.user.id,
      searchTerm as string || '',
      tagsArray
    );

    const response: APIResponse = {
      success: true,
      data: { cards },
      requestId,
    };

    res.json(response);
  });

  getSavedCardsByTag = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { tag } = req.params;

    if (!tag) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'MISSING_TAG',
          message: 'Tag parameter is required',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const cards = await savedCardsService.getSavedCardsByTag(req.user.id, tag);

    const response: APIResponse = {
      success: true,
      data: { cards },
      requestId,
    };

    res.json(response);
  });

  getSavedCardsAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const analytics = await savedCardsService.getSavedCardsAnalytics(req.user.id);

    const response: APIResponse = {
      success: true,
      data: { analytics },
      requestId,
    };

    res.json(response);
  });

  updateSavedCardTags = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const { cardId } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_TAGS_FORMAT',
          message: 'Tags must be an array',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const updatedCard = await savedCardsService.updateSavedCardTags(req.user.id, cardId, tags);

    const response: APIResponse = {
      success: true,
      data: { card: updatedCard },
      requestId,
    };

    res.json(response);
  });

  exportSavedCards = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const format = req.query.format as string || 'json';

    if (!['json', 'csv'].includes(format)) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'INVALID_FORMAT',
          message: 'Format must be either json or csv',
        },
        requestId,
      };
      res.status(400).json(response);
      return;
    }

    const exportData = await savedCardsService.exportSavedCards(req.user.id, format as 'json' | 'csv');

    if (format === 'json') {
      const response: APIResponse = {
        success: true,
        data: exportData,
        requestId,
      };

      res.json(response);
    } else {
      // CSV format
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="saved-cards-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(exportData);
    }
  });
}

export const savedCardsController = new SavedCardsController();