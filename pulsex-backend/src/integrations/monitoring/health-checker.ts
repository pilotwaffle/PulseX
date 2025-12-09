import { BaseClient } from '../core/base-client';
import { HealthCheckResult } from '../types/common';
import { Logger } from '../../utils/logger';
import { EventEmitter } from 'events';

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: string;
  responseTime: number;
  errorRate: number;
  uptime: number;
  details?: Record<string, any>;
}

export interface HealthThresholds {
  maxResponseTime: number;
  maxErrorRate: number;
  minUptime: number;
}

export class HealthChecker extends EventEmitter {
  private services: Map<string, {
    client: BaseClient;
    thresholds: HealthThresholds;
    interval: number;
    checkFunction?: () => Promise<HealthCheckResult>;
  }> = new Map();

  private healthStatus: Map<string, ServiceHealth> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private logger: Logger;

  constructor() {
    super();
    this.logger = new Logger('HealthChecker');
  }

  /**
   * Register a service for health checking
   */
  registerService(
    name: string,
    client: BaseClient,
    thresholds: Partial<HealthThresholds> = {},
    interval: number = 60000, // 1 minute default
    customCheck?: () => Promise<HealthCheckResult>
  ): void {
    const serviceConfig = {
      client,
      thresholds: {
        maxResponseTime: thresholds.maxResponseTime || 5000, // 5 seconds
        maxErrorRate: thresholds.maxErrorRate || 0.1, // 10%
        minUptime: thresholds.minUptime || 0.95, // 95%
        ...thresholds,
      },
      interval,
      checkFunction: customCheck,
    };

    this.services.set(name, serviceConfig);
    this.healthStatus.set(name, {
      name,
      status: 'healthy',
      lastCheck: new Date().toISOString(),
      responseTime: 0,
      errorRate: 0,
      uptime: 1,
    });

    this.logger.info(`Service registered for health checking: ${name}`, {
      interval,
      thresholds: serviceConfig.thresholds,
    });

    // Start health checking
    this.startHealthCheck(name);
  }

  /**
   * Unregister a service
   */
  unregisterService(name: string): void {
    this.stopHealthCheck(name);
    this.services.delete(name);
    this.healthStatus.delete(name);
    this.logger.info(`Service unregistered from health checking: ${name}`);
  }

  /**
   * Manually trigger health check for a service
   */
  async checkHealth(name: string): Promise<ServiceHealth> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not registered for health checking`);
    }

    return this.performHealthCheck(name, service);
  }

  /**
   * Get health status of all services
   */
  getAllHealthStatus(): ServiceHealth[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get health status of a specific service
   */
  getHealthStatus(name: string): ServiceHealth | undefined {
    return this.healthStatus.get(name);
  }

  /**
   * Get services by status
   */
  getServicesByStatus(status: 'healthy' | 'degraded' | 'unhealthy'): ServiceHealth[] {
    return Array.from(this.healthStatus.values()).filter(
      service => service.status === status
    );
  }

  /**
   * Get overall system health
   */
  getOverallHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: {
      total: number;
      healthy: number;
      degraded: number;
      unhealthy: number;
    };
    uptime: number;
    lastCheck: string;
  } {
    const services = this.getAllHealthStatus();
    const total = services.length;
    const healthy = services.filter(s => s.status === 'healthy').length;
    const degraded = services.filter(s => s.status === 'degraded').length;
    const unhealthy = services.filter(s => s.status === 'unhealthy').length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (unhealthy > 0) {
      overallStatus = 'unhealthy';
    } else if (degraded > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const lastCheck = services
      .map(s => new Date(s.lastCheck))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return {
      status: overallStatus,
      services: { total, healthy, degraded, unhealthy },
      uptime: total > 0 ? healthy / total : 0,
      lastCheck: lastCheck ? lastCheck.toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Start health checking for a service
   */
  private startHealthCheck(name: string): void {
    const service = this.services.get(name);
    if (!service) return;

    const interval = setInterval(async () => {
      try {
        await this.performHealthCheck(name, service);
      } catch (error) {
        this.logger.error(`Health check failed for ${name}`, { error: error.message });
      }
    }, service.interval);

    this.intervals.set(name, interval);

    // Perform initial check
    this.performHealthCheck(name, service).catch(error => {
      this.logger.error(`Initial health check failed for ${name}`, { error: error.message });
    });
  }

  /**
   * Stop health checking for a service
   */
  private stopHealthCheck(name: string): void {
    const interval = this.intervals.get(name);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(name);
    }
  }

  /**
   * Perform health check for a service
   */
  private async performHealthCheck(
    name: string,
    service: {
      client: BaseClient;
      thresholds: HealthThresholds;
      checkFunction?: () => Promise<HealthCheckResult>;
    }
  ): Promise<ServiceHealth> {
    const startTime = Date.now();
    let checkResult: HealthCheckResult;

    try {
      // Use custom check function if provided, otherwise use client's health check
      if (service.checkFunction) {
        checkResult = await service.checkFunction();
      } else {
        checkResult = await service.client.healthCheck();
      }

      const responseTime = Date.now() - startTime;

      // Get client metrics
      const metrics = service.client.getMetrics();
      const errorRate = metrics.totalRequests > 0
        ? metrics.failedRequests / metrics.totalRequests
        : 0;

      // Determine health status based on thresholds
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (checkResult.status === 'unhealthy' || errorRate > service.thresholds.maxErrorRate) {
        status = 'unhealthy';
      } else if (
        checkResult.status === 'degraded' ||
        responseTime > service.thresholds.maxResponseTime ||
        errorRate > service.thresholds.maxErrorRate * 0.5
      ) {
        status = 'degraded';
      }

      const health: ServiceHealth = {
        name,
        status,
        lastCheck: new Date().toISOString(),
        responseTime,
        errorRate,
        uptime: 1 - errorRate,
        details: {
          ...checkResult.details,
          metrics: {
            totalRequests: metrics.totalRequests,
            successfulRequests: metrics.successfulRequests,
            failedRequests: metrics.failedRequests,
            averageResponseTime: metrics.averageResponseTime,
            totalCost: metrics.totalCost,
          },
        },
      };

      // Update health status
      const previousStatus = this.healthStatus.get(name);
      this.healthStatus.set(name, health);

      // Emit status change if different
      if (previousStatus && previousStatus.status !== status) {
        this.emit('statusChange', {
          service: name,
          previousStatus: previousStatus.status,
          currentStatus: status,
          health,
        });

        this.logger.info(`Health status changed for ${name}`, {
          from: previousStatus.status,
          to: status,
          responseTime,
          errorRate,
        });
      }

      // Emit health check result
      this.emit('healthCheck', { service: name, health });

      return health;

    } catch (error) {
      const responseTime = Date.now() - startTime;

      const health: ServiceHealth = {
        name,
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        responseTime,
        errorRate: 1,
        uptime: 0,
        details: {
          error: error.message,
          errorType: error.constructor.name,
        },
      };

      this.healthStatus.set(name, health);

      this.emit('healthCheck', { service: name, health, error });

      this.logger.error(`Health check failed for ${name}`, {
        error: error.message,
        responseTime,
      });

      return health;
    }
  }

  /**
   * Get health statistics
   */
  getHealthStats(): {
    totalServices: number;
    averageResponseTime: number;
    averageErrorRate: number;
    uptime: number;
    statusDistribution: Record<string, number>;
  } {
    const services = this.getAllHealthStatus();
    const totalServices = services.length;

    if (totalServices === 0) {
      return {
        totalServices: 0,
        averageResponseTime: 0,
        averageErrorRate: 0,
        uptime: 0,
        statusDistribution: {},
      };
    }

    const totalResponseTime = services.reduce((sum, s) => sum + s.responseTime, 0);
    const totalErrorRate = services.reduce((sum, s) => sum + s.errorRate, 0);
    const totalUptime = services.reduce((sum, s) => sum + s.uptime, 0);

    const statusDistribution = services.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalServices,
      averageResponseTime: totalResponseTime / totalServices,
      averageErrorRate: totalErrorRate / totalServices,
      uptime: totalUptime / totalServices,
      statusDistribution,
    };
  }

  /**
   * Export health data for monitoring
   */
  exportHealthData(): {
    timestamp: string;
    overall: any;
    services: ServiceHealth[];
    statistics: any;
  } {
    return {
      timestamp: new Date().toISOString(),
      overall: this.getOverallHealth(),
      services: this.getAllHealthStatus(),
      statistics: this.getHealthStats(),
    };
  }

  /**
   * Stop all health checking
   */
  stopAll(): void {
    for (const [name] of this.services.entries()) {
      this.stopHealthCheck(name);
    }
    this.logger.info('All health checking stopped');
  }

  /**
   * Restart health checking for all services
   */
  restartAll(): void {
    this.stopAll();
    for (const [name] of this.services.entries()) {
      this.startHealthCheck(name);
    }
    this.logger.info('All health checking restarted');
  }
}