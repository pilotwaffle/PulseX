import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ContentSource } from './ContentSource';
import { RawContentMetadata } from '@/types';

@Entity('raw_content')
@Index(['sourceId'])
@Index(['category'])
@Index(['language'])
@Index(['createdAt'])
@Index(['processedAt'])
@Index(['qualityScore'])
@Index(['isActive'])
export class RawContent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  sourceId: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  author?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  url?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  imageUrl?: string;

  @Column({ type: 'varchar', length: 100, default: 'article' })
  contentType: 'article' | 'post' | 'tweet' | 'report' | 'update' | 'analysis';

  @Column({ type: 'varchar', length: 50 })
  category: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  @Index()
  language: string;

  @Column({ type: 'varchar', length: 10, default: 'global' })
  region: string;

  @Column({ type: 'integer', default: 0 })
  wordCount: number;

  @Column({ type: 'integer', default: 60 })
  readingTime: number; // in seconds

  @Column({
    type: 'simple-array',
    default: () => `'{}'`
  })
  tags: string[];

  @Column({ type: 'varchar', length: 20, nullable: true })
  publishedDate?: string; // ISO date string

  @Column({ type: 'timestamp', nullable: true })
  publishedAt?: Date;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  sentimentScore?: number; // -1 to 1 scale

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  politicalBiasScore?: number; // -1 to 1 scale

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  factualAccuracyScore?: number; // 0 to 1 scale

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  @Index()
  qualityScore: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  relevanceScore: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  freshnessScore: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  popularityScore: number;

  @Column({ type: 'boolean', default: true })
  @Index()
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isProcessed: boolean;

  @Column({ type: 'boolean', default: false })
  isUsedInBriefing: boolean;

  @Column({ type: 'boolean', default: false })
  hasFinancialContent: boolean;

  @Column({ type: 'boolean', default: false })
  hasPoliticalContent: boolean;

  @Column({ type: 'boolean', default: false })
  hasBreakingNews: boolean;

  @Column({ type: 'boolean', default: false })
  requiresFactCheck: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: RawContentMetadata;

  @Column({ type: 'jsonb', nullable: true })
  extractedData?: {
    entities: Array<{
      text: string;
      type: string;
      confidence: number;
    }>;
    keywords: string[];
    topics: string[];
    summary?: string;
    keyPoints?: string[];
    quotes?: string[];
  };

  @Column({ type: 'jsonb', nullable: true })
  processingData?: {
    processingTime: number; // in milliseconds
    llmModel: string;
    tokensUsed: number;
    processingSteps: string[];
    errors?: string[];
  };

  @Column({ type: 'jsonb', nullable: true })
  contentAnalysis?: {
    readabilityScore: number;
    objectivityScore: number;
    complexityScore: number;
    sentimentLabel: 'positive' | 'negative' | 'neutral';
    politicalLabel: 'left' | 'center' | 'right';
    language: string;
    credibilityScore: number;
  };

  @CreateDateColumn({ type: 'timestamp' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  crawledAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  processedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedInBriefingAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ type: 'text', nullable: true })
  processingError?: string;

  @Column({ type: 'simple-array', nullable: true })
  relatedContentIds?: string[];

  @Column({ type: 'jsonb', nullable: true })
  sourceMetadata?: {
    crawlId: string;
    crawlerVersion: string;
    cacheHit: boolean;
    responseTime: number;
    httpStatus: number;
  };

  // Relationships
  @ManyToOne(() => ContentSource, source => source.rawContent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceId' })
  source: ContentSource;

  // Helper methods
  markAsProcessed(qualityScore: number, error?: string): void {
    this.isProcessed = true;
    this.processedAt = new Date();
    this.qualityScore = qualityScore;
    if (error) {
      this.processingError = error;
    }
    this.updatedAt = new Date();
  }

  markAsUsedInBriefing(): void {
    this.isUsedInBriefing = true;
    this.usedInBriefingAt = new Date();
    this.updatedAt = new Date();
  }

  calculateFreshness(): number {
    const now = new Date();
    const published = this.publishedAt || this.createdAt;
    const hoursOld = (now.getTime() - published.getTime()) / (1000 * 60 * 60);

    // Freshness score: 1.0 for very recent, decreasing over time
    if (hoursOld < 1) return 1.0;
    if (hoursOld < 6) return 0.9;
    if (hoursOld < 24) return 0.7;
    if (hoursOld < 48) return 0.5;
    if (hoursOld < 168) return 0.3; // 1 week
    return 0.1;
  }

  calculateReadingTime(): number {
    const wordsPerMinute = 200;
    const minutes = Math.max(1, Math.ceil(this.wordCount / wordsPerMinute));
    return minutes * 60; // Convert to seconds
  }

  getSentimentLabel(): string {
    if (!this.sentimentScore) return 'neutral';
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

  isHighQuality(): boolean {
    return this.qualityScore >= 0.7 &&
           (this.factualAccuracyScore || 0) >= 0.8 &&
           this.wordCount >= 100;
  }

  isPoliticallyBalanced(): boolean {
    if (!this.hasPoliticalContent) return true;
    const bias = this.politicalBiasScore || 0;
    return Math.abs(bias) <= 0.3;
  }

  isFresh(): boolean {
    return this.calculateFreshness() >= 0.5;
  }

  isExpired(): boolean {
    return this.expiresAt ? this.expiresAt < new Date() : false;
  }

  shouldBeProcessed(): boolean {
    return this.isActive && !this.isProcessed && !this.processingError;
  }

  canBeUsedInBriefing(): boolean {
    return this.isHighQuality() &&
           this.isFresh() &&
           this.isProcessed &&
           !this.isUsedInBriefing &&
           this.isActive;
  }

  updateContentAnalysis(analysis: {
    readabilityScore: number;
    objectivityScore: number;
    complexityScore: number;
    sentimentLabel: 'positive' | 'negative' | 'neutral';
    politicalLabel: 'left' | 'center' | 'right';
    language: string;
    credibilityScore: number;
  }): void {
    this.contentAnalysis = analysis;

    // Update sentiment score
    const sentimentMap = { positive: 0.5, negative: -0.5, neutral: 0 };
    this.sentimentScore = sentimentMap[analysis.sentimentLabel];

    // Update political bias score
    const biasMap = { left: -0.5, center: 0, right: 0.5 };
    this.politicalBiasScore = biasMap[analysis.politicalLabel];

    this.language = analysis.language;
    this.factualAccuracyScore = analysis.credibilityScore;

    this.updatedAt = new Date();
  }

  addExtractedData(data: {
    entities: Array<{ text: string; type: string; confidence: number }>;
    keywords: string[];
    topics: string[];
    summary?: string;
    keyPoints?: string[];
    quotes?: string[];
  }): void {
    this.extractedData = data;

    // Update metadata
    this.metadata.entities = data.entities.map(e => e.text);
    this.metadata.keywords = data.keywords;
    this.metadata.topics = data.topics;

    // Update tags
    this.tags = [...new Set([...this.tags, ...data.keywords, ...data.topics])];

    this.updatedAt = new Date();
  }

  updateProcessingData(data: {
    processingTime: number;
    llmModel: string;
    tokensUsed: number;
    processingSteps: string[];
    errors?: string[];
  }): void {
    this.processingData = data;

    if (data.errors && data.errors.length > 0) {
      this.processingError = data.errors.join('; ');
    }

    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }

  activate(): void {
    this.isActive = true;
    this.processingError = null;
    this.updatedAt = new Date();
  }

  getOverallScore(): number {
    const qualityWeight = 0.3;
    const freshnessWeight = 0.2;
    const relevanceWeight = 0.3;
    const popularityWeight = 0.2;

    return (
      this.qualityScore * qualityWeight +
      this.calculateFreshness() * freshnessWeight +
      this.relevanceScore * relevanceWeight +
      this.popularityScore * popularityWeight
    );
  }
}