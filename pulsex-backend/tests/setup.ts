import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { database } from '../src/config/database';
import { redisClient } from '../src/config/redis';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-123456789';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-123456789';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/pulsex_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.NEWS_API_KEY = 'test-news-api-key';
process.env.CRYPTO_API_KEY = 'test-crypto-api-key';

// Mock external dependencies
jest.mock('../src/config/database', () => ({
  database: {
    query: jest.fn(),
    getClient: jest.fn(() => ({
      query: jest.fn(),
      release: jest.fn(),
    })),
    healthCheck: jest.fn(),
    close: jest.fn(),
  },
}));

jest.mock('../src/config/redis', () => ({
  redisClient: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    getClient: jest.fn(() => ({
      keys: jest.fn(),
      del: jest.fn(),
    })),
    healthCheck: jest.fn(),
  },
}));

// Mock UUID
jest.mock('uuid', () => ({
  v4: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
}));

beforeAll(async () => {
  // Initialize test database connection
  try {
    await database.query('SELECT 1'); // Test connection
    console.log('Test database connection established');
  } catch (error) {
    console.log('Test database connection not available - using mocks');
  }

  // Initialize test Redis connection
  try {
    await redisClient.connect();
    await redisClient.healthCheck();
    console.log('Test Redis connection established');
  } catch (error) {
    console.log('Test Redis connection not available - using mocks');
  }
});

afterAll(async () => {
  // Clean up test connections
  try {
    await redisClient.disconnect();
    await database.close();
    console.log('Test connections closed');
  } catch (error) {
    console.log('Error closing test connections (expected in mock environment)');
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

export const generateTestToken = async (userId: string, email: string) => {
  const { jwtService } = await import('../src/utils/jwt');
  return jwtService.generateTokenPair({ sub: userId, email });
};

// Mock data factories
export const createMockUser = () => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  phone_number: '+1234567890',
  avatar_url: null,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
});

export const createMockBriefing = () => ({
  id: '123e4567-e89b-12d3-a456-426614174001',
  user_id: '123e4567-e89b-12d3-a456-426614174000',
  date: '2025-01-01',
  title: 'Test Briefing',
  content: 'This is a test briefing content.',
  summary: 'Test summary',
  topics: ['technology', 'business'],
  is_read: false,
  created_at: new Date(),
  updated_at: new Date(),
});

export const createMockFeedback = () => ({
  id: '123e4567-e89b-12d3-a456-426614174002',
  user_id: '123e4567-e89b-12d3-a456-426614174000',
  briefing_id: '123e4567-e89b-12d3-a456-426614174001',
  rating: 5,
  comment: 'Great briefing!',
  category: 'content',
  created_at: new Date(),
});

export const createMockNotification = () => ({
  id: '123e4567-e89b-12d3-a456-426614174003',
  user_id: '123e4567-e89b-12d3-a456-426614174000',
  type: 'briefing_ready',
  title: 'New Briefing Available',
  message: 'Your daily briefing is ready.',
  is_read: false,
  scheduled_for: new Date(),
  created_at: new Date(),
});

export const createMockSavedCard = () => ({
  id: '123e4567-e89b-12d3-a456-426614174004',
  user_id: '123e4567-e89b-12d3-a456-426614174000',
  briefing_id: '123e4567-e89b-12d3-a456-426614174001',
  card_type: 'article',
  title: 'Test Article',
  content: 'Test article content',
  url: 'https://example.com/article',
  metadata: { author: 'Test Author', source: 'Test Source' },
  created_at: new Date(),
});

export const createMockJWTPayload = () => ({
  sub: '123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
});

// Mock request/response objects
export const createMockRequest = (overrides: any = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {
    'x-request-id': 'test-request-id',
    'content-type': 'application/json',
    ...overrides.headers,
  },
  user: null,
  ...overrides,
});

export const createMockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

export const createAuthenticatedRequest = (userId = '123e4567-e89b-12d3-a456-426614174000', email = 'test@example.com') => {
  return {
    ...createMockRequest(),
    user: {
      id: userId,
      email,
    },
  };
};

// External API mocks
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

// Integration layer mocks
jest.mock('../src/integrations/llm/openai/client', () => ({
  openaiClient: {
    generate: jest.fn().mockResolvedValue({
      content: 'OpenAI generated content',
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
      model: 'gpt-4-test',
      finish_reason: 'stop',
    }),
    healthCheck: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/integrations/llm/anthropic/client', () => ({
  anthropicClient: {
    generate: jest.fn().mockResolvedValue({
      content: 'Anthropic generated content',
      usage: { input_tokens: 100, output_tokens: 200 },
      model: 'claude-3-test',
      stop_reason: 'end_turn',
    }),
    healthCheck: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/integrations/news/news-api/client', () => ({
  newsAPIClient: {
    fetchTopHeadlines: jest.fn().mockResolvedValue([
      {
        title: 'Breaking News Test',
        description: 'Test description',
        url: 'https://example.com',
        source: 'Test Source',
        publishedAt: new Date(),
        category: 'general',
      },
    ]),
    searchNews: jest.fn().mockResolvedValue([]),
    healthCheck: jest.fn().mockResolvedValue(true),
  },
}));

// Console mock to reduce test noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

export default {
  createTestUser,
  createTestBriefing,
  generateTestToken,
  createMockUser,
  createMockBriefing,
  createMockFeedback,
  createMockNotification,
  createMockSavedCard,
  createMockJWTPayload,
  createMockRequest,
  createMockResponse,
  createAuthenticatedRequest,
};