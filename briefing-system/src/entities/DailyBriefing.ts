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
import { User } from './User';
import { BriefingCard } from './BriefingCard';
import { UserFeedback } from './UserFeedback';
import { BriefingMetadata } from '@/types';

@Entity('daily_briefings')
@Index(['userId'])
@Index(['createdAt'])
@Index(['deliveredAt'])
@Index(['readAt'])
@Index(['status'])
@Index(['qualityScore'])
export class DailyBriefing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
    enum: ['pending', 'generating', 'completed', 'delivered', 'read', 'failed']
  })
  status: 'pending' | 'generating' | 'completed' | 'delivered' | 'read' | 'failed';

  @Column({ type: 'integer', default: 0 })
  cardCount: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  qualityScore: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  relevanceScore: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  userRating?: number;

  @Column({ type: 'integer', default: 0 })
  totalReadingTime: number; // in seconds

  @Column({ type: 'integer', default: 0 })
  cardsRead: number;

  @Column({ type: 'decimal', precision: 5, scale: 0, default: 0 })
  generationTime: number; // in milliseconds

  @Column({ type: 'jsonb', nullable: true })
  metadata?: BriefingMetadata;

  @Column({ type: 'jsonb', nullable: true })
  generationData?: {
    sourcesUsed: string[];
    contentTypesUsed: string[];
    personalizationScore: number;
    diversityScore: number;
    freshnessScore: number;
    errors: string[];
  };

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'jsonb', nullable: true })
  qualityMetrics?: {
    factualAccuracy: number;
    sourceReliability: number;
    contentFreshness: number;
    readTimeAccuracy: number;
    sentimentBalance: number;
    politicalNeutrality: number;
  };

  @CreateDateColumn({ type: 'timestamp' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  generatedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  deliveredAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  readAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @Column({ type: 'jsonb', nullable: true })
  userContext?: {
    timeOfDay: string;
    dayOfWeek: string;
    timezone: string;
    device: string;
    location?: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  aBTestGroup?: {
    testId: string;
    variant: string;
    enrolledAt: Date;
  };

  // Relationships
  @ManyToOne(() => User, user => user.briefings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => BriefingCard, card => card.briefing, { cascade: true })
  cards: BriefingCard[];

  @OneToMany(() => UserFeedback, feedback => feedback.briefing)
  feedback: UserFeedback[];

  // Helper methods
  markAsGenerated(): void {
    this.status = 'completed';
    this.generatedAt = new Date();
    this.updatedAt = new Date();
  }

  markAsDelivered(): void {
    this.status = 'delivered';
    this.deliveredAt = new Date();
    this.updatedAt = new Date();
  }

  markAsRead(): void {
    this.status = 'read';
    this.readAt = new Date();
    this.updatedAt = new Date();
  }

  markAsFailed(error: string): void {
    this.status = 'failed';
    this.errorMessage = error;
    this.updatedAt = new Date();
  }

  calculateCompletionRate(): number {
    if (this.cardCount === 0) return 0;
    return (this.cardsRead / this.cardCount) * 100;
  }

  isExpired(): boolean {
    return this.expiresAt ? this.expiresAt < new Date() : false;
  }

  canBeRegenerated(): boolean {
    // Allow regeneration if failed or if more than 12 hours old
    if (this.status === 'failed') return true;
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    return this.createdAt < twelveHoursAgo;
  }

  getAverageCardRating(): number {
    const ratedCards = this.cards.filter(card => card.userRating !== undefined);
    if (ratedCards.length === 0) return 0;

    const totalRating = ratedCards.reduce((sum, card) => sum + (card.userRating || 0), 0);
    return totalRating / ratedCards.length;
  }

  hasPoliticalContent(): boolean {
    return this.cards.some(card => card.type === 'political_narrative');
  }

  hasFinancialContent(): boolean {
    return this.cards.some(card => card.type === 'crypto_market');
  }

  getReadingTimeBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {};

    this.cards.forEach(card => {
      if (!breakdown[card.type]) {
        breakdown[card.type] = 0;
      }
      breakdown[card.type] += card.readingTime;
    });

    return breakdown;
  }

  updateQualityMetrics(metrics: {
    factualAccuracy: number;
    sourceReliability: number;
    contentFreshness: number;
    readTimeAccuracy: number;
    sentimentBalance: number;
    politicalNeutrality: number;
  }): void {
    this.qualityMetrics = metrics;

    // Calculate overall quality score
    this.qualityScore = (
      metrics.factualAccuracy * 0.25 +
      metrics.sourceReliability * 0.20 +
      metrics.contentFreshness * 0.20 +
      metrics.readTimeAccuracy * 0.15 +
      metrics.sentimentBalance * 0.10 +
      metrics.politicalNeutrality * 0.10
    );

    this.updatedAt = new Date();
  }

  archive(): void {
    this.isArchived = true;
    this.updatedAt = new Date();
  }
}