import { z } from 'zod';

export const userRegistrationSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phoneNumber: z.string().optional(),
});

export const userLoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const userPreferencesSchema = z.object({
  preferredTopics: z.array(z.string()).min(1, 'At least one topic is required'),
  briefingTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  timezone: z.string().min(1, 'Timezone is required'),
  language: z.string().min(2, 'Language code is required'),
  notificationPreferences: z.object({
    pushEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    categories: z.object({
      news: z.boolean(),
      crypto: z.boolean(),
      stocks: z.boolean(),
      tech: z.boolean(),
    }),
  }),
});

export const deviceTokenSchema = z.object({
  token: z.string().min(1, 'Device token is required'),
  deviceType: z.enum(['ios', 'android']),
  deviceInfo: z.record(z.any()).optional(),
});

export const feedbackSchema = z.object({
  briefingId: z.string().uuid('Invalid briefing ID'),
  cardId: z.string().min(1, 'Card ID is required'),
  type: z.enum(['like', 'dislike']),
  topic: z.string().min(1, 'Topic is required'),
  reason: z.string().optional(),
});

export const savedCardSchema = z.object({
  briefingId: z.string().uuid('Invalid briefing ID'),
  cardId: z.string().min(1, 'Card ID is required'),
  title: z.string().min(1, 'Title is required'),
  summary: z.string().min(1, 'Summary is required'),
  tags: z.array(z.string()).optional(),
});

export const briefingGenerationSchema = z.object({
  topics: z.array(z.string()).min(1, 'At least one topic is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
});

export const notificationPreferencesSchema = z.object({
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  categories: z.object({
    news: z.boolean(),
    crypto: z.boolean(),
    stocks: z.boolean(),
    tech: z.boolean(),
  }),
});

export const apiRequestSchema = z.object({
  requestId: z.string().optional(),
  timestamp: z.number().optional(),
});

export const updateUserProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  phoneNumber: z.string().optional(),
  avatarUrl: z.string().url('Invalid avatar URL').optional(),
});

export const contentGenerationSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  maxTokens: z.number().min(1).max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
  model: z.string().optional(),
});

export const analyticsEventSchema = z.object({
  eventType: z.string().min(1, 'Event type is required'),
  eventData: z.record(z.any()).optional(),
  sessionId: z.string().optional(),
});

export type UserRegistration = z.infer<typeof userRegistrationSchema>;
export type UserLogin = z.infer<typeof userLoginSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type DeviceToken = z.infer<typeof deviceTokenSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type SavedCard = z.infer<typeof savedCardSchema>;
export type BriefingGeneration = z.infer<typeof briefingGenerationSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type ContentGeneration = z.infer<typeof contentGenerationSchema>;
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

export const validateRequest = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      throw new Error(`Validation failed: ${JSON.stringify(validationErrors)}`);
    }
    throw error;
  }
};

export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

export const sanitizeInput = (input: string): string => {
  return input.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPassword = (password: string): boolean => {
  return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
};