import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import cron from 'node-cron';
import 'dotenv/config';

import { database } from './config/database';
import { redisClient } from './config/redis';
import { logger } from './config/logger';
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes';
import { notificationService } from './services/notificationService';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://pullex-daily-briefing.com', 'https://api.pullex-daily-briefing.com']
    : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] as string || Math.random().toString(36).substring(7);

  // Add request ID to headers
  res.setHeader('X-Request-ID', requestId);
  req.headers['x-request-id'] = requestId;

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId,
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      requestId,
    });
  });

  next();
});

// Rate limiting
app.use(generalLimiter);

// API routes
app.use('/api/v1', routes);

// Swagger documentation
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PulseX Daily Briefing API',
      version: '1.0.0',
      description: 'Backend API for PulseX Daily Briefing App - Your personalized daily news and insights',
      contact: {
        name: 'API Support',
        email: 'api-support@pullex-daily-briefing.com',
      },
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production'
          ? 'https://api.pullex-daily-briefing.com'
          : `http://localhost:${PORT}`,
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phoneNumber: { type: 'string' },
            avatarUrl: { type: 'string', format: 'uri' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        DailyBriefing: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            date: { type: 'string', format: 'date' },
            title: { type: 'string' },
            content: { type: 'string' },
            summary: { type: 'string' },
            topics: { type: 'array', items: { type: 'string' } },
            isRead: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        APIResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
              },
            },
            requestId: { type: 'string' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts'], // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'PulseX Daily Briefing API Documentation',
  }));

  // Swagger JSON endpoint
  app.get('/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown handlers
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    // Close server
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close database connections
    await database.close();
    logger.info('Database connections closed');

    // Close Redis connection
    await redisClient.disconnect();
    logger.info('Redis connection closed');

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
};

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason,
    promise,
  });
  process.exit(1);
});

// Scheduled tasks
const initializeScheduledTasks = () => {
  // Process scheduled notifications every minute
  cron.schedule('* * * * *', async () => {
    try {
      await notificationService.processScheduledNotifications();
    } catch (error) {
      logger.error('Failed to process scheduled notifications', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, {
    scheduled: false, // Don't start immediately
  });

  // Send scheduled briefings every minute (to check for users who should receive briefings now)
  cron.schedule('* * * * *', async () => {
    try {
      await notificationService.sendScheduledBriefings();
    } catch (error) {
      logger.error('Failed to send scheduled briefings', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, {
    scheduled: false, // Don't start immediately
  });

  // Daily cleanup task at 2 AM UTC
  cron.schedule('0 2 * * *', async () => {
    try {
      // Clean up old analytics data, expired tokens, etc.
      logger.info('Running daily cleanup task');
      // Implementation would go here
    } catch (error) {
      logger.error('Failed to run daily cleanup task', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  logger.info('Scheduled tasks initialized');
};

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbHealthy = await database.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database health check failed');
    }
    logger.info('Database connection established');

    // Test Redis connection
    await redisClient.connect();
    const redisHealthy = await redisClient.healthCheck();
    if (!redisHealthy) {
      throw new Error('Redis health check failed');
    }
    logger.info('Redis connection established');

    // Initialize scheduled tasks
    initializeScheduledTasks();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`Server started successfully on port ${PORT}`, {
        environment: process.env.NODE_ENV || 'development',
        port: PORT,
        pid: process.pid,
      });

      if (process.env.NODE_ENV !== 'production') {
        logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
        logger.info(`Health check available at http://localhost:${PORT}/api/v1/health`);
      }
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
};

// Start the server
let server: any;
startServer().then((serverInstance) => {
  server = serverInstance;
}).catch((error) => {
  logger.error('Server startup failed', {
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  process.exit(1);
});

export default app;