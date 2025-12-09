import axios, { AxiosInstance } from 'axios';
import { logger } from '../../config/logger';
import { redisClient } from '../../config/redis';
import { NewsArticle, ExternalAPIResponse } from '../../types';
import { handleExternalAPIError } from '../../middleware/errorHandler';

export class NewsAPIService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl: string = 'https://newsapi.org/v2';
  private cacheTTL: number = 1800; // 30 minutes

  constructor() {
    this.apiKey = process.env.NEWS_API_KEY || '';

    if (!this.apiKey) {
      logger.warn('News API key not configured');
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'X-API-Key': this.apiKey,
        'User-Agent': 'PulseX-Daily-Briefing/1.0',
      },
    });

    this.client.interceptors.request.use(
      (config) => {
        logger.debug('News API request', { method: config.method, url: config.url });
        return config;
      },
      (error) => {
        logger.error('News API request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('News API response', { status: response.status, url: response.config.url });
        return response;
      },
      (error) => {
        logger.error('News API response error', {
          status: error.response?.status,
          url: error.config?.url,
          error: error.message,
        });
        return Promise.reject(handleExternalAPIError(error, 'News API'));
      }
    );
  }

  async getTopHeadlines(country: string = 'us', category?: string, pageSize: number = 20): Promise<ExternalAPIResponse<NewsArticle[]>> {
    const cacheKey = `news:headlines:${country}:${category || 'all'}:${pageSize}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached news headlines', { country, category });
        return {
          data: JSON.parse(cached),
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: true,
        };
      }

      const params: any = {
        country,
        pageSize,
      };

      if (category && category !== 'all') {
        params.category = category;
      }

      const response = await this.client.get('/top-headlines', { params });

      const articles: NewsArticle[] = response.data.articles.map((article: any) => ({
        id: this.generateArticleId(article.url),
        title: article.title || 'Untitled',
        description: article.description || '',
        url: article.url,
        source: article.source?.name || 'Unknown',
        publishedAt: new Date(article.publishedAt),
        category: category || 'general',
        relevanceScore: this.calculateRelevanceScore(article),
      }));

      // Cache the results
      await redisClient.set(cacheKey, JSON.stringify(articles), this.cacheTTL);

      return {
        data: articles,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to fetch top headlines', {
        country,
        category,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async searchNews(query: string, language: string = 'en', sortBy: string = 'publishedAt', pageSize: number = 20): Promise<ExternalAPIResponse<NewsArticle[]>> {
    const cacheKey = `news:search:${Buffer.from(query).toString('base64')}:${language}:${sortBy}:${pageSize}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached search results', { query });
        return {
          data: JSON.parse(cached),
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: true,
        };
      }

      const response = await this.client.get('/everything', {
        params: {
          q: query,
          language,
          sortBy,
          pageSize,
        },
      });

      const articles: NewsArticle[] = response.data.articles.map((article: any) => ({
        id: this.generateArticleId(article.url),
        title: article.title || 'Untitled',
        description: article.description || '',
        url: article.url,
        source: article.source?.name || 'Unknown',
        publishedAt: new Date(article.publishedAt),
        category: 'search',
        relevanceScore: this.calculateRelevanceScore(article, query),
      }));

      // Cache the results
      await redisClient.set(cacheKey, JSON.stringify(articles), this.cacheTTL);

      return {
        data: articles,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to search news', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getNewsBySources(sources: string[], pageSize: number = 20): Promise<ExternalAPIResponse<NewsArticle[]>> {
    const sourcesKey = sources.join(',');
    const cacheKey = `news:sources:${sourcesKey}:${pageSize}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached news by sources', { sources: sourcesKey });
        return {
          data: JSON.parse(cached),
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: true,
        };
      }

      const response = await this.client.get('/top-headlines', {
        params: {
          sources: sourcesKey,
          pageSize,
        },
      });

      const articles: NewsArticle[] = response.data.articles.map((article: any) => ({
        id: this.generateArticleId(article.url),
        title: article.title || 'Untitled',
        description: article.description || '',
        url: article.url,
        source: article.source?.name || 'Unknown',
        publishedAt: new Date(article.publishedAt),
        category: 'custom',
        relevanceScore: this.calculateRelevanceScore(article),
      }));

      // Cache the results
      await redisClient.set(cacheKey, JSON.stringify(articles), this.cacheTTL);

      return {
        data: articles,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to fetch news by sources', {
        sources: sourcesKey,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getAvailableSources(category?: string, language: string = 'en'): Promise<ExternalAPIResponse<any[]>> {
    const cacheKey = `news:sources:available:${category || 'all'}:${language}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached available sources', { category, language });
        return {
          data: JSON.parse(cached),
          status: 200,
          statusText: 'OK',
          headers: {},
          cached: true,
        };
      }

      const params: any = {
        language,
      };

      if (category && category !== 'all') {
        params.category = category;
      }

      const response = await this.client.get('/sources', { params });

      // Cache the results for longer (24 hours)
      await redisClient.set(cacheKey, JSON.stringify(response.data.sources), 86400);

      return {
        data: response.data.sources,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        cached: false,
      };
    } catch (error) {
      logger.error('Failed to fetch available sources', {
        category,
        language,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private generateArticleId(url: string): string {
    return Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }

  private calculateRelevanceScore(article: any, query?: string): number {
    let score = 0.5; // Base score

    // Boost score for articles with titles and descriptions
    if (article.title && article.title.length > 0) {
      score += 0.2;
    }

    if (article.description && article.description.length > 0) {
      score += 0.2;
    }

    // Boost score for recent articles (within last 24 hours)
    const articleDate = new Date(article.publishedAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - articleDate.getTime()) / (1000 * 60 * 60);

    if (hoursDiff < 24) {
      score += 0.3;
    } else if (hoursDiff < 48) {
      score += 0.2;
    } else if (hoursDiff < 72) {
      score += 0.1;
    }

    // Boost score for query matching
    if (query && article.title && article.description) {
      const titleMatch = article.title.toLowerCase().includes(query.toLowerCase()) ? 0.2 : 0;
      const descMatch = article.description.toLowerCase().includes(query.toLowerCase()) ? 0.1 : 0;
      score += titleMatch + descMatch;
    }

    // Ensure score is within bounds
    return Math.min(Math.max(score, 0), 1);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/top-headlines', {
        params: { country: 'us', pageSize: 1 }
      });
      return true;
    } catch (error) {
      logger.error('News API health check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }
}

export const newsAPIService = new NewsAPIService();