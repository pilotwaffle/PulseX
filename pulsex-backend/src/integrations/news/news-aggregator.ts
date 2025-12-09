import { NewsAPIClient } from './news-api/client';
// import { GuardianClient } from './guardian/client'; // Would implement similarly
import {
  NewsArticle,
  NewsCategory,
  NewsSearchRequest,
  NewsSearchResponse,
  NewsProvider,
  ContentFilter,
  AggregatedNews,
  NewsAggregatorConfig,
} from '../types/news';
import { ConfigManager } from '../core/config';
import { Logger } from '../../utils/logger';
import { CacheManager } from '../core/cache-manager';
import { sleep } from '../../utils/helpers';

export class NewsAggregator {
  private config: NewsAggregatorConfig;
  private clients: Map<NewsProvider, NewsAPIClient>; // Simplified for now
  private cache: CacheManager;
  private logger: Logger;

  constructor(config?: Partial<NewsAggregatorConfig>) {
    this.logger = new Logger('NewsAggregator');
    this.cache = new CacheManager({ enabled: true, ttl: 300, key: 'news-aggregator' });

    const configManager = ConfigManager.getInstance();

    this.config = {
      providers: [
        {
          name: 'newsapi',
          enabled: configManager.isIntegrationEnabled('newsapi'),
          weight: 1.0,
        },
        // {
        //   name: 'guardian',
        //   enabled: configManager.isIntegrationEnabled('guardian'),
        //   weight: 0.8,
        // },
      ],
      deduplication: {
        enabled: true,
        similarityThreshold: 0.8,
        timeWindow: 24, // hours
      },
      ranking: {
        credibility: 0.4,
        relevance: 0.3,
        recency: 0.2,
        diversity: 0.1,
      },
      filtering: {
        enabled: true,
        prohibitedWords: ['fake', 'hoax', 'conspiracy'],
        politicalBiasThreshold: 0.7,
        sentimentAnalysis: true,
        factChecking: true,
        spamDetection: true,
        clickbaitDetection: true,
        adultContent: true,
        violenceContent: true,
      },
      caching: {
        enabled: true,
        ttl: 600, // 10 minutes
        maxSize: 1000,
      },
      ...config,
    } as NewsAggregatorConfig;

    this.initializeClients();
  }

  /**
   * Initialize news provider clients
   */
  private initializeClients(): void {
    this.clients = new Map();

    // Initialize NewsAPI client
    if (this.config.providers.find(p => p.name === 'newsapi' && p.enabled)) {
      this.clients.set('newsapi', new NewsAPIClient());
      this.logger.info('NewsAPI client initialized for aggregator');
    }

    // Would initialize other clients similarly
  }

  /**
   * Search for news across all providers
   */
  async searchNews(request: NewsSearchRequest): Promise<AggregatedNews> {
    const cacheKey = `search:${JSON.stringify(request)}`;

    // Check cache first
    if (this.config.caching.enabled) {
      const cached = await this.cache.get<AggregatedNews>(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached search results', { query: request.query });
        return cached;
      }
    }

    try {
      const allArticles: NewsArticle[] = [];
      const duplicates: any[] = [];

      // Fetch from all enabled providers
      for (const providerConfig of this.config.providers) {
        if (!providerConfig.enabled) continue;

        const provider = providerConfig.name as NewsProvider;
        const client = this.clients.get(provider);

        if (!client) {
          this.logger.warn(`No client available for provider: ${provider}`);
          continue;
        }

        try {
          const response = await client.searchNews(request);
          allArticles.push(...response.data.articles);

          this.logger.debug(`Fetched ${response.data.articles.length} articles from ${provider}`);
        } catch (error) {
          this.logger.error(`Failed to fetch from ${provider}`, { error: error.message });
        }
      }

      // Process and deduplicate articles
      const processed = await this.processArticles(allArticles, request);

      // Cache results
      if (this.config.caching.enabled) {
        await this.cache.set(cacheKey, processed, this.config.caching.ttl);
      }

      return processed;

    } catch (error) {
      this.logger.error('News aggregation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get top headlines across all providers
   */
  async getTopHeadlines(request: Partial<NewsSearchRequest> = {}): Promise<AggregatedNews> {
    const searchRequest: NewsSearchRequest = {
      ...request,
      sortBy: 'publishedAt',
      pageSize: request.pageSize || 50,
    };

    return this.searchNews(searchRequest);
  }

  /**
   * Get breaking news
   */
  async getBreakingNews(): Promise<AggregatedNews> {
    const searchRequest: NewsSearchRequest = {
      sortBy: 'publishedAt',
      pageSize: 20,
      includeBreaking: true,
    };

    return this.searchNews(searchRequest);
  }

  /**
   * Get news by category
   */
  async getNewsByCategory(category: NewsCategory, request: Partial<NewsSearchRequest> = {}): Promise<AggregatedNews> {
    const searchRequest: NewsSearchRequest = {
      ...request,
      category: [category],
      sortBy: 'publishedAt',
      pageSize: request.pageSize || 30,
    };

    return this.searchNews(searchRequest);
  }

  /**
   * Get personalized news based on user preferences
   */
  async getPersonalizedNews(preferences: {
    interests: Record<string, number>;
    preferredSources?: string[];
    blockedSources?: string[];
    biasPreference?: 'left' | 'center' | 'right' | 'neutral';
    readingLevel?: 'beginner' | 'intermediate' | 'advanced';
  }, request: Partial<NewsSearchRequest> = {}): Promise<AggregatedNews> {
    // Build personalized search request
    const searchRequest: NewsSearchRequest = {
      ...request,
      sortBy: 'relevancy',
      pageSize: request.pageSize || 25,
    };

    // Add source preferences
    if (preferences.preferredSources?.length) {
      searchRequest.sources = preferences.preferredSources;
    }

    if (preferences.blockedSources?.length) {
      searchRequest.excludeDomains = preferences.blockedSources;
    }

    // Fetch articles
    const aggregated = await this.searchNews(searchRequest);

    // Personalize ranking
    aggregated.articles = this.rankByPersonalPreferences(aggregated.articles, preferences);

    return aggregated;
  }

  /**
   * Process articles: deduplicate, filter, rank
   */
  private async processArticles(
    articles: NewsArticle[],
    request: NewsSearchRequest
  ): Promise<AggregatedNews> {
    // Filter articles
    let filteredArticles = this.filterArticles(articles, request);

    // Deduplicate
    if (this.config.deduplication.enabled) {
      const { deduplicated, duplicates } = this.deduplicateArticles(filteredArticles);
      filteredArticles = deduplicated;
    }

    // Apply content filtering
    if (this.config.filtering.enabled) {
      filteredArticles = await this.applyContentFiltering(filteredArticles);
    }

    // Rank articles
    filteredArticles = this.rankArticles(filteredArticles, request);

    // Limit results
    const limit = request.pageSize || 50;
    filteredArticles = filteredArticles.slice(0, limit);

    // Generate summary and trends
    const summary = this.generateSummary(filteredArticles);
    const trends = this.identifyTrends(filteredArticles);

    return {
      articles: filteredArticles,
      duplicates: [], // Would populate from deduplication
      trends,
      summary,
    };
  }

  /**
   * Filter articles based on basic criteria
   */
  private filterArticles(articles: NewsArticle[], request: NewsSearchRequest): NewsArticle[] {
    return articles.filter(article => {
      // Basic content quality filters
      if (!article.title || article.title.length < 10) return false;
      if (!article.content || article.content.length < 50) return false;

      // Credibility filter
      if (request.minCredibility && article.credibility.overallScore < request.minCredibility) {
        return false;
      }

      // Bias filter
      if (request.excludeBias?.includes(article.bias.overallBias)) {
        return false;
      }

      // Recency filter
      if (this.config.deduplication.timeWindow) {
        const cutoffTime = new Date(Date.now() - this.config.deduplication.timeWindow * 60 * 60 * 1000);
        if (new Date(article.publishedAt) < cutoffTime) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Deduplicate similar articles
   */
  private deduplicateArticles(articles: NewsArticle[]): {
    deduplicated: NewsArticle[];
    duplicates: any[];
  } {
    const deduplicated: NewsArticle[] = [];
    const duplicates: any[] = [];
    const seen = new Map<string, NewsArticle>();

    // Sort by publication date (newest first)
    const sorted = [...articles].sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    for (const article of sorted) {
      // Generate similarity key (simplified)
      const key = this.generateSimilarityKey(article);

      if (seen.has(key)) {
        // Found duplicate
        const original = seen.get(key)!;
        const similarity = this.calculateSimilarity(original, article);

        if (similarity > this.config.deduplication.similarityThreshold) {
          duplicates.push({
            original: original.id,
            duplicates: [article.id],
            similarityScore: similarity,
          });
          continue;
        }
      }

      seen.set(key, article);
      deduplicated.push(article);
    }

    return { deduplicated, duplicates };
  }

  /**
   * Apply content filtering
   */
  private async applyContentFiltering(articles: NewsArticle[]): Promise<NewsArticle[]> {
    return articles.filter(article => {
      const content = `${article.title} ${article.content}`.toLowerCase();

      // Check for prohibited words
      for (const word of this.config.filtering.prohibitedWords) {
        if (content.includes(word.toLowerCase())) {
          return false;
        }
      }

      // Check political bias threshold
      const biasScore = Math.abs(article.bias.biasScore);
      if (biasScore > this.config.filtering.politicalBiasThreshold * 100) {
        return false;
      }

      // Check for spam indicators
      if (this.isSpam(content)) {
        return false;
      }

      // Check for clickbait
      if (this.isClickbait(article.title)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Rank articles based on multiple factors
   */
  private rankArticles(articles: NewsArticle[], request: NewsSearchRequest): NewsArticle[] {
    return articles.map(article => ({
      ...article,
      relevanceScore: this.calculateRelevanceScore(article, request),
    })).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  /**
   * Rank by personal preferences
   */
  private rankByPersonalPreferences(
    articles: NewsArticle[],
    preferences: any
  ): NewsArticle[] {
    return articles.map(article => {
      let personalScore = article.relevanceScore || 50;

      // Boost for preferred sources
      if (preferences.preferredSources?.includes(article.source.id)) {
        personalScore += 20;
      }

      // Penalty for blocked sources
      if (preferences.blockedSources?.includes(article.source.id)) {
        personalScore -= 50;
      }

      // Boost for matching interests
      for (const [interest, weight] of Object.entries(preferences.interests)) {
        if (article.category === interest || article.tags.includes(interest)) {
          personalScore += (weight as number) * 10;
        }
      }

      // Bias preference matching
      if (preferences.biasPreference) {
        if (article.bias.overallBias === preferences.biasPreference) {
          personalScore += 15;
        } else if (article.bias.overallBias === 'neutral') {
          personalScore += 5;
        }
      }

      return {
        ...article,
        relevanceScore: Math.min(100, personalScore),
      };
    }).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  }

  /**
   * Generate summary of articles
   */
  private generateSummary(articles: NewsArticle[]): any {
    const totalArticles = articles.length;
    const averageCredibility = articles.reduce((sum, a) => sum + a.credibility.overallScore, 0) / totalArticles;

    const biasDistribution = articles.reduce((acc, article) => {
      acc[article.bias.overallBias] = (acc[article.bias.overallBias] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topSources = articles
      .reduce((acc, article) => {
        acc[article.source.name] = (acc[article.source.name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
      ;

    const dominantTopics = articles
      .reduce((acc, article) => {
        acc[article.category] = (acc[article.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
      ;

    return {
      totalArticles,
      averageCredibility,
      biasDistribution,
      topSources,
      dominantTopics,
    };
  }

  /**
   * Identify trending topics
   */
  private identifyTrends(articles: NewsArticle[]): any[] {
    const topicCounts: Record<string, { count: number; sentiment: string[] }> = {};

    for (const article of articles) {
      if (!topicCounts[article.category]) {
        topicCounts[article.category] = { count: 0, sentiment: [] };
      }
      topicCounts[article.category].count++;
      topicCounts[article.category].sentiment.push(article.bias.overallBias);
    }

    return Object.entries(topicCounts)
      .map(([topic, data]) => ({
        topic,
        articleCount: data.count,
        sentiment: data.sentiment.length > 0 ? 'neutral' : 'neutral',
        timeframe: '24h',
      }))
      .sort((a, b) => b.articleCount - a.articleCount)
      .slice(0, 5);
  }

  /**
   * Helper methods
   */
  private generateSimilarityKey(article: NewsArticle): string {
    // Simplified similarity key based on title
    return article.title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .slice(0, 5) // First 5 words
      .join('-');
  }

  private calculateSimilarity(article1: NewsArticle, article2: NewsArticle): number {
    // Simple similarity calculation based on title overlap
    const words1 = article1.title.toLowerCase().split(/\s+/);
    const words2 = article2.title.toLowerCase().split(/\s+/);

    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];

    return intersection.length / union.length;
  }

  private isSpam(content: string): boolean {
    // Simple spam detection
    const spamIndicators = ['click here', 'free money', 'guaranteed', 'limited time', 'act now'];
    const spamCount = spamIndicators.filter(indicator =>
      content.toLowerCase().includes(indicator)
    ).length;

    return spamCount > 2;
  }

  private isClickbait(title: string): boolean {
    // Simple clickbait detection
    const clickbaitIndicators = ['!', 'shocking', 'unbelievable', 'you won\'t believe', 'secret revealed'];
    return clickbaitIndicators.some(indicator =>
      title.toLowerCase().includes(indicator)
    );
  }

  private calculateRelevanceScore(article: NewsArticle, request: NewsSearchRequest): number {
    let score = 50; // Base score

    // Credibility component
    score += article.credibility.overallScore * this.config.ranking.credibility;

    // Recency component
    const hoursOld = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 100 - hoursOld);
    score += recencyScore * this.config.ranking.recency;

    // Source diversity component
    score += (1 - article.source.reliabilityScore / 100) * this.config.ranking.diversity;

    // Relevance component (simplified)
    if (request.query && article.title.toLowerCase().includes(request.query.toLowerCase())) {
      score += 20 * this.config.ranking.relevance;
    }

    return Math.min(100, score);
  }
}