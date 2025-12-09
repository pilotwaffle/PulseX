import { Router } from 'express';
import authRoutes from './auth';
import briefingRoutes from './briefings';
import feedbackRoutes from './feedback';
import savedCardsRoutes from './savedCards';
import notificationRoutes from './notifications';
import userPreferencesRoutes from './userPreferences';

const router = Router();

// Health check endpoint (no authentication required)
router.get('/health', async (req, res) => {
  try {
    // Basic health check
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
    };

    res.json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// API routes
router.use('/auth', authRoutes);
router.use('/briefings', briefingRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/saved-cards', savedCardsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/preferences', userPreferencesRoutes);

export default router;