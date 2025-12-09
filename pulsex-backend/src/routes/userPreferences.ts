import { Router } from 'express';
import { userPreferencesController } from '../controllers/userPreferencesController';
import { generalLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = Router();

// All user preferences routes require authentication
router.use(authenticate);

router.get('/', generalLimiter, userPreferencesController.getUserPreferences);
router.post('/', generalLimiter, userPreferencesController.createUserPreferences);
router.put('/', generalLimiter, userPreferencesController.updateUserPreferences);
router.patch('/', generalLimiter, userPreferencesController.updatePartialPreferences);
router.delete('/reset', generalLimiter, userPreferencesController.resetPreferences);
router.get('/topics', generalLimiter, userPreferencesController.getAvailableTopics);
router.get('/timezones', generalLimiter, userPreferencesController.getTimezones);
router.get('/languages', generalLimiter, userPreferencesController.getLanguages);

export default router;