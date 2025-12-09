import { Router } from 'express';
import { briefingController } from '../controllers/briefingController';
import { generalLimiter, contentGenerationLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = Router();

// All briefing routes require authentication
router.use(authenticate);

router.post('/generate', contentGenerationLimiter, briefingController.generateDailyBriefing);
router.get('/today', generalLimiter, briefingController.getTodayBriefing);
router.get('/history', generalLimiter, briefingController.getBriefingHistory);
router.get('/analytics', generalLimiter, briefingController.getBriefingAnalytics);
router.get('/:date', generalLimiter, briefingController.getBriefingByDate);
router.get('/id/:briefingId', generalLimiter, briefingController.getBriefingById);
router.post('/:briefingId/read', generalLimiter, briefingController.markBriefingAsRead);
router.post('/:date/regenerate', contentGenerationLimiter, briefingController.regenerateBriefing);

export default router;