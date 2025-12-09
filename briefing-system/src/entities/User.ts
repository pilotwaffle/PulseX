import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { DailyBriefing } from './DailyBriefing';
import { UserFeedback } from './UserFeedback';
import { PersonalizationProfile } from './PersonalizationProfile';
import { UserPreferences, NotificationSettings } from '@/types';

@Entity('users')
@Index(['email'], { unique: true })
@Index(['username'], { unique: true })
@Index(['subscriptionTier'])
@Index(['lastActiveAt'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  @Column({ type: 'varchar', length: 20, default: 'free' })
  subscriptionTier: 'free' | 'premium';

  @Column({
    type: 'jsonb',
    default: () => `'${JSON.stringify({
      interests: {
        crypto_market: 0.3,
        ai_tech: 0.3,
        political_narrative: 0.2,
        daily_focus: 0.1,
        wildcard: 0.1
      },
      contentTypes: ['crypto_market', 'ai_tech', 'political_narrative', 'daily_focus', 'wildcard'],
      readingTime: 'balanced',
      riskTolerance: 'moderate',
      timezone: 'UTC',
      language: 'en',
      topics: [],
      excludedSources: [],
      preferredSources: []
    })}'`
  })
  preferences: UserPreferences;

  @Column({
    type: 'jsonb',
    default: () => `'${JSON.stringify({
      enabled: true,
      preferredTime: '07:00',
      timezone: 'UTC',
      frequency: 'daily',
      channels: ['push'],
      breakingNewsAlerts: false
    })}'`
  })
  notificationSettings: NotificationSettings;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  @Index()
  lastActiveAt: Date;

  @Column({ type: 'integer', default: 0 })
  totalBriefings: number;

  @Column({ type: 'integer', default: 0 })
  totalCardsRead: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  averageRating: number;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionExpiresAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @OneToMany(() => DailyBriefing, briefing => briefing.user)
  briefings: DailyBriefing[];

  @OneToMany(() => UserFeedback, feedback => feedback.user)
  feedback: UserFeedback[];

  @OneToOne(() => PersonalizationProfile, profile => profile.user, { cascade: true })
  @JoinColumn()
  personalizationProfile?: PersonalizationProfile;

  // Helper methods
  isPremium(): boolean {
    return this.subscriptionTier === 'premium' &&
           (!this.subscriptionExpiresAt || this.subscriptionExpiresAt > new Date());
  }

  updateLastActive(): void {
    this.lastActiveAt = new Date();
    this.updatedAt = new Date();
  }

  getPreferredReadingTime(): number {
    const timeMapping = {
      quick: 30,
      balanced: 60,
      detailed: 90
    };
    return timeMapping[this.preferences.readingTime] || 60;
  }

  hasContentPreference(contentType: string): boolean {
    return this.preferences.contentTypes.includes(contentType as any);
  }

  shouldReceiveNotifications(): boolean {
    return this.notificationSettings.enabled && this.isActive;
  }

  canAccessPremiumFeatures(): boolean {
    return this.isPremium();
  }

  incrementBriefingCount(): void {
    this.totalBriefings += 1;
    this.updateLastActive();
  }

  incrementCardsRead(count: number = 1): void {
    this.totalCardsRead += count;
    this.updateLastActive();
  }

  updateAverageRating(newRating: number): void {
    if (this.totalBriefings === 0) {
      this.averageRating = newRating;
    } else {
      this.averageRating = ((this.averageRating * this.totalBriefings) + newRating) / (this.totalBriefings + 1);
    }
  }
}