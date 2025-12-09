import { LLMManager } from './llm/llm-manager';
import { NewsAggregator } from './news/news-aggregator';
import { CostTracker } from './monitoring/cost-tracker';
import { HealthChecker } from './monitoring/health-checker';
import { ConfigManager } from './core/config';
import { Logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface IntegrationManagerConfig {
  enableHealthChecks: boolean;
  enableCostTracking: boolean;
  healthCheckInterval: number;
  costAlertThreshold: number;
  enableCaching: boolean;
  cacheTTL: number;
}

export class IntegrationManager extends EventEmitter {
  private config: IntegrationManagerConfig;
  private llmManager: LLMManager;
  private newsAggregator: NewsAggregator;
  private costTracker: CostTracker;
  private healthChecker: HealthChecker;
  private configManager: ConfigManager;
  private logger: Logger;
  private isInitialized: boolean = false;

  constructor(config: Partial<IntegrationManagerConfig> = {}) {
    super();

    this.config = {
      enableHealthChecks: true,
      enableCostTracking: true,
      healthCheckInterval: 60000, // 1 minute
      costAlertThreshold: 100, // $100 daily budget alert
      enableCaching: true,
      cacheTTL: 300, // 5 minutes
      ...config,
    };

    this.logger = new Logger('IntegrationManager');
    this.configManager = ConfigManager.getInstance();

    this.initialize();
  }

  /**
   * Initialize all integrations
   */
  private async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Integration Manager...');

      // Validate configuration
      const validation = this.configManager.validateConfig();
      if (!validation.valid) {
        this.logger.error('Configuration validation failed', { errors: validation.errors });
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Initialize LLM Manager
      this.llmManager = new LLMManager({
        primaryProvider: 'openai',
        fallbackProviders: ['anthropic'],
        costOptimization: {
          enabled: this.config.enableCostTracking,
          maxCostPerRequest: 0.1,
          preferCheaperForSimpleTasks: true,
        },
        performanceOptimization: {
          enabled: true,
          cacheResults: this.config.enableCaching,
          useFastModelForDrafts: true,
        },
      });

      // Initialize News Aggregator
      this.newsAggregator = new NewsAggregator({
        caching: {
          enabled: this.config.enableCaching,
          ttl: this.config.cacheTTL,
          maxSize: 1000,
        },
      });

      // Initialize Cost Tracker
      if (this.config.enableCostTracking) {
        this.costTracker = new CostTracker('integration-manager');

        // Set budget alerts
        const dailyBudget = process.env.DAILY_BUDGET ? parseFloat(process.env.DAILY_BUDGET) : 100;
        this.costTracker.setBudget('openai', dailyBudget * 0.6);
        this.costTracker.setBudget('anthropic', dailyBudget * 0.4);
      }

      // Initialize Health Checker
      if (this.config.enableHealthChecks) {
        this.healthChecker = new HealthChecker();
        this.setupHealthChecks();
        this.setupHealthEventListeners();
      }

      this.isInitialized = true;
      this.logger.info('Integration Manager initialized successfully');

      // Emit initialization complete
      this.emit('initialized', {
        llmProviders: this.llmManager.getProviderHealth(),
        newsProviders: [], // Would add from news aggregator
        costTracking: this.config.enableCostTracking,
        healthChecks: this.config.enableHealthChecks,
      });

    } catch (error) {
      this.logger.error('Integration Manager initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate content for daily briefing
   */
  async generateDailyBriefing(options: {
    interests?: Record<string, number>;
    categories?: string[];
    maxArticles?: number;
    tone?: 'neutral' | 'analytical' | 'optimistic';
    includeFinancial?: boolean;
  }): Promise<{
    cards: Array<{
      type: string;
      title: string;
      content: string;
      source: string;
      metadata: any;
    }>;
    metadata: {
      totalCost: number;
      generationTime: number;
      sourcesUsed: string[];
      tokensUsed: number;
    };
  }> {
    if (!this.isInitialized) {
      throw new Error('Integration Manager not initialized');
    }

    const startTime = Date.now();
    const cards: any[] = [];
    const sourcesUsed = new Set<string>();
    let totalCost = 0;
    let totalTokens = 0;

    try {
      this.logger.info('Generating daily briefing', options);

      // Get relevant news
      const newsResponse = await this.newsAggregator.getPersonalizedNews({
        interests: options.interests || { 'technology': 0.5, 'business': 0.3, 'science': 0.2 },
        biasPreference: 'neutral',
      });

      // Generate AI summaries for top articles
      const topArticles = newsResponse.articles.slice(0, options.maxArticles || 5);

      for (const article of topArticles) {
        try {
          const contentRequest = {
            type: 'news_summary' as const,
            input: {
              articles: [article],
            },
            constraints: {
              maxLength: 300,
              tone: options.tone || 'neutral',
              readingLevel: 'intermediate',
              politicalBias: 'neutral',
              includeDisclaimer: article.category === 'crypto',
            },
            outputFormat: {
              includeHeadline: true,
              includeSummary: true,
              includeKeyPoints: true,
              includeDisclaimer: true,
            },
          };

          const result = await this.llmManager.generateContent(contentRequest);

          cards.push({
            type: article.category,
            title: result.headline || article.title,
            content: result.summary || result.content,
            source: article.source.name,
            metadata: {
              originalArticle: article.url,
              credibility: article.credibility.overallScore,
              bias: article.bias.overallBias,
              publishedAt: article.publishedAt,
              generationMetadata: result.metadata,
              quality: result.quality,
            },
          });

          sourcesUsed.add(article.source.name);
          totalCost += result.metadata.cost;
          totalTokens += result.metadata.tokensUsed;

        } catch (error) {
          this.logger.warn('Failed to generate summary for article', {
            error: error.message,
            articleId: article.id,
          });
          // Add original article as fallback
          cards.push({
            type: article.category,
            title: article.title,
            content: article.description || article.content.substring(0, 300),
            source: article.source.name,
            metadata: {
              originalArticle: article.url,
              credibility: article.credibility.overallScore,
              bias: article.bias.overallBias,
              publishedAt: article.publishedAt,
              fallbackUsed: true,
            },
          });
        }
      }

      const generationTime = Date.now() - startTime;

      this.logger.info('Daily briefing generated', {
        cardsGenerated: cards.length,
        totalCost,
        totalTokens,
        generationTime,
      });

      return {
        cards,
        metadata: {
          totalCost,
          generationTime,
          sourcesUsed: Array.from(sourcesUsed),
          tokensUsed: totalTokens,
        },
      };

    } catch (error) {
      this.logger.error('Daily briefing generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Search for news with optional AI analysis
   */
  async searchNews(query: string, options: {
    categories?: string[];
    maxResults?: number;
    includeAnalysis?: boolean;
    tone?: 'neutral' | 'analytical' | 'optimistic';
  } = {}): Promise<{
    articles: any[];
    analysis?: string;
    metadata: any;
  }> {
    if (!this.isInitialized) {
      throw new Error('Integration Manager not initialized');
    }

    try {
      const newsResponse = await this.newsAggregator.searchNews({
        query,
        category: options.categories as any[],
        pageSize: options.maxResults || 20,
        sortBy: 'publishedAt',
      });

      let analysis: string | undefined;

      if (options.includeAnalysis && newsResponse.articles.length > 0) {
        try {
          const analysisRequest = {
            type: 'news_summary' as const,
            input: {
              articles: newsResponse.articles.slice(0, 5), // Analyze top 5 articles
            },
            constraints: {
              maxLength: 500,
              tone: options.tone || 'analytical',
              readingLevel: 'advanced',
              politicalBias: 'neutral',
            },
            outputFormat: {
              includeHeadline: false,
              includeSummary: true,
              includeAnalysis: true,
              includeKeyPoints: true,
            },
          };

          const result = await this.llmManager.generateContent(analysisRequest);
          analysis = result.analysis || result.content;

        } catch (error) {
          this.logger.warn('Failed to generate news analysis', { error: error.message });
        }
      }

      return {
        articles: newsResponse.articles,
        analysis,
        metadata: {
          totalResults: newsResponse.articles.length,
          trends: newsResponse.trends,
          summary: newsResponse.summary,
          searchTime: Date.now(),
        },
      };

    } catch (error) {
      this.logger.error('News search failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get system health status
   */
  getSystemHealth(): {
    overall: any;
    llm: any;
    news: any;
    costs?: any;
    uptime: number;
  } {
    if (!this.isInitialized) {
      throw new Error('Integration Manager not initialized');
    }

    const health = {
      overall: this.healthChecker ? this.healthChecker.getOverallHealth() : null,
      llm: this.llmManager.getProviderHealth(),
      news: { status: 'active', sources: [] }, // Would get from news aggregator
      costs: this.config.enableCostTracking ? this.costTracker.getTotalCosts() : null,
      uptime: process.uptime(),
    };

    return health;
  }

  /**
   * Get cost analysis
   */
  getCostAnalysis(): {
    summary: any;
    recommendations: any;
    alerts: any;
  } | null {
    if (!this.config.enableCostTracking || !this.costTracker) {
      return null;
    }

    return {
      summary: this.costTracker.getTotalCosts(),
      recommendations: this.costTracker.getOptimizationRecommendations(),
      alerts: this.costTracker.getBudgetAlerts(),
    };
  }

  /**
   * Setup health checks for all services
   */
  private setupHealthChecks(): void {
    // Register LLM providers for health checking
    this.healthChecker.registerService(
      'llm-manager',
      this.llmManager as any, // Type hack - LLMManager implements health check interface
      {
        maxResponseTime: 10000, // 10 seconds
        maxErrorRate: 0.1, // 10%
        minUptime: 0.95, // 95%
      },
      this.config.healthCheckInterval
    );

    // Would register other services similarly
  }

  /**
   * Setup health event listeners
   */
  private setupHealthEventListeners(): void {
    if (!this.healthChecker) return;

    this.healthChecker.on('statusChange', (event) => {
      this.logger.warn('Service health status changed', {
        service: event.service,
        from: event.previousStatus,
        to: event.currentStatus,
      });

      // Emit to parent listeners
      this.emit('healthStatusChange', event);
    });

    this.healthChecker.on('healthCheck', (event) => {
      // Track health check events for monitoring
      if (event.health.status === 'unhealthy') {
        this.logger.error('Service health check failed', {
          service: event.service,
          health: event.health,
          error: event.error,
        });
      }
    });
  }

  /**
   * Shutdown all integrations gracefully
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Integration Manager...');

    if (this.healthChecker) {
      this.healthChecker.stopAll();
    }

    // Would close other connections as needed

    this.isInitialized = false;
    this.logger.info('Integration Manager shutdown complete');
    this.emit('shutdown');
  }

  /**
   * Check if manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get configuration
   */
  getConfig(): IntegrationManagerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<IntegrationManagerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Configuration updated', { config: this.config });
  }
}