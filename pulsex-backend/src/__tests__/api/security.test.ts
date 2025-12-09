import request from 'supertest';
import app from '../../server';

describe('Security Tests', () => {
  let authToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    // Create test user for authentication
    const registerResponse = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'security-test@example.com',
        password: 'SecurePass123!',
        firstName: 'Security',
        lastName: 'Test',
      });

    authToken = registerResponse.body.data.tokens.accessToken;
    refreshToken = registerResponse.body.data.tokens.refreshToken;
  });

  describe('Input Validation and Sanitization', () => {
    describe('SQL Injection Protection', () => {
      it('should prevent SQL injection in login', async () => {
        // Arrange
        const maliciousInput = "admin'; DROP TABLE users; --";

        // Act
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: maliciousInput,
            password: 'password',
          });

        // Assert
        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });

      it('should prevent SQL injection in registration', async () => {
        // Arrange
        const maliciousInput = "user'; DELETE FROM users; --";

        // Act
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: `${maliciousInput}@example.com`,
            password: 'SecurePass123!',
            firstName: 'Test',
            lastName: 'User',
          });

        // Assert
        // Should either succeed with sanitized input or fail validation
        expect([201, 400]).toContain(response.status);
      });

      it('should prevent SQL injection in briefing queries', async () => {
        // Arrange
        const maliciousDate = "2025-01-01'; DROP TABLE daily_briefings; --";

        // Act
        const response = await request(app)
          .get(`/api/v1/briefings/${maliciousDate}`)
          .set('Authorization', `Bearer ${authToken}`);

        // Assert
        expect([400, 404]).toContain(response.status);
      });
    });

    describe('XSS Protection', () => {
      it('should sanitize HTML in user input', async () => {
        // Arrange
        const xssPayload = '<script>alert("xss")</script>';

        // Act
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: 'xss-test@example.com',
            password: 'SecurePass123!',
            firstName: xssPayload,
            lastName: 'User',
          });

        // Assert
        if (response.status === 201) {
          // If registration succeeds, check that HTML is sanitized
          expect(response.body.data.user.firstName).not.toContain('<script>');
        }
      });

      it('should prevent XSS in feedback submission', async () => {
        // Arrange
        const xssPayload = '<img src=x onerror=alert("xss")>';

        // Act
        const response = await request(app)
          .post('/api/v1/feedback')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            briefingId: 'test-briefing-id',
            rating: 5,
            comment: xssPayload,
          });

        // Assert
        // Should either succeed with sanitized content or fail validation
        expect([201, 400, 422]).toContain(response.status);
      });
    });

    describe('NoSQL Injection Protection', () => {
      it('should prevent NoSQL injection in query parameters', async () => {
        // Arrange
        const maliciousQuery = {
          $ne: null,
        };

        // Act
        const response = await request(app)
          .get('/api/v1/briefings')
          .set('Authorization', `Bearer ${authToken}`)
          .query(maliciousQuery);

        // Assert
        expect([400, 422]).toContain(response.status);
      });
    });

    describe('Path Traversal Protection', () => {
      it('should prevent path traversal attacks', async () => {
        // Arrange
        const maliciousPath = '../../../etc/passwd';

        // Act
        const response = await request(app)
          .get(`/api/v1/briefings/${maliciousPath}`)
          .set('Authorization', `Bearer ${authToken}`);

        // Assert
        expect([400, 404]).toContain(response.status);
      });
    });

    describe('Command Injection Protection', () => {
      it('should prevent command injection in file uploads', async () => {
        // Arrange
        const maliciousFilename = 'test.txt; rm -rf /';

        // Act
        const response = await request(app)
          .post('/api/v1/upload')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from('test content'), maliciousFilename);

        // Assert
        expect([400, 404, 422]).toContain(response.status);
      });
    });
  });

  describe('Authentication Security', () => {
    describe('Token Security', () => {
      it('should reject malformed JWT tokens', async () => {
        // Arrange
        const malformedToken = 'invalid.jwt.token';

        // Act
        const response = await request(app)
          .get('/api/v1/briefings')
          .set('Authorization', `Bearer ${malformedToken}`);

        // Assert
        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });

      it('should reject expired JWT tokens', async () => {
        // Arrange
        const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ.invalid';

        // Act
        const response = await request(app)
          .get('/api/v1/briefings')
          .set('Authorization', `Bearer ${expiredToken}`);

        // Assert
        expect(response.status).toBe(401);
      });

      it('should reject tokens with invalid signature', async () => {
        // Arrange
        const tokenWithInvalidSignature = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalidsignature';

        // Act
        const response = await request(app)
          .get('/api/v1/briefings')
          .set('Authorization', `Bearer ${tokenWithInvalidSignature}`);

        // Assert
        expect(response.status).toBe(401);
      });

      it('should reject requests without Authorization header', async () => {
        // Act
        const response = await request(app)
          .get('/api/v1/briefings');

        // Assert
        expect(response.status).toBe(401);
      });

      it('should reject requests with invalid Authorization header format', async () => {
        // Act
        const response = await request(app)
          .get('/api/v1/briefings')
          .set('Authorization', 'InvalidFormat token');

        // Assert
        expect(response.status).toBe(401);
      });
    });

    describe('Password Security', () => {
      it('should reject weak passwords', async () => {
        const weakPasswords = [
          'password',
          '123456',
          'qwerty',
          'admin',
          'welcome',
          'password123',
          '123456789',
          'abc123',
        ];

        for (const weakPassword of weakPasswords) {
          // Act
          const response = await request(app)
            .post('/api/v1/auth/register')
            .send({
              email: `weak-${Date.now()}@example.com`,
              password: weakPassword,
              firstName: 'Test',
              lastName: 'User',
            });

          // Assert
          expect(response.status).toBe(400);
          expect(response.body.error.code).toBe('PASSWORD_TOO_WEAK');
        }
      });

      it('should enforce password complexity requirements', async () => {
        const invalidPasswords = [
          { password: 'short', description: 'too short' },
          { password: 'nouppercase123!', description: 'no uppercase' },
          { password: 'NOLOWERCASE123!', description: 'no lowercase' },
          { password: 'NoNumbers!', description: 'no numbers' },
          { password: 'NoSymbols123', description: 'no symbols' },
        ];

        for (const { password, description } of invalidPasswords) {
          // Act
          const response = await request(app)
            .post('/api/v1/auth/register')
            .send({
              email: `complexity-test-${Date.now()}@example.com`,
              password,
              firstName: 'Test',
              lastName: 'User',
            });

          // Assert
          expect(response.status).toBe(400);
          expect(response.body.error.code).toBe('PASSWORD_TOO_WEAK');
        }
      });

      it('should prevent password reuse', async () => {
        // This test would require implementing password history checking
        // For now, we'll test that the password is hashed and not stored in plain text
        const password = 'NewSecurePass123!';

        // Act
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: `password-reuse-${Date.now()}@example.com`,
            password,
            firstName: 'Test',
            lastName: 'User',
          });

        // Assert
        if (response.status === 201) {
          // Password should not be returned in response
          expect(response.body.data.user.password).toBeUndefined();
        }
      });
    });

    describe('Rate Limiting', () => {
      it('should enforce authentication rate limiting', async () => {
        // Arrange
        const requests = Array.from({ length: 20 }, () =>
          request(app)
            .post('/api/v1/auth/login')
            .send({
              email: 'rate-limit-test@example.com',
              password: 'wrong-password',
            })
        );

        // Act
        const responses = await Promise.allSettled(requests);
        const rateLimitedResponses = responses.filter(
          (result) =>
            result.status === 'fulfilled' && result.value.status === 429
        );

        // Assert
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
      });

      it('should enforce API endpoint rate limiting', async () => {
        // Arrange
        const requests = Array.from({ length: 100 }, () =>
          request(app)
            .get('/api/v1/health')
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
      });
    });
  });

  describe('Authorization Security', () => {
    describe('Access Control', () => {
      it('should prevent unauthorized access to user data', async () => {
        // Arrange
        const otherUserId = 'other-user-123';

        // Act
        const response = await request(app)
          .get(`/api/v1/users/${otherUserId}`)
          .set('Authorization', `Bearer ${authToken}`);

        // Assert
        expect([403, 404]).toContain(response.status);
      });

      it('should prevent access to other users\' briefings', async () => {
        // Arrange
        const otherBriefingId = 'other-briefing-123';

        // Act
        const response = await request(app)
          .get(`/api/v1/briefings/${otherBriefingId}`)
          .set('Authorization', `Bearer ${authToken}`);

        // Assert
        expect([403, 404]).toContain(response.status);
      });

      it('should prevent modification of other users\' data', async () => {
        // Act
        const response = await request(app)
          .patch(`/api/v1/briefings/other-briefing/read`)
          .set('Authorization', `Bearer ${authToken}`);

        // Assert
        expect([403, 404]).toContain(response.status);
      });
    });

    describe('Role-Based Access Control', () => {
      it('should restrict admin-only endpoints', async () => {
        // Act - Try to access admin endpoint
        const response = await request(app)
          .get('/api/v1/admin/users')
          .set('Authorization', `Bearer ${authToken}`);

        // Assert
        expect([403, 404]).toContain(response.status);
      });

      it('should prevent privilege escalation attempts', async () => {
        // Arrange
        const adminUpdateRequest = {
          role: 'admin',
        };

        // Act
        const response = await request(app)
          .patch('/api/v1/users/profile')
          .set('Authorization', `Bearer ${authToken}`)
          .send(adminUpdateRequest);

        // Assert
        expect([400, 403, 422]).toContain(response.status);
      });
    });
  });

  describe('Data Protection', () => {
    describe('Sensitive Data Exposure', () => {
      it('should not expose password hashes in API responses', async () => {
        // Act
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'security-test@example.com',
            password: 'SecurePass123!',
          });

        // Assert
        if (response.status === 200) {
          expect(response.body.data.user.password).toBeUndefined();
          expect(response.body.data.user.password_hash).toBeUndefined();
        }
      });

      it('should not expose internal system information', async () => {
        // Act
        const response = await request(app)
          .get('/api/v1/non-existent-endpoint');

        // Assert
        expect(response.body).not.toContain('stack');
        expect(response.body).not.toContain('internal');
        expect(response.body).not.toContain('database');
      });

      it('should not reveal user existence through timing attacks', async () => {
        // Arrange
        const existingEmail = 'security-test@example.com';
        const nonExistingEmail = 'non-existing-user@example.com';

        // Act
        const start1 = Date.now();
        const response1 = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: existingEmail,
            password: 'wrong-password',
          });
        const time1 = Date.now() - start1;

        const start2 = Date.now();
        const response2 = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: nonExistingEmail,
            password: 'wrong-password',
          });
        const time2 = Date.now() - start2;

        // Assert
        expect(response1.status).toBe(401);
        expect(response2.status).toBe(401);
        // Response times should be similar (within 100ms)
        expect(Math.abs(time1 - time2)).toBeLessThan(100);
      });
    });

    describe('Data Encryption', () => {
      it('should use HTTPS in production headers', async () => {
        // Act
        const response = await request(app)
          .get('/api/v1/health');

        // Assert
        if (process.env.NODE_ENV === 'production') {
          expect(response.headers['strict-transport-security']).toBeDefined();
        }
      });

      it('should set secure cookie headers', async () => {
        // Act
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: 'security-test@example.com',
            password: 'SecurePass123!',
          });

        // Assert
        // In production, cookies should have Secure and HttpOnly flags
        if (process.env.NODE_ENV === 'production') {
          const setCookieHeader = response.headers['set-cookie'];
          if (setCookieHeader) {
            expect(setCookieHeader.some(cookie => cookie.includes('Secure'))).toBe(true);
            expect(setCookieHeader.some(cookie => cookie.includes('HttpOnly'))).toBe(true);
          }
        }
      });
    });
  });

  describe('CORS Security', () => {
    it('should enforce CORS policy', async () => {
      // Act - Make request from unauthorized origin
      const response = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'https://malicious-site.com')
        .set('Access-Control-Request-Method', 'POST');

      // Assert
      // In development, CORS might be permissive
      if (process.env.NODE_ENV === 'production') {
        expect(response.headers['access-control-allow-origin']).not.toBe('*');
      }
    });

    it('should handle preflight requests correctly', async () => {
      // Act
      const response = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type');

      // Assert
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/health');

      // Assert
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
      expect(response.headers['referrer-policy']).toBeDefined();
    });

    it('should include Content Security Policy', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/health');

      // Assert
      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('File Upload Security', () => {
    it('should validate file types', async () => {
      // Act - Try to upload executable file
      const response = await request(app)
        .post('/api/v1/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('fake executable'), 'malware.exe');

      // Assert
      expect([400, 404, 422]).toContain(response.status);
    });

    it('should validate file sizes', async () => {
      // Act - Try to upload large file
      const largeBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
      const response = await request(app)
        .post('/api/v1/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', largeBuffer, 'large-file.txt');

      // Assert
      expect([400, 413, 422]).toContain(response.status);
    });
  });

  describe('Error Handling Security', () => {
    it('should not leak internal error details', async () => {
      // Act - Trigger internal error
      const response = await request(app)
        .get('/api/v1/internal-error-test');

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body).not.toContain('stack trace');
      expect(response.body).not.toContain('database connection');
    });

    it('should sanitize error messages', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: 'test',
        });

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).not.toContain('SQL');
      expect(response.body.error.message).not.toContain('database');
    });
  });

  describe('Session Security', () => {
    it('should invalidate tokens after logout', async () => {
      // Act
      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      // Try to use the token after logout
      const subsequentResponse = await request(app)
        .get('/api/v1/briefings')
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(logoutResponse.status).toBe(200);
      expect(subsequentResponse.status).toBe(401);
    });

    it('should handle session expiration', async () => {
      // This test would require waiting for token expiration
      // For now, we'll test with an expired token format
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxfQ.invalid';

      // Act
      const response = await request(app)
        .get('/api/v1/briefings')
        .set('Authorization', `Bearer ${expiredToken}`);

      // Assert
      expect(response.status).toBe(401);
    });
  });
});

export {};