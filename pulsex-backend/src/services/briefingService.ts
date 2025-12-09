import { database } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';
import { DailyBriefing, SourceData, BriefingGenerationRequest } from '../types';
import { newsAPIService } from './external/newsAPI';
import { cryptoAPIService } from './external/cryptoAPI';
import { llmService } from './external/llmService';
import { handleDatabaseError } from '../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

export class BriefingService {
  async generateDailyBriefing(userId: string, date: string = new Date().toISOString().split('T')[0]): Promise<DailyBriefing> {
    const startTime = Date.now();

    try {
      // Check if briefing already exists for this date
      const existingBriefingQuery = 'SELECT id FROM daily_briefings WHERE user_id = $1 AND date = $2';
      const existingBriefing = await database.query(existingBriefingQuery, [userId, date]);

      if (existingBriefing.rows.length > 0) {
        throw new Error('Briefing already exists for this date');
      }

      // Get user preferences
      const userPreferencesQuery = `
        SELECT up.* FROM user_preferences up
        WHERE up.user_id = $1
      `;
      const preferencesResult = await database.query(userPreferencesQuery, [userId]);

      if (preferencesResult.rows.length === 0) {
        throw new Error('User preferences not found');
      }

      const userPreferences = preferencesResult.rows[0];

      // Collect source data
      const sourceData = await this.collectSourceData(userPreferences);

      // Generate content using LLM
      const contentResult = await llmService.generateDailyBriefing(
        userPreferences.preferred_topics,
        userPreferences
      );

      // Create briefing
      const createBriefingQuery = `
        INSERT INTO daily_briefings (
          user_id, date, title, content, summary, topics, sources,
          metadata, is_read, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW(), NOW())
        RETURNING *
      `;

      const briefingData = {
        userId,
        date,
        title: this.generateTitle(contentResult.content, userPreferences.preferred_topics),
        content: contentResult.content,
        summary: contentResult.summary,
        topics: contentResult.topics,
        sources: sourceData,
        metadata: contentResult.metadata,
      };

      const result = await database.query(createBriefingQuery, [
        briefingData.userId,
        briefingData.date,
        briefingData.title,
        briefingData.content,
        briefingData.summary,
        JSON.stringify(briefingData.topics),
        JSON.stringify(briefingData.sources),
        JSON.stringify(briefingData.metadata),
      ]);

      const briefing = result.rows[0];

      // Cache the briefing
      await this.cacheBriefing(userId, date, briefing);

      logger.info('Daily briefing generated successfully', {
        userId,
        date,
        briefingId: briefing.id,
        processingTimeMs: Date.now() - startTime,
        sourcesCollected: sourceData.length,
      });

      return {
        ...briefing,
        topics: typeof briefing.topics === 'string' ? JSON.parse(briefing.topics) : briefing.topics,
        sources: typeof briefing.sources === 'string' ? JSON.parse(briefing.sources) : briefing.sources,
        metadata: typeof briefing.metadata === 'string' ? JSON.parse(briefing.metadata) : briefing.metadata,
      };
    } catch (error) {
      logger.error('Failed to generate daily briefing', {
        userId,
        date,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime,
      });

      if (error instanceof Error && (
        error.message === 'Briefing already exists for this date' ||
        error.message === 'User preferences not found'
      )) {
        throw error;
      }

      throw handleDatabaseError(error);
    }
  }

  async getTodayBriefing(userId: string): Promise<DailyBriefing | null> {
    const today = new Date().toISOString().split('T')[0];
    return this.getBriefingByDate(userId, today);
  }

  async getBriefingByDate(userId: string, date: string): Promise<DailyBriefing | null> {
    const cacheKey = `briefing:${userId}:${date}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.debug('Returning cached briefing', { userId, date });
        return JSON.parse(cached);
      }

      const query = 'SELECT * FROM daily_briefings WHERE user_id = $1 AND date = $2';
      const result = await database.query(query, [userId, date]);

      if (result.rows.length === 0) {
        return null;
      }

      const briefing = result.rows[0];

      // Parse JSON fields
      const parsedBriefing = {
        ...briefing,
        topics: typeof briefing.topics === 'string' ? JSON.parse(briefing.topics) : briefing.topics,
        sources: typeof briefing.sources === 'string' ? JSON.parse(briefing.sources) : briefing.sources,
        metadata: typeof briefing.metadata === 'string' ? JSON.parse(briefing.metadata) : briefing.metadata,
      };

      // Cache for 1 hour
      await redisClient.set(cacheKey, JSON.stringify(parsedBriefing), 3600);

      return parsedBriefing;
    } catch (error) {
      logger.error('Failed to get briefing by date', {
        userId,
        date,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async getBriefingHistory(userId: string, limit: number = 30, offset: number = 0): Promise<{ briefings: DailyBriefing[]; total: number }> {
    try {
      const countQuery = 'SELECT COUNT(*) FROM daily_briefings WHERE user_id = $1';
      const countResult = await database.query(countQuery, [userId]);
      const total = parseInt(countResult.rows[0].count);

      const briefingsQuery = `
        SELECT * FROM daily_briefings
        WHERE user_id = $1
        ORDER BY date DESC, created_at DESC
        LIMIT $2 OFFSET $3
      `;
      const briefingsResult = await database.query(briefingsQuery, [userId, limit, offset]);

      const briefings = briefingsResult.rows.map(briefing => ({
        ...briefing,
        topics: typeof briefing.topics === 'string' ? JSON.parse(briefing.topics) : briefing.topics,
        sources: typeof briefing.sources === 'string' ? JSON.parse(briefing.sources) : briefing.sources,
        metadata: typeof briefing.metadata === 'string' ? JSON.parse(briefing.metadata) : briefing.metadata,
      }));

      return { briefings, total };
    } catch (error) {
      logger.error('Failed to get briefing history', {
        userId,
        limit,
        offset,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async markBriefingAsRead(userId: string, briefingId: string): Promise<void> {
    try {
      const query = `
        UPDATE daily_briefings
        SET is_read = true, read_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND user_id = $2
      `;
      await database.query(query, [briefingId, userId]);

      // Invalidate cache
      const briefing = await this.getBriefingById(briefingId);
      if (briefing) {
        const cacheKey = `briefing:${userId}:${briefing.date}`;
        await redisClient.del(cacheKey);
      }

      logger.info('Briefing marked as read', { userId, briefingId });
    } catch (error) {
      logger.error('Failed to mark briefing as read', {
        userId,
        briefingId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async getBriefingById(briefingId: string): Promise<DailyBriefing | null> {
    try {
      const query = 'SELECT * FROM daily_briefings WHERE id = $1';
      const result = await database.query(query, [briefingId]);

      if (result.rows.length === 0) {
        return null;
      }

      const briefing = result.rows[0];

      return {
        ...briefing,
        topics: typeof briefing.topics === 'string' ? JSON.parse(briefing.topics) : briefing.topics,
        sources: typeof briefing.sources === 'string' ? JSON.parse(briefing.sources) : briefing.sources,
        metadata: typeof briefing.metadata === 'string' ? JSON.parse(briefing.metadata) : briefing.metadata,
      };
    } catch (error) {
      logger.error('Failed to get briefing by ID', {
        briefingId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  private async collectSourceData(userPreferences: any): Promise<SourceData[]> {
    const sources: SourceData[] = [];
    const categories = userPreferences.notification_preferences?.categories || {};

    try {
      // Collect news data
      if (categories.news || categories.tech) {
        try {
          const newsResponse = await newsAPIService.getTopHeadlines('us', categories.tech ? 'technology' : 'general', 10);
          if (newsResponse.data) {
            newsResponse.data.forEach((article: any) => {
              sources.push({
                id: uuidv4(),
                type: 'news',
                title: article.title,
                summary: article.description,
                url: article.url,
                source: article.source,
                publishedAt: article.publishedAt,
                metadata: {
                  relevanceScore: article.relevanceScore,
                  category: article.category,
                },
              });
            });
          }
        } catch (error) {
          logger.warn('Failed to fetch news data', { error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      // Collect crypto data
      if (categories.crypto) {
        try {
          const cryptoResponse = await cryptoAPIService.getTopCryptocurrencies(5);
          if (cryptoResponse.data) {
            cryptoResponse.data.forEach((crypto: any) => {
              sources.push({
                id: uuidv4(),
                type: 'crypto',
                title: `${crypto.name} (${crypto.symbol}) - $${crypto.price.toFixed(2)}`,
                summary: `${crypto.name} is trading at $${crypto.price.toFixed(2)} with a ${crypto.priceChangePercentage24h > 0 ? '+' : ''}${crypto.priceChangePercentage24h.toFixed(2)}% change in the last 24 hours. Market cap: $${(crypto.marketCap / 1e9).toFixed(1)}B`,
                url: `https://www.coingecko.com/en/coins/${crypto.id}`,
                source: 'CoinGecko',
                publishedAt: crypto.lastUpdated,
                metadata: {
                  symbol: crypto.symbol,
                  price: crypto.price,
                  priceChange: crypto.priceChange24h,
                  marketCap: crypto.marketCap,
                  volume24h: crypto.volume24h,
                },
              });
            });
          }
        } catch (error) {
          logger.warn('Failed to fetch crypto data', { error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      // Sort sources by relevance score
      sources.sort((a, b) => (b.metadata.relevanceScore || 0) - (a.metadata.relevanceScore || 0));

      // Return top 10 sources
      return sources.slice(0, 10);
    } catch (error) {
      logger.error('Failed to collect source data', { error: error instanceof Error ? error.message : 'Unknown error' });
      return [];
    }
  }

  private generateTitle(content: string, topics: string[]): string {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    if (topics.length > 0) {
      const mainTopic = topics[0];
      return `${today}: Your ${mainTopic} Daily Briefing`;
    }

    return `${today}: Your Daily Briefing`;
  }

  private async cacheBriefing(userId: string, date: string, briefing: DailyBriefing): Promise<void> {
    const cacheKey = `briefing:${userId}:${date}`;
    await redisClient.set(cacheKey, JSON.stringify(briefing), 3600); // Cache for 1 hour
  }

  async getBriefingAnalytics(userId: string, startDate: string, endDate: string): Promise<any> {
    try {
      const query = `
        SELECT
          COUNT(*) as total_briefings,
          COUNT(CASE WHEN is_read = true THEN 1 END) as read_briefings,
          AVG(EXTRACT(EPOCH FROM (read_at - created_at))/60) as avg_time_to_read_minutes
        FROM daily_briefings
        WHERE user_id = $1 AND date BETWEEN $2 AND $3
      `;
      const result = await database.query(query, [userId, startDate, endDate]);

      const analytics = result.rows[0];

      return {
        totalBriefings: parseInt(analytics.total_briefings),
        readBriefings: parseInt(analytics.read_briefings),
        readRate: analytics.total_briefings > 0 ? (analytics.read_briefings / analytics.total_briefings) * 100 : 0,
        averageTimeToReadMinutes: parseFloat(analytics.avg_time_to_read_minutes) || 0,
      };
    } catch (error) {
      logger.error('Failed to get briefing analytics', {
        userId,
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async regenerateBriefing(userId: string, date: string): Promise<DailyBriefing> {
    try {
      // Delete existing briefing
      const deleteQuery = 'DELETE FROM daily_briefings WHERE user_id = $1 AND date = $2';
      await database.query(deleteQuery, [userId, date]);

      // Invalidate cache
      const cacheKey = `briefing:${userId}:${date}`;
      await redisClient.del(cacheKey);

      // Generate new briefing
      return await this.generateDailyBriefing(userId, date);
    } catch (error) {
      logger.error('Failed to regenerate briefing', {
        userId,
        date,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }
}

export const briefingService = new BriefingService();