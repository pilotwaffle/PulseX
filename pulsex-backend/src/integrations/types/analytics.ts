import { BaseApiResponse, IntegrationConfig } from './common';

// Analytics Provider Types
export type AnalyticsProvider = 'posthog' | 'amplitude' | 'mixpanel' | 'segment';

export interface AnalyticsConfig extends IntegrationConfig {
  provider: AnalyticsProvider;
  apiKey: string;
  projectId?: string;
  dataPlaneUrl?: string;
  batchSize?: number;
  flushInterval?: number;
  enableGeoIp?: boolean;
  enableUserAgent?: boolean;
  debugMode?: boolean;
}

// Event Types
export interface AnalyticsEvent {
  event: string;
  distinctId?: string;
  properties?: Record<string, any>;
  timestamp?: number;
  groups?: Record<string, string>;
  $set?: Record<string, any>;
  $set_once?: Record<string, any>;
  $unset?: string[];
  $add?: Record<string, number>;
  $append?: Record<string, any>;
  $union?: Record<string, any[]>;
  $remove?: Record<string, any>;
}

export interface UserProperties {
  $set?: Record<string, any>;
  $set_once?: Record<string, any>;
  $unset?: string[];
  $add?: Record<string, number>;
  $append?: Record<string, any>;
  $union?: Record<string, any[]>;
  $remove?: Record<string, any>;
}

export interface GroupProperties {
  groupType: string;
  groupKey: string;
  properties: Record<string, any>;
}

// Specific Event Types for PulseX
export interface PulseXEventTypes {
  // App Lifecycle Events
  'app_opened': {
    sessionId: string;
    deviceInfo: DeviceInfo;
    appVersion: string;
    source?: string;
  };

  'app_backgrounded': {
    sessionDuration: number;
    cardsViewed: number;
    interactions: number;
  };

  // User Engagement Events
  'card_viewed': {
    cardId: string;
    cardType: string;
    source: string;
    position: number;
    sessionOrder: number;
    readTime?: number;
  };

  'card_completed': {
    cardId: string;
    cardType: string;
    readTime: number;
    scrollDepth: number;
    interactions: number;
  };

  'card_shared': {
    cardId: string;
    cardType: string;
    platform: string;
    medium: string;
  };

  'card_saved': {
    cardId: string;
    cardType: string;
    collectionId?: string;
  };

  'card_feedback': {
    cardId: string;
    cardType: string;
    rating: number;
    reason?: string;
    feedback?: string;
  };

  // Personalization Events
  'onboarding_completed': {
    interests: Record<string, number>;
    preferences: UserPreferences;
    completionTime: number;
  };

  'interests_updated': {
    oldInterests: Record<string, number>;
    newInterests: Record<string, number>;
    source: string;
  };

  'schedule_updated': {
    oldSchedule: string[];
    newSchedule: string[];
    reason?: string;
  };

  // Content Interaction Events
  'source_blocked': {
    sourceId: string;
    sourceName: string;
    reason: string;
  };

  'source_preferred': {
    sourceId: string;
    sourceName: string;
    reason: string;
  };

  'topic_explored': {
    topic: string;
    depth: number;
    timeSpent: number;
  };

  // Premium Events
  'premium_viewed': {
    source: string;
    planViewed: string;
  };

  'upgrade_started': {
    source: string;
    plan: string;
  };

  'upgrade_completed': {
    source: string;
    plan: string;
    revenue: number;
    currency: string;
  };

  // Push Notification Events
  'notification_received': {
    type: string;
    title: string;
    timeReceived: number;
  };

  'notification_opened': {
    type: string;
    title: string;
    timeToOpen: number;
  };

  'notification_dismissed': {
    type: string;
    title: string;
    timeToDismiss: number;
  };

  // Performance Events
  'performance_slow_load': {
    loadTime: number;
    type: 'app' | 'card' | 'image';
    url?: string;
  };

  'api_error': {
    endpoint: string;
    errorType: string;
    statusCode?: number;
  };
}

export interface DeviceInfo {
  platform: string;
  os: string;
  osVersion: string;
  deviceModel: string;
  appVersion: string;
  buildNumber: string;
  carrier?: string;
  screenWidth: number;
  screenHeight: number;
  timezone: string;
  language: string;
}

export interface UserPreferences {
  interests: Record<string, number>;
  notificationSettings: {
    enabled: boolean;
    times: string[];
    types: string[];
  };
  readingPreferences: {
    depthLevel: 'surface' | 'balanced' | 'detailed';
    preferredTimes: string[];
  };
  contentFilters: {
    blockedSources: string[];
    preferredSources: string[];
    biasSettings: Record<string, number>;
  };
}

// User Management Types
export interface UserProfile {
  distinctId: string;
  properties: {
    $email?: string;
    $name?: string;
    $phone?: string;
    $avatar?: string;
    $created_at?: string;
    $country?: string;
    $region?: string;
    $city?: string;
    $browser?: string;
    $browser_version?: string;
    $device?: string;
    $device_type?: string;
    $os?: string;
    $os_version?: string;
    $referrer?: string;
    $referring_domain?: string;
    $initial_referrer?: string;
    $initial_referring_domain?: string;
    $utm_source?: string;
    $utm_medium?: string;
    $utm_campaign?: string;
    $utm_content?: string;
    $utm_term?: string;
  };
  customProperties: {
    userType: 'free' | 'premium';
    registrationDate?: string;
    lastActiveDate?: string;
    totalSessions: number;
    totalCardsViewed: number;
    totalSessionTime: number;
    averageSessionTime: number;
    favoriteCategories: string[];
    preferredReadingTime: string;
    onboardingCompleted: boolean;
    notificationsEnabled: boolean;
    deviceCount: number;
    hasSubscribed: boolean;
    subscriptionStartDate?: string;
    subscriptionPlan?: string;
  };
}

// Funnel Analysis Types
export interface FunnelStep {
  step: number;
  name: string;
  event: string;
  customEvent?: string;
  properties?: Record<string, any>;
  timeToComplete?: number;
}

export interface FunnelAnalysis {
  id: string;
  name: string;
  description: string;
  steps: FunnelStep[];
  window: number; // in days
  dateRange: {
    from: string;
    to: string;
  };
  results: {
    step: number;
    usersEntered: number;
    usersCompleted: number;
    conversionRate: number;
    dropoffRate: number;
    timeToComplete: number;
    avgTimeBetweenSteps: number;
  }[];
  overallConversionRate: number;
  totalUsers: number;
  insights: string[];
}

// Cohort Analysis Types
export interface CohortDefinition {
  name: string;
  event: string;
  dateProperty: string;
  dateRange?: {
    from: string;
    to: string;
  };
  properties?: Record<string, any>;
}

export interface CohortMetrics {
  cohortSize: number;
  retentionByDay: number[];
  churnByDay: number[];
  avgLifetime: number;
  totalRevenue?: number;
}

export interface RetentionAnalysis {
  cohortDefinition: CohortDefinition;
  metrics: {
    date: string;
    cohortSize: number;
    retentionRates: Record<string, number>;
  }[];
  insights: {
    bestPerformingCohort: string;
    worstPerformingCohort: string;
    averageRetention: number;
    trends: string[];
  };
}

// A/B Testing Types
export interface Experiment {
  id: string;
  name: string;
  description: string;
  key: string;
  featureFlagKey?: string;
  variants: {
    key: string;
    name: string;
    rolloutPercentage: number;
    properties?: Record<string, any>;
  }[];
  startDate: string;
  endDate?: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  targetConditions?: {
    properties: Record<string, any>;
    groups: Record<string, string>;
  };
  metrics: {
    primary: string;
    secondary?: string[];
    statisticalSignificance: number;
    minimumSampleSize: number;
  };
  results?: {
    variant: string;
    users: number;
    conversions: number;
    conversionRate: number;
    confidence: number;
    lift?: number;
    pValue?: number;
  }[];
}

// Custom Event Types
export interface CustomEvent {
  event: string;
  properties: {
    [key: string]: string | number | boolean | Date | object;
  };
  timestamp?: number;
}

// Dashboard Types
export interface Dashboard {
  id: string;
  name: string;
  description: string;
  widgets: Widget[];
  filters: {
    dateRange?: {
      from: string;
      to: string;
    };
    properties?: Record<string, any>;
  };
  sharing: {
    public: boolean;
    allowedEmails?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface Widget {
  id: string;
  type: 'line_chart' | 'bar_chart' | 'pie_chart' | 'table' | 'number' | 'funnel';
  title: string;
  query: string;
  visualization: {
    xAxis?: string;
    yAxis?: string;
    groupBy?: string;
    aggregation?: 'count' | 'sum' | 'average' | 'unique' | 'median';
    timeRange?: string;
  };
  size: {
    width: number;
    height: number;
  };
  position: {
    x: number;
    y: number;
  };
}

// Real-time Types
export interface RealtimeEvent {
  distinctId: string;
  event: string;
  properties: Record<string, any>;
  timestamp: number;
  ip?: string;
  geoLocation?: {
    country: string;
    region: string;
    city: string;
  };
  userAgent?: string;
}

// Export Types
export interface ExportConfig {
  format: 'csv' | 'json' | 'xlsx';
  dateRange: {
    from: string;
    to: string;
  };
  events?: string[];
  properties?: string[];
  userProperties?: string[];
  includeTimestamps?: boolean;
  includeUserProperties?: boolean;
  maxRows?: number;
}

export interface ExportResult {
  id: string;
  url: string;
  format: string;
  size: number;
  rows: number;
  createdAt: string;
  expiresAt: string;
}

// Error Handling Types
export class AnalyticsProviderError extends Error {
  constructor(
    message: string,
    public provider: AnalyticsProvider,
    public code: string,
    public retryable: boolean = false,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'AnalyticsProviderError';
  }
}

export class AnalyticsQuotaExceededError extends AnalyticsProviderError {
  constructor(provider: AnalyticsProvider, public resetTime?: string) {
    super(
      `Quota exceeded for ${provider}`,
      provider,
      'QUOTA_EXCEEDED',
      false,
      429
    );
    this.name = 'AnalyticsQuotaExceededError';
  }
}

export class AnalyticsEventInvalidError extends AnalyticsProviderError {
  constructor(provider: AnalyticsProvider, public event: string, public reason: string) {
    super(
      `Invalid event '${event}' for ${provider}: ${reason}`,
      provider,
      'EVENT_INVALID',
      false,
      400
    );
    this.name = 'AnalyticsEventInvalidError';
  }
}