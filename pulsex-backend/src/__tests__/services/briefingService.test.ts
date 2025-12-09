import { briefingService } from '../../services/briefingService';
import { database } from '../../config/database';
import { redisClient } from '../../config/redis';
import { llmService } from '../../services/external/llmService';
import { newsAPIService } from '../../services/external/newsAPI';
import { cryptoAPIService } from '../../services/external/cryptoAPI';
import { createMockBriefing, createMockUser } from '../../../tests/setup';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../config/redis');
jest.mock('../../services/external/llmService');
jest.mock('../../services/external/newsAPI');
jest.mock('../../services/external/cryptoAPI');

describe('BriefingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateDailyBriefing', () => {
    const userId = 'user-123';
    const date = '2025-01-01';
    const mockUser = createMockUser();

    it('should generate a new daily briefing successfully', async () => {
      // Arrange
      const mockNews = [
        {
          title: 'Tech Breakthrough',
          description: 'New AI advancement',
          url: 'https://example.com/tech',
          category: 'technology',
        },
      ];
      const mockCrypto = [
        {
          id: 'bitcoin',
          symbol: 'BTC',
          name: 'Bitcoin',
          price: 50000,
          priceChange24h: 1000,
        },
      ];
      const mockLLMResponse = {
        content: 'Generated briefing content',
        summary: 'Briefing summary',
        topics: ['technology', 'crypto'],
        sources: [],
        metadata: {
          model_version: 'gpt-4',
          processing_time_ms: 1500,
          relevance_score: 0.9,
        },
      };
      const mockBriefing = createMockBriefing();

      (database.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user
        .mockResolvedValueOnce({ rows: [] }) // Check existing briefing
        .mockResolvedValueOnce({ rows: [mockBriefing] }); // Create briefing
      (newsAPIService.getTopHeadings as jest.Mock).mockResolvedValue({ data: mockNews });
      (cryptoAPIService.getTopCryptocurrencies as jest.Mock).mockResolvedValue({ data: mockCrypto });
      (llmService.generateDailyBriefing as jest.Mock).mockResolvedValue(mockLLMResponse);
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      // Act
      const result = await briefingService.generateDailyBriefing(userId, date);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM users WHERE id = $1'),
        [userId]
      );
      expect(newsAPIService.getTopHeadings).toHaveBeenCalled();
      expect(cryptoAPIService.getTopCryptocurrencies).toHaveBeenCalled();
      expect(llmService.generateDailyBriefing).toHaveBeenCalledWith(
        expect.objectContaining({
          news: mockNews,
          crypto: mockCrypto,
          userPreferences: expect.any(Object),
        })
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO daily_briefings'),
        expect.arrayContaining([
          userId,
          date,
          mockLLMResponse.title,
          mockLLMResponse.content,
          mockLLMResponse.summary,
          mockLLMResponse.topics,
        ])
      );
      expect(result).toEqual(mockBriefing);
    });

    it('should use user preferences for personalization', async () => {
      // Arrange
      const userWithPreferences = {
        ...mockUser,
        preferences: {
          topics: ['technology', 'finance'],
          sources: ['TechCrunch', 'Reuters'],
          length: 'short',
        },
      };

      (database.query as jest.Mock).mockResolvedValue({ rows: [userWithPreferences] });
      (database.query as jest.Mock).mockResolvedValue({ rows: [] }); // No existing briefing
      (newsAPIService.getTopHeadings as jest.Mock).mockResolvedValue({ data: [] });
      (cryptoAPIService.getTopCryptocurrencies as jest.Mock).mockResolvedValue({ data: [] });
      (llmService.generateDailyBriefing as jest.Mock).mockResolvedValue({
        content: 'Personalized content',
        summary: 'Personalized summary',
        topics: ['technology'],
        sources: [],
      });
      (database.query as jest.Mock).mockResolvedValue({ rows: [createMockBriefing()] });
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      // Act
      await briefingService.generateDailyBriefing(userId, date);

      // Assert
      expect(llmService.generateDailyBriefing).toHaveBeenCalledWith(
        expect.objectContaining({
          userPreferences: userWithPreferences.preferences,
        })
      );
    });

    it('should throw error when user not found', async () => {
      // Arrange
      (database.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act & Assert
      await expect(briefingService.generateDailyBriefing(userId, date)).rejects.toThrow(
        'User not found'
      );
    });

    it('should throw error when briefing already exists', async () => {
      // Arrange
      const existingBriefing = createMockBriefing();
      (database.query as jest.Mock).mockResolvedValueOnce({ rows: [mockUser] });
      (database.query as jest.Mock).mockResolvedValueOnce({ rows: [existingBriefing] });

      // Act & Assert
      await expect(briefingService.generateDailyBriefing(userId, date)).rejects.toThrow(
        'Briefing already exists for this date'
      );
    });

    it('should handle LLM service failures', async () => {
      // Arrange
      (database.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] });
      (newsAPIService.getTopHeadings as jest.Mock).mockResolvedValue({ data: [] });
      (cryptoAPIService.getTopCryptocurrencies as jest.Mock).mockResolvedValue({ data: [] });
      (llmService.generateDailyBriefing as jest.Mock).mockRejectedValue(
        new Error('LLM service unavailable')
      );

      // Act & Assert
      await expect(briefingService.generateDailyBriefing(userId, date)).rejects.toThrow(
        'LLM service unavailable'
      );
    });

    it('should cache generated briefing', async () => {
      // Arrange
      (database.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [createMockBriefing()] });
      (newsAPIService.getTopHeadings as jest.Mock).mockResolvedValue({ data: [] });
      (cryptoAPIService.getTopCryptocurrencies as jest.Mock).mockResolvedValue({ data: [] });
      (llmService.generateDailyBriefing as jest.Mock).mockResolvedValue({
        content: 'Cached content',
        summary: 'Cached summary',
        topics: [],
        sources: [],
      });
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      // Act
      await briefingService.generateDailyBriefing(userId, date);

      // Assert
      expect(redisClient.set).toHaveBeenCalledWith(
        expect.stringContaining(`briefing:${userId}:${date}`),
        expect.any(String),
        expect.stringContaining('EX'),
        expect.any(Function)
      );
    });
  });

  describe('getDailyBriefing', () => {
    const userId = 'user-123';
    const date = '2025-01-01';
    const mockBriefing = createMockBriefing();

    it('should return cached briefing if available', async () => {
      // Arrange
      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(mockBriefing));

      // Act
      const result = await briefingService.getDailyBriefing(userId, date);

      // Assert
      expect(redisClient.get).toHaveBeenCalledWith(`briefing:${userId}:${date}`);
      expect(result).toEqual(mockBriefing);
    });

    it('should fetch briefing from database if not cached', async () => {
      // Arrange
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (database.query as jest.Mock).mockResolvedValue({ rows: [mockBriefing] });
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      // Act
      const result = await briefingService.getDailyBriefing(userId, date);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM daily_briefings'),
        [userId, date]
      );
      expect(redisClient.set).toHaveBeenCalled();
      expect(result).toEqual(mockBriefing);
    });

    it('should return null when briefing not found', async () => {
      // Arrange
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (database.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act
      const result = await briefingService.getDailyBriefing(userId, date);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getBriefingHistory', () => {
    const userId = 'user-123';
    const mockBriefings = [createMockBriefing(), createMockBriefing()];

    it('should return paginated briefing history', async () => {
      // Arrange
      const options = { page: 1, limit: 10 };
      (database.query as jest.Mock).mockResolvedValue({
        rows: mockBriefings,
      });
      (database.query as jest.Mock).mockResolvedValue({
        rows: [{ count: '20' }],
      });

      // Act
      const result = await briefingService.getBriefingHistory(userId, options);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM daily_briefings'),
        expect.arrayContaining([userId, 0, 10])
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*)'),
        [userId]
      );
      expect(result).toEqual({
        briefings: mockBriefings,
        pagination: {
          page: 1,
          limit: 10,
          total: 20,
          totalPages: 2,
        },
      });
    });

    it('should handle date range filtering', async () => {
      // Arrange
      const options = {
        page: 1,
        limit: 10,
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      };
      (database.query as jest.Mock).mockResolvedValue({ rows: [] });
      (database.query as jest.Mock).mockResolvedValue({ rows: [{ count: '0' }] });

      // Act
      await briefingService.getBriefingHistory(userId, options);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('AND date >= $2 AND date <= $3'),
        expect.arrayContaining([userId, options.dateFrom, options.dateTo])
      );
    });
  });

  describe('markAsRead', () => {
    const userId = 'user-123';
    const briefingId = 'briefing-123';

    it('should mark briefing as read', async () => {
      // Arrange
      const mockBriefing = createMockBriefing();
      (database.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockBriefing] }) // Verify ownership
        .mockResolvedValueOnce({ rows: [{ ...mockBriefing, is_read: true }] }); // Update

      // Act
      await briefingService.markAsRead(userId, briefingId);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT user_id FROM daily_briefings'),
        [briefingId]
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE daily_briefings SET is_read = true'),
        [briefingId]
      );
    });

    it('should throw error when briefing not found', async () => {
      // Arrange
      (database.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act & Assert
      await expect(briefingService.markAsRead(userId, briefingId)).rejects.toThrow(
        'Briefing not found'
      );
    });

    it('should throw error when user does not own briefing', async () => {
      // Arrange
      const otherUsersBriefing = { ...createMockBriefing(), user_id: 'other-user' };
      (database.query as jest.Mock).mockResolvedValue({ rows: [otherUsersBriefing] });

      // Act & Assert
      await expect(briefingService.markAsRead(userId, briefingId)).rejects.toThrow(
        'Unauthorized access to briefing'
      );
    });
  });

  describe('generateShareLink', () => {
    const userId = 'user-123';
    const briefingId = 'briefing-123';
    const expiresIn = '24h';

    it('should generate share link successfully', async () => {
      // Arrange
      const mockBriefing = createMockBriefing();
      (database.query as jest.Mock).mockResolvedValue({ rows: [mockBriefing] });
      (redisClient.set as jest.Mock).mockResolvedValue('OK');

      // Act
      const result = await briefingService.generateShareLink(userId, briefingId, expiresIn);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT user_id, is_read FROM daily_briefings'),
        [briefingId]
      );
      expect(redisClient.set).toHaveBeenCalledWith(
        expect.stringContaining(`share_briefing:`),
        expect.any(String),
        expect.stringContaining('EX'),
        expect.any(Function)
      );
      expect(result).toMatch(/^https?:\/\/.*\/share\/briefing\/[a-zA-Z0-9]+$/);
    });

    it('should throw error when briefing not found', async () => {
      // Arrange
      (database.query as jest.Mock).mockResolvedValue({ rows: [] });

      // Act & Assert
      await expect(
        briefingService.generateShareLink(userId, briefingId, expiresIn)
      ).rejects.toThrow('Briefing not found');
    });

    it('should throw error for unauthorized access', async () => {
      // Arrange
      const otherUsersBriefing = { ...createMockBriefing(), user_id: 'other-user' };
      (database.query as jest.Mock).mockResolvedValue({ rows: [otherUsersBriefing] });

      // Act & Assert
      await expect(
        briefingService.generateShareLink(userId, briefingId, expiresIn)
      ).rejects.toThrow('Unauthorized access to briefing');
    });
  });

  describe('getSharedBriefing', () => {
    const shareToken = 'abc123';
    const mockBriefing = createMockBriefing();

    it('should return shared briefing content', async () => {
      // Arrange
      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(mockBriefing));

      // Act
      const result = await briefingService.getSharedBriefing(shareToken);

      // Assert
      expect(redisClient.get).toHaveBeenCalledWith(`share_briefing:${shareToken}`);
      expect(result).toEqual(mockBriefing);
    });

    it('should return null when share token not found', async () => {
      // Arrange
      (redisClient.get as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await briefingService.getSharedBriefing(shareToken);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('regenerateBriefing', () => {
    const userId = 'user-123';
    const briefingId = 'briefing-123';
    const preferences = { topics: ['technology'], length: 'short' };

    it('should regenerate briefing with new preferences', async () => {
      // Arrange
      const mockBriefing = createMockBriefing();
      const regeneratedContent = 'Regenerated content';
      (database.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockBriefing] }) // Verify ownership
        .mockResolvedValueOnce({ rows: [{}] }); // Check regeneration limit
      (llmService.generateContent as jest.Mock).mockResolvedValue({
        content: regeneratedContent,
        summary: 'Updated summary',
        topics: ['technology'],
      });
      (database.query as jest.Mock).mockResolvedValue({ rows: [mockBriefing] });
      (redisClient.del as jest.Mock).mockResolvedValue(1);

      // Act
      const result = await briefingService.regenerateBriefing(userId, briefingId, preferences);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT user_id, date FROM daily_briefings'),
        [briefingId]
      );
      expect(llmService.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({ preferences })
      );
      expect(redisClient.del).toHaveBeenCalledWith(
        expect.stringContaining(`briefing:${userId}:`)
      );
      expect(result).toEqual(mockBriefing);
    });

    it('should throw error when regeneration limit exceeded', async () => {
      // Arrange
      const mockBriefing = createMockBriefing();
      (database.query as jest.Mock).mockResolvedValueOnce({ rows: [mockBriefing] });
      (database.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ regeneration_count: '5' }], // Exceeds daily limit
      });

      // Act & Assert
      await expect(
        briefingService.regenerateBriefing(userId, briefingId, preferences)
      ).rejects.toThrow('Regeneration limit exceeded for today');
    });
  });

  describe('getBriefingAnalytics', () => {
    const userId = 'user-123';

    it('should return briefing analytics', async () => {
      // Arrange
      const mockAnalytics = {
        totalBriefings: 30,
        readBriefings: 25,
        averageReadTime: 300,
        favoriteTopics: ['technology', 'business'],
        readingStreak: 15,
      };
      (database.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            total_briefings: '30',
            read_briefings: '25',
            avg_read_time: '300',
            reading_streak: '15',
            favorite_topics: ['technology', 'business'],
          },
        ],
      });

      // Act
      const result = await briefingService.getBriefingAnalytics(userId);

      // Assert
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as total_briefings'),
        [userId]
      );
      expect(result).toEqual(mockAnalytics);
    });
  });
});

export {};