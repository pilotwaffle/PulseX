export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone_number?: string;
  avatar_url?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  preferred_topics: string[];
  briefing_time: string;
  timezone: string;
  language: string;
  notification_preferences: {
    push_enabled: boolean;
    email_enabled: boolean;
    categories: {
      news: boolean;
      crypto: boolean;
      stocks: boolean;
      tech: boolean;
    };
  };
  created_at: Date;
  updated_at: Date;
}

export interface DeviceToken {
  id: string;
  user_id: string;
  token: string;
  device_type: 'ios' | 'android';
  device_info: Record<string, any>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DailyBriefing {
  id: string;
  user_id: string;
  date: string;
  title: string;
  content: string;
  summary: string;
  topics: string[];
  sources: SourceData[];
  metadata: {
    generated_at: Date;
    model_version: string;
    processing_time_ms: number;
    relevance_score: number;
  };
  is_read: boolean;
  read_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface SourceData {
  id: string;
  type: 'news' | 'crypto' | 'stocks' | 'tech';
  title: string;
  summary: string;
  url: string;
  source: string;
  published_at: Date;
  metadata: Record<string, any>;
}

export interface Feedback {
  id: string;
  user_id: string;
  briefing_id: string;
  card_id: string;
  type: 'like' | 'dislike';
  topic: string;
  reason?: string;
  created_at: Date;
}

export interface SavedCard {
  id: string;
  user_id: string;
  briefing_id: string;
  card_id: string;
  content: string;
  title: string;
  summary: string;
  tags: string[];
  saved_at: Date;
  created_at: Date;
}

export interface AnalyticsEvent {
  id: string;
  user_id: string;
  event_type: string;
  event_data: Record<string, any>;
  session_id?: string;
  timestamp: Date;
}

export interface JWTPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  requestId: string;
}

export interface BriefingGenerationRequest {
  user_id: string;
  topics: string[];
  date: string;
  preferences: UserPreferences;
}

export interface ContentGenerationResult {
  content: string;
  summary: string;
  topics: string[];
  sources: SourceData[];
  metadata: {
    model_version: string;
    processing_time_ms: number;
    relevance_score: number;
  };
}

export interface NotificationPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority: 'high' | 'normal' | 'low';
  scheduled_at?: Date;
}

export enum EventTypes {
  USER_REGISTERED = 'user_registered',
  USER_LOGIN = 'user_login',
  BRIEFING_GENERATED = 'briefing_generated',
  BRIEFING_READ = 'briefing_read',
  FEEDBACK_SUBMITTED = 'feedback_submitted',
  CARD_SAVED = 'card_saved',
  NOTIFICATION_SENT = 'notification_sent',
  CONTENT_SHARED = 'content_shared',
  USER_PREFERENCES_UPDATED = 'user_preferences_updated'
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface CacheConfig {
  ttl: number;
  key: string;
  tags?: string[];
}

export interface ExternalAPIResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  cached: boolean;
}

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: Date;
  category: string;
  relevanceScore: number;
}

export interface CryptoData {
  id: string;
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  priceChangePercentage24h: number;
  marketCap: number;
  volume24h: number;
  lastUpdated: Date;
}

export interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  lastUpdated: Date;
}