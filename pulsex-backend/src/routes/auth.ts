import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authLimiter, generalLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes (no authentication required)
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh-token', authLimiter, authController.refreshToken);

// Protected routes (authentication required)
router.use(authenticate); // Apply authentication to all subsequent routes

router.post('/logout', generalLimiter, authController.logout);
router.get('/profile', generalLimiter, authController.getProfile);
router.put('/profile', generalLimiter, authController.updateProfile);
router.delete('/account', generalLimiter, authController.deactivateAccount);

export default router;