import { database } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';
import { Feedback, DailyBriefing } from '../types';
import { handleDatabaseError } from '../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

export class FeedbackService {
  async submitFeedback(userId: string, feedbackData: {
    briefingId: string;
    cardId: string;
    type: 'like' | 'dislike';
    topic: string;
    reason?: string;
  }): Promise<Feedback> {
    try {
      // Verify user owns the briefing
      const briefingQuery = 'SELECT id FROM daily_briefings WHERE id = $1 AND user_id = $2';
      const briefingResult = await database.query(briefingQuery, [feedbackData.briefingId, userId]);

      if (briefingResult.rows.length === 0) {
        throw new Error('Briefing not found or access denied');
      }

      // Check if feedback already exists for this card
      const existingFeedbackQuery = `
        SELECT id FROM feedback
        WHERE user_id = $1 AND briefing_id = $2 AND card_id = $3
      `;
      const existingFeedback = await database.query(existingFeedbackQuery, [
        userId,
        feedbackData.briefingId,
        feedbackData.cardId,
      ]);

      if (existingFeedback.rows.length > 0) {
        // Update existing feedback
        const updateQuery = `
          UPDATE feedback
          SET type = $1, topic = $2, reason = $3, created_at = NOW()
          WHERE id = $4
          RETURNING *
        `;
        const result = await database.query(updateQuery, [
          feedbackData.type,
          feedbackData.topic,
          feedbackData.reason || null,
          existingFeedback.rows[0].id,
        ]);

        const feedback = result.rows[0];

        logger.info('Feedback updated', {
          userId,
          briefingId: feedbackData.briefingId,
          cardId: feedbackData.cardId,
          type: feedbackData.type,
        });

        return feedback;
      } else {
        // Create new feedback
        const insertQuery = `
          INSERT INTO feedback (user_id, briefing_id, card_id, type, topic, reason, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING *
        `;
        const result = await database.query(insertQuery, [
          userId,
          feedbackData.briefingId,
          feedbackData.cardId,
          feedbackData.type,
          feedbackData.topic,
          feedbackData.reason || null,
        ]);

        const feedback = result.rows[0];

        logger.info('Feedback submitted', {
          userId,
          briefingId: feedbackData.briefingId,
          cardId: feedbackData.cardId,
          type: feedbackData.type,
          topic: feedbackData.topic,
        });

        // Update user preferences based on feedback
        await this.updateUserPreferencesFromFeedback(userId, feedbackData);

        return feedback;
      }
    } catch (error) {
      logger.error('Failed to submit feedback', {
        userId,
        feedbackData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && error.message === 'Briefing not found or access denied') {
        throw error;
      }

      throw handleDatabaseError(error);
    }
  }

  async getFeedbackAnalytics(userId: string, startDate?: string, endDate?: string): Promise<any> {
    try {
      let query = `
        SELECT
          type,
          topic,
          COUNT(*) as count,
          AVG(CASE WHEN reason IS NOT NULL THEN 1 ELSE 0 END) as has_reason_rate
        FROM feedback
        WHERE user_id = $1
      `;
      const params = [userId];

      if (startDate && endDate) {
        query += ` AND created_at BETWEEN $${params.length + 1} AND $${params.length + 2}`;
        params.push(startDate, endDate);
      }

      query += ' GROUP BY type, topic ORDER BY count DESC';

      const result = await database.query(query, params);

      const analytics = {
        totalFeedback: 0,
        likes: 0,
        dislikes: 0,
        topics: {},
        detailedFeedback: 0,
        feedbackByType: result.rows,
      };

      result.rows.forEach((row) => {
        analytics.totalFeedback += parseInt(row.count);
        if (row.type === 'like') {
          analytics.likes += parseInt(row.count);
        } else {
          analytics.dislikes += parseInt(row.count);
        }

        if (!analytics.topics[row.topic]) {
          analytics.topics[row.topic] = {
            likes: 0,
            dislikes: 0,
            total: 0,
          };
        }

        analytics.topics[row.topic][row.type] += parseInt(row.count);
        analytics.topics[row.topic].total += parseInt(row.count);
        analytics.detailedFeedback += Math.round(parseFloat(row.has_reason_rate) * parseInt(row.count));
      });

      analytics.likeRate = analytics.totalFeedback > 0 ? (analytics.likes / analytics.totalFeedback) * 100 : 0;
      analytics.detailedFeedbackRate = analytics.totalFeedback > 0 ? (analytics.detailedFeedback / analytics.totalFeedback) * 100 : 0;

      return analytics;
    } catch (error) {
      logger.error('Failed to get feedback analytics', {
        userId,
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async getUserFeedbackHistory(userId: string, limit: number = 50, offset: number = 0): Promise<{ feedback: Feedback[]; total: number }> {
    try {
      const countQuery = 'SELECT COUNT(*) FROM feedback WHERE user_id = $1';
      const countResult = await database.query(countQuery, [userId]);
      const total = parseInt(countResult.rows[0].count);

      const feedbackQuery = `
        SELECT f.*, db.title as briefing_title, db.date as briefing_date
        FROM feedback f
        JOIN daily_briefings db ON f.briefing_id = db.id
        WHERE f.user_id = $1
        ORDER BY f.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      const feedbackResult = await database.query(feedbackQuery, [userId, limit, offset]);

      const feedback = feedbackResult.rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        briefing_id: row.briefing_id,
        card_id: row.card_id,
        type: row.type,
        topic: row.topic,
        reason: row.reason,
        created_at: row.created_at,
        briefing_title: row.briefing_title,
        briefing_date: row.briefing_date,
      }));

      return { feedback, total };
    } catch (error) {
      logger.error('Failed to get user feedback history', {
        userId,
        limit,
        offset,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }

  async getGlobalFeedbackAnalytics(limit: number = 10): Promise<any> {
    try {
      const query = `
        SELECT
          topic,
          type,
          COUNT(*) as count,
          COUNT(DISTINCT user_id) as unique_users,
          AVG(CASE WHEN reason IS NOT NULL THEN 1 ELSE 0 END) as has_reason_rate
        FROM feedback
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY topic, type
        ORDER BY count DESC
        LIMIT $1
      `;
      const result = await database.query(query, [limit]);

      const analytics = {
        totalFeedback: 0,
        topics: {},
        topLikedTopics: [],
        topDislikedTopics: [],
      };

      const topicData: Record<string, { likes: number; dislikes: number; total: number; uniqueUsers: number }> = {};

      result.rows.forEach((row) => {
        analytics.totalFeedback += parseInt(row.count);

        if (!topicData[row.topic]) {
          topicData[row.topic] = {
            likes: 0,
            dislikes: 0,
            total: 0,
            uniqueUsers: 0,
          };
        }

        if (row.type === 'like') {
          topicData[row.topic].likes += parseInt(row.count);
        } else {
          topicData[row.topic].dislikes += parseInt(row.count);
        }

        topicData[row.topic].total += parseInt(row.count);
        topicData[row.topic].uniqueUsers = Math.max(topicData[row.topic].uniqueUsers, parseInt(row.unique_users));
      });

      // Convert to final format
      Object.keys(topicData).forEach(topic => {
        const data = topicData[topic];
        const likeRate = data.total > 0 ? (data.likes / data.total) * 100 : 0;

        analytics.topics[topic] = {
          ...data,
          likeRate,
        };

        analytics.topLikedTopics.push({ topic, count: data.likes, likeRate });
        analytics.topDislikedTopics.push({ topic, count: data.dislikes, likeRate });
      });

      // Sort top topics
      analytics.topLikedTopics.sort((a, b) => b.count - a.count);
      analytics.topDislikedTopics.sort((a, b) => b.count - a.count);

      return analytics;
    } catch (error) {
      logger.error('Failed to get global feedback analytics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  private async updateUserPreferencesFromFeedback(userId: string, feedbackData: any): Promise<void> {
    try {
      // Get current user preferences
      const preferencesQuery = 'SELECT preferred_topics FROM user_preferences WHERE user_id = $1';
      const preferencesResult = await database.query(preferencesQuery, [userId]);

      if (preferencesResult.rows.length === 0) {
        return; // User preferences not found, skip update
      }

      const currentTopics = preferencesResult.rows[0].preferred_topics || [];
      let updatedTopics = [...currentTopics];

      // Adjust topic preferences based on feedback
      if (feedbackData.type === 'dislike') {
        // Reduce preference for disliked topics
        updatedTopics = updatedTopics.filter(topic => topic !== feedbackData.topic);
        logger.info('Removed disliked topic from preferences', {
          userId,
          topic: feedbackData.topic,
        });
      } else if (feedbackData.type === 'like') {
        // Boost preference for liked topics
        if (!updatedTopics.includes(feedbackData.topic)) {
          updatedTopics.push(feedbackData.topic);
          logger.info('Added liked topic to preferences', {
            userId,
            topic: feedbackData.topic,
          });
        }
      }

      // Update preferences if changed
      if (JSON.stringify(currentTopics) !== JSON.stringify(updatedTopics)) {
        const updateQuery = `
          UPDATE user_preferences
          SET preferred_topics = $1, updated_at = NOW()
          WHERE user_id = $2
        `;
        await database.query(updateQuery, [JSON.stringify(updatedTopics), userId]);

        // Invalidate cached preferences
        await redisClient.del(`user_preferences:${userId}`);
      }
    } catch (error) {
      logger.error('Failed to update user preferences from feedback', {
        userId,
        feedbackData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw here, as this is not critical
    }
  }

  async deleteFeedback(userId: string, feedbackId: string): Promise<void> {
    try {
      const query = 'DELETE FROM feedback WHERE id = $1 AND user_id = $2';
      const result = await database.query(query, [feedbackId, userId]);

      if (result.rowCount === 0) {
        throw new Error('Feedback not found or access denied');
      }

      logger.info('Feedback deleted', { userId, feedbackId });
    } catch (error) {
      logger.error('Failed to delete feedback', {
        userId,
        feedbackId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && error.message === 'Feedback not found or access denied') {
        throw error;
      }

      throw handleDatabaseError(error);
    }
  }

  async getFeedbackByTopic(userId: string, topic: string): Promise<Feedback[]> {
    try {
      const query = `
        SELECT f.*, db.title as briefing_title, db.date as briefing_date
        FROM feedback f
        JOIN daily_briefings db ON f.briefing_id = db.id
        WHERE f.user_id = $1 AND f.topic = $2
        ORDER BY f.created_at DESC
      `;
      const result = await database.query(query, [userId, topic]);

      return result.rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        briefing_id: row.briefing_id,
        card_id: row.card_id,
        type: row.type,
        topic: row.topic,
        reason: row.reason,
        created_at: row.created_at,
        briefing_title: row.briefing_title,
        briefing_date: row.briefing_date,
      }));
    } catch (error) {
      logger.error('Failed to get feedback by topic', {
        userId,
        topic,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async getFeedbackTrends(userId: string, days: number = 30): Promise<any> {
    try {
      const query = `
        SELECT
          DATE(created_at) as date,
          type,
          COUNT(*) as count
        FROM feedback
        WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at), type
        ORDER BY date DESC
      `;
      const result = await database.query(query, [userId]);

      const trends: Record<string, { likes: number; dislikes: number; total: number }> = {};

      result.rows.forEach((row) => {
        const date = row.date;
        if (!trends[date]) {
          trends[date] = { likes: 0, dislikes: 0, total: 0 };
        }

        trends[date][row.type] += parseInt(row.count);
        trends[date].total += parseInt(row.count);
      });

      return trends;
    } catch (error) {
      logger.error('Failed to get feedback trends', {
        userId,
        days,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }
}

export const feedbackService = new FeedbackService();