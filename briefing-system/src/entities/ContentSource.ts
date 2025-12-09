import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { BriefingCard } from './BriefingCard';
import { RawContent } from './RawContent';
import { SourceType, SourceMetadata } from '@/types';

@Entity('content_sources')
@Index(['isActive'])
@Index(['type'])
@Index(['reliability'])
@Index(['priority'])
@Index(['lastCrawled'])
export class ContentSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  @Index()
  name: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({
    type: 'varchar',
    length: 50,
    enum: ['news', 'crypto', 'ai_tech', 'political', 'research', 'social']
  })
  @Index()
  type: SourceType;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  language: string;

  @Column({ type: 'varchar', length: 10, default: 'global' })
  region: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.5 })
  @Index()
  reliability: number; // 0 to 1 scale

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  biasScore: number; // -1 (left) to 1 (right) scale

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.5 })
  qualityScore: number; // 0 to 1 scale

  @Column({ type: 'integer', default: 5 })
  @Index()
  priority: number; // Higher number = higher priority

  @Column({ type: 'boolean', default: true })
  @Index()
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  requiresAuth: boolean;

  @Column({ type: 'boolean', default: false })
  requiresApiKey: boolean;

  @Column({ type: 'text', nullable: true })
  apiKey?: string;

  @Column({ type: 'text', nullable: true })
  apiSecret?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  apiEndpoint?: string;

  @Column({ type: 'integer', default: 1000 })
  rateLimit: number; // Requests per hour

  @Column({ type: 'varchar', length: 100, default: 'hourly' })
  updateFrequency: string;

  @Column({ type: 'integer', default: 24 })
  maxContentAge: number; // Hours

  @Column({ type: 'jsonb', nullable: true })
  crawlConfig?: {
    selectors: Record<string, string>;
    headers: Record<string, string>;
    userAgent: string;
    timeout: number;
    retries: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  authConfig?: {
    type: 'oauth' | 'api_key' | 'basic' | 'bearer';
    credentials: Record<string, string>;
    tokenUrl?: string;
    scopes?: string[];
  };

  @Column({ type: 'jsonb', nullable: true })
  filterRules?: {
    includeKeywords: string[];
    excludeKeywords: string[];
    includeDomains: string[];
    excludeDomains: string[];
    minContentLength: number;
    maxContentLength: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata: SourceMetadata;

  @Column({ type: 'integer', default: 0 })
  totalItemsCrawled: number;

  @Column({ type: 'integer', default: 0 })
  successfulCrawls: number;

  @Column({ type: 'integer', default: 0 })
  failedCrawls: number;

  @Column({ type: 'integer', default: 0 })
  itemsUsedInBriefings: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  averageProcessingTime: number; // in seconds

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  lastCrawled?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastSuccessfulCrawl?: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextCrawlAt?: Date;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ type: 'jsonb', nullable: true })
  statistics?: {
    dailyItemsCrawled: number;
    weeklyItemsCrawled: number;
    monthlyItemsCrawled: number;
    averageItemQuality: number;
    averageRelevanceScore: number;
    errorRate: number;
  };

  // Relationships
  @OneToMany(() => BriefingCard, card => card.source)
  cards: BriefingCard[];

  @OneToMany(() => RawContent, content => content.source)
  rawContent: RawContent[];

  // Helper methods
  getSuccessRate(): number {
    if (this.totalItemsCrawled === 0) return 0;
    return (this.successfulCrawls / this.totalItemsCrawled) * 100;
  }

  getErrorRate(): number {
    if (this.totalItemsCrawled === 0) return 0;
    return (this.failedCrawls / this.totalItemsCrawled) * 100;
  }

  getUtilizationRate(): number {
    if (this.totalItemsCrawled === 0) return 0;
    return (this.itemsUsedInBriefings / this.totalItemsCrawled) * 100;
  }

  isReadyToCrawl(): boolean {
    if (!this.isActive) return false;
    if (!this.nextCrawlAt) return true;
    return new Date() >= this.nextCrawlAt;
  }

  markCrawlAttempt(success: boolean, error?: string): void {
    this.totalItemsCrawled += 1;
    if (success) {
      this.successfulCrawls += 1;
      this.lastSuccessfulCrawl = new Date();
    } else {
      this.failedCrawls += 1;
      this.lastError = error;
    }
    this.lastCrawled = new Date();

    // Schedule next crawl
    const interval = this.getCrawlInterval();
    this.nextCrawlAt = new Date(Date.now() + interval);

    this.updatedAt = new Date();
  }

  getCrawlInterval(): number {
    const intervals = {
      realtime: 5 * 60 * 1000,      // 5 minutes
      frequent: 15 * 60 * 1000,     // 15 minutes
      hourly: 60 * 60 * 1000,       // 1 hour
      daily: 24 * 60 * 60 * 1000,   // 24 hours
      weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    return intervals[this.updateFrequency as keyof typeof intervals] || intervals.hourly;
  }

  updateStatistics(): void {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // This would typically be calculated from actual data
    // For now, we'll update based on current values
    this.statistics = {
      dailyItemsCrawled: this.successfulCrawls,
      weeklyItemsCrawled: this.successfulCrawls * 7,
      monthlyItemsCrawled: this.successfulCrawls * 30,
      averageItemQuality: this.qualityScore,
      averageRelevanceScore: this.reliability,
      errorRate: this.getErrorRate(),
    };
  }

  isHighQuality(): boolean {
    return this.qualityScore >= 0.7 && this.reliability >= 0.8;
  }

  isPoliticallyBalanced(): boolean {
    if (this.type !== 'political') return true;
    return Math.abs(this.biasScore) <= 0.3;
  }

  isReliable(): boolean {
    return this.reliability >= 0.6 && this.getErrorRate() <= 20;
  }

  isActiveAndHealthy(): boolean {
    return this.isActive &&
           this.isReliable() &&
           this.lastSuccessfulCrawl &&
           (Date.now() - this.lastSuccessfulCrawl.getTime()) < 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  shouldRateLimit(): boolean {
    if (!this.lastCrawled) return false;
    const timeSinceLastCrawl = Date.now() - this.lastCrawled.getTime();
    const minInterval = (60 * 60 * 1000) / this.rateLimit; // Minimum time between requests
    return timeSinceLastCrawl < minInterval;
  }

  incrementUsage(): void {
    this.itemsUsedInBriefings += 1;
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }

  activate(): void {
    this.isActive = true;
    this.updatedAt = new Date();
  }

  updateQuality(newQualityScore: number, newReliabilityScore?: number): void {
    this.qualityScore = newQualityScore;
    if (newReliabilityScore !== undefined) {
      this.reliability = newReliabilityScore;
    }
    this.updatedAt = new Date();
  }
}