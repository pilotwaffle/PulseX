import { BaseApiResponse, IntegrationConfig, CostTracking } from './common';

// LLM Provider Types
export type LLMProvider = 'openai' | 'anthropic';

export type LLMModel =
  // OpenAI models
  | 'gpt-4-turbo-preview'
  | 'gpt-4-vision-preview'
  | 'gpt-3.5-turbo-16k'
  // Anthropic models
  | 'claude-3-opus-20240229'
  | 'claude-3-sonnet-20240229'
  | 'claude-3-haiku-20240307';

export interface LLMConfig extends IntegrationConfig {
  provider: LLMProvider;
  model: LLMModel;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
  fallbackProvider?: LLMProvider;
  fallbackModel?: LLMModel;
}

// Message Types
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
  name?: string;
}

export interface ContentBlock {
  type: 'text' | 'image' | 'document';
  text?: string;
  source?: {
    type: 'base64' | 'url';
    media_type: string;
    data: string;
  };
}

// Request/Response Types
export interface LLMRequest {
  messages: LLMMessage[];
  model: LLMModel;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  stop?: string[];
  metadata?: Record<string, any>;
}

export interface LLMResponse extends BaseApiResponse {
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finishReason: 'stop' | 'length' | 'function_call' | 'content_filter';
  }[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  costTracking: CostTracking;
}

// Streaming Types
export interface LLMStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finishReason?: 'stop' | 'length' | 'function_call' | 'content_filter';
  }[];
}

// Template Types
export interface LLMPromptTemplate {
  id: string;
  name: string;
  description: string;
  category: 'summarization' | 'classification' | 'generation' | 'analysis' | 'translation';
  template: string;
  variables: TemplateVariable[];
  systemPrompt?: string;
  examples?: PromptExample[];
  config: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  costEstimate: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  defaultValue?: any;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enum?: string[];
  };
}

export interface PromptExample {
  input: Record<string, any>;
  output: string;
  description?: string;
}

// Content Generation Types
export interface ContentGenerationRequest {
  type: 'news_summary' | 'crypto_analysis' | 'political_briefing' | 'personalized_content';
  input: {
    articles?: any[];
    marketData?: any;
    userPreferences?: any;
    context?: any;
  };
  constraints: {
    maxLength?: number;
    tone?: 'neutral' | 'optimistic' | 'cautious' | 'analytical';
    readingLevel?: 'beginner' | 'intermediate' | 'advanced';
    includeDisclaimer?: boolean;
    politicalBias?: 'left' | 'center' | 'right' | 'neutral';
  };
  outputFormat: {
    includeHeadline?: boolean;
    includeSummary?: boolean;
    includeKeyPoints?: boolean;
    includeAnalysis?: boolean;
    includeDisclaimer?: boolean;
  };
}

export interface ContentGenerationResult {
  content: string;
  headline?: string;
  summary?: string;
  keyPoints?: string[];
  analysis?: string;
  disclaimer?: string;
  metadata: {
    model: string;
    tokensUsed: number;
    cost: number;
    generationTime: number;
    confidence: number;
    sources: string[];
  };
  quality: {
    relevanceScore: number;
    coherenceScore: number;
    biasScore: number;
    factualAccuracy: number;
    overallQuality: number;
  };
}

// Fine-tuning Types
export interface FineTuningJob {
  id: string;
  provider: LLMProvider;
  baseModel: LLMModel;
  status: 'pending' | 'running' | 'completed' | 'failed';
  trainingFile: string;
  validationFile?: string;
  hyperparameters: {
    nEpochs?: number;
    batchSize?: number;
    learningRateMultiplier?: number;
  };
  metrics?: {
    trainingLoss: number;
    validationLoss: number;
    tokenAccuracy: number;
  };
  createdAt: string;
  finishedAt?: string;
  estimatedCost?: number;
}

// Monitoring Types
export interface LLMPerformanceMetrics {
  provider: string;
  model: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalTokens: number;
  averageTokensPerRequest: number;
  totalCost: number;
  averageCostPerRequest: number;
  errorRate: number;
  lastReset: string;
}

// Load Balancing Types
export interface LoadBalancingConfig {
  strategy: 'round_robin' | 'weighted' | 'cost_optimized' | 'performance_based';
  providers: ProviderConfig[];
  healthCheck: {
    enabled: boolean;
    interval: number;
    timeout: number;
    unhealthyThreshold: number;
    healthyThreshold: number;
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    timeout: number;
    halfOpenMaxCalls: number;
  };
}

export interface ProviderConfig {
  provider: LLMProvider;
  model: LLMModel;
  weight: number;
  maxRequestsPerMinute?: number;
  maxCostPerHour?: number;
  enabled: boolean;
}

// Rate Limiting Types
export interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;
}

// Bias Detection Types
export interface BiasAnalysis {
  politicalBias: {
    left: number;
    center: number;
    right: number;
    neutral: number;
    overallBias: 'left' | 'center' | 'right' | 'neutral';
    confidence: number;
  };
  sentimentAnalysis: {
    positive: number;
    negative: number;
    neutral: number;
    overallSentiment: 'positive' | 'negative' | 'neutral';
  };
  topics: {
    name: string;
    confidence: number;
  }[];
  flaggedContent: {
    type: 'hate_speech' | 'violence' | 'self_harm' | 'sexual_content' | 'misinformation';
    confidence: number;
    description: string;
  }[];
  recommendations: string[];
}