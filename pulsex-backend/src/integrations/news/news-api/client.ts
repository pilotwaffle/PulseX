import { BaseClient } from '../../core/base-client';
import {
  NewsConfig,
  NewsProvider,
  NewsArticle,
  NewsSource,
  NewsSearchRequest,
  NewsSearchResponse,
  NewsCategory,
  BiasRating,
  CredibilityScore,
} from '../../types/news';
import { ConfigManager } from '../../core/config';
import { Logger } from '../../../utils/logger';

export interface NewsAPIConfig extends NewsConfig {
  provider: 'newsapi';
}

export class NewsAPIClient extends BaseClient {
  private config: NewsAPIConfig;
  private logger: Logger;
  private sourceCredibilityCache: Map<string, CredibilityScore> = new Map();

  constructor(config?: Partial<NewsAPIConfig>) {
    const configManager = ConfigManager.getInstance();
    const defaultConfig = configManager.getIntegrationConfig('newsapi') || {};

    const mergedConfig: NewsAPIConfig = {
      ...defaultConfig,
      provider: 'newsapi',
      categories: ['general', 'business', 'technology', 'science', 'health', 'sports', 'entertainment'],
      countries: ['us', 'gb', 'ca', 'au'],
      languages: ['en'],
      sortBy: 'publishedAt',
      excludeBias: [],
      contentQuality: {
        minLength: 100,
        maxLength: 10000,
        credibilityThreshold: 0.6,
        recencyHours: 24,
      },
      ...config,
    } as NewsAPIConfig;

    super(mergedConfig);
    this.config = mergedConfig;
    this.logger = new Logger('NewsAPIClient');

    this.initializeSourceCredibility();
  }

  /**
   * Search for news articles
   */
  async searchNews(request: NewsSearchRequest): Promise<NewsSearchResponse> {
    try {
      const queryParams = this.buildSearchParams(request);
      const cacheKey = `search:${JSON.stringify(queryParams)}`;

      const response = await this.request('/everything', {
        method: 'GET',
        params: queryParams,
        cacheKey,
      });

      const articles = await this.transformArticles(response.data.articles);

      // Apply additional filters
      const filteredArticles = this.applyFilters(articles, request);

      // Calculate metadata
      const metadata = this.calculateMetadata(filteredArticles, request);

      return {
        success: true,
        data: {
          totalResults: filteredArticles.length,
          articles: filteredArticles,
          filters: this.getFilters(filteredArticles),
          metadata,
        },
      };

    } catch (error) {
      this.logger.error('News search failed', {
        error: error.message,
        query: request.query,
      });
      throw error;
    }
  }

  /**
   * Get top headlines
   */
  async getTopHeadlines(request: Partial<NewsSearchRequest> = {}): Promise<NewsSearchResponse> {
    try {
      const queryParams = this.buildHeadlinesParams(request);
      const cacheKey = `headlines:${JSON.stringify(queryParams)}`;

      const response = await this.request('/top-headlines', {
        method: 'GET',
        params: queryParams,
        cacheKey,
      });

      const articles = await this.transformArticles(response.data.articles);

      // Apply additional filters
      const filteredArticles = this.applyFilters(articles, request);

      // Calculate metadata
      const metadata = this.calculateMetadata(filteredArticles, request);

      return {
        success: true,
        data: {
          totalResults: filteredArticles.length,
          articles: filteredArticles,
          filters: this.getFilters(filteredArticles),
          metadata,
        },
      };

    } catch (error) {
      this.logger.error('Top headlines fetch failed', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get available sources
   */
  async getSources(): Promise<NewsSource[]> {
    try {
      const response = await this.request('/sources', {
        method: 'GET',
        params: {
          language: 'en',
        },
        cacheKey: 'sources',
      });

      return response.data.sources.map((source: any) => this.transformSource(source));

    } catch (error) {
      this.logger.error('Sources fetch failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get articles by category
   */
  async getArticlesByCategory(
    category: NewsCategory,
    request: Partial<NewsSearchRequest> = {}
  ): Promise<NewsSearchResponse> {
    return this.getTopHeadlines({
      ...request,
      category: [category],
    });
  }

  /**
   * Search for breaking news
   */
  async getBreakingNews(request: Partial<NewsSearchRequest> = {}): Promise<NewsSearchResponse> {
    // Get recent articles from the last 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    return this.searchNews({
      ...request,
      from: twoHoursAgo,
      sortBy: 'publishedAt',
      pageSize: Math.min(request.pageSize || 20, 10), // Limit breaking news
    });
  }

  /**
   * Initialize source credibility ratings
   */
  private initializeSourceCredibility(): void {
    // Predefined credibility scores for major sources
    const credibilityData: Record<string, CredibilityScore> = {
      'reuters': {
        overallScore: 95,
        factualAccuracy: 98,
        sourceReputation: 96,
        editorialStandards: 95,
        transparency: 94,
        correctionsPolicy: 97,
        lastUpdated: new Date().toISOString(),
        factors: {
          factChecking: 95,
          sourcesCited: 90,
          bylinePresent: 98,
          publicationDate: 100,
          professionalism: 95,
        },
      },
      'associated-press': {
        overallScore: 93,
        factualAccuracy: 95,
        sourceReputation: 94,
        editorialStandards: 92,
        transparency: 90,
        correctionsPolicy: 94,
        lastUpdated: new Date().toISOString(),
        factors: {
          factChecking: 90,
          sourcesCited: 88,
          bylinePresent: 95,
          publicationDate: 100,
          professionalism: 92,
        },
      },
      'bbc-news': {
        overallScore: 90,
        factualAccuracy: 92,
        sourceReputation: 92,
        editorialStandards: 89,
        transparency: 88,
        correctionsPolicy: 90,
        lastUpdated: new Date().toISOString(),
        factors: {
          factChecking: 88,
          sourcesCited: 85,
          bylinePresent: 92,
          publicationDate: 100,
          professionalism: 90,
        },
      },
      'the-new-york-times': {
        overallScore: 88,
        factualAccuracy: 90,
        sourceReputation: 91,
        editorialStandards: 87,
        transparency: 86,
        correctionsPolicy: 89,
        lastUpdated: new Date().toISOString(),
        factors: {
          factChecking: 87,
          sourcesCited: 84,
          bylinePresent: 94,
          publicationDate: 100,
          professionalism: 88,
        },
      },
      'the-guardian': {
        overallScore: 85,
        factualAccuracy: 87,
        sourceReputation: 86,
        editorialStandards: 84,
        transparency: 85,
        correctionsPolicy: 86,
        lastUpdated: new Date().toISOString(),
        factors: {
          factChecking: 84,
          sourcesCited: 82,
          bylinePresent: 91,
          publicationDate: 100,
          professionalism: 85,
        },
      },
      'techcrunch': {
        overallScore: 82,
        factualAccuracy: 84,
        sourceReputation: 83,
        editorialStandards: 81,
        transparency: 82,
        correctionsPolicy: 83,
        lastUpdated: new Date().toISOString(),
        factors: {
          factChecking: 82,
          sourcesCited: 80,
          bylinePresent: 89,
          publicationDate: 100,
          professionalism: 82,
        },
      },
    };

    for (const [sourceId, score] of Object.entries(credibilityData)) {
      this.sourceCredibilityCache.set(sourceId, score);
    }
  }

  /**
   * Build search parameters for NewsAPI
   */
  private buildSearchParams(request: NewsSearchRequest): Record<string, any> {
    const params: Record<string, any> = {
      sortBy: request.sortBy || this.config.sortBy,
      pageSize: Math.min(request.pageSize || 20, 100), // NewsAPI max is 100
      page: request.page || 1,
    };

    if (request.query) {
      params.q = request.query;
    }

    if (request.from) {
      params.from = request.from;
    }

    if (request.to) {
      params.to = request.to;
    }

    if (request.sources?.length) {
      params.sources = request.sources.join(',');
    }

    if (request.domains?.length) {
      params.domains = request.domains.join(',');
    }

    if (request.excludeDomains?.length) {
      params.excludeDomains = request.excludeDomains.join(',');
    }

    return params;
  }

  /**
   * Build headlines parameters for NewsAPI
   */
  private buildHeadlinesParams(request: Partial<NewsSearchRequest>): Record<string, any> {
    const params: Record<string, any> = {
      pageSize: Math.min(request.pageSize || 20, 100),
      page: request.page || 1,
      country: 'us', // Default to US
    };

    if (request.category?.length) {
      params.category = request.category[0]; // NewsAPI only supports one category
    }

    if (request.sources?.length) {
      params.sources = request.sources.join(',');
    }

    if (request.query) {
      params.q = request.query;
    }

    return params;
  }

  /**
   * Transform NewsAPI articles to standard format
   */
  private async transformArticles(articles: any[]): Promise<NewsArticle[]> {
    const transformedArticles: NewsArticle[] = [];

    for (const article of articles) {
      try {
        const transformed = await this.transformArticle(article);
        transformedArticles.push(transformed);
      } catch (error) {
        this.logger.warn('Failed to transform article', {
          error: error.message,
          articleId: article.url,
        });
      }
    }

    return transformedArticles;
  }

  /**
   * Transform single NewsAPI article
   */
  private async transformArticle(article: any): Promise<NewsArticle> {
    const source = this.transformSource(article.source);
    const credibility = this.getSourceCredibility(source.id);
    const bias = this.analyzeBias(source, article);

    return {
      id: this.generateArticleId(article.url),
      title: article.title || '',
      content: article.content || article.description || '',
      source,
      author: article.author,
      description: article.description,
      url: article.url,
      urlToImage: article.urlToImage,
      publishedAt: article.publishedAt,
      bias,
      credibility,
      relevanceScore: this.calculateRelevanceScore(article),
      category: this.categorizeArticle(article),
      tags: this.extractTags(article),
      metadata: {
        wordCount: this.countWords(article.content || ''),
        readTime: this.estimateReadTime(article.content || ''),
        hasImage: !!article.urlToImage,
        sourceRank: this.getSourceRank(source.id),
        freshness: this.calculateFreshness(article.publishedAt),
      },
    };
  }

  /**
   * Transform NewsAPI source to standard format
   */
  private transformSource(source: any): NewsSource {
    return {
      id: source.id || source.name?.toLowerCase().replace(/\s+/g, '-'),
      name: source.name,
      description: source.description,
      url: source.url || '',
      category: this.mapNewsAPICategory(source.category) as NewsCategory,
      language: source.language,
      country: source.country,
      biasRating: this.getSourceBiasRating(source.id),
      credibilityScore: this.getSourceCredibility(source.id).overallScore,
      reliabilityScore: this.calculateReliabilityScore(source.id),
    };
  }

  /**
   * Get source credibility score
   */
  private getSourceCredibility(sourceId: string): CredibilityScore {
    return this.sourceCredibilityCache.get(sourceId) || {
      overallScore: 70, // Default score
      factualAccuracy: 70,
      sourceReputation: 70,
      editorialStandards: 70,
      transparency: 70,
      correctionsPolicy: 70,
      lastUpdated: new Date().toISOString(),
      factors: {
        factChecking: 70,
        sourcesCited: 70,
        bylinePresent: 70,
        publicationDate: 70,
        professionalism: 70,
      },
    };
  }

  /**
   * Analyze bias of article
   */
  private analyzeBias(source: NewsSource, article: any): BiasRating {
    // Start with source bias rating
    const sourceBias = source.biasRating;

    // Adjust based on article content (simplified analysis)
    const contentBias = this.analyzeContentBias(article.title + ' ' + (article.description || ''));

    // Combine source and content bias
    const combinedScore = (sourceBias.biasScore + contentBias) / 2;

    let overallBias: BiasRating['overallBias'];
    if (combinedScore < -30) {
      overallBias = 'left';
    } else if (combinedScore > 30) {
      overallBias = 'right';
    } else {
      overallBias = 'center';
    }

    return {
      overallBias,
      biasScore: combinedScore,
      factualReporting: source.credibilityScore,
      politicalCoverage: 'moderate',
      editorialSlant: sourceBias.editorialSlant,
      confidence: 0.8,
    };
  }

  /**
   * Simple content bias analysis (placeholder)
   */
  private analyzeContentBias(content: string): number {
    // This is a simplified implementation
    // In production, you'd use NLP libraries for proper sentiment analysis
    const leftKeywords = ['progressive', 'liberal', 'democrat', 'equality', 'social justice'];
    const rightKeywords = ['conservative', 'republican', 'traditional', 'free market', 'individual'];

    const leftScore = leftKeywords.reduce((count, word) =>
      count + (content.toLowerCase().includes(word) ? 1 : 0), 0);
    const rightScore = rightKeywords.reduce((count, word) =>
      count + (content.toLowerCase().includes(word) ? 1 : 0), 0);

    if (leftScore > rightScore) return -20;
    if (rightScore > leftScore) return 20;
    return 0;
  }

  /**
   * Apply filters to articles
   */
  private applyFilters(articles: NewsArticle[], request: NewsSearchRequest): NewsArticle[] {
    let filtered = [...articles];

    // Filter by minimum credibility
    if (request.minCredibility) {
      filtered = filtered.filter(article =>
        article.credibility.overallScore >= request.minCredibility!
      );
    }

    // Filter by bias
    if (request.excludeBias?.length) {
      filtered = filtered.filter(article =>
        !request.excludeBias!.includes(article.bias.overallBias)
      );
    }

    // Filter by content quality
    if (this.config.contentQuality) {
      filtered = filtered.filter(article => {
        const metadata = article.metadata as any;
        return metadata.wordCount >= this.config.contentQuality!.minLength &&
               metadata.wordCount <= this.config.contentQuality!.maxLength &&
               article.credibility.overallScore >= this.config.contentQuality!.credibilityThreshold;
      });
    }

    // Filter by recency
    if (this.config.contentQuality?.recencyHours) {
      const cutoffTime = new Date(Date.now() - this.config.contentQuality.recencyHours * 60 * 60 * 1000);
      filtered = filtered.filter(article =>
        new Date(article.publishedAt) >= cutoffTime
      );
    }

    return filtered;
  }

  /**
   * Calculate metadata for search response
   */
  private calculateMetadata(articles: NewsArticle[], request: NewsSearchRequest): any {
    const totalCredibility = articles.reduce((sum, article) => sum + article.credibility.overallScore, 0);
    const averageCredibility = articles.length > 0 ? totalCredibility / articles.length : 0;

    const biasDistribution = articles.reduce((acc, article) => {
      acc[article.bias.overallBias] = (acc[article.bias.overallBias] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      searchTime: Date.now(), // Would calculate actual search time
      sources: [...new Set(articles.map(a => a.source.id))].length,
      averageCredibility,
      biasBalance: biasDistribution,
    };
  }

  /**
   * Get filters information
   */
  private getFilters(articles: NewsArticle[]): any {
    const categories = [...new Set(articles.map(a => a.category))];
    const sources = [...new Set(articles.map(a => a.source))];

    return {
      categories,
      sources,
      biasDistribution: this.calculateBiasDistribution(articles),
    };
  }

  /**
   * Helper methods
   */
  private generateArticleId(url: string): string {
    return Buffer.from(url).toString('base64').replace(/[/+=]/g, '').substring(0, 16);
  }

  private mapNewsAPICategory(category?: string): string {
    const mapping: Record<string, string> = {
      'general': 'general',
      'business': 'business',
      'entertainment': 'entertainment',
      'health': 'health',
      'science': 'science',
      'sports': 'sports',
      'technology': 'technology',
    };

    return mapping[category || ''] || 'general';
  }

  private getSourceBiasRating(sourceId: string): BiasRating {
    // Simplified bias ratings
    const biasRatings: Record<string, BiasRating> = {
      'reuters': {
        overallBias: 'center',
        biasScore: 0,
        factualReporting: 95,
        politicalCoverage: 'moderate',
        editorialSlant: 'neutral',
        confidence: 0.95,
      },
      'associated-press': {
        overallBias: 'center',
        biasScore: 0,
        factualReporting: 93,
        politicalCoverage: 'moderate',
        editorialSlant: 'neutral',
        confidence: 0.93,
      },
      'bbc-news': {
        overallBias: 'center',
        biasScore: -5,
        factualReporting: 90,
        politicalCoverage: 'moderate',
        editorialSlant: 'center-left',
        confidence: 0.90,
      },
      'the-guardian': {
        overallBias: 'left',
        biasScore: -25,
        factualReporting: 82,
        politicalCoverage: 'heavy',
        editorialSlant: 'center-left',
        confidence: 0.82,
      },
      'techcrunch': {
        overallBias: 'center',
        biasScore: -10,
        factualReporting: 84,
        politicalCoverage: 'minimal',
        editorialSlant: 'center-left',
        confidence: 0.84,
      },
    };

    return biasRatings[sourceId] || {
      overallBias: 'center',
      biasScore: 0,
      factualReporting: 70,
      politicalCoverage: 'moderate',
      editorialSlant: 'neutral',
      confidence: 0.70,
    };
  }

  private calculateReliabilityScore(sourceId: string): number {
    const credibility = this.getSourceCredibility(sourceId);
    return credibility.overallScore;
  }

  private calculateRelevanceScore(article: any): number {
    // Simple relevance scoring based on article properties
    let score = 50; // Base score

    // Bonus for recent articles
    const hoursOld = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60);
    if (hoursOld < 1) score += 20;
    else if (hoursOld < 6) score += 10;
    else if (hoursOld < 24) score += 5;

    // Bonus for articles with images
    if (article.urlToImage) score += 5;

    // Bonus for longer articles
    if (article.content && article.content.length > 500) score += 5;

    // Bonus for articles with authors
    if (article.author) score += 3;

    return Math.min(100, score);
  }

  private categorizeArticle(article: any): string {
    // Simple categorization based on content
    const content = (article.title + ' ' + (article.description || '')).toLowerCase();

    if (content.includes('crypto') || content.includes('bitcoin') || content.includes('ethereum')) {
      return 'crypto';
    }
    if (content.includes('ai') || content.includes('artificial intelligence') || content.includes('machine learning')) {
      return 'ai';
    }
    if (content.includes('election') || content.includes('politics') || content.includes('government')) {
      return 'politics';
    }

    return 'general';
  }

  private extractTags(article: any): string[] {
    const content = article.title + ' ' + (article.description || '');
    const tags: string[] = [];

    // Simple tag extraction
    if (content.toLowerCase().includes('breaking')) tags.push('breaking');
    if (content.toLowerCase().includes('analysis')) tags.push('analysis');
    if (content.toLowerCase().includes('exclusive')) tags.push('exclusive');
    if (article.author) tags.push('has-author');
    if (article.urlToImage) tags.push('has-image');

    return tags;
  }

  private countWords(content: string): number {
    return content.split(/\s+/).filter(word => word.length > 0).length;
  }

  private estimateReadTime(content: string): number {
    const wordsPerMinute = 250;
    const words = this.countWords(content);
    return Math.ceil(words / wordsPerMinute);
  }

  private getSourceRank(sourceId: string): number {
    // Simple ranking based on credibility
    const credibility = this.getSourceCredibility(sourceId);
    return Math.round(credibility.overallScore);
  }

  private calculateFreshness(publishedAt: string): number {
    const hoursOld = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);
    return Math.max(0, 100 - hoursOld);
  }

  private calculateBiasDistribution(articles: NewsArticle[]): Record<string, number> {
    return articles.reduce((acc, article) => {
      acc[article.bias.overallBias] = (acc[article.bias.overallBias] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}