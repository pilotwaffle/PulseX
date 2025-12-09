import { Request, Response } from 'express';
import { BriefingController } from '../../controllers/briefingController';
import { briefingService } from '../../services/briefingService';
import { AuthenticatedRequest } from '../../middleware/auth';
import {
  createMockRequest,
  createMockResponse,
  createMockBriefing,
  createAuthenticatedRequest
} from '../../../tests/setup';

// Mock dependencies
jest.mock('../../services/briefingService');
jest.mock('../../middleware/auth', () => ({
  AuthenticatedRequest: {},
}));

describe('BriefingController', () => {
  let briefingController: BriefingController;
  let mockRequest: Request;
  let mockResponse: Response;

  beforeEach(() => {
    briefingController = new BriefingController();
    mockRequest = createMockRequest();
    mockResponse = createMockResponse();
    jest.clearAllMocks();
  });

  describe('getDailyBriefing', () => {
    it('should return daily briefing for authenticated user', async () => {
      // Arrange
      const userId = 'user-123';
      const date = '2025-01-01';
      const mockBriefing = createMockBriefing();

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { date };
      mockRequest.headers = { ...mockRequest.headers, 'x-request-id': 'test-id' };

      (briefingService.getDailyBriefing as jest.Mock).mockResolvedValue(mockBriefing);

      // Act
      await briefingController.getDailyBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(briefingService.getDailyBriefing).toHaveBeenCalledWith(userId, date);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockBriefing,
        requestId: 'test-id',
      });
    });

    it('should return 404 when briefing not found', async () => {
      // Arrange
      const userId = 'user-123';
      const date = '2025-01-01';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { date };

      (briefingService.getDailyBriefing as jest.Mock).mockResolvedValue(null);

      // Act
      await briefingController.getDailyBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'BRIEFING_NOT_FOUND',
          message: 'Daily briefing not found for the specified date',
        },
        requestId: expect.any(String),
      });
    });

    it('should generate new briefing when none exists', async () => {
      // Arrange
      const userId = 'user-123';
      const date = '2025-01-01';
      const newBriefing = { ...createMockBriefing(), id: 'new-briefing-id' };

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { date };
      mockRequest.query = { generate: 'true' };

      (briefingService.getDailyBriefing as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(newBriefing);
      (briefingService.generateDailyBriefing as jest.Mock).mockResolvedValue(newBriefing);

      // Act
      await briefingController.getDailyBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(briefingService.generateDailyBriefing).toHaveBeenCalledWith(userId, date);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should handle service errors', async () => {
      // Arrange
      const userId = 'user-123';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { date: '2025-01-01' };

      (briefingService.getDailyBriefing as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      // Act
      await briefingController.getDailyBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });
  });

  describe('generateDailyBriefing', () => {
    it('should generate and return new daily briefing', async () => {
      // Arrange
      const userId = 'user-123';
      const date = '2025-01-01';
      const newBriefing = createMockBriefing();

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.body = { date };

      (briefingService.generateDailyBriefing as jest.Mock).mockResolvedValue(newBriefing);
      mockRequest.headers = { ...mockRequest.headers, 'x-request-id': 'test-id' };

      // Act
      await briefingController.generateDailyBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(briefingService.generateDailyBriefing).toHaveBeenCalledWith(userId, date);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: newBriefing,
        requestId: 'test-id',
      });
    });

    it('should handle generation rate limiting', async () => {
      // Arrange
      const userId = 'user-123';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.body = { date: '2025-01-01' };

      (briefingService.generateDailyBriefing as jest.Mock).mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      // Act
      await briefingController.generateDailyBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });

    it('should handle LLM service errors', async () => {
      // Arrange
      const userId = 'user-123';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.body = { date: '2025-01-01' };

      (briefingService.generateDailyBriefing as jest.Mock).mockRejectedValue(
        new Error('LLM service unavailable')
      );

      // Act
      await briefingController.generateDailyBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(503);
    });
  });

  describe('getBriefingHistory', () => {
    it('should return paginated briefing history', async () => {
      // Arrange
      const userId = 'user-123';
      const mockBriefings = [
        createMockBriefing(),
        { ...createMockBriefing(), id: 'briefing-2', date: '2025-01-02' },
      ];
      const pagination = {
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      };

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.query = { page: '1', limit: '10' };
      mockRequest.headers = { ...mockRequest.headers, 'x-request-id': 'test-id' };

      (briefingService.getBriefingHistory as jest.Mock).mockResolvedValue({
        briefings: mockBriefings,
        pagination,
      });

      // Act
      await briefingController.getBriefingHistory(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(briefingService.getBriefingHistory).toHaveBeenCalledWith(userId, {
        page: 1,
        limit: 10,
        dateFrom: undefined,
        dateTo: undefined,
      });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          briefings: mockBriefings,
          pagination,
        },
        requestId: 'test-id',
      });
    });

    it('should handle date range filtering', async () => {
      // Arrange
      const userId = 'user-123';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.query = {
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      };

      (briefingService.getBriefingHistory as jest.Mock).mockResolvedValue({
        briefings: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });

      // Act
      await briefingController.getBriefingHistory(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(briefingService.getBriefingHistory).toHaveBeenCalledWith(userId, {
        page: 1,
        limit: 10,
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      });
    });
  });

  describe('markAsRead', () => {
    it('should mark briefing as read', async () => {
      // Arrange
      const userId = 'user-123';
      const briefingId = 'briefing-123';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { id: briefingId };
      mockRequest.headers = { ...mockRequest.headers, 'x-request-id': 'test-id' };

      (briefingService.markAsRead as jest.Mock).mockResolvedValue(undefined);

      // Act
      await briefingController.markAsRead(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(briefingService.markAsRead).toHaveBeenCalledWith(userId, briefingId);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Briefing marked as read' },
        requestId: 'test-id',
      });
    });

    it('should return 404 when briefing not found', async () => {
      // Arrange
      const userId = 'user-123';
      const briefingId = 'nonexistent-briefing';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { id: briefingId };

      (briefingService.markAsRead as jest.Mock).mockRejectedValue(
        new Error('Briefing not found')
      );

      // Act
      await briefingController.markAsRead(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('should handle unauthorized access', async () => {
      // Arrange
      const userId = 'user-123';
      const briefingId = 'other-user-briefing';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { id: briefingId };

      (briefingService.markAsRead as jest.Mock).mockRejectedValue(
        new Error('Unauthorized access to briefing')
      );

      // Act
      await briefingController.markAsRead(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('shareBriefing', () => {
    it('should generate share link for briefing', async () => {
      // Arrange
      const userId = 'user-123';
      const briefingId = 'briefing-123';
      const shareLink = 'https://pulsex.app/share/briefing/abc123';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { id: briefingId };
      mockRequest.body = { expiresIn: '24h' };
      mockRequest.headers = { ...mockRequest.headers, 'x-request-id': 'test-id' };

      (briefingService.generateShareLink as jest.Mock).mockResolvedValue(shareLink);

      // Act
      await briefingController.shareBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(briefingService.generateShareLink).toHaveBeenCalledWith(
        userId,
        briefingId,
        '24h'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { shareLink },
        requestId: 'test-id',
      });
    });

    it('should handle invalid expiration time', async () => {
      // Arrange
      const userId = 'user-123';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { id: 'briefing-123' };
      mockRequest.body = { expiresIn: 'invalid' };

      // Act
      await briefingController.shareBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should handle sharing disabled briefing', async () => {
      // Arrange
      const userId = 'user-123';
      const briefingId = 'private-briefing';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { id: briefingId };
      mockRequest.body = { expiresIn: '1h' };

      (briefingService.generateShareLink as jest.Mock).mockRejectedValue(
        new Error('Sharing is disabled for this briefing')
      );

      // Act
      await briefingController.shareBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('getSharedBriefing', () => {
    it('should return shared briefing content', async () => {
      // Arrange
      const shareToken = 'abc123';
      const sharedBriefing = createMockBriefing();

      mockRequest.params = { shareToken };
      mockRequest.headers = { ...mockRequest.headers, 'x-request-id': 'test-id' };

      (briefingService.getSharedBriefing as jest.Mock).mockResolvedValue(sharedBriefing);

      // Act
      await briefingController.getSharedBriefing(mockRequest, mockResponse);

      // Assert
      expect(briefingService.getSharedBriefing).toHaveBeenCalledWith(shareToken);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: sharedBriefing,
        requestId: 'test-id',
      });
    });

    it('should return 404 for invalid share token', async () => {
      // Arrange
      const shareToken = 'invalid-token';

      mockRequest.params = { shareToken };

      (briefingService.getSharedBriefing as jest.Mock).mockResolvedValue(null);

      // Act
      await briefingController.getSharedBriefing(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('should return 410 for expired share link', async () => {
      // Arrange
      const shareToken = 'expired-token';

      mockRequest.params = { shareToken };

      (briefingService.getSharedBriefing as jest.Mock).mockRejectedValue(
        new Error('Share link has expired')
      );

      // Act
      await briefingController.getSharedBriefing(mockRequest, mockResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(410);
    });
  });

  describe('regenerateBriefing', () => {
    it('should regenerate briefing with updated preferences', async () => {
      // Arrange
      const userId = 'user-123';
      const briefingId = 'briefing-123';
      const regeneratedBriefing = { ...createMockBriefing(), id: 'regenerated-id' };

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { id: briefingId };
      mockRequest.body = { preferences: { topics: ['technology'], length: 'short' } };
      mockRequest.headers = { ...mockRequest.headers, 'x-request-id': 'test-id' };

      (briefingService.regenerateBriefing as jest.Mock).mockResolvedValue(regeneratedBriefing);

      // Act
      await briefingController.regenerateBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(briefingService.regenerateBriefing).toHaveBeenCalledWith(
        userId,
        briefingId,
        { topics: ['technology'], length: 'short' }
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: regeneratedBriefing,
        requestId: 'test-id',
      });
    });

    it('should handle regeneration limit exceeded', async () => {
      // Arrange
      const userId = 'user-123';
      const briefingId = 'briefing-123';

      mockRequest = createAuthenticatedRequest(userId);
      mockRequest.params = { id: briefingId };

      (briefingService.regenerateBriefing as jest.Mock).mockRejectedValue(
        new Error('Regeneration limit exceeded for today')
      );

      // Act
      await briefingController.regenerateBriefing(
        mockRequest as unknown as AuthenticatedRequest,
        mockResponse
      );

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(429);
    });
  });
});

export {};