import { Router } from 'express';
import { notificationsController } from '../controllers/notificationsController';
import { generalLimiter, notificationLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

router.post('/device-token', generalLimiter, notificationsController.registerDeviceToken);
router.delete('/device-token', generalLimiter, notificationsController.removeDeviceToken);
router.get('/device-tokens', generalLimiter, notificationsController.getDeviceTokens);
router.post('/test', notificationLimiter, notificationsController.sendTestNotification);
router.post('/schedule', generalLimiter, notificationsController.scheduleNotification);
router.get('/settings', generalLimiter, notificationsController.getNotificationSettings);
router.put('/settings', generalLimiter, notificationsController.updateNotificationSettings);
router.get('/analytics', generalLimiter, notificationsController.getNotificationAnalytics);
router.post('/trigger-scheduled', generalLimiter, notificationsController.triggerScheduledBriefings);
router.get('/health', generalLimiter, notificationsController.healthCheck);

export default router;