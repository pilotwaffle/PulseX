import request from 'supertest';
import app from '../../server';
import {
  createTestUser,
  createTestBriefing,
  generateTestToken,
} from '../../../tests/setup';

describe('API Integration Tests', () => {
  let authToken: string;
  let refreshToken: string;
  let userId: string;

  beforeAll(async () => {
    // Create a test user for integration tests
    const testUser = await createTestUser({
      email: 'integration-test@example.com',
      password: 'TestPass123!',
      firstName: 'Integration',
      lastName: 'Test',
    });
    userId = testUser.user.id;

    const tokens = generateTestToken(userId, testUser.user.email);
    authToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      // Assert
      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        memory: expect.any(Object),
      });
    });
  });

  describe('Authentication Flow', () => {
    describe('POST /api/v1/auth/register', () => {
      it('should register a new user successfully', async () => {
        // Arrange
        const userData = {
          email: `new-user-${Date.now()}@example.com`,
          password: 'SecurePass123!',
          firstName: 'New',
          lastName: 'User',
          phoneNumber: '+1234567890',
        };

        // Act
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send(userData)
          .expect(201);

        // Assert
        expect(response.body).toMatchObject({
          success: true,
          data: {
            user: {
              email: userData.email,
              firstName: userData.firstName,
              lastName: userData.lastName,
              phoneNumber: userData.phoneNumber,
              isActive: true,
            },
            tokens: {
              accessToken: expect.any(String),
              refreshToken: expect.any(String),
            },
          },
        });
      });

      it('should reject weak password', async () => {
        // Arrange
        const userData = {
          email: `weak-user-${Date.now()}@example.com`,
          password: 'weak',
          firstName: 'Weak',
          lastName: 'User',
        };

        // Act
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send(userData)
          .expect(400);

        // Assert
        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'PASSWORD_TOO_WEAK',
            message: expect.stringContaining('security requirements'),
          },
        });
      });

      it('should reject duplicate email', async () => {
        // Arrange
        const userData = {
          email: 'integration-test@example.com', // Already exists
          password: 'SecurePass123!',
          firstName: 'Duplicate',
          lastName: 'User',
        };

        // Act
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send(userData)
          .expect(409);

        // Assert
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/v1/auth/login', () => {
      it('should login successfully with valid credentials', async () => {
        // Arrange
        const loginData = {
          email: 'integration-test@example.com',
          password: 'TestPass123!',
        };

        // Act
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send(loginData)
          .expect(200);

        // Assert
        expect(response.body).toMatchObject({
          success: true,
          data: {
            user: {
              email: loginData.email,
              isActive: true,
            },
            tokens: {
              accessToken: expect.any(String),
              refreshToken: expect.any(String),
            },
          },
        });
      });

      it('should reject invalid credentials', async () => {
        // Arrange
        const loginData = {
          email: 'integration-test@example.com',
          password: 'wrong-password',
        };

        // Act
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send(loginData)
          .expect(401);

        // Assert
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/v1/auth/refresh', () => {
      it('should refresh tokens successfully', async () => {
        // Arrange
        const refreshData = {
          refreshToken,
        };

        // Act
        const response = await request(app)
          .post('/api/v1/auth/refresh')
          .send(refreshData)
          .expect(200);

        // Assert
        expect(response.body).toMatchObject({
          success: true,
          data: {
            accessToken: expect.any(String),
            refreshToken: expect.any(String),
          },
        });
      });

      it('should reject invalid refresh token', async () => {
        // Arrange
        const refreshData = {
          refreshToken: 'invalid-refresh-token',
        };

        // Act
        const response = await request(app)
          .post('/api/v1/auth/refresh')
          .send(refreshData)
          .expect(401);

        // Assert
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/v1/auth/logout', () => {
      it('should logout successfully', async () => {
        // Act
        const response = await request(app)
          .post('/api/v1/auth/logout')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Assert
        expect(response.body).toMatchObject({
          success: true,
          data: {
            message: 'Logged out successfully',
          },
        });
      });

      it('should reject logout without authentication', async () => {
        // Act
        const response = await request(app)
          .post('/api/v1/auth/logout')
          .expect(401);

        // Assert
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Briefing Endpoints', () => {
    describe('POST /api/v1/briefings/generate', () => {
      it('should generate daily briefing', async () => {
        // Arrange
        const briefingData = {
          date: '2025-01-01',
        };

        // Act
        const response = await request(app)
          .post('/api/v1/briefings/generate')
          .set('Authorization', `Bearer ${authToken}`)
          .send(briefingData)
          .expect(201);

        // Assert
        expect(response.body).toMatchObject({
          success: true,
          data: {
            date: briefingData.date,
            title: expect.any(String),
            content: expect.any(String),
            summary: expect.any(String),
            topics: expect.any(Array),
            isRead: false,
          },
        });
      });

      it('should reject briefing generation without authentication', async () => {
        // Arrange
        const briefingData = {
          date: '2025-01-01',
        };

        // Act
        const response = await request(app)
          .post('/api/v1/briefings/generate')
          .send(briefingData)
          .expect(401);

        // Assert
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/v1/briefings/:date', () => {
      it('should get daily briefing for specific date', async () => {
        // Arrange
        const date = '2025-01-01';

        // Act
        const response = await request(app)
          .get(`/api/v1/briefings/${date}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Assert
        expect(response.body).toMatchObject({
          success: true,
          data: {
            date,
            title: expect.any(String),
            content: expect.any(String),
          },
        });
      });

      it('should return 404 for non-existent briefing', async () => {
        // Arrange
        const date = '2099-01-01'; // Future date

        // Act
        const response = await request(app)
          .get(`/api/v1/briefings/${date}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        // Assert
        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: 'BRIEFING_NOT_FOUND',
          },
        });
      });
    });

    describe('GET /api/v1/briefings', () => {
      it('should get briefing history with pagination', async () => {
        // Act
        const response = await request(app)
          .get('/api/v1/briefings')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ page: 1, limit: 10 })
          .expect(200);

        // Assert
        expect(response.body).toMatchObject({
          success: true,
          data: {
            briefings: expect.any(Array),
            pagination: {
              page: 1,
              limit: 10,
              total: expect.any(Number),
              totalPages: expect.any(Number),
            },
          },
        });
      });

      it('should filter by date range', async () => {
        // Act
        const response = await request(app)
          .get('/api/v1/briefings')
          .set('Authorization', `Bearer ${authToken}`)
          .query({
            dateFrom: '2025-01-01',
            dateTo: '2025-01-31',
          })
          .expect(200);

        // Assert
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('briefings');
      });
    });

    describe('PATCH /api/v1/briefings/:id/read', () => {
      it('should mark briefing as read', async () => {
        // First, create a briefing
        const briefing = await createTestBriefing(userId, '2025-01-02');

        // Act
        const response = await request(app)
          .patch(`/api/v1/briefings/${briefing.id}/read`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Assert
        expect(response.body).toMatchObject({
          success: true,
          data: {
            message: 'Briefing marked as read',
          },
        });
      });

      it('should return 404 for non-existent briefing', async () => {
        // Act
        const response = await request(app)
          .patch('/api/v1/briefings/non-existent/read')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        // Assert
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/v1/briefings/:id/share', () => {
      it('should generate share link', async () => {
        // First, create a briefing
        const briefing = await createTestBriefing(userId, '2025-01-03');

        // Act
        const response = await request(app)
          .post(`/api/v1/briefings/${briefing.id}/share`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ expiresIn: '24h' })
          .expect(200);

        // Assert
        expect(response.body).toMatchObject({
          success: true,
          data: {
            shareLink: expect.stringMatching(/\/share\/briefing\/[a-zA-Z0-9]+/),
          },
        });
      });

      it('should reject invalid expiration time', async () => {
        // Act
        const response = await request(app)
          .post('/api/v1/briefings/briefing-123/share')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ expiresIn: 'invalid' })
          .expect(400);

        // Assert
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limiting on protected endpoints', async () => {
      // Make multiple rapid requests
      const requests = Array.from({ length: 100 }, () =>
        request(app)
          .get('/api/v1/briefings')
          .set('Authorization', `Bearer ${authToken}`)
      );

      // Act
      const responses = await Promise.allSettled(requests);
      const rateLimitedResponses = responses.filter(
        (result) =>
          result.status === 'fulfilled' && result.value.status === 429
      );

      // Assert
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Input Validation', () => {
    describe('Authentication endpoints', () => {
      it('should validate email format', async () => {
        // Act
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: 'invalid-email',
            password: 'SecurePass123!',
            firstName: 'Test',
            lastName: 'User',
          })
          .expect(400);

        // Assert
        expect(response.body.success).toBe(false);
      });

      it('should validate required fields', async () => {
        // Act
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'test@example.com',
            // Missing password
          })
          .expect(400);

        // Assert
        expect(response.body.success).toBe(false);
      });
    });

    describe('Briefing endpoints', () => {
      it('should validate date format', async () => {
        // Act
        const response = await request(app)
          .get('/api/v1/briefings/invalid-date')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        // Assert
        expect(response.body.success).toBe(false);
      });

      it('should validate pagination parameters', async () => {
        // Act
        const response = await request(app)
          .get('/api/v1/briefings')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ page: -1, limit: 0 })
          .expect(400);

        // Assert
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('CORS and Security Headers', () => {
    it('should include appropriate security headers', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      // Assert
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should handle preflight OPTIONS requests', async () => {
      // Act
      const response = await request(app)
        .options('/api/v1/auth/login')
        .expect(200);

      // Assert
      expect(response.headers).toHaveProperty('access-control-allow-headers');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
    });
  });

  describe('Error Handling', () => {
    it('should return consistent error format', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/non-existent-endpoint')
        .expect(404);

      // Assert
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String),
        },
      });
    });

    it('should include request ID in responses', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      // Assert
      expect(response.headers).toHaveProperty('x-request-id');
    });
  });

  describe('Performance Tests', () => {
    it('should respond to health check within 100ms', async () => {
      // Act
      const start = Date.now();
      await request(app).get('/api/v1/health').expect(200);
      const duration = Date.now() - start;

      // Assert
      expect(duration).toBeLessThan(100);
    });

    it('should handle concurrent requests', async () => {
      // Arrange
      const concurrentRequests = 50;

      // Act
      const start = Date.now();
      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/api/v1/health')
      );
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      // Assert
      expect(responses.every((res) => res.status === 200)).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    }, 15000);
  });
});

export {};