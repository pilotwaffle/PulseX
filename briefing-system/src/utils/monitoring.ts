import client from 'prom-client';
import { HealthCheck, ServiceHealth, SystemMetrics } from '@/types';
import { AppDataSource } from '@/config/database';
import Redis from 'ioredis';
import logger from './logger';

// Create a Registry to register metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const briefingGenerationDuration = new client.Histogram({
  name: 'briefing_generation_duration_seconds',
  help: 'Duration of briefing generation in seconds',
  labelNames: ['card_type', 'success'],
  registers: [register],
});

const briefingGenerationTotal = new client.Counter({
  name: 'briefing_generation_total',
  help: 'Total number of briefings generated',
  labelNames: ['card_type', 'success'],
  registers: [register],
});

const contentQualityScore = new client.Gauge({
  name: 'content_quality_score',
  help: 'Quality score of generated content',
  labelNames: ['card_type'],
  registers: [register],
});

const userEngagementScore = new client.Gauge({
  name: 'user_engagement_score',
  help: 'User engagement score',
  registers: [register],
});

const externalApiRequests = new client.Counter({
  name: 'external_api_requests_total',
  help: 'Total number of external API requests',
  labelNames: ['service', 'status'],
  registers: [register],
});

const externalApiDuration = new client.Histogram({
  name: 'external_api_request_duration_seconds',
  help: 'Duration of external API requests in seconds',
  labelNames: ['service'],
  registers: [register],
});

const databaseConnections = new client.Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
  registers: [register],
});

const cacheHitRate = new client.Gauge({
  name: 'cache_hit_rate',
  help: 'Cache hit rate percentage',
  registers: [register],
});

const personalizationAccuracy = new client.Gauge({
  name: 'personalization_accuracy',
  help: 'Personalization model accuracy',
  registers: [register],
});

const jobProcessingDuration = new client.Histogram({
  name: 'job_processing_duration_seconds',
  help: 'Duration of job processing in seconds',
  labelNames: ['job_name', 'status'],
  registers: [register],
});

const jobQueueSize = new client.Gauge({
  name: 'job_queue_size',
  help: 'Number of jobs in queue',
  labelNames: ['queue_name'],
  registers: [register],
});

// Health check status
let healthStatus: HealthCheck = {
  status: 'healthy',
  timestamp: new Date(),
  services: [],
  uptime: 0,
};

// System start time
const startTime = Date.now();

export class MonitoringService {
  private redis?: Redis;

  constructor(redis?: Redis) {
    this.redis = redis;
    this.startHealthChecks();
  }

  // Get metrics for Prometheus
  getMetrics(): string {
    return register.metrics();
  }

  // Record HTTP request metrics
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    const labels = { method, route, status_code: statusCode.toString() };
    httpRequestDuration.observe(labels, duration / 1000);
    httpRequestTotal.inc(labels);
  }

  // Record briefing generation metrics
  recordBriefingGeneration(
    cardType: string,
    success: boolean,
    duration: number,
    qualityScore?: number
  ): void {
    const labels = { card_type: cardType, success: success.toString() };
    briefingGenerationDuration.observe(labels, duration / 1000);
    briefingGenerationTotal.inc(labels);

    if (success && qualityScore !== undefined) {
      contentQualityScore.set({ card_type: cardType }, qualityScore);
    }
  }

  // Record user engagement
  recordUserEngagement(score: number): void {
    userEngagementScore.set(score);
  }

  // Record external API request
  recordExternalApiRequest(service: string, status: 'success' | 'error', duration: number): void {
    const durationLabels = { service };
    const countLabels = { service, status };

    externalApiDuration.observe(durationLabels, duration / 1000);
    externalApiRequests.inc(countLabels);
  }

  // Record job processing metrics
  recordJobProcessing(jobName: string, status: 'completed' | 'failed', duration: number): void {
    const labels = { job_name: jobName, status };
    jobProcessingDuration.observe(labels, duration / 1000);
  }

  // Update queue size metrics
  updateQueueSize(queueName: string, size: number): void {
    jobQueueSize.set({ queue_name: queueName }, size);
  }

  // Update database connection metrics
  updateDatabaseConnections(count: number): void {
    databaseConnections.set(count);
  }

  // Update cache hit rate
  updateCacheHitRate(hitRate: number): void {
    cacheHitRate.set(hitRate);
  }

  // Update personalization accuracy
  updatePersonalizationAccuracy(accuracy: number): void {
    personalizationAccuracy.set(accuracy);
  }

  // Health check methods
  async checkHealth(): Promise<HealthCheck> {
    const services: ServiceHealth[] = [];

    // Check database
    const dbHealth = await this.checkDatabase();
    services.push(dbHealth);

    // Check Redis if configured
    if (this.redis) {
      const redisHealth = await this.checkRedis();
      services.push(redisHealth);
    }

    // Check external APIs
    const apiHealth = await this.checkExternalApis();
    services.push(...apiHealth);

    // Determine overall status
    const allHealthy = services.every(service => service.status === 'healthy');
    const someDegraded = services.some(service => service.status === 'degraded');

    healthStatus = {
      status: allHealthy ? 'healthy' : someDegraded ? 'degraded' : 'unhealthy',
      timestamp: new Date(),
      services,
      uptime: Date.now() - startTime,
    };

    return healthStatus;
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    const start = Date.now();

    try {
      const isHealthy = await AppDataSource.query('SELECT 1');
      const responseTime = Date.now() - start;

      return {
        name: 'database',
        status: 'healthy',
        responseTime,
        lastCheck: new Date(),
      };
    } catch (error) {
      const responseTime = Date.now() - start;

      return {
        name: 'database',
        status: 'unhealthy',
        responseTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  private async checkRedis(): Promise<ServiceHealth> {
    if (!this.redis) {
      return {
        name: 'redis',
        status: 'unhealthy',
        lastCheck: new Date(),
        error: 'Redis not configured',
      };
    }

    const start = Date.now();

    try {
      await this.redis.ping();
      const responseTime = Date.now() - start;

      return {
        name: 'redis',
        status: 'healthy',
        responseTime,
        lastCheck: new Date(),
      };
    } catch (error) {
      const responseTime = Date.now() - start;

      return {
        name: 'redis',
        status: 'unhealthy',
        responseTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      };
    }
  }

  private async checkExternalApis(): Promise<ServiceHealth[]> {
    const services: ServiceHealth[] = [];

    // Check OpenAI API
    const openaiHealth = await this.checkApiHealth('OpenAI', 'https://api.openai.com/v1/models');
    services.push(openaiHealth);

    // Check Anthropic API
    const anthropicHealth = await this.checkApiHealth('Anthropic', 'https://api.anthropic.com/v1/messages');
    services.push(anthropicHealth);

    // Check CoinGecko API
    const coingeckoHealth = await this.checkApiHealth('CoinGecko', 'https://api.coingecko.com/api/v3/ping');
    services.push(coingeckoHealth);

    return services;
  }

  private async checkApiHealth(name: string, url: string): Promise<ServiceHealth> {
    const start = Date.now();

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const responseTime = Date.now() - start;

      return {
        name: name.toLowerCase(),
        status: response.ok ? 'healthy' : 'degraded',
        responseTime,
        lastCheck: new Date(),
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      const responseTime = Date.now() - start;

      return {
        name: name.toLowerCase(),
        status: 'unhealthy',
        responseTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown API error',
      };
    }
  }

  private startHealthChecks(): void {
    // Run health checks every 30 seconds
    setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, 30000);
  }

  // Get system metrics
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get metrics from database (simplified example)
      const briefingsResult = await AppDataSource.query(`
        SELECT
          COUNT(*) as briefings_generated,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000) as avg_generation_time,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
          COUNT(*) as total
        FROM daily_briefings
        WHERE created_at >= $1
      `, [oneDayAgo]);

      const briefingsData = briefingsResult[0];

      const successRate = briefingsData.total > 0
        ? (briefingsData.successful / briefingsData.total) * 100
        : 0;

      const averageGenerationTime = briefingsData.avg_generation_time || 0;

      // Get user engagement (simplified)
      const engagementResult = await AppDataSource.query(`
        SELECT
          AVG(CASE
            WHEN total_cards > 0 THEN (cards_read::float / total_cards) * 100
            ELSE 0
          END) as avg_completion_rate
        FROM (
          SELECT
            b.id,
            COUNT(c.id) as total_cards,
            SUM(CASE WHEN c.first_read_at IS NOT NULL THEN 1 ELSE 0 END) as cards_read
          FROM daily_briefings b
          LEFT JOIN briefing_cards c ON b.id = c.briefing_id
          WHERE b.created_at >= $1
          GROUP BY b.id
        ) briefings_with_cards
      `, [oneDayAgo]);

      const userEngagement = engagementResult[0]?.avg_completion_rate || 0;

      // Get content quality (simplified)
      const qualityResult = await AppDataSource.query(`
        SELECT AVG(quality_score) as avg_quality
        FROM briefing_cards
        WHERE created_at >= $1 AND quality_score > 0
      `, [oneDayAgo]);

      const contentQuality = qualityResult[0]?.avg_quality || 0;

      // System load metrics (placeholder - would be implemented with actual system monitoring)
      const systemLoad = {
        cpu: 0.5, // Would get actual CPU usage
        memory: 0.6, // Would get actual memory usage
        database: 0.3, // Would get actual DB load
        cache: 0.2, // Would get actual cache load
        activeJobs: 0, // Would get actual job queue size
      };

      return {
        timestamp: now,
        briefingsGenerated: parseInt(briefingsData.briefings_generated) || 0,
        averageGenerationTime,
        successRate,
        errorRate: 100 - successRate,
        userEngagement,
        contentQuality,
        systemLoad,
      };
    } catch (error) {
      logger.error('Error getting system metrics:', error);

      return {
        timestamp: new Date(),
        briefingsGenerated: 0,
        averageGenerationTime: 0,
        successRate: 0,
        errorRate: 100,
        userEngagement: 0,
        contentQuality: 0,
        systemLoad: {
          cpu: 0,
          memory: 0,
          database: 0,
          cache: 0,
          activeJobs: 0,
        },
      };
    }
  }

  // Get current health status
  getCurrentHealthStatus(): HealthCheck {
    return healthStatus;
  }
}

// Create singleton instance
let monitoringService: MonitoringService;

export const getMonitoringService = (redis?: Redis): MonitoringService => {
  if (!monitoringService) {
    monitoringService = new MonitoringService(redis);
  }
  return monitoringService;
};

export default getMonitoringService;