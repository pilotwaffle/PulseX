import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './User';
import { InterestWeights, ReadingPattern, EngagementHistory } from '@/types';

@Entity('personalization_profiles')
@Index(['userId'])
@Index(['modelVersion'])
@Index(['lastUpdated'])
export class PersonalizationProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({
    type: 'jsonb',
    default: () => `'${JSON.stringify({
      crypto_market: 0.3,
      ai_tech: 0.3,
      political_narrative: 0.2,
      daily_focus: 0.1,
      wildcard: 0.1
    })}'`
  })
  topicWeights: InterestWeights;

  @Column({
    type: 'jsonb',
    default: () => `'[]'`
  })
  readingPatterns: ReadingPattern[];

  @Column({
    type: 'jsonb',
    default: () => `'${JSON.stringify({
      totalBriefings: 0,
      averageCardsPerBriefing: 0,
      averageReadingTime: 0,
      completionRate: 0,
      feedbackScore: 0,
      preferredSources: [],
      avoidedTopics: []
    })}'`
  })
  engagementHistory: EngagementHistory;

  @Column({ type: 'jsonb', nullable: true })
  contentPreferences?: {
    readingDifficulty: 'simple' | 'moderate' | 'complex';
    preferredLength: 'short' | 'medium' | 'long';
    contentDepth: 'overview' | 'detailed' | 'comprehensive';
    visualPreference: 'text' | 'mixed' | 'visual';
    updateFrequency: 'realtime' | 'daily' | 'weekly';
  };

  @Column({ type: 'jsonb', nullable: true })
  learningModel?: {
    features: Record<string, number>;
    weights: Record<string, number>;
    lastTrainingDate: Date;
    accuracy: number;
    version: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  contextualPreferences?: {
    timeOfDayPreferences: Record<string, Record<string, number>>;
    dayOfWeekPreferences: Record<string, Record<string, number>>;
    devicePreferences: Record<string, Record<string, number>>;
    locationPreferences?: Record<string, Record<string, number>>;
  };

  @Column({ type: 'jsonb', nullable: true })
  topicInteractions?: {
    positive: Record<string, number>;
    negative: Record<string, number>;
    neutral: Record<string, number>;
    total: Record<string, number>;
  };

  @Column({ type: 'jsonb', nullable: true })
  sourceInteractions?: {
    positive: Record<string, number>;
    negative: Record<string, number>;
    blocked: string[];
    preferred: string[];
    reliability: Record<string, number>;
  };

  @Column({ type: 'jsonb', nullable: true })
  temporalPatterns?: {
    preferredReadingTimes: string[];
    peakEngagementHours: number[];
    optimalBriefingLength: number;
    averageSessionDuration: number;
    readingStreak: number;
    lastReadingDate: Date;
  };

  @Column({ type: 'jsonb', nullable: true })
  personalizationMetrics?: {
    profileCompleteness: number;
    dataFreshness: number;
    predictionAccuracy: number;
    userSatisfactionScore: number;
    diversityScore: number;
    learningRate: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  aBTestParticipation?: {
    currentTests: string[];
    completedTests: string[];
    testPreferences: Record<string, string>;
    conversionRates: Record<string, number>;
  };

  @Column({ type: 'varchar', length: 50 })
  @Index()
  modelVersion: string;

  @Column({ type: 'integer', default: 0 })
  trainingIterations: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  confidence: number; // Model confidence in predictions (0-1)

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isPremium: boolean;

  @Column({ type: 'integer', default: 0 })
  feedbackCount: number;

  @Column({ type: 'integer', default: 0 })
  predictionsCorrect: number;

  @Column({ type: 'integer', default: 0 })
  predictionsTotal: number;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  @Index()
  lastUpdated: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastTrainedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastValidatedAt?: Date;

  // Relationships
  @OneToOne(() => User, user => user.personalizationProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Helper methods
  updateTopicWeights(newWeights: Partial<InterestWeights>, learningRate: number = 0.1): void {
    const currentWeights = this.topicWeights;

    for (const [topic, newWeight] of Object.entries(newWeights)) {
      if (topic in currentWeights) {
        // Weighted average with learning rate
        currentWeights[topic as keyof InterestWeights] =
          (currentWeights[topic as keyof InterestWeights] * (1 - learningRate)) +
          (newWeight * learningRate);
      }
    }

    // Normalize weights to sum to 1
    const total = Object.values(currentWeights).reduce((sum, weight) => sum + weight, 0);
    if (total > 0) {
      for (const topic of Object.keys(currentWeights)) {
        currentWeights[topic as keyof InterestWeights] /= total;
      }
    }

    this.lastUpdated = new Date();
    this.trainingIterations += 1;
  }

  updateEngagementHistory(briefingData: {
    cardsRead: number;
    totalCards: number;
    readingTime: number;
    rating?: number;
    sourceId?: string;
  }): void {
    const history = this.engagementHistory;

    // Update totals
    history.totalBriefings += 1;
    history.averageCardsPerBriefing =
      ((history.averageCardsPerBriefing * (history.totalBriefings - 1)) + briefingData.cardsRead) /
      history.totalBriefings;

    history.averageReadingTime =
      ((history.averageReadingTime * (history.totalBriefings - 1)) + briefingData.readingTime) /
      history.totalBriefings;

    const completionRate = briefingData.totalCards > 0 ?
      (briefingData.cardsRead / briefingData.totalCards) * 100 : 0;

    history.completionRate =
      ((history.completionRate * (history.totalBriefings - 1)) + completionRate) /
      history.totalBriefings;

    if (briefingData.rating !== undefined) {
      history.feedbackScore =
        ((history.feedbackScore * (history.totalBriefings - 1)) + briefingData.rating) /
        history.totalBriefings;
    }

    this.lastUpdated = new Date();
  }

  addTopicInteraction(topic: string, sentiment: 'positive' | 'negative' | 'neutral'): void {
    if (!this.topicInteractions) {
      this.topicInteractions = {
        positive: {},
        negative: {},
        neutral: {},
        total: {}
      };
    }

    this.topicInteractions[sentiment][topic] = (this.topicInteractions[sentiment][topic] || 0) + 1;
    this.topicInteractions.total[topic] = (this.topicInteractions.total[topic] || 0) + 1;

    this.feedbackCount += 1;
    this.lastUpdated = new Date();
  }

  addSourceInteraction(sourceId: string, sentiment: 'positive' | 'negative', block: boolean = false): void {
    if (!this.sourceInteractions) {
      this.sourceInteractions = {
        positive: {},
        negative: {},
        blocked: [],
        preferred: [],
        reliability: {}
      };
    }

    if (block) {
      if (!this.sourceInteractions.blocked.includes(sourceId)) {
        this.sourceInteractions.blocked.push(sourceId);
      }
    } else {
      this.sourceInteractions[sentiment][sourceId] = (this.sourceInteractions[sentiment][sourceId] || 0) + 1;
    }

    this.lastUpdated = new Date();
  }

  updateReadingPattern(pattern: {
    timeOfDay: string;
    dayOfWeek: string;
    contentTypes: string[];
    readingTime: number;
    completion: boolean;
  }): void {
    if (!this.readingPatterns) {
      this.readingPatterns = [];
    }

    // Add new pattern
    this.readingPatterns.push({
      timeOfDay: pattern.timeOfDay,
      dayOfWeek: pattern.dayOfWeek,
      preferredContentTypes: pattern.contentTypes as any,
      averageReadingTime: pattern.readingTime,
      completionRate: pattern.completion ? 1 : 0
    });

    // Keep only last 100 patterns to prevent excessive memory usage
    if (this.readingPatterns.length > 100) {
      this.readingPatterns = this.readingPatterns.slice(-100);
    }

    this.lastUpdated = new Date();
  }

  getTopicAffinity(topic: string): number {
    if (!this.topicInteractions) return 0.5; // Neutral

    const total = this.topicInteractions.total[topic] || 0;
    if (total === 0) return 0.5;

    const positive = this.topicInteractions.positive[topic] || 0;
    return positive / total;
  }

  getSourceAffinity(sourceId: string): number {
    if (!this.sourceInteractions) return 0.5;

    if (this.sourceInteractions.blocked.includes(sourceId)) return 0;

    const positive = this.sourceInteractions.positive[sourceId] || 0;
    const negative = this.sourceInteractions.negative[sourceId] || 0;
    const total = positive + negative;

    if (total === 0) return 0.5;

    return positive / total;
  }

  getPreferredContentTypes(timeOfDay?: string): string[] {
    const relevantPatterns = timeOfDay
      ? this.readingPatterns.filter(p => p.timeOfDay === timeOfDay)
      : this.readingPatterns;

    if (relevantPatterns.length === 0) {
      return Object.keys(this.topicWeights).sort((a, b) =>
        this.topicWeights[b as keyof InterestWeights] - this.topicWeights[a as keyof InterestWeights]
      );
    }

    // Aggregate content type preferences from patterns
    const typeCounts: Record<string, number> = {};

    relevantPatterns.forEach(pattern => {
      pattern.preferredContentTypes.forEach(type => {
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });
    });

    return Object.keys(typeCounts)
      .sort((a, b) => typeCounts[b] - typeCounts[a])
      .slice(0, 3); // Top 3 preferences
  }

  calculateProfileCompleteness(): number {
    let completeness = 0;
    let totalFactors = 0;

    // Topic weights (20%)
    totalFactors++;
    if (Object.values(this.topicWeights).some(w => w !== 0.2)) { // Not all default
      completeness += 0.2;
    }

    // Engagement history (20%)
    totalFactors++;
    if (this.engagementHistory.totalBriefings > 5) {
      completeness += 0.2;
    }

    // Reading patterns (20%)
    totalFactors++;
    if (this.readingPatterns.length > 0) {
      completeness += 0.2;
    }

    // Topic interactions (20%)
    totalFactors++;
    if (this.topicInteractions && Object.keys(this.topicInteractions.total).length > 0) {
      completeness += 0.2;
    }

    // Source interactions (20%)
    totalFactors++;
    if (this.sourceInteractions && Object.keys(this.sourceInteractions.positive).length > 0) {
      completeness += 0.2;
    }

    return completeness;
  }

  updatePersonalizationMetrics(): void {
    if (!this.personalizationMetrics) {
      this.personalizationMetrics = {
        profileCompleteness: 0,
        dataFreshness: 0,
        predictionAccuracy: 0,
        userSatisfactionScore: 0,
        diversityScore: 0,
        learningRate: 0.1
      };
    }

    this.personalizationMetrics.profileCompleteness = this.calculateProfileCompleteness();

    // Data freshness based on last update
    const hoursSinceUpdate = (Date.now() - this.lastUpdated.getTime()) / (1000 * 60 * 60);
    this.personalizationMetrics.dataFreshness = Math.max(0, 1 - (hoursSinceUpdate / 168)); // Decay over a week

    // User satisfaction based on engagement and feedback
    const engagementScore = Math.min(1, this.engagementHistory.completionRate / 100);
    const feedbackScore = Math.min(1, this.engagementHistory.feedbackScore / 5);
    this.personalizationMetrics.userSatisfactionScore = (engagementScore + feedbackScore) / 2;

    // Prediction accuracy
    if (this.predictionsTotal > 0) {
      this.personalizationMetrics.predictionAccuracy = this.predictionsCorrect / this.predictionsTotal;
    }

    this.lastUpdated = new Date();
  }

  recordPrediction(correct: boolean): void {
    this.predictionsTotal += 1;
    if (correct) {
      this.predictionsCorrect += 1;
    }
    this.updatePersonalizationMetrics();
  }

  getModelAccuracy(): number {
    return this.predictionsTotal > 0 ? this.predictionsCorrect / this.predictionsTotal : 0;
  }

  isProfileSufficient(): boolean {
    return this.calculateProfileCompleteness() >= 0.6 &&
           this.engagementHistory.totalBriefings >= 3;
  }

  needsRetraining(): boolean {
    if (!this.lastTrainedAt) return true;

    const hoursSinceTraining = (Date.now() - this.lastTrainedAt.getTime()) / (1000 * 60 * 60);
    const feedbackSinceTraining = this.feedbackCount - (this.trainingIterations * 10); // Assume 10 feedback per training

    return hoursSinceTraining > 24 || feedbackSinceTraining >= 20;
  }

  upgradeToPremium(): void {
    this.isPremium = true;
    this.modelVersion = 'premium-v1';
    this.lastUpdated = new Date();
  }
}