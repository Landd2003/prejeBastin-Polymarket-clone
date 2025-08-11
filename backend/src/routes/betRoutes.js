// /backend/src/routes/betRoutes.js
import express from 'express';
import { placeBet, getUserBets, listBets } from '../controllers/betController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { createBetSchema, getUserBetsSchema } from '../validators/betSchemas.js';
import { idempotency } from '../middleware/idempotency.js';
import { redis } from '../config/redisClient.js';           // <-- use the shared Redis client
import { requireVerified } from '../middleware/requireVerified.js'; // <-- remove if not enforcing

const router = express.Router();

/**
 * POST /api/bets
 * - Auth required
 * - (Optional) email verification required
 * - Idempotent via Idempotency-Key header (cached for 10 min by default)
 *
 * Order matters:
 *  1) authenticate → 2) requireVerified → 3) idempotency({ redis }) → 4) validate → 5) controller
 */
router.post(
    '/',
    authenticateToken,
    requireVerified,                              // remove if not enforcing verification
    idempotency({ redis, ttlSec: 600 }),          // was idempotency(300) → now opts: { redis, ttlSec }
    validate(createBetSchema),
    placeBet
);

// router.post('/bets', authenticateToken, validate(placeBetSchema), placeBetController);
router.get('/', authenticateToken, listBets);

/**
 * GET /api/bets/user/:userId
 * - Auth required
 * - Controller enforces: users see only themselves; admins may view others
 */
router.get(
    '/user/:userId',
    authenticateToken,
    validate(getUserBetsSchema),
    getUserBets
);

export default router;
