import { Router } from 'express';
import { savedCardsController } from '../controllers/savedCardsController';
import { generalLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = Router();

// All saved cards routes require authentication
router.use(authenticate);

router.post('/', generalLimiter, savedCardsController.saveCard);
router.get('/', generalLimiter, savedCardsController.getSavedCards);
router.get('/search', generalLimiter, savedCardsController.searchSavedCards);
router.get('/analytics', generalLimiter, savedCardsController.getSavedCardsAnalytics);
router.get('/tag/:tag', generalLimiter, savedCardsController.getSavedCardsByTag);
router.get('/export', generalLimiter, savedCardsController.exportSavedCards);
router.get('/:cardId', generalLimiter, savedCardsController.getSavedCardById);
router.put('/:cardId/tags', generalLimiter, savedCardsController.updateSavedCardTags);
router.delete('/:cardId', generalLimiter, savedCardsController.deleteSavedCard);

export default router;