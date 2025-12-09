import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './User';
import { BriefingCard } from './BriefingCard';
import { DailyBriefing } from './DailyBriefing';
import { FeedbackType, FeedbackMetadata } from '@/types';

@Entity('user_feedback')
@Index(['userId'])
@Index(['cardId'])
@Index(['briefingId'])
@Index(['type'])
@Index(['createdAt'])
@Index(['rating'])
export class UserFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  cardId?: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  briefingId?: string;

  @Column({
    type: 'varchar',
    length: 50,
    enum: ['thumbs_up', 'thumbs_down', 'share', 'save', 'hide', 'report', 'detailed_rating']
  })
  @Index()
  type: FeedbackType;

  @Column({ type: 'decimal', precision: 2, scale: 1, nullable: true })
  @Index()
  rating?: number; // 1-5 scale for detailed ratings

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category?: string; // For categorizing feedback types

  @Column({ type: 'jsonb', nullable: true })
  metadata?: FeedbackMetadata;

  @Column({ type: 'jsonb', nullable: true })
  context?: {
    userAgent: string;
    platform: 'ios' | 'android' | 'web' | 'desktop';
    appVersion: string;
    sessionId: string;
    location?: string;
    timeOfDay: string;
    dayOfWeek: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  aBTestContext?: {
    testId: string;
    variant: string;
    cohort: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  personalizationData?: {
    userInterestsAtTime: Record<string, number>;
    contentRecommendationScore: number;
    relevanceScore: number;
    userState: string;
  };

  @Column({ type: 'boolean', default: false })
  isProcessed: boolean;

  @Column({ type: 'boolean', default: false })
  isActioned: boolean;

  @Column({ type: 'boolean', default: false })
  requiresFollowUp: boolean;

  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  actionedAt?: Date;

  @Column({ type: 'uuid', nullable: true })
  processedBy?: string; // Admin user ID who processed this

  @Column({ type: 'text', nullable: true })
  adminNotes?: string;

  @Column({ type: 'jsonb', nullable: true })
  analysis?: {
    sentiment: 'positive' | 'negative' | 'neutral';
    urgency: 'low' | 'medium' | 'high';
    category: string;
    tags: string[];
    similarFeedbackCount: number;
    trendingIssue: boolean;
  };

  @CreateDateColumn({ type: 'timestamp' })
  @Index()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt?: Date;

  // Relationships
  @ManyToOne(() => User, user => user.feedback, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => BriefingCard, card => card.feedback, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cardId' })
  card?: BriefingCard;

  @ManyToOne(() => DailyBriefing, briefing => briefing.feedback, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'briefingId' })
  briefing?: DailyBriefing;

  // Helper methods
  isPositive(): boolean {
    return this.type === 'thumbs_up' ||
           (this.rating && this.rating >= 4) ||
           this.type === 'share' ||
           this.type === 'save';
  }

  isNegative(): boolean {
    return this.type === 'thumbs_down' ||
           this.type === 'hide' ||
           this.type === 'report' ||
           (this.rating && this.rating <= 2);
  }

  isEngagement(): boolean {
    return this.type === 'share' || this.type === 'save';
  }

  isContentQuality(): boolean {
    return this.type === 'thumbs_up' ||
           this.type === 'thumbs_down' ||
           this.type === 'detailed_rating';
  }

  getUrgencyLevel(): 'low' | 'medium' | 'high' {
    if (this.type === 'report') return 'high';
    if (this.type === 'thumbs_down' && this.rating && this.rating <= 1) return 'high';
    if (this.isNegative()) return 'medium';
    return 'low';
  }

  requiresImmediateAttention(): boolean {
    return this.getUrgencyLevel() === 'high' ||
           (this.reason && this.reason.toLowerCase().includes('bug')) ||
           (this.comment && this.comment.toLowerCase().includes('broken'));
  }

  getSentimentLabel(): 'positive' | 'negative' | 'neutral' {
    if (this.isPositive()) return 'positive';
    if (this.isNegative()) return 'negative';
    return 'neutral';
  }

  markAsProcessed(processedBy?: string, adminNotes?: string): void {
    this.isProcessed = true;
    this.processedAt = new Date();
    this.processedBy = processedBy;
    this.adminNotes = adminNotes;
    this.updatedAt = new Date();
  }

  markAsActioned(actionedBy?: string, adminNotes?: string): void {
    this.isActioned = true;
    this.actionedAt = new Date();
    this.processedBy = actionedBy || this.processedBy;
    if (adminNotes) {
      this.adminNotes = this.adminNotes ? `${this.adminNotes}\n${adminNotes}` : adminNotes;
    }
    this.updatedAt = new Date();
  }

  requiresHumanReview(): boolean {
    return this.type === 'report' ||
           (this.comment && this.comment.length > 100) ||
           (this.reason && this.reason.includes('offensive')) ||
           this.requiresFollowUp;
  }

  categorizeFeedback(): string {
    if (this.type === 'report') return 'safety';
    if (this.reason?.includes('bug')) return 'technical';
    if (this.reason?.includes('biased')) return 'bias';
    if (this.reason?.includes('irrelevant')) return 'relevance';
    if (this.reason?.includes('quality')) return 'quality';
    if (this.type === 'thumbs_up' || this.type === 'thumbs_down') return 'content';
    if (this.type === 'share' || this.type === 'save') return 'engagement';
    return 'general';
  }

  updateAnalysis(analysis: {
    sentiment: 'positive' | 'negative' | 'neutral';
    urgency: 'low' | 'medium' | 'high';
    category: string;
    tags: string[];
    similarFeedbackCount: number;
    trendingIssue: boolean;
  }): void {
    this.analysis = analysis;
    this.updatedAt = new Date();

    // Update category if not set
    if (!this.category) {
      this.category = analysis.category;
    }

    // Update requiresFollowUp based on urgency
    this.requiresFollowUp = analysis.urgency === 'high' || analysis.trendingIssue;
  }

  getActionableInsights(): string[] {
    const insights: string[] = [];

    if (this.isNegative()) {
      insights.push('Content quality issue detected');
    }

    if (this.reason?.includes('biased')) {
      insights.push('Potential political bias in content');
    }

    if (this.reason?.includes('irrelevant')) {
      insights.push('Personalization algorithm needs adjustment');
    }

    if (this.type === 'report') {
      insights.push('Content moderation required');
    }

    if (this.metadata?.completion === false) {
      insights.push('Content may be too long or complex');
    }

    if (this.metadata?.duration && this.metadata.duration < 10000) { // Less than 10 seconds
      insights.push('Content may be too simple or unengaging');
    }

    return insights;
  }

  getQualityScore(): number {
    let score = 0.5; // Base score

    if (this.isPositive()) score += 0.3;
    if (this.isNegative()) score -= 0.3;
    if (this.rating) {
      score += (this.rating - 3) * 0.1; // Center around 3
    }
    if (this.comment && this.comment.length > 20) {
      score += 0.1; // Detailed feedback is valuable
    }

    return Math.max(0, Math.min(1, score));
  }

  isRecent(hours: number = 24): boolean {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.createdAt > cutoff;
  }

  hasPersonalizationData(): boolean {
    return !!this.personalizationData &&
           Object.keys(this.personalizationData).length > 0;
  }

  getRecommendationScore(): number {
    if (!this.hasPersonalizationData()) return 0;

    const data = this.personalizationData!;
    return data.contentRecommendationScore || data.relevanceScore || 0;
  }

  // Static method to create feedback from card interaction
  static createFromCardInteraction(
    userId: string,
    cardId: string,
    briefingId: string,
    type: FeedbackType,
    rating?: number,
    reason?: string,
    metadata?: FeedbackMetadata
  ): Partial<UserFeedback> {
    return {
      userId,
      cardId,
      briefingId,
      type,
      rating,
      reason,
      metadata,
    };
  }
}