import { Router } from 'express';
import { feedbackController } from '../controllers/feedbackController';
import { generalLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = Router();

// All feedback routes require authentication
router.use(authenticate);

router.post('/', generalLimiter, feedbackController.submitFeedback);
router.get('/analytics', generalLimiter, feedbackController.getFeedbackAnalytics);
router.get('/history', generalLimiter, feedbackController.getFeedbackHistory);
router.get('/trends', generalLimiter, feedbackController.getFeedbackTrends);
router.get('/topic/:topic', generalLimiter, feedbackController.getFeedbackByTopic);
router.get('/global/analytics', generalLimiter, feedbackController.getGlobalFeedbackAnalytics);
router.delete('/:feedbackId', generalLimiter, feedbackController.deleteFeedback);

export default router;