import bcrypt from 'bcryptjs';
import { logger } from '../config/logger';

export class PasswordService {
  private rounds: number;

  constructor() {
    this.rounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  }

  async hash(password: string): Promise<string> {
    try {
      const salt = await bcrypt.genSalt(this.rounds);
      const hashedPassword = await bcrypt.hash(password, salt);

      logger.info('Password hashed successfully');
      return hashedPassword;
    } catch (error) {
      logger.error('Password hashing failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Password hashing failed');
    }
  }

  async compare(password: string, hashedPassword: string): Promise<boolean> {
    try {
      const isMatch = await bcrypt.compare(password, hashedPassword);

      if (isMatch) {
        logger.debug('Password comparison successful');
      } else {
        logger.warn('Password comparison failed - mismatch');
      }

      return isMatch;
    } catch (error) {
      logger.error('Password comparison failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new Error('Password comparison failed');
    }
  }

  validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
      errors.push('Password must be less than 128 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Check for common patterns
    const commonPatterns = [
      /password/i,
      /123456/,
      /qwerty/i,
      /admin/i,
      /letmein/i,
      /welcome/i,
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('Password cannot contain common patterns');
        break;
      }
    }

    // Check for sequential characters
    const hasSequentialChars = (str: string): boolean => {
      for (let i = 0; i < str.length - 2; i++) {
        const char1 = str.charCodeAt(i);
        const char2 = str.charCodeAt(i + 1);
        const char3 = str.charCodeAt(i + 2);

        if (char2 === char1 + 1 && char3 === char2 + 1) {
          return true;
        }
        if (char2 === char1 - 1 && char3 === char2 - 1) {
          return true;
        }
      }
      return false;
    };

    if (hasSequentialChars(password)) {
      errors.push('Password cannot contain sequential characters');
    }

    // Check for repeated characters
    const hasRepeatedChars = (str: string): boolean => {
      for (let i = 0; i < str.length - 2; i++) {
        if (str[i] === str[i + 1] && str[i + 1] === str[i + 2]) {
          return true;
        }
      }
      return false;
    };

    if (hasRepeatedChars(password)) {
      errors.push('Password cannot contain repeated characters');
    }

    const isValid = errors.length === 0;

    if (!isValid) {
      logger.warn('Password validation failed', { errors });
    }

    return { isValid, errors };
  }

  generateSecurePassword(length: number = 16): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';

    // Ensure at least one character from each category
    const categories = [
      'abcdefghijklmnopqrstuvwxyz',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789',
      '!@#$%^&*()_+-=[]{}|;:,.<>?'
    ];

    // Add one character from each category
    for (const category of categories) {
      password += category.charAt(Math.floor(Math.random() * category.length));
    }

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  async checkPasswordBreached(password: string): Promise<boolean> {
    try {
      // Hash the password using SHA-1 (required by HaveIBeenPwned API)
      const crypto = require('crypto');
      const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = hash.substring(0, 5);
      const suffix = hash.substring(5);

      // In a real implementation, you would make a request to the HaveIBeenPwned API
      // For this example, we'll just return false (not breached)
      // const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
      // const data = await response.text();
      // return data.includes(suffix);

      return false;
    } catch (error) {
      logger.error('Password breach check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  getRounds(): number {
    return this.rounds;
  }
}

export const passwordService = new PasswordService();