import { generateToken, verifyToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt';

describe('JWT Utils', () => {
  const mockUserId = 'test-user-123';
  const mockEmail = 'test@example.com';

  describe('generateToken', () => {
    it('should generate a valid access token', () => {
      const token = generateToken(mockUserId, mockEmail);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateToken(mockUserId, mockEmail);
      const payload = verifyToken(token);

      expect(payload).toBeDefined();
      expect(payload.userId).toBe(mockUserId);
      expect(payload.email).toBe(mockEmail);
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => {
        verifyToken(invalidToken);
      }).toThrow();
    });
  });
});
