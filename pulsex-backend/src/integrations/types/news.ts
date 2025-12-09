import { BaseApiResponse, IntegrationConfig, ContentItem, QualityMetrics } from './common';

// News Provider Types
export type NewsProvider = 'newsapi' | 'guardian' | 'reuters' | 'associated_press';

export interface NewsConfig extends IntegrationConfig {
  provider: NewsProvider;
  categories?: NewsCategory[];
  countries?: string[];
  languages?: string[];
  sources?: string[];
  sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
  excludeBias?: ('left' | 'right' | 'center')[];
  contentQuality?: {
    minLength?: number;
    maxLength?: number;
    credibilityThreshold?: number;
    recencyHours?: number;
  };
}

export type NewsCategory =
  | 'general'
  | 'business'
  | 'entertainment'
  | 'health'
  | 'science'
  | 'sports'
  | 'technology'
  | 'politics'
  | 'world'
  | 'crypto'
  | 'ai'
  | 'markets';

export interface NewsArticle extends ContentItem {
  source: NewsSource;
  author?: string;
  description?: string;
  url: string;
  urlToImage?: string;
  publishedAt: string;
  content: string;
  bias: BiasAnalysis;
  credibility: CredibilityScore;
  relevanceScore: number;
}

export interface NewsSource {
  id: string;
  name: string;
  description?: string;
  url: string;
  category?: NewsCategory;
  language?: string;
  country?: string;
  biasRating: BiasRating;
  credibilityScore: number;
  reliabilityScore: number;
}

export interface BiasRating {
  overallBias: 'left' | 'right' | 'center' | 'neutral';
  biasScore: number; // -100 (far left) to +100 (far right), 0 is neutral
  factualReporting: number; // 0-100 scale
  politicalCoverage: 'heavy' | 'moderate' | 'minimal' | 'none';
  editorialSlant: string;
  confidence: number;
}

export interface CredibilityScore {
  overallScore: number; // 0-100
  factualAccuracy: number;
  sourceReputation: number;
  editorialStandards: number;
  transparency: number;
  correctionsPolicy: number;
  lastUpdated: string;
  factors: {
    factChecking: number;
    sourcesCited: number;
    bylinePresent: number;
    publicationDate: number;
    professionalism: number;
  };
}

export interface BiasAnalysis {
  politicalBias: BiasRating;
  sentimentAnalysis: {
    positive: number;
    negative: number;
    neutral: number;
    overall: 'positive' | 'negative' | 'neutral';
    confidence: number;
  };
  topicBias: {
    topic: string;
    biasIndicator: number;
    mentions: number;
  }[];
  linguisticAnalysis: {
    emotionalLanguage: number;
    loadedWords: string[];
    propaganda: string[];
    exaggeration: boolean;
    fearAppeal: boolean;
  };
}

// Request/Response Types
export interface NewsSearchRequest {
  query?: string;
  category?: NewsCategory[];
  sources?: string[];
  countries?: string[];
  languages?: string[];
  from?: string;
  to?: string;
  sortBy?: 'relevancy' | 'popularity' | 'publishedAt';
  pageSize?: number;
  page?: number;
  excludeBias?: BiasRating['overallBias'][];
  minCredibility?: number;
  includeBreaking?: boolean;
}

export interface NewsSearchResponse extends BaseApiResponse {
  totalResults: number;
  articles: NewsArticle[];
  filters: {
    categories: NewsCategory[];
    sources: NewsSource[];
    biasDistribution: Record<string, number>;
  };
  metadata: {
    searchTime: number;
    sources: number;
    averageCredibility: number;
    biasBalance: Record<string, number>;
  };
}

// Content Filtering Types
export interface ContentFilter {
  enabled: boolean;
  prohibitedWords: string[];
  politicalBiasThreshold: number;
  sentimentAnalysis: boolean;
  factChecking: boolean;
  spamDetection: boolean;
  clickbaitDetection: boolean;
  adultContent: boolean;
  violenceContent: boolean;
}

export interface FilterResult {
  passed: boolean;
  blocked: boolean;
  reasons: FilterReason[];
  score: number;
  recommendations: string[];
}

export interface FilterReason {
  type: 'bias' | 'sentiment' | 'fact_check' | 'spam' | 'clickbait' | 'adult' | 'violence';
  description: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
}

// News Aggregation Types
export interface NewsAggregatorConfig {
  providers: NewsConfig[];
  deduplication: {
    enabled: boolean;
    similarityThreshold: number;
    timeWindow: number; // hours
  };
  ranking: {
    credibility: number;
    relevance: number;
    recency: number;
    diversity: number;
  };
  filtering: ContentFilter;
  caching: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
}

export interface AggregatedNews {
  articles: NewsArticle[];
  duplicates: {
    original: string;
    duplicates: string[];
    similarityScore: number;
  }[];
  trends: {
    topic: string;
    articleCount: number;
    sentiment: 'positive' | 'negative' | 'neutral';
    timeframe: string;
  }[];
  summary: {
    totalArticles: number;
    averageCredibility: number;
    biasDistribution: Record<string, number>;
    topSources: string[];
    dominantTopics: string[];
  };
}

// Monitoring Types
export interface NewsProviderMetrics {
  provider: NewsProvider;
  status: 'active' | 'degraded' | 'inactive';
  lastRequest: string;
  responseTime: number;
  successRate: number;
  errorRate: number;
  articlesFetched: number;
  averageCredibility: number;
  cost: number;
  quotaUsage: {
    requests: number;
    limit: number;
    remaining: number;
    resetTime: string;
  };
}

// Real-time Updates Types
export interface NewsUpdate {
  type: 'breaking' | 'update' | 'correction' | 'retraction';
  articleId: string;
  title: string;
  summary: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  publishedAt: string;
  source: NewsSource;
  verificationStatus: 'verified' | 'unverified' | 'disputed';
}

export interface NewsSubscription {
  id: string;
  userId: string;
  criteria: NewsSearchRequest;
  frequency: 'real_time' | 'hourly' | 'daily' | 'weekly';
  notifications: {
    enabled: boolean;
    channels: ('push' | 'email' | 'sms')[];
    quietHours: {
      start: string;
      end: string;
    };
  };
  lastDelivery?: string;
  totalDelivered: number;
}

// Personalization Types
export interface NewsPersonalizationProfile {
  userId: string;
  interests: {
    topic: string;
    weight: number;
    lastUpdated: string;
  }[];
  sources: {
    sourceId: string;
    preference: 'preferred' | 'neutral' | 'blocked';
    reason?: string;
  }[];
  biasPreferences: {
    politicalBias: BiasRating['overallBias'];
    opennessToDifferentViews: number; // 0-1 scale
  };
  consumptionPatterns: {
    readingTime: number;
    articleLength: 'short' | 'medium' | 'long';
    preferredTimes: string[];
    topicsRead: Record<string, number>;
  };
  feedback: {
    articles: {
      articleId: string;
      rating: number;
      feedback: string;
      timestamp: string;
    }[];
    adjustments: {
      topic: string;
      oldWeight: number;
      newWeight: number;
      reason: string;
    }[];
  };
}

// Error Handling Types
export class NewsProviderError extends Error {
  constructor(
    message: string,
    public provider: NewsProvider,
    public code: string,
    public retryable: boolean = false,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'NewsProviderError';
  }
}

export class NewsQuotaExceededError extends NewsProviderError {
  constructor(provider: NewsProvider, public resetTime?: string) {
    super(
      `Quota exceeded for ${provider}`,
      provider,
      'QUOTA_EXCEEDED',
      false,
      429
    );
    this.name = 'NewsQuotaExceededError';
  }
}

export class NewsFilterError extends NewsProviderError {
  constructor(provider: NewsProvider, public filterReason: string) {
    super(
      `Content filtered by ${provider}: ${filterReason}`,
      provider,
      'CONTENT_FILTERED',
      false,
      200
    );
    this.name = 'NewsFilterError';
  }
}