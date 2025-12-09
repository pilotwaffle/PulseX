import { DataSource } from 'typeorm';
import { User } from '@/entities/User';
import { DailyBriefing } from '@/entities/DailyBriefing';
import { BriefingCard } from '@/entities/BriefingCard';
import { ContentSource } from '@/entities/ContentSource';
import { RawContent } from '@/entities/RawContent';
import { UserFeedback } from '@/entities/UserFeedback';
import { PersonalizationProfile } from '@/entities/PersonalizationProfile';
import config from './index';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.name,
  ssl: config.database.ssl,
  synchronize: config.app.env === 'development',
  logging: config.app.env === 'development',
  entities: [
    User,
    DailyBriefing,
    BriefingCard,
    ContentSource,
    RawContent,
    UserFeedback,
    PersonalizationProfile,
  ],
  migrations: ['dist/database/migrations/*.js'],
  subscribers: ['dist/database/subscribers/*.js'],
  extra: {
    max: config.database.pool.max,
    min: config.database.pool.min,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
});

// Initialize database connection
export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Error during database initialization:', error);
    throw error;
  }
};

// Close database connection
export const closeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.destroy();
    console.log('Database connection closed successfully');
  } catch (error) {
    console.error('Error during database closure:', error);
    throw error;
  }
};

// Health check for database
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await AppDataSource.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};