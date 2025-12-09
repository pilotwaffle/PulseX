import { UserService } from '../../services/userService';
import { User } from '../../types';

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  describe('createUser', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        preferences: {
          topics: ['crypto', 'ai'],
          briefingTime: '08:00',
          timezone: 'America/New_York'
        }
      };

      // Mock the database call
      jest.spyOn(userService as any, 'databaseQuery').mockResolvedValue({
        id: 'user-123',
        email: userData.email,
        preferences: userData.preferences,
        created_at: new Date()
      });

      const result = await userService.createUser(userData);

      expect(result).toBeDefined();
      expect(result.email).toBe(userData.email);
    });

    it('should throw error for duplicate email', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123'
      };

      jest.spyOn(userService as any, 'databaseQuery').mockRejectedValue(
        new Error('User already exists')
      );

      await expect(userService.createUser(userData)).rejects.toThrow('User already exists');
    });
  });

  describe('getUserById', () => {
    it('should return user for valid ID', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        preferences: {}
      };

      jest.spyOn(userService as any, 'databaseQuery').mockResolvedValue(mockUser);

      const result = await userService.getUserById(userId);

      expect(result).toBeDefined();
      expect(result.id).toBe(userId);
    });

    it('should return null for non-existent user', async () => {
      jest.spyOn(userService as any, 'databaseQuery').mockResolvedValue(null);

      const result = await userService.getUserById('non-existent');

      expect(result).toBeNull();
    });
  });
});
