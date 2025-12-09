import axios, { AxiosInstance } from 'axios';
import { logger } from '../../config/logger';
import { redisClient } from '../../config/redis';
import { ContentGenerationResult, ExternalAPIResponse } from '../../types';
import { handleExternalAPIError } from '../../middleware/errorHandler';

export interface LLMProvider {
  name: string;
  generateContent(prompt: string, options?: ContentGenerationOptions): Promise<ContentGenerationResult>;
}

export interface ContentGenerationOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export class OpenAIService implements LLMProvider {
  public name = 'OpenAI';
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string = 'https://api.openai.com/v1';

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';

    if (!this.apiKey) {
      logger.warn('OpenAI API key not configured');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // 60 seconds timeout for LLM requests
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PulseX-Daily-Briefing/1.0',
      },
    });
  }

  async generateContent(prompt: string, options: ContentGenerationOptions = {}): Promise<ContentGenerationResult> {
    const startTime = Date.now();
    const {
      maxTokens = 1000,
      temperature = 0.7,
      model = 'gpt-3.5-turbo',
      topP = 1,
      frequencyPenalty = 0,
      presencePenalty = 0,
    } = options;

    const cacheKey = `llm:openai:${Buffer.from(prompt).toString('base64').substring(0, 32)}:${JSON.stringify(options)}`;

    try {
      // Check cache first (LLM responses can be cached for identical prompts)
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached LLM response', { provider: this.name, model });
        return JSON.parse(cached);
      }

      const response = await this.client.post('/chat/completions', {
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a professional content curator for a daily briefing app. Create concise, informative, and engaging content summaries.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        frequency_penalty: frequencyPenalty,
        presence_penalty: presencePenalty,
      });

      const content = response.data.choices[0]?.message?.content || '';
      const processingTimeMs = Date.now() - startTime;

      const result: ContentGenerationResult = {
        content,
        summary: this.extractSummary(content),
        topics: this.extractTopics(content),
        sources: [], // Will be populated by the calling service
        metadata: {
          model_version: model,
          processing_time_ms: processingTimeMs,
          relevance_score: this.calculateRelevanceScore(content, prompt),
        },
      };

      // Cache the result for 1 hour
      await redisClient.set(cacheKey, JSON.stringify(result), 3600);

      logger.info('Content generated successfully', {
        provider: this.name,
        model,
        tokens: response.data.usage?.total_tokens,
        processingTimeMs,
      });

      return result;
    } catch (error) {
      logger.error('Failed to generate content with OpenAI', {
        error: error instanceof Error ? error.message : 'Unknown error',
        model,
        processingTimeMs: Date.now() - startTime,
      });
      throw handleExternalAPIError(error, 'OpenAI');
    }
  }

  private extractSummary(content: string): string {
    // Extract first few sentences as summary
    const sentences = content.split(/[.!?]+/);
    return sentences.slice(0, 2).join('.').trim() + (sentences.length > 2 ? '.' : '');
  }

  private extractTopics(content: string): string[] {
    const topics = new Set<string>();

    // Common tech topics
    const techKeywords = [
      'AI', 'artificial intelligence', 'machine learning', 'ML', 'deep learning',
      'cryptocurrency', 'bitcoin', 'blockchain', 'DeFi', 'NFT', 'metaverse',
      'cloud computing', 'cybersecurity', 'data privacy', '5G', 'IoT',
      'startup', 'venture capital', 'funding', 'IPO', 'acquisition',
      'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Tesla', 'Twitter'
    ];

    // Extract topics based on keywords
    techKeywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        topics.add(keyword);
      }
    });

    return Array.from(topics);
  }

  private calculateRelevanceScore(content: string, prompt: string): number {
    // Simple relevance scoring based on content length and keyword overlap
    const contentWords = content.toLowerCase().split(/\s+/);
    const promptWords = prompt.toLowerCase().split(/\s+/);

    let overlap = 0;
    promptWords.forEach(pWord => {
      if (contentWords.some(cWord => cWord.includes(pWord) || pWord.includes(cWord))) {
        overlap++;
      }
    });

    const overlapRatio = overlap / promptWords.length;
    const lengthScore = Math.min(content.length / 500, 1); // Normalize to 0-1 based on 500 chars

    return Math.min((overlapRatio * 0.7) + (lengthScore * 0.3), 1);
  }
}

export class AnthropicService implements LLMProvider {
  public name = 'Anthropic';
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string = 'https://api.anthropic.com/v1';

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';

    if (!this.apiKey) {
      logger.warn('Anthropic API key not configured');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'User-Agent': 'PulseX-Daily-Briefing/1.0',
      },
    });
  }

  async generateContent(prompt: string, options: ContentGenerationOptions = {}): Promise<ContentGenerationResult> {
    const startTime = Date.now();
    const {
      maxTokens = 1000,
      temperature = 0.7,
      model = 'claude-3-sonnet-20240229',
    } = options;

    const cacheKey = `llm:anthropic:${Buffer.from(prompt).toString('base64').substring(0, 32)}:${JSON.stringify(options)}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached LLM response', { provider: this.name, model });
        return JSON.parse(cached);
      }

      const response = await this.client.post('/messages', {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          {
            role: 'user',
            content: `You are a professional content curator for a daily briefing app. Create concise, informative, and engaging content summaries.

${prompt}`,
          },
        ],
      });

      const content = response.data.content[0]?.text || '';
      const processingTimeMs = Date.now() - startTime;

      const result: ContentGenerationResult = {
        content,
        summary: this.extractSummary(content),
        topics: this.extractTopics(content),
        sources: [],
        metadata: {
          model_version: model,
          processing_time_ms: processingTimeMs,
          relevance_score: this.calculateRelevanceScore(content, prompt),
        },
      };

      // Cache the result for 1 hour
      await redisClient.set(cacheKey, JSON.stringify(result), 3600);

      logger.info('Content generated successfully', {
        provider: this.name,
        model,
        tokens: response.data.usage?.input_tokens + response.data.usage?.output_tokens,
        processingTimeMs,
      });

      return result;
    } catch (error) {
      logger.error('Failed to generate content with Anthropic', {
        error: error instanceof Error ? error.message : 'Unknown error',
        model,
        processingTimeMs: Date.now() - startTime,
      });
      throw handleExternalAPIError(error, 'Anthropic');
    }
  }

  private extractSummary(content: string): string {
    const sentences = content.split(/[.!?]+/);
    return sentences.slice(0, 2).join('.').trim() + (sentences.length > 2 ? '.' : '');
  }

  private extractTopics(content: string): string[] {
    const topics = new Set<string>();

    const techKeywords = [
      'AI', 'artificial intelligence', 'machine learning', 'ML', 'deep learning',
      'cryptocurrency', 'bitcoin', 'blockchain', 'DeFi', 'NFT', 'metaverse',
      'cloud computing', 'cybersecurity', 'data privacy', '5G', 'IoT',
      'startup', 'venture capital', 'funding', 'IPO', 'acquisition',
      'Apple', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Tesla', 'Twitter'
    ];

    techKeywords.forEach(keyword => {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        topics.add(keyword);
      }
    });

    return Array.from(topics);
  }

  private calculateRelevanceScore(content: string, prompt: string): number {
    const contentWords = content.toLowerCase().split(/\s+/);
    const promptWords = prompt.toLowerCase().split(/\s+/);

    let overlap = 0;
    promptWords.forEach(pWord => {
      if (contentWords.some(cWord => cWord.includes(pWord) || pWord.includes(cWord))) {
        overlap++;
      }
    });

    const overlapRatio = overlap / promptWords.length;
    const lengthScore = Math.min(content.length / 500, 1);

    return Math.min((overlapRatio * 0.7) + (lengthScore * 0.3), 1);
  }
}

export class LLMService {
  private providers: LLMProvider[] = [];
  private primaryProvider: LLMProvider;
  private fallbackProviders: LLMProvider[] = [];

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const openaiService = new OpenAIService();
    const anthropicService = new AnthropicService();

    // Prioritize providers based on API key availability
    if (process.env.OPENAI_API_KEY) {
      this.providers.push(openaiService);
      if (process.env.ANTHROPIC_API_KEY) {
        this.fallbackProviders.push(anthropicService);
      }
    } else if (process.env.ANTHROPIC_API_KEY) {
      this.providers.push(anthropicService);
    }

    if (this.providers.length === 0) {
      logger.error('No LLM providers configured');
      throw new Error('No LLM providers configured');
    }

    this.primaryProvider = this.providers[0];
    this.fallbackProviders = this.providers.slice(1);

    logger.info('LLM providers initialized', {
      primary: this.primaryProvider.name,
      fallbacks: this.fallbackProviders.map(p => p.name),
    });
  }

  async generateContent(prompt: string, options: ContentGenerationOptions = {}): Promise<ContentGenerationResult> {
    const startTime = Date.now();

    try {
      // Try primary provider first
      return await this.primaryProvider.generateContent(prompt, options);
    } catch (error) {
      logger.warn('Primary LLM provider failed, trying fallbacks', {
        primary: this.primaryProvider.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Try fallback providers
      for (const provider of this.fallbackProviders) {
        try {
          logger.info('Trying fallback provider', { provider: provider.name });
          return await provider.generateContent(prompt, options);
        } catch (fallbackError) {
          logger.warn('Fallback provider failed', {
            provider: provider.name,
            error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
          });
          continue;
        }
      }

      // All providers failed
      logger.error('All LLM providers failed', {
        processingTimeMs: Date.now() - startTime,
      });
      throw new Error('All LLM providers failed to generate content');
    }
  }

  async generateDailyBriefing(topics: string[], userPreferences: any): Promise<ContentGenerationResult> {
    const prompt = this.buildBriefingPrompt(topics, userPreferences);

    const options: ContentGenerationOptions = {
      maxTokens: 1500,
      temperature: 0.6,
      model: 'gpt-4', // Use best model for daily briefings
    };

    return await this.generateContent(prompt, options);
  }

  private buildBriefingPrompt(topics: string[], preferences: any): string {
    const topicList = topics.join(', ');
    const categories = preferences.notificationPreferences?.categories || {};

    return `Create a comprehensive daily briefing covering the following topics: ${topicList}

User preferences:
- Interested in: ${Object.entries(categories).filter(([_, enabled]) => enabled).map(([cat]) => cat).join(', ')}
- Language: ${preferences.language || 'English'}
- Timezone: ${preferences.timezone || 'UTC'}

Please structure the briefing with:
1. A compelling headline/title
2. A concise summary (2-3 sentences)
3. 3-5 key stories/developments with brief explanations
4. Important numbers or statistics
5. Forward-looking insights

Focus on:
- Actionable information
- Clear explanations of complex topics
- Balanced perspective
- Recent developments (last 24-48 hours)

Make it engaging but professional, suitable for busy professionals who want to stay informed quickly.`;
  }

  getAvailableProviders(): string[] {
    return this.providers.map(p => p.name);
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    for (const provider of this.providers) {
      try {
        // Test with a simple prompt
        await provider.generateContent('Hello', { maxTokens: 10 });
        health[provider.name] = true;
      } catch (error) {
        health[provider.name] = false;
      }
    }

    return health;
  }
}

export const llmService = new LLMService();