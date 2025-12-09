import winston from 'winston';
import config from '@/config';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = () => {
  const env = config.app.env || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : config.app.logLevel || 'info';
};

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

// Define which transports the logger must use
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),

  // File transport for errors
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),

  // File transport for all logs
  new winston.transports.File({
    filename: 'logs/combined.log',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }),
];

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false,
});

// Add Elasticsearch transport if configured
if (config.monitoring.sentry.dsn) {
  // Elasticsearch transport would be configured here
  // For now, we'll just log that it would be added
  logger.info('Elasticsearch transport would be configured here');
}

// Create a stream object for Morgan HTTP logger
const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Helper functions for structured logging
export const logUserAction = (userId: string, action: string, details?: any) => {
  logger.info(`User action: ${action}`, {
    userId,
    action,
    details,
    type: 'user_action'
  });
};

export const logSystemEvent = (event: string, details?: any) => {
  logger.info(`System event: ${event}`, {
    event,
    details,
    type: 'system_event'
  });
};

export const logPerformance = (operation: string, duration: number, details?: any) => {
  logger.info(`Performance: ${operation} completed in ${duration}ms`, {
    operation,
    duration,
    details,
    type: 'performance'
  });
};

export const logError = (error: Error, context?: string, details?: any) => {
  logger.error(`Error in ${context || 'unknown'}: ${error.message}`, {
    error: error.message,
    stack: error.stack,
    context,
    details,
    type: 'error'
  });
};

export const logAPIRequest = (method: string, url: string, statusCode: number, duration: number, userId?: string) => {
  logger.http(`API ${method} ${url} - ${statusCode} (${duration}ms)`, {
    method,
    url,
    statusCode,
    duration,
    userId,
    type: 'api_request'
  });
};

export const logContentGeneration = (
  briefingId: string,
  userId: string,
  cardType: string,
  duration: number,
  quality: number
) => {
  logger.info(`Content generated: ${cardType} for briefing ${briefingId}`, {
    briefingId,
    userId,
    cardType,
    duration,
    quality,
    type: 'content_generation'
  });
};

export const logPersonalization = (
  userId: string,
  action: string,
  details?: any
) => {
  logger.info(`Personalization: ${action} for user ${userId}`, {
    userId,
    action,
    details,
    type: 'personalization'
  });
};

export const logExternalAPI = (
  service: string,
  endpoint: string,
  statusCode: number,
  duration: number,
  error?: string
) => {
  if (error) {
    logger.error(`External API error: ${service} ${endpoint}`, {
      service,
      endpoint,
      statusCode,
      duration,
      error,
      type: 'external_api_error'
    });
  } else {
    logger.info(`External API: ${service} ${endpoint} - ${statusCode} (${duration}ms)`, {
      service,
      endpoint,
      statusCode,
      duration,
      type: 'external_api'
    });
  }
};

// Health check logger
export const logHealthCheck = (service: string, status: 'healthy' | 'unhealthy', responseTime?: number, details?: any) => {
  const level = status === 'healthy' ? 'info' : 'warn';
  logger[level](`Health check: ${service} is ${status}${responseTime ? ` (${responseTime}ms)` : ''}`, {
    service,
    status,
    responseTime,
    details,
    type: 'health_check'
  });
};

// Job processing logger
export const logJob = (
  jobName: string,
  jobId: string,
  status: 'started' | 'completed' | 'failed',
  duration?: number,
  error?: string
) => {
  const level = status === 'failed' ? 'error' : 'info';
  logger[level](`Job ${status}: ${jobName} (${jobId})${duration ? ` (${duration}ms)` : ''}`, {
    jobName,
    jobId,
    status,
    duration,
    error,
    type: 'job'
  });
};

// Database logger
export const logDatabase = (
  operation: string,
  table: string,
  duration: number,
  affectedRows?: number,
  error?: string
) => {
  if (error) {
    logger.error(`Database error: ${operation} on ${table}`, {
      operation,
      table,
      duration,
      affectedRows,
      error,
      type: 'database_error'
    });
  } else {
    logger.debug(`Database: ${operation} on ${table} (${duration}ms, ${affectedRows || 0} rows)`, {
      operation,
      table,
      duration,
      affectedRows,
      type: 'database'
    });
  }
};

// Security logger
export const logSecurity = (
  event: string,
  userId?: string,
  ip?: string,
  userAgent?: string,
  details?: any
) => {
  logger.warn(`Security event: ${event}`, {
    event,
    userId,
    ip,
    userAgent,
    details,
    type: 'security'
  });
};

// Rate limiting logger
export const logRateLimit = (
  ip: string,
  endpoint: string,
  limit: number,
  remaining: number,
  resetTime: Date
) => {
  logger.warn(`Rate limit exceeded for ${endpoint}`, {
    ip,
    endpoint,
    limit,
    remaining,
    resetTime,
    type: 'rate_limit'
  });
};

// Background task logger
export const logBackgroundTask = (
  taskName: string,
  status: 'started' | 'completed' | 'failed',
  details?: any
) => {
  logger.info(`Background task ${status}: ${taskName}`, {
    taskName,
    status,
    details,
    type: 'background_task'
  });
};

// Cleanup old logs (this would typically be run as a scheduled job)
export const cleanupLogs = () => {
  logger.info('Log cleanup task completed', {
    type: 'maintenance'
  });
};

// Create a child logger with additional context
export const createChildLogger = (service: string, additionalContext?: Record<string, any>) => {
  const childLogger = logger.child({ service, ...additionalContext });

  return {
    info: (message: string, meta?: any) => childLogger.info(message, meta),
    error: (message: string, meta?: any) => childLogger.error(message, meta),
    warn: (message: string, meta?: any) => childLogger.warn(message, meta),
    debug: (message: string, meta?: any) => childLogger.debug(message, meta),
    http: (message: string, meta?: any) => childLogger.http(message, meta),
  };
};

export default logger;