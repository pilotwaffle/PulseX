import request from 'supertest';
import app from '../../server';

describe('Performance Tests', () => {
  let authToken: string;

  beforeAll(async () => {
    // Create authentication token for protected endpoints
    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'TestPass123!',
      });

    authToken = loginResponse.body.data.tokens.accessToken;
  });

  describe('Response Time Benchmarks', () => {
    it('should respond to health check within 50ms', async () => {
      // Act
      const start = Date.now();
      await request(app).get('/api/v1/health').expect(200);
      const responseTime = Date.now() - start;

      // Assert
      expect(responseTime).toBeLessThan(50);
    });

    it('should handle authentication within 200ms', async () => {
      // Arrange
      const loginData = {
        email: 'test@example.com',
        password: 'TestPass123!',
      };

      // Act
      const start = Date.now();
      await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);
      const responseTime = Date.now() - start;

      // Assert
      expect(responseTime).toBeLessThan(200);
    });

    it('should handle briefing retrieval within 300ms', async () => {
      // Act
      const start = Date.now();
      await request(app)
        .get('/api/v1/briefings/2025-01-01')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const responseTime = Date.now() - start;

      // Assert
      expect(responseTime).toBeLessThan(300);
    });

    it('should handle briefing history within 500ms', async () => {
      // Act
      const start = Date.now();
      await request(app)
        .get('/api/v1/briefings')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 20 })
        .expect(200);
      const responseTime = Date.now() - start;

      // Assert
      expect(responseTime).toBeLessThan(500);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 50 concurrent health check requests', async () => {
      // Arrange
      const concurrentRequests = 50;

      // Act
      const start = Date.now();
      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/api/v1/health')
      );
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - start;

      // Assert
      expect(responses.every((res) => res.status === 200)).toBe(true);
      expect(totalTime).toBeLessThan(2000); // Should complete within 2 seconds
    }, 10000);

    it('should handle 20 concurrent authentication requests', async () => {
      // Arrange
      const concurrentRequests = 20;
      const loginData = {
        email: 'test@example.com',
        password: 'TestPass123!',
      };

      // Act
      const start = Date.now();
      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app).post('/api/v1/auth/login').send(loginData)
      );
      const responses = await Promise.allSettled(requests);
      const totalTime = Date.now() - start;

      // Assert
      const successfulResponses = responses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 200
      );
      expect(successfulResponses.length).toBeGreaterThan(0);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
    }, 15000);

    it('should handle 10 concurrent briefing generation requests', async () => {
      // Arrange
      const concurrentRequests = 10;
      const briefingData = {
        date: '2025-01-01',
      };

      // Act
      const start = Date.now();
      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .post('/api/v1/briefings/generate')
          .set('Authorization', `Bearer ${authToken}`)
          .send(briefingData)
      );
      const responses = await Promise.allSettled(requests);
      const totalTime = Date.now() - start;

      // Assert
      const successfulResponses = responses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 201
      );
      expect(successfulResponses.length).toBeGreaterThan(0);
      expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds
    }, 20000);
  });

  describe('Memory Usage', () => {
    it('should maintain stable memory usage during repeated requests', async () => {
      // Arrange
      const initialMemory = process.memoryUsage();
      const requestCount = 100;

      // Act
      for (let i = 0; i < requestCount; i++) {
        await request(app).get('/api/v1/health');
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Assert
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }, 10000);

    it('should handle large response bodies efficiently', async () => {
      // Arrange
      const initialMemory = process.memoryUsage();

      // Act
      await request(app)
        .get('/api/v1/briefings')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 100 });

      const responseMemory = process.memoryUsage();
      const memoryUsage = responseMemory.heapUsed - initialMemory.heapUsed;

      // Assert
      // Memory usage should be reasonable for large response
      expect(memoryUsage).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should enforce rate limiting without impacting performance', async () => {
      // Arrange
      const requestCount = 60; // Above typical rate limit
      const start = Date.now();

      // Act
      const requests = Array.from({ length: requestCount }, () =>
        request(app).get('/api/v1/health')
      );
      const responses = await Promise.allSettled(requests);
      const totalTime = Date.now() - start;

      // Assert
      const successfulRequests = responses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 200
      );
      const rateLimitedRequests = responses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 429
      );

      expect(successfulRequests.length).toBeGreaterThan(0);
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
      expect(totalTime).toBeLessThan(5000); // Should handle quickly
    });

    it('should recover quickly after rate limit reset', async () => {
      // Arrange
      const initialTime = Date.now();

      // Act - First batch to trigger rate limit
      const firstBatch = Array.from({ length: 50 }, () =>
        request(app).get('/api/v1/health')
      );
      await Promise.allSettled(firstBatch);

      // Wait for rate limit to potentially reset
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Second batch should work
      const secondBatch = Array.from({ length: 5 }, () =>
        request(app).get('/api/v1/health')
      );
      const secondBatchResponses = await Promise.allSettled(secondBatch);
      const totalTime = Date.now() - initialTime;

      // Assert
      const successfulSecondBatch = secondBatchResponses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 200
      );
      expect(successfulSecondBatch.length).toBeGreaterThan(0);
      expect(totalTime).toBeLessThan(10000); // Should recover within 10 seconds
    }, 15000);
  });

  describe('Database Performance', () => {
    it('should handle database query timeouts gracefully', async () => {
      // Arrange - Mock a slow database query
      const originalQuery = require('../../config/database').database.query;
      require('../../config/database').database.query = jest.fn().mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
      });

      // Act
      const start = Date.now();
      const response = await request(app)
        .get('/api/v1/briefings/2025-01-01')
        .set('Authorization', `Bearer ${authToken}`);
      const responseTime = Date.now() - start;

      // Restore original query function
      require('../../config/database').database.query = originalQuery;

      // Assert
      // Should timeout or handle gracefully
      expect(responseTime).toBeLessThan(30000); // Should not hang indefinitely
    }, 35000);

    it('should handle database connection pooling efficiently', async () => {
      // Arrange
      const concurrentDbRequests = 20;

      // Act
      const start = Date.now();
      const requests = Array.from({ length: concurrentDbRequests }, () =>
        request(app)
          .get('/api/v1/briefings')
          .set('Authorization', `Bearer ${authToken}`)
      );
      const responses = await Promise.allSettled(requests);
      const totalTime = Date.now() - start;

      // Assert
      const successfulResponses = responses.filter(
        (result) => result.status === 'fulfilled' && result.value.status === 200
      );
      expect(successfulResponses.length).toBeGreaterThan(0);
      expect(totalTime).toBeLessThan(10000); // Should handle pooling efficiently
    }, 15000);
  });

  describe('External API Performance', () => {
    it('should handle slow external API responses', async () => {
      // Mock slow LLM service response
      const originalService = require('../../services/external/llmService').llmService;
      require('../../services/external/llmService').llmService = {
        ...originalService,
        generateDailyBriefing: jest.fn().mockImplementation(() => {
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                content: 'Slow external API response',
                summary: 'Slow response',
                topics: ['test'],
                sources: [],
                metadata: {
                  model_version: 'test',
                  processing_time_ms: 5000,
                  relevance_score: 0.8,
                },
              });
            }, 3000); // 3 second delay
          });
        }),
      };

      // Act
      const start = Date.now();
      const response = await request(app)
        .post('/api/v1/briefings/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ date: '2025-01-01' });
      const responseTime = Date.now() - start;

      // Restore original service
      require('../../services/external/llmService').llmService = originalService;

      // Assert
      expect(response.status).toBe(201);
      expect(responseTime).toBeLessThan(10000); // Should handle slow external APIs
    }, 15000);

    it('should implement proper timeouts for external calls', async () => {
      // Mock extremely slow external service
      const originalService = require('../../services/external/llmService').llmService;
      require('../../services/external/llmService').llmService = {
        ...originalService,
        generateDailyBriefing: jest.fn().mockImplementation(() => {
          return new Promise(resolve => setTimeout(resolve, 30000)); // 30 second delay
        }),
      };

      // Act
      const start = Date.now();
      try {
        await request(app)
          .post('/api/v1/briefings/generate')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ date: '2025-01-01' });
      } catch (error) {
        // Expected to timeout
      }
      const totalTime = Date.now() - start;

      // Restore original service
      require('../../services/external/llmService').llmService = originalService;

      // Assert
      expect(totalTime).toBeLessThan(15000); // Should timeout before external service
    }, 20000);
  });

  describe('Stress Tests', () => {
    it('should handle sustained load over time', async () => {
      // Arrange
      const duration = 5000; // 5 seconds
      const requestsPerSecond = 10;
      const interval = 1000 / requestsPerSecond;

      let requestCount = 0;
      let successfulRequests = 0;
      const startTime = Date.now();

      // Act
      const intervalId = setInterval(async () => {
        if (Date.now() - startTime >= duration) {
          clearInterval(intervalId);
          return;
        }

        requestCount++;
        try {
          const response = await request(app).get('/api/v1/health');
          if (response.status === 200) {
            successfulRequests++;
          }
        } catch (error) {
          // Handle errors
        }
      }, interval);

      // Wait for stress test to complete
      await new Promise(resolve => setTimeout(resolve, duration + 1000));

      // Assert
      const successRate = successfulRequests / requestCount;
      expect(successRate).toBeGreaterThan(0.8); // At least 80% success rate
      expect(successfulRequests).toBeGreaterThan(40); // Minimum successful requests
    }, 10000);

    it('should maintain performance under memory pressure', async () => {
      // Arrange
      const initialMemory = process.memoryUsage();
      const largeData = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: 'x'.repeat(1000), // 1KB per item
      }));

      // Act - Process large data while making requests
      const processDataPromise = new Promise(resolve => {
        setTimeout(() => {
          largeData.forEach(item => {
            JSON.parse(JSON.stringify(item)); // Process the data
          });
          resolve(undefined);
        }, 1000);
      });

      // Make requests during data processing
      const requests = Array.from({ length: 20 }, () =>
        request(app).get('/api/v1/health')
      );

      await Promise.all([...requests, processDataPromise]);

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Assert
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
    }, 15000);
  });

  describe('Load Testing Metrics', () => {
    it('should track and report performance metrics', async () => {
      // Arrange
      const metrics = {
        totalRequests: 0,
        successfulRequests: 0,
        responseTimes: [],
      };

      // Act
      for (let i = 0; i < 50; i++) {
        const start = Date.now();
        try {
          const response = await request(app).get('/api/v1/health');
          const responseTime = Date.now() - start;

          metrics.totalRequests++;
          metrics.responseTimes.push(responseTime);

          if (response.status === 200) {
            metrics.successfulRequests++;
          }
        } catch (error) {
          metrics.totalRequests++;
        }
      }

      // Calculate metrics
      const successRate = metrics.successfulRequests / metrics.totalRequests;
      const avgResponseTime = metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length;
      const maxResponseTime = Math.max(...metrics.responseTimes);
      const p95ResponseTime = metrics.responseTimes.sort((a, b) => a - b)[Math.floor(metrics.responseTimes.length * 0.95)];

      // Assert
      expect(successRate).toBeGreaterThan(0.95);
      expect(avgResponseTime).toBeLessThan(100);
      expect(maxResponseTime).toBeLessThan(500);
      expect(p95ResponseTime).toBeLessThan(200);
    }, 10000);
  });
});

export {};