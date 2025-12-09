import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { APIResponse } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: Record<string, any>;
}

export const createError = (
  message: string,
  statusCode: number = 500,
  code: string = 'INTERNAL_ERROR',
  details?: Record<string, any>
): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.isOperational = true;
  error.details = details;
  return error;
};

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = (req as any).requestId || req.headers['x-request-id'] as string || uuidv4();

  // Log the error
  const logData = {
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      details: error.details,
    },
    request: {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id,
    },
    requestId,
  };

  if (error.statusCode && error.statusCode < 500) {
    logger.warn('Client error', logData);
  } else {
    logger.error('Server error', logData);
  }

  // Prepare error response
  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = error.isOperational ? error.message : 'Internal server error';

  const response: APIResponse = {
    success: false,
    error: {
      code,
      message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
        details: error.details,
      }),
    },
    requestId,
  };

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
    response.error!.message = 'Internal server error';
    delete response.error!.stack;
    delete response.error!.details;
  }

  res.status(statusCode).json(response);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();

  logger.warn('Route not found', {
    method: req.method,
    url: req.url,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId,
  });

  const response: APIResponse = {
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested resource was not found',
    },
    requestId,
  };

  res.status(404).json(response);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction): Promise<void> => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const validateRequest = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const details = error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));

        const requestId = req.headers['x-request-id'] as string || uuidv4();

        const response: APIResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: { validationErrors: details },
          },
          requestId,
        };

        res.status(400).json(response);
        return;
      }

      req.body = value;
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const handleDatabaseError = (error: any): AppError => {
  // PostgreSQL error codes
  switch (error.code) {
    case '23505': // Unique violation
      return createError(
        'Resource already exists',
        409,
        'DUPLICATE_RESOURCE',
        { field: error.constraint }
      );

    case '23503': // Foreign key violation
      return createError(
        'Referenced resource does not exist',
        400,
        'REFERENCE_NOT_FOUND',
        { table: error.table }
      );

    case '23502': // Not null violation
      return createError(
        'Required field is missing',
        400,
        'REQUIRED_FIELD_MISSING',
        { field: error.column }
      );

    case '23514': // Check violation
      return createError(
        'Data validation failed',
        400,
        'CHECK_VIOLATION',
        { constraint: error.constraint }
      );

    case '08006': // Connection failure
    case '08001': // Connection does not exist
    case '08004': // Connection rejected
      return createError(
        'Database connection error',
        503,
        'DATABASE_CONNECTION_ERROR'
      );

    case '57014': // Query canceled
      return createError(
        'Request timeout',
        408,
        'REQUEST_TIMEOUT'
      );

    default:
      logger.error('Unhandled database error', { error });
      return createError(
        'Database operation failed',
        500,
        'DATABASE_ERROR'
      );
  }
};

export const handleExternalAPIError = (error: any, serviceName: string): AppError => {
  if (error.response) {
    const status = error.response.status;
    const message = error.response.data?.message || `External API error from ${serviceName}`;

    switch (status) {
      case 400:
        return createError(message, 400, 'EXTERNAL_API_BAD_REQUEST');
      case 401:
        return createError(`Invalid credentials for ${serviceName}`, 401, 'EXTERNAL_API_UNAUTHORIZED');
      case 403:
        return createError(`Access denied to ${serviceName}`, 403, 'EXTERNAL_API_FORBIDDEN');
      case 404:
        return createError(`Resource not found in ${serviceName}`, 404, 'EXTERNAL_API_NOT_FOUND');
      case 429:
        return createError(`Rate limit exceeded for ${serviceName}`, 429, 'EXTERNAL_API_RATE_LIMIT');
      case 500:
      case 502:
      case 503:
      case 504:
        return createError(`${serviceName} service unavailable`, 503, 'EXTERNAL_API_UNAVAILABLE');
      default:
        return createError(message, status, 'EXTERNAL_API_ERROR');
    }
  } else if (error.request) {
    return createError(
      `No response from ${serviceName}`,
      503,
      'EXTERNAL_API_NO_RESPONSE'
    );
  } else {
    return createError(
      `Failed to connect to ${serviceName}: ${error.message}`,
      500,
      'EXTERNAL_API_CONNECTION_ERROR'
    );
  }
};