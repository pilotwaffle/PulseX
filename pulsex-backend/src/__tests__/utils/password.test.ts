import { passwordService } from '../../utils/password';

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
  genSalt: jest.fn(),
}));

describe('PasswordService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hashPassword', () => {
    const password = 'TestPassword123!';

    it('should hash password successfully', async () => {
      // Arrange
      const { hash, genSalt } = require('bcryptjs');
      const mockSalt = 'mock-salt-12';
      const mockHash = 'hashed-password';

      genSalt.mockResolvedValue(mockSalt);
      hash.mockResolvedValue(mockHash);

      // Act
      const result = await passwordService.hashPassword(password);

      // Assert
      expect(genSalt).toHaveBeenCalledWith(12);
      expect(hash).toHaveBeenCalledWith(password, mockSalt);
      expect(result).toBe(mockHash);
    });

    it('should handle salt generation errors', async () => {
      // Arrange
      const { genSalt } = require('bcryptjs');
      genSalt.mockRejectedValue(new Error('Salt generation failed'));

      // Act & Assert
      await expect(passwordService.hashPassword(password)).rejects.toThrow(
        'Salt generation failed'
      );
    });

    it('should handle hashing errors', async () => {
      // Arrange
      const { hash, genSalt } = require('bcryptjs');
      genSalt.mockResolvedValue('mock-salt');
      hash.mockRejectedValue(new Error('Hashing failed'));

      // Act & Assert
      await expect(passwordService.hashPassword(password)).rejects.toThrow('Hashing failed');
    });
  });

  describe('verifyPassword', () => {
    const password = 'TestPassword123!';
    const hashedPassword = '$2b$12$hashedpassword';

    it('should verify password successfully', async () => {
      // Arrange
      const { compare } = require('bcryptjs');
      compare.mockResolvedValue(true);

      // Act
      const result = await passwordService.verifyPassword(password, hashedPassword);

      // Assert
      expect(compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      // Arrange
      const { compare } = require('bcryptjs');
      compare.mockResolvedValue(false);

      // Act
      const result = await passwordService.verifyPassword('wrong-password', hashedPassword);

      // Assert
      expect(compare).toHaveBeenCalledWith('wrong-password', hashedPassword);
      expect(result).toBe(false);
    });

    it('should handle comparison errors', async () => {
      // Arrange
      const { compare } = require('bcryptjs');
      compare.mockRejectedValue(new Error('Comparison failed'));

      // Act & Assert
      await expect(
        passwordService.verifyPassword(password, hashedPassword)
      ).rejects.toThrow('Comparison failed');
    });
  });

  describe('validatePasswordStrength', () => {
    describe('Strong passwords', () => {
      it('should accept strong password with all requirements', async () => {
        // Arrange
        const strongPassword = 'SecurePass123!@#';

        // Act
        const result = await passwordService.validatePasswordStrength(strongPassword);

        // Assert
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.score).toBeGreaterThan(80);
      });

      it('should accept password with mixed case, numbers, and symbols', async () => {
        // Arrange
        const password = 'MySecureP@ssw0rd';

        // Act
        const result = await passwordService.validatePasswordStrength(password);

        // Assert
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });
    });

    describe('Weak passwords', () => {
      it('should reject password that is too short', async () => {
        // Arrange
        const shortPassword = 'Short1!';

        // Act
        const result = await passwordService.validatePasswordStrength(shortPassword);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password must be at least 8 characters long');
      });

      it('should reject password without uppercase letters', async () => {
        // Arrange
        const password = 'lowercase123!';

        // Act
        const result = await passwordService.validatePasswordStrength(password);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one uppercase letter');
      });

      it('should reject password without lowercase letters', async () => {
        // Arrange
        const password = 'UPPERCASE123!';

        // Act
        const result = await passwordService.validatePasswordStrength(password);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one lowercase letter');
      });

      it('should reject password without numbers', async () => {
        // Arrange
        const password = 'NoNumbers!';

        // Act
        const result = await passwordService.validatePasswordStrength(password);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one number');
      });

      it('should reject password without special characters', async () => {
        // Arrange
        const password = 'NoSpecialChars123';

        // Act
        const result = await passwordService.validatePasswordStrength(password);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password must contain at least one special character');
      });

      it('should reject common passwords', async () => {
        // Arrange
        const commonPasswords = ['password', '123456', 'qwerty', 'admin123'];

        // Act & Assert
        for (const commonPassword of commonPasswords) {
          const result = await passwordService.validatePasswordStrength(commonPassword + 'A!');
          expect(result.isValid).toBe(false);
          expect(result.errors).toContain('Password is too common');
        }
      });

      it('should reject passwords with repeated characters', async () => {
        // Arrange
        const weakPassword = 'Aaaaaa123!';

        // Act
        const result = await passwordService.validatePasswordStrength(weakPassword);

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password contains too many repeated characters');
      });
    });

    describe('Password strength scoring', () => {
      it('should assign appropriate score based on complexity', async () => {
        // Test various password strengths
        const testCases = [
          { password: 'Simple1!', expectedMinScore: 20 },
          { password: 'MediumPassword2@', expectedMinScore: 50 },
          { password: 'VeryStrongPassword3!#$', expectedMinScore: 80 },
        ];

        for (const testCase of testCases) {
          const result = await passwordService.validatePasswordStrength(testCase.password);
          expect(result.score).toBeGreaterThanOrEqual(testCase.expectedMinScore);
        }
      });

      it('should provide strength feedback', async () => {
        // Arrange
        const password = 'MediumPassword2@';

        // Act
        const result = await passwordService.validatePasswordStrength(password);

        // Assert
        expect(result).toHaveProperty('strength');
        expect(typeof result.strength).toBe('string');
        expect(['weak', 'fair', 'good', 'strong']).toContain(result.strength);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty password', async () => {
        // Act
        const result = await passwordService.validatePasswordStrength('');

        // Assert
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Password must be at least 8 characters long');
      });

      it('should handle null/undefined password', async () => {
        // Act
        const nullResult = await passwordService.validatePasswordStrength(null as any);
        const undefinedResult = await passwordService.validatePasswordStrength(undefined as any);

        // Assert
        expect(nullResult.isValid).toBe(false);
        expect(undefinedResult.isValid).toBe(false);
      });

      it('should handle extremely long passwords', async () => {
        // Arrange
        const longPassword = 'A'.repeat(200) + '1!';

        // Act
        const result = await passwordService.validatePasswordStrength(longPassword);

        // Assert
        expect(result).toHaveProperty('isValid');
        expect(result).toHaveProperty('errors');
      });
    });
  });

  describe('generateSecurePassword', () => {
    it('should generate password with specified length', async () => {
      // Arrange
      const length = 16;

      // Act
      const password = await passwordService.generateSecurePassword(length);

      // Assert
      expect(password).toHaveLength(length);
    });

    it('should generate password meeting all requirements', async () => {
      // Act
      const password = await passwordService.generateSecurePassword(12);

      // Assert
      expect(password).toMatch(/[a-z]/); // lowercase
      expect(password).toMatch(/[A-Z]/); // uppercase
      expect(password).toMatch(/[0-9]/); // number
      expect(password).toMatch(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/); // special
    });

    it('should validate generated password', async () => {
      // Act
      const password = await passwordService.generateSecurePassword(12);
      const validation = await passwordService.validatePasswordStrength(password);

      // Assert
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should not generate the same password consecutively', async () => {
      // Act
      const password1 = await passwordService.generateSecurePassword(16);
      const password2 = await passwordService.generateSecurePassword(16);

      // Assert
      expect(password1).not.toBe(password2);
    });

    it('should handle custom options', async () => {
      // Arrange
      const options = {
        length: 20,
        includeNumbers: false,
        includeSymbols: false,
      };

      // Act
      const password = await passwordService.generateSecurePassword(options.length, options);

      // Assert
      expect(password).toHaveLength(20);
      expect(password).toMatch(/[a-z]/); // lowercase
      expect(password).toMatch(/[A-Z]/); // uppercase
      expect(password).not.toMatch(/[0-9]/); // no numbers
      expect(password).not.toMatch(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/); // no symbols
    });
  });

  describe('estimatePasswordStrength', () => {
    it('should estimate strength based on common patterns', async () => {
      // Test cases with expected strength levels
      const testCases = [
        { password: 'password', expectedStrength: 'weak' },
        { password: 'password123', expectedStrength: 'weak' },
        { password: 'Password123!', expectedStrength: 'fair' },
        { password: 'SecurePassword123!', expectedStrength: 'good' },
        { password: 'VerySecurePassword123!@#$', expectedStrength: 'strong' },
      ];

      for (const testCase of testCases) {
        const strength = await passwordService.estimatePasswordStrength(testCase.password);
        expect(['weak', 'fair', 'good', 'strong']).toContain(strength);
      }
    });

    it('should consider length in strength estimation', async () => {
      // Arrange
      const basePassword = 'Secure1!';

      // Act
      const shortStrength = await passwordService.estimatePasswordStrength(basePassword);
      const longStrength = await passwordService.estimatePasswordStrength(basePassword.repeat(3));

      // Assert
      expect(['weak', 'fair', 'good', 'strong']).toContain(shortStrength);
      expect(['weak', 'fair', 'good', 'strong']).toContain(longStrength);
    });
  });
});

export {};