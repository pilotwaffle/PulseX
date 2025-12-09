import { database } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';
import { SavedCard } from '../types';
import { handleDatabaseError } from '../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

export class SavedCardsService {
  async saveCard(userId: string, cardData: {
    briefingId: string;
    cardId: string;
    title: string;
    summary: string;
    tags?: string[];
  }): Promise<SavedCard> {
    try {
      // Verify user owns the briefing
      const briefingQuery = 'SELECT id FROM daily_briefings WHERE id = $1 AND user_id = $2';
      const briefingResult = await database.query(briefingQuery, [cardData.briefingId, userId]);

      if (briefingResult.rows.length === 0) {
        throw new Error('Briefing not found or access denied');
      }

      // Check if card is already saved
      const existingCardQuery = `
        SELECT id FROM saved_cards
        WHERE user_id = $1 AND briefing_id = $2 AND card_id = $3
      `;
      const existingCard = await database.query(existingCardQuery, [
        userId,
        cardData.briefingId,
        cardData.cardId,
      ]);

      if (existingCard.rows.length > 0) {
        throw new Error('Card already saved');
      }

      // Create new saved card
      const insertQuery = `
        INSERT INTO saved_cards (
          user_id, briefing_id, card_id, title, summary, tags, saved_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *
      `;
      const result = await database.query(insertQuery, [
        userId,
        cardData.briefingId,
        cardData.cardId,
        cardData.title,
        cardData.summary,
        JSON.stringify(cardData.tags || []),
      ]);

      const savedCard = result.rows[0];

      logger.info('Card saved successfully', {
        userId,
        briefingId: cardData.briefingId,
        cardId: cardData.cardId,
      });

      // Update user preferences based on saved topics
      await this.updateUserPreferencesFromSavedCard(userId, cardData.tags || []);

      return {
        ...savedCard,
        tags: typeof savedCard.tags === 'string' ? JSON.parse(savedCard.tags) : savedCard.tags,
      };
    } catch (error) {
      logger.error('Failed to save card', {
        userId,
        cardData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && (
        error.message === 'Briefing not found or access denied' ||
        error.message === 'Card already saved'
      )) {
        throw error;
      }

      throw handleDatabaseError(error);
    }
  }

  async getSavedCards(userId: string, limit: number = 50, offset: number = 0): Promise<{ cards: SavedCard[]; total: number }> {
    try {
      const countQuery = 'SELECT COUNT(*) FROM saved_cards WHERE user_id = $1';
      const countResult = await database.query(countQuery, [userId]);
      const total = parseInt(countResult.rows[0].count);

      const cardsQuery = `
        SELECT sc.*, db.title as briefing_title, db.date as briefing_date
        FROM saved_cards sc
        JOIN daily_briefings db ON sc.briefing_id = db.id
        WHERE sc.user_id = $1
        ORDER BY sc.saved_at DESC
        LIMIT $2 OFFSET $3
      `;
      const cardsResult = await database.query(cardsQuery, [userId, limit, offset]);

      const cards = cardsResult.rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        briefing_id: row.briefing_id,
        card_id: row.card_id,
        title: row.title,
        summary: row.summary,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
        saved_at: row.saved_at,
        created_at: row.created_at,
        briefing_title: row.briefing_title,
        briefing_date: row.briefing_date,
      }));

      return { cards, total };
    } catch (error) {
      logger.error('Failed to get saved cards', {
        userId,
        limit,
        offset,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async getSavedCardById(userId: string, cardId: string): Promise<SavedCard | null> {
    try {
      const query = `
        SELECT sc.*, db.title as briefing_title, db.date as briefing_date
        FROM saved_cards sc
        JOIN daily_briefings db ON sc.briefing_id = db.id
        WHERE sc.id = $1 AND sc.user_id = $2
      `;
      const result = await database.query(query, [cardId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const card = result.rows[0];

      return {
        ...card,
        tags: typeof card.tags === 'string' ? JSON.parse(card.tags) : card.tags,
      };
    } catch (error) {
      logger.error('Failed to get saved card by ID', {
        userId,
        cardId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async deleteSavedCard(userId: string, cardId: string): Promise<void> {
    try {
      const query = 'DELETE FROM saved_cards WHERE id = $1 AND user_id = $2';
      const result = await database.query(query, [cardId, userId]);

      if (result.rowCount === 0) {
        throw new Error('Saved card not found or access denied');
      }

      logger.info('Saved card deleted', { userId, cardId });
    } catch (error) {
      logger.error('Failed to delete saved card', {
        userId,
        cardId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && error.message === 'Saved card not found or access denied') {
        throw error;
      }

      throw handleDatabaseError(error);
    }
  }

  async searchSavedCards(userId: string, searchTerm: string, tags?: string[]): Promise<SavedCard[]> {
    try {
      let query = `
        SELECT sc.*, db.title as briefing_title, db.date as briefing_date
        FROM saved_cards sc
        JOIN daily_briefings db ON sc.briefing_id = db.id
        WHERE sc.user_id = $1
      `;
      const params = [userId];

      if (searchTerm) {
        query += ` AND (sc.title ILIKE $${params.length + 1} OR sc.summary ILIKE $${params.length + 1})`;
        params.push(`%${searchTerm}%`);
      }

      if (tags && tags.length > 0) {
        const tagConditions = tags.map((_, index) => `sc.tags::jsonb ? $${params.length + 1 + index}`).join(' OR ');
        query += ` AND (${tagConditions})`;
        params.push(...tags);
      }

      query += ' ORDER BY sc.saved_at DESC LIMIT 100';

      const result = await database.query(query, params);

      return result.rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        briefing_id: row.briefing_id,
        card_id: row.card_id,
        title: row.title,
        summary: row.summary,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
        saved_at: row.saved_at,
        created_at: row.created_at,
        briefing_title: row.briefing_title,
        briefing_date: row.briefing_date,
      }));
    } catch (error) {
      logger.error('Failed to search saved cards', {
        userId,
        searchTerm,
        tags,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async getSavedCardsByTag(userId: string, tag: string): Promise<SavedCard[]> {
    try {
      const query = `
        SELECT sc.*, db.title as briefing_title, db.date as briefing_date
        FROM saved_cards sc
        JOIN daily_briefings db ON sc.briefing_id = db.id
        WHERE sc.user_id = $1 AND sc.tags::jsonb ? $2
        ORDER BY sc.saved_at DESC
      `;
      const result = await database.query(query, [userId, tag]);

      return result.rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        briefing_id: row.briefing_id,
        card_id: row.card_id,
        title: row.title,
        summary: row.summary,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
        saved_at: row.saved_at,
        created_at: row.created_at,
        briefing_title: row.briefing_title,
        briefing_date: row.briefing_date,
      }));
    } catch (error) {
      logger.error('Failed to get saved cards by tag', {
        userId,
        tag,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async getSavedCardsAnalytics(userId: string): Promise<any> {
    try {
      const query = `
        SELECT
          COUNT(*) as total_saved_cards,
          COUNT(DISTINCT briefing_id) as unique_briefings,
          DATE(saved_at) as save_date,
          COUNT(*) as cards_saved_on_date
        FROM saved_cards
        WHERE user_id = $1
        GROUP BY DATE(saved_at)
        ORDER BY save_date DESC
        LIMIT 30
      `;
      const result = await database.query(query, [userId]);

      // Get tag analytics
      const tagQuery = `
        SELECT jsonb_array_elements_text(tags) as tag, COUNT(*) as count
        FROM saved_cards
        WHERE user_id = $1
        GROUP BY tag
        ORDER BY count DESC
        LIMIT 10
      `;
      const tagResult = await database.query(tagQuery, [userId]);

      const totalCards = result.rows.reduce((sum, row) => sum + parseInt(row.cards_saved_on_date), 0);
      const uniqueBriefings = result.rows.length > 0 ? new Set(result.rows.map(row => row.save_date)).size : 0;

      const analytics = {
        totalSavedCards: totalCards,
        uniqueBriefings: result.rows.length > 0 ? parseInt(result.rows[0].unique_briefings) : 0,
        topTags: tagResult.rows.map(row => ({
          tag: row.tag,
          count: parseInt(row.count),
        })),
        saveTrends: result.rows.map(row => ({
          date: row.save_date,
          cardsSaved: parseInt(row.cards_saved_on_date),
        })),
      };

      return analytics;
    } catch (error) {
      logger.error('Failed to get saved cards analytics', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  async updateSavedCardTags(userId: string, cardId: string, tags: string[]): Promise<SavedCard> {
    try {
      const updateQuery = `
        UPDATE saved_cards
        SET tags = $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING *
      `;
      const result = await database.query(updateQuery, [JSON.stringify(tags), cardId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Saved card not found or access denied');
      }

      const updatedCard = result.rows[0];

      logger.info('Saved card tags updated', {
        userId,
        cardId,
        newTags: tags,
      });

      // Update user preferences based on new tags
      await this.updateUserPreferencesFromSavedCard(userId, tags);

      return {
        ...updatedCard,
        tags: typeof updatedCard.tags === 'string' ? JSON.parse(updatedCard.tags) : updatedCard.tags,
      };
    } catch (error) {
      logger.error('Failed to update saved card tags', {
        userId,
        cardId,
        tags,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && error.message === 'Saved card not found or access denied') {
        throw error;
      }

      throw handleDatabaseError(error);
    }
  }

  async exportSavedCards(userId: string, format: 'json' | 'csv' = 'json'): Promise<any> {
    try {
      const query = `
        SELECT sc.*, db.title as briefing_title, db.date as briefing_date
        FROM saved_cards sc
        JOIN daily_briefings db ON sc.briefing_id = db.id
        WHERE sc.user_id = $1
        ORDER BY sc.saved_at DESC
      `;
      const result = await database.query(query, [userId]);

      const cards = result.rows.map(row => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
        saved_at: row.saved_at,
        briefing_title: row.briefing_title,
        briefing_date: row.briefing_date,
      }));

      if (format === 'json') {
        return {
          export_date: new Date().toISOString(),
          total_cards: cards.length,
          cards,
        };
      } else if (format === 'csv') {
        // Convert to CSV format
        const headers = ['Title', 'Summary', 'Tags', 'Saved At', 'Briefing Title', 'Briefing Date'];
        const csvRows = [headers.join(',')];

        cards.forEach(card => {
          const row = [
            `"${card.title.replace(/"/g, '""')}"`,
            `"${card.summary.replace(/"/g, '""')}"`,
            `"${card.tags.join('; ')}"`,
            card.saved_at,
            `"${card.briefing_title.replace(/"/g, '""')}"`,
            card.briefing_date,
          ];
          csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
      }
    } catch (error) {
      logger.error('Failed to export saved cards', {
        userId,
        format,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw handleDatabaseError(error);
    }
  }

  private async updateUserPreferencesFromSavedCard(userId: string, tags: string[]): Promise<void> {
    try {
      if (tags.length === 0) {
        return;
      }

      // Get current user preferences
      const preferencesQuery = 'SELECT preferred_topics FROM user_preferences WHERE user_id = $1';
      const preferencesResult = await database.query(preferencesQuery, [userId]);

      if (preferencesResult.rows.length === 0) {
        return; // User preferences not found, skip update
      }

      const currentTopics = preferencesResult.rows[0].preferred_topics || [];
      let updatedTopics = [...currentTopics];

      // Add new topics from saved cards
      tags.forEach(tag => {
        if (!updatedTopics.includes(tag)) {
          updatedTopics.push(tag);
        }
      });

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

        logger.info('Updated user preferences from saved card tags', {
          userId,
          newTopics: tags.filter(tag => !currentTopics.includes(tag)),
        });
      }
    } catch (error) {
      logger.error('Failed to update user preferences from saved card', {
        userId,
        tags,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw here, as this is not critical
    }
  }
}

export const savedCardsService = new SavedCardsService();