export interface User {
  id: string;
  email: string;
  username: string;
  preferences: UserPreferences;
  notificationSettings: NotificationSettings;
  subscriptionTier: 'free' | 'premium';
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
}

export interface UserPreferences {
  interests: InterestWeights;
  contentTypes: ContentType[];
  readingTime: ReadingTime;
  riskTolerance: RiskTolerance;
  timezone: string;
  language: string;
  topics: string[];
  excludedSources: string[];
  preferredSources: string[];
}

export interface InterestWeights {
  crypto_market: number;
  ai_tech: number;
  political_narrative: number;
  daily_focus: number;
  wildcard: number;
}

export type ContentType = 'crypto_market' | 'ai_tech' | 'political_narrative' | 'daily_focus' | 'wildcard';
export type ReadingTime = 'quick' | 'balanced' | 'detailed';
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';

export interface NotificationSettings {
  enabled: boolean;
  preferredTime: string;
  timezone: string;
  frequency: 'daily' | 'twice_daily' | 'weekly';
  channels: ('push' | 'email' | 'sms')[];
  breakingNewsAlerts: boolean;
}

export interface DailyBriefing {
  id: string;
  userId: string;
  title: string;
  summary: string;
  cards: BriefingCard[];
  generatedAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  engagementScore?: number;
  qualityScore: number;
  metadata: BriefingMetadata;
}

export interface BriefingCard {
  id: string;
  type: ContentType;
  title: string;
  content: string;
  summary: string;
  readingTime: number; // in seconds
  source: ContentSource;
  metadata: CardMetadata;
  qualityScore: number;
  relevanceScore: number;
  createdAt: Date;
  tags: string[];
  imageUrl?: string;
  externalUrl?: string;
  disclaimer?: string;
}

export interface CardMetadata {
  sentiment?: 'positive' | 'negative' | 'neutral';
  complexity: number; // 0-1 scale
  topics: string[];
  entities: string[];
  keywords: string[];
  languages: string[];
  factualAccuracy?: number;
  biasScore?: number;
  financialRiskLevel?: 'low' | 'medium' | 'high';
  politicalBias?: 'left' | 'center' | 'right';
}

export interface ContentSource {
  id: string;
  name: string;
  url: string;
  type: SourceType;
  reliability: number; // 0-1 scale
  biasScore?: number; // -1 to 1 scale
  lastCrawled: Date;
  isActive: boolean;
  priority: number;
  metadata: SourceMetadata;
}

export type SourceType = 'news' | 'crypto' | 'ai_tech' | 'political' | 'research' | 'social';

export interface SourceMetadata {
  country?: string;
  language?: string;
  category?: string;
  updateFrequency?: string;
  requiresAuth?: boolean;
  apiEndpoint?: string;
  rateLimit?: number;
}

export interface UserFeedback {
  id: string;
  userId: string;
  cardId: string;
  type: FeedbackType;
  rating?: number; // 1-5 scale
  reason?: string;
  timestamp: Date;
  metadata: FeedbackMetadata;
}

export type FeedbackType = 'thumbs_up' | 'thumbs_down' | 'share' | 'save' | 'hide' | 'report';
export type FeedbackMetadata = {
  duration?: number; // time spent reading
  completion?: boolean; // whether user finished reading
  context?: string; // additional context
};

export interface RawContent {
  id: string;
  sourceId: string;
  title: string;
  content: string;
  summary?: string;
  author?: string;
  publishedAt: Date;
  crawledAt: Date;
  metadata: RawContentMetadata;
  processedAt?: Date;
  qualityScore?: number;
}

export interface RawContentMetadata {
  url?: string;
  imageUrl?: string;
  tags: string[];
  category: string;
  language: string;
  wordCount: number;
  readingTime: number;
  sentiment?: 'positive' | 'negative' | 'neutral';
  keywords: string[];
  entities: string[];
}

export interface PersonalizationProfile {
  id: string;
  userId: string;
  topicWeights: InterestWeights;
  readingPatterns: ReadingPattern[];
  engagementHistory: EngagementHistory;
  lastUpdated: Date;
  modelVersion: string;
}

export interface ReadingPattern {
  timeOfDay: string;
  dayOfWeek: string;
  preferredContentTypes: ContentType[];
  averageReadingTime: number;
  completionRate: number;
}

export interface EngagementHistory {
  totalBriefings: number;
  averageCardsPerBriefing: number;
  averageReadingTime: number;
  completionRate: number;
  feedbackScore: number;
  preferredSources: string[];
  avoidedTopics: string[];
}

export interface BriefingMetadata {
  generationTime: number; // in milliseconds
  sourcesUsed: number;
  qualityMetrics: QualityMetrics;
  personalizationScore: number;
  diversityScore: number;
  freshnessScore: number;
}

export interface QualityMetrics {
  factualAccuracy: number;
  sourceReliability: number;
  contentFreshness: number;
  readTimeAccuracy: number;
  sentimentBalance: number;
  politicalNeutrality: number;
}

export interface SystemMetrics {
  timestamp: Date;
  briefingsGenerated: number;
  averageGenerationTime: number;
  successRate: number;
  errorRate: number;
  userEngagement: number;
  contentQuality: number;
  systemLoad: SystemLoad;
}

export interface SystemLoad {
  cpu: number;
  memory: number;
  database: number;
  cache: number;
  activeJobs: number;
}

export interface JobConfig {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  priority: number;
  concurrency: number;
  attempts: number;
  backoff: {
    type: string;
    delay: number;
  };
  data: Record<string, any>;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: APIError;
  metadata?: ResponseMetadata;
}

export interface APIError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
}

export interface ResponseMetadata {
  timestamp: Date;
  requestId: string;
  version: string;
  processingTime: number;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: ServiceHealth[];
  uptime: number;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastCheck: Date;
  error?: string;
}

export interface ContentFilter {
  profanity: boolean;
  spam: boolean;
  misinformation: boolean;
  bias: boolean;
  quality: boolean;
  relevance: boolean;
}

export interface ContentGenerationRequest {
  userId: string;
  preferences: UserPreferences;
  context: GenerationContext;
  constraints: GenerationConstraints;
}

export interface GenerationContext {
  timeOfDay: string;
  dayOfWeek: string;
  recentEvents: string[];
  userHistory: EngagementHistory;
  trendingTopics: string[];
}

export interface GenerationConstraints {
  maxCards: number;
  readingTimeTarget: number;
  qualityThreshold: number;
  diversity: boolean;
  politicalBalance: boolean;
  financialDisclaimer: boolean;
}

export interface LLMRequest {
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  metadata?: Record<string, any>;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  finishReason: string;
  metadata?: Record<string, any>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CacheOptions {
  ttl: number;
  key: string;
  tags?: string[];
  compress?: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}