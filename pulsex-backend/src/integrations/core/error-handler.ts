import { IntegrationError, RateLimitError, AuthenticationError, QuotaExceededError } from '../types/common';
import { Logger } from '../../utils/logger';

export interface ErrorContext {
  requestId?: string;
  endpoint?: string;
  attempt?: number;
  timestamp?: string;
  userId?: string;
  [key: string]: any;
}

export interface ErrorReport {
  error: IntegrationError;
  context: ErrorContext;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actionable: boolean;
  recommendations: string[];
}

export class ErrorHandler {
  private serviceName: string;
  private logger: Logger;
  private errorCounts: Map<string, number> = new Map();
  private lastErrors: Map<string, { error: any; timestamp: number }> = new Map();

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.logger = new Logger(`${serviceName}-error-handler`);
  }

  /**
   * Handle error and return standardized error
   */
  handle(error: any, context: ErrorContext = {}): IntegrationError {
    const integrationError = this.createIntegrationError(error);
    this.logError(integrationError, context);
    this.trackError(integrationError);

    // Generate error report if needed
    const report = this.generateErrorReport(integrationError, context);
    if (report.severity === 'high' || report.severity === 'critical') {
      this.reportHighSeverityError(report);
    }

    return integrationError;
  }

  /**
   * Create standardized integration error
   */
  private createIntegrationError(error: any): IntegrationError {
    // If it's already an IntegrationError, return it
    if (error instanceof IntegrationError) {
      return error;
    }

    // Handle axios errors
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 401:
          return new AuthenticationError(this.serviceName);
        case 429:
          const retryAfter = error.response.headers['retry-after'];
          return new RateLimitError(this.serviceName, retryAfter ? parseInt(retryAfter) : undefined);
        case 402:
          return new QuotaExceededError(this.serviceName, 'payment_required');
        case 400:
          return new IntegrationError(
            data?.message || 'Bad request',
            data?.code || 'BAD_REQUEST',
            this.serviceName,
            false,
            status,
            data
          );
        case 404:
          return new IntegrationError(
            data?.message || 'Resource not found',
            data?.code || 'NOT_FOUND',
            this.serviceName,
            false,
            status,
            data
          );
        case 500:
        case 502:
        case 503:
        case 504:
          return new IntegrationError(
            data?.message || `Server error (${status})`,
            data?.code || `HTTP_${status}`,
            this.serviceName,
            true,
            status,
            data
          );
        default:
          return new IntegrationError(
            data?.message || `HTTP error ${status}`,
            data?.code || `HTTP_${status}`,
            this.serviceName,
            status >= 500,
            status,
            data
          );
      }
    }

    // Handle network errors
    if (error.code) {
      switch (error.code) {
        case 'ECONNRESET':
        case 'ECONNREFUSED':
        case 'ENOTFOUND':
        case 'ETIMEDOUT':
          return new IntegrationError(
            `Network error: ${error.message}`,
            error.code,
            this.serviceName,
            true,
            0,
            error
          );
        case 'ECONNABORTED':
          return new IntegrationError(
            `Request timeout: ${error.message}`,
            'TIMEOUT',
            this.serviceName,
            true,
            0,
            error
          );
        default:
          return new IntegrationError(
            error.message || 'Unknown network error',
            error.code,
            this.serviceName,
            true,
            0,
            error
          );
      }
    }

    // Handle generic errors
    if (error instanceof Error) {
      return new IntegrationError(
        error.message,
        'UNKNOWN_ERROR',
        this.serviceName,
        false,
        0,
        {
          stack: error.stack,
          name: error.name,
        }
      );
    }

    // Handle unknown error types
    return new IntegrationError(
      'An unknown error occurred',
      'UNKNOWN_ERROR',
      this.serviceName,
      false,
      0,
      { originalError: error }
    );
  }

  /**
   * Log error with context
   */
  private logError(error: IntegrationError, context: ErrorContext): void {
    const logData = {
      serviceName: this.serviceName,
      errorCode: error.code,
      provider: error.provider,
      retryable: error.retryable,
      statusCode: error.statusCode,
      message: error.message,
      context,
      timestamp: new Date().toISOString(),
    };

    if (error.retryable) {
      this.logger.warn('Retryable error occurred', logData);
    } else {
      this.logger.error('Non-retryable error occurred', logData);
    }
  }

  /**
   * Track error for monitoring
   */
  private trackError(error: IntegrationError): void {
    const errorKey = `${error.provider}:${error.code}`;

    // Increment error count
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);

    // Store last error
    this.lastErrors.set(errorKey, {
      error: error,
      timestamp: Date.now(),
    });

    // Clean up old entries periodically
    this.cleanupErrorTracking();
  }

  /**
   * Generate error report
   */
  private generateErrorReport(error: IntegrationError, context: ErrorContext): ErrorReport {
    const errorKey = `${error.provider}:${error.code}`;
    const errorCount = this.errorCounts.get(errorKey) || 0;
    const lastError = this.lastErrors.get(errorKey);

    // Determine severity
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let actionable = true;

    if (error instanceof AuthenticationError) {
      severity = 'high';
    } else if (error instanceof QuotaExceededError) {
      severity = 'medium';
    } else if (error instanceof RateLimitError) {
      severity = errorCount > 10 ? 'medium' : 'low';
    } else if (error.statusCode && error.statusCode >= 500) {
      severity = errorCount > 5 ? 'high' : 'medium';
    } else if (errorCount > 20) {
      severity = 'high';
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(error, errorCount, context);

    return {
      error,
      context,
      severity,
      actionable,
      recommendations,
    };
  }

  /**
   * Generate error recommendations
   */
  private generateRecommendations(error: IntegrationError, errorCount: number, context: ErrorContext): string[] {
    const recommendations: string[] = [];

    if (error instanceof AuthenticationError) {
      recommendations.push('Verify API key is valid and not expired');
      recommendations.push('Check if API key has required permissions');
      recommendations.push('Consider implementing API key rotation');
    } else if (error instanceof QuotaExceededError) {
      recommendations.push('Check usage quotas and billing status');
      recommendations.push('Consider upgrading plan or reducing usage');
      recommendations.push('Implement rate limiting on client side');
    } else if (error instanceof RateLimitError) {
      if (errorCount > 10) {
        recommendations.push('Consider implementing circuit breaker');
        recommendations.push('Reduce request frequency or implement backoff');
      } else {
        recommendations.push('Implement exponential backoff retry logic');
      }
    } else if (error.statusCode && error.statusCode >= 500) {
      if (errorCount > 5) {
        recommendations.push('Provider service appears to be degraded');
        recommendations.push('Consider switching to backup provider');
      } else {
        recommendations.push('Implement retry logic for server errors');
      }
    } else if (error.retryable) {
      recommendations.push('This error is retryable - implement retry logic');
    } else {
      recommendations.push('Review request parameters and format');
      recommendations.push('Check API documentation for correct usage');
    }

    if (errorCount > 20) {
      recommendations.push('High error frequency detected - investigate root cause');
      recommendations.push('Consider implementing monitoring and alerts');
    }

    return recommendations;
  }

  /**
   * Report high severity errors
   */
  private reportHighSeverityError(report: ErrorReport): void {
    // In a real implementation, this would send alerts to monitoring systems
    this.logger.error('High severity error detected', {
      severity: report.severity,
      error: report.error.message,
      code: report.error.code,
      provider: report.error.provider,
      context: report.context,
      recommendations: report.recommendations,
    });
  }

  /**
   * Clean up old error tracking data
   */
  private cleanupErrorTracking(): void {
    const now = Date.now();
    const cutoffTime = now - (60 * 60 * 1000); // 1 hour ago

    // Clean up error counts
    for (const [key] of this.errorCounts.entries()) {
      const lastError = this.lastErrors.get(key);
      if (!lastError || lastError.timestamp < cutoffTime) {
        this.errorCounts.delete(key);
      }
    }

    // Clean up last errors
    for (const [key, value] of this.lastErrors.entries()) {
      if (value.timestamp < cutoffTime) {
        this.lastErrors.delete(key);
      }
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByProvider: Record<string, number>;
    errorsByCode: Record<string, number>;
    recentErrors: Array<{ error: any; timestamp: number }>;
  } {
    const errorsByProvider: Record<string, number> = {};
    const errorsByCode: Record<string, number> = {};
    let totalErrors = 0;

    for (const [key, count] of this.errorCounts.entries()) {
      const [provider, code] = key.split(':');
      errorsByProvider[provider] = (errorsByProvider[provider] || 0) + count;
      errorsByCode[code] = (errorsByCode[code] || 0) + count;
      totalErrors += count;
    }

    const recentErrors = Array.from(this.lastErrors.entries())
      .map(([key, value]) => value)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    return {
      totalErrors,
      errorsByProvider,
      errorsByCode,
      recentErrors,
    };
  }

  /**
   * Reset error tracking
   */
  resetTracking(): void {
    this.errorCounts.clear();
    this.lastErrors.clear();
    this.logger.info('Error tracking reset');
  }

  /**
   * Check if error is critical based on frequency and type
   */
  isCriticalError(error: IntegrationError): boolean {
    const errorKey = `${error.provider}:${error.code}`;
    const errorCount = this.errorCounts.get(errorKey) || 0;

    return (
      error instanceof AuthenticationError ||
      error instanceof QuotaExceededError ||
      (error.statusCode === 429 && errorCount > 10) ||
      (error.statusCode && error.statusCode >= 500 && errorCount > 5) ||
      errorCount > 20
    );
  }

  /**
   * Get service health based on errors
   */
  getServiceHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    errorRate: number;
    criticalErrors: number;
    recommendations: string[];
  } {
    const stats = this.getErrorStats();
    const recentErrorsCount = stats.recentErrors.length;

    let status: 'healthy' | 'degraded' | 'unhealthy';
    let recommendations: string[] = [];

    if (recentErrorsCount === 0) {
      status = 'healthy';
    } else if (recentErrorsCount < 5) {
      status = 'degraded';
      recommendations.push('Monitor error rates');
    } else {
      status = 'unhealthy';
      recommendations.push('Investigate high error rate');
      recommendations.push('Consider service failover');
    }

    // Add specific recommendations based on error types
    if (stats.errorsByProvider[this.serviceName] > 10) {
      recommendations.push(`${this.serviceName} service has high error rate`);
    }

    return {
      status,
      errorRate: recentErrorsCount / Math.max(1, stats.totalErrors),
      criticalErrors: Object.values(stats.errorsByCode).reduce((sum, count) => sum + count, 0),
      recommendations,
    };
  }
}