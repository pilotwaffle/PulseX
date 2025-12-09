import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { DailyBriefing } from './DailyBriefing';
import { ContentSource } from './ContentSource';
import { UserFeedback } from './UserFeedback';
import { ContentType, CardMetadata } from '@/types';

@Entity('briefing_cards')
@Index(['briefingId'])
@Index(['type'])
@Index(['sourceId'])
@Index(['qualityScore'])
@Index(['relevanceScore'])
@Index(['createdAt'])
@Index(['userRating'])
export class BriefingCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  briefingId: string;

  @Column({
    type: 'varchar',
    length: 50,
    enum: ['crypto_market', 'ai_tech', 'political_narrative', 'daily_focus', 'wildcard']
  })
  @Index()
  type: ContentType;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'integer', default: 60 }) // in seconds
  readingTime: number;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  sourceId?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceName?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  imageUrl?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  externalUrl?: string;

  @Column({ type: 'text', nullable: true })
  disclaimer?: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  @Index()
  qualityScore: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  @Index()
  relevanceScore: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  sentimentScore: number; // -1 to 1 scale

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  complexityScore: number; // 0 to 1 scale

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  politicalBiasScore?: number; // -1 (left) to 1 (right) scale

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  factualAccuracyScore?: number; // 0 to 1 scale

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  @Index()
  userRating?: number; // 1 to 5 scale

  @Column({ type: 'integer', default: 0 })
  readCount: number;

  @Column({ type: 'integer', default: 0 })
  shareCount: number;

  @Column({ type: 'integer', default: 0 })
  saveCount: number;

  @Column({ type: 'integer', default: 0 })
  feedbackCount: number;

  @Column({ type: 'decimal', precision: 5, scale: 0, default: 0 })
  averageReadingTime: number; // in milliseconds

  @Column({ type: 'boolean', default: false })
  hasFinancialContent: boolean;

  @Column({ type: 'boolean', default: false })
  hasPoliticalContent: boolean;

  @Column({ type: 'boolean', default: false })
  requiresDisclaimer: boolean;

  @Column({
    type: 'jsonb',
    default: () => `'{}'`
  })
  metadata: CardMetadata;

  @Column({
    type: 'simple-array',
    default: () => `'{}'`
  })
  tags: string[];

  @Column({ type: 'jsonb', nullable: true })
  generationData?: {
    llmModel: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    generationTime: number;
    temperature: number;
    seed?: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  contentAnalysis?: {
    keywords: string[];
    entities: string[];
    topics: string[];
    sentiment: 'positive' | 'negative' | 'neutral';
    language: string;
    readability: number;
    objectivity: number;
  };

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @Column({ type: 'boolean', default: false })
  isHidden: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  firstReadAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastReadAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  // Relationships
  @ManyToOne(() => DailyBriefing, briefing => briefing.cards, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'briefingId' })
  briefing: DailyBriefing;

  @ManyToOne(() => ContentSource, source => source.cards, { nullable: true })
  @JoinColumn({ name: 'sourceId' })
  source?: ContentSource;

  @OneToMany(() => UserFeedback, feedback => feedback.card)
  feedback: UserFeedback[];

  // Helper methods
  markAsRead(): void {
    const now = new Date();
    if (!this.firstReadAt) {
      this.firstReadAt = now;
    }
    this.lastReadAt = now;
    this.readCount += 1;
    this.updatedAt = now;
  }

  incrementShareCount(): void {
    this.shareCount += 1;
    this.updatedAt = new Date();
  }

  incrementSaveCount(): void {
    this.saveCount += 1;
    this.updatedAt = new Date();
  }

  incrementFeedbackCount(): void {
    this.feedbackCount += 1;
    this.updatedAt = new Date();
  }

  updateRating(newRating: number): void {
    this.userRating = newRating;
    this.updatedAt = new Date();
  }

  getEngagementScore(): number {
    const readWeight = 0.4;
    const shareWeight = 0.3;
    const saveWeight = 0.2;
    const ratingWeight = 0.1;

    const normalizedReads = Math.min(this.readCount / 10, 1);
    const normalizedShares = Math.min(this.shareCount / 5, 1);
    const normalizedSaves = Math.min(this.saveCount / 3, 1);
    const normalizedRating = (this.userRating || 0) / 5;

    return (
      normalizedReads * readWeight +
      normalizedShares * shareWeight +
      normalizedSaves * saveWeight +
      normalizedRating * ratingWeight
    );
  }

  isHighQuality(): boolean {
    return this.qualityScore >= 0.7 && this.factualAccuracyScore >= 0.8;
  }

  isPoliticallyBalanced(): boolean {
    if (!this.hasPoliticalContent) return true;
    const bias = this.politicalBiasScore || 0;
    return Math.abs(bias) <= 0.3;
  }

  requiresFinancialDisclaimer(): boolean {
    return this.hasFinancialContent && this.type === 'crypto_market';
  }

  getSentimentLabel(): string {
    if (this.sentimentScore > 0.1) return 'positive';
    if (this.sentimentScore < -0.1) return 'negative';
    return 'neutral';
  }

  getPoliticalBiasLabel(): string {
    if (!this.politicalBiasScore) return 'neutral';
    if (this.politicalBiasScore > 0.3) return 'right';
    if (this.politicalBiasScore < -0.3) return 'left';
    return 'center';
  }

  getComplexityLabel(): string {
    if (this.complexityScore < 0.3) return 'simple';
    if (this.complexityScore < 0.7) return 'moderate';
    return 'complex';
  }

  isExpired(): boolean {
    return this.expiresAt ? this.expiresAt < new Date() : false;
  }

  isFresh(): boolean {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.createdAt > twentyFourHoursAgo;
  }

  hide(): void {
    this.isHidden = true;
    this.updatedAt = new Date();
  }

  archive(): void {
    this.isArchived = true;
    this.updatedAt = new Date();
  }

  updateAnalysis(analysis: {
    keywords: string[];
    entities: string[];
    topics: string[];
    sentiment: 'positive' | 'negative' | 'neutral';
    language: string;
    readability: number;
    objectivity: number;
  }): void {
    this.contentAnalysis = analysis;

    // Update sentiment score
    const sentimentMap = { positive: 0.5, negative: -0.5, neutral: 0 };
    this.sentimentScore = sentimentMap[analysis.sentiment];

    // Update metadata
    this.metadata.sentiment = analysis.sentiment;
    this.metadata.keywords = analysis.keywords;
    this.metadata.entities = analysis.entities;
    this.metadata.topics = analysis.topics;
    this.metadata.languages = [analysis.language];

    this.updatedAt = new Date();
  }

  getReadTimeAccuracy(): number {
    if (this.readCount === 0) return 1;
    const difference = Math.abs(this.readingTime - this.averageReadingTime / 1000);
    return Math.max(0, 1 - (difference / this.readingTime));
  }
}