import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { database } from '../src/config/database';
import { redisClient } from '../src/config/redis';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

beforeAll(async () => {
  // Initialize test database connection
  try {
    await database.query('SELECT 1'); // Test connection
    console.log('Test database connection established');
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    process.exit(1);
  }

  // Initialize test Redis connection
  try {
    await redisClient.connect();
    await redisClient.healthCheck();
    console.log('Test Redis connection established');
  } catch (error) {
    console.error('Failed to connect to test Redis:', error);
    process.exit(1);
  }
});

afterAll(async () => {
  // Clean up test connections
  try {
    await redisClient.disconnect();
    await database.close();
    console.log('Test connections closed');
  } catch (error) {
    console.error('Error closing test connections:', error);
  }
});

beforeEach(async () => {
  // Clean up Redis before each test
  try {
    const keys = await redisClient.getClient().keys('*');
    if (keys.length > 0) {
      await redisClient.getClient().del(...keys);
    }
  } catch (error) {
    console.warn('Failed to clean up Redis:', error);
  }
});

afterEach(async () => {
  // Clean up database after each test
  try {
    // Clean up test data in reverse order of dependencies
    const tables = [
      'analytics_events',
      'notification_logs',
      'saved_cards',
      'feedback',
      'daily_briefings',
      'device_tokens',
      'user_preferences',
      'users'
    ];

    for (const table of tables) {
      await database.query(`DELETE FROM ${table} WHERE email LIKE '%@test.example%'`);
    }
  } catch (error) {
    console.warn('Failed to clean up database:', error);
  }
});

// Global test utilities
export const createTestUser = async (userData = {}) => {
  const defaultUser = {
    email: `test-${Date.now()}@test.example`,
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User',
    ...userData,
  };

  const { userService } = await import('../src/services/userService');
  return await userService.createUser(defaultUser);
};

export const createTestBriefing = async (userId: string, date?: string) => {
  const { briefingService } = await import('../src/services/briefingService');
  return await briefingService.generateDailyBriefing(userId, date);
};

export const generateTestToken = (userId: string, email: string) => {
  const { jwtService } = await import('../src/utils/jwt');
  return jwtService.generateTokenPair({ sub: userId, email });
};

// Mock external APIs for testing
jest.mock('../src/services/external/newsAPI', () => ({
  newsAPIService: {
    getTopHeadings: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'test-news-1',
          title: 'Test News Article',
          description: 'Test news description',
          url: 'https://example.com/news1',
          source: 'Test Source',
          publishedAt: new Date(),
          category: 'technology',
          relevanceScore: 0.9,
        },
      ],
      status: 200,
      statusText: 'OK',
      headers: {},
      cached: false,
    }),
    searchNews: jest.fn().mockResolvedValue({
      data: [],
      status: 200,
      statusText: 'OK',
      headers: {},
      cached: false,
    }),
    healthCheck: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/services/external/cryptoAPI', () => ({
  cryptoAPIService: {
    getTopCryptocurrencies: jest.fn().mockResolvedValue({
      data: [
        {
          id: 'bitcoin',
          symbol: 'BTC',
          name: 'Bitcoin',
          price: 50000,
          priceChange24h: 1000,
          priceChangePercentage24h: 2.0,
          marketCap: 1000000000000,
          volume24h: 30000000000,
          lastUpdated: new Date(),
        },
      ],
      status: 200,
      statusText: 'OK',
      headers: {},
      cached: false,
    }),
    healthCheck: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/services/external/llmService', () => ({
  llmService: {
    generateContent: jest.fn().mockResolvedValue({
      content: 'Generated test content about technology and business trends.',
      summary: 'Test summary of key developments in tech and business.',
      topics: ['technology', 'business', 'AI'],
      sources: [],
      metadata: {
        model_version: 'test-model',
        processing_time_ms: 1500,
        relevance_score: 0.85,
      },
    }),
    generateDailyBriefing: jest.fn().mockResolvedValue({
      content: 'Your personalized daily briefing covering the latest in technology and business.',
      summary: 'Key updates in tech innovation and market trends.',
      topics: ['technology', 'business'],
      sources: [],
      metadata: {
        model_version: 'test-model',
        processing_time_ms: 2000,
        relevance_score: 0.9,
      },
    }),
    getAvailableProviders: jest.fn().mockReturnValue(['OpenAI', 'Anthropic']),
    healthCheck: jest.fn().mockResolvedValue({ 'OpenAI': true, 'Anthropic': true }),
  },
}));

jest.mock('../src/services/notificationService', () => ({
  notificationService: {
    sendPushNotification: jest.fn().mockResolvedValue(true),
    scheduleNotification: jest.fn().mockResolvedValue(undefined),
    sendScheduledBriefings: jest.fn().mockResolvedValue(undefined),
    processScheduledNotifications: jest.fn().mockResolvedValue(undefined),
    getUserNotificationSettings: jest.fn().mockResolvedValue({
      pushEnabled: true,
      emailEnabled: false,
      categories: {
        news: true,
        crypto: true,
        stocks: true,
        tech: true,
      },
    }),
    updateUserNotificationSettings: jest.fn().mockResolvedValue(undefined),
    getNotificationAnalytics: jest.fn().mockResolvedValue({
      totalSent: 10,
      successfulNotifications: 8,
      totalSuccesses: 8,
      totalFailures: 2,
      successRate: 80,
    }),
    healthCheck: jest.fn().mockResolvedValue({
      apns: true,
      redis: true,
    }),
  },
}));