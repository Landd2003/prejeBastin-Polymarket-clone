// /backend/routes/healthRoutes.js
import { Router } from 'express';
import mongoose from 'mongoose';
import { redis } from '../config/redisClient.js';

const router = Router();

// Liveness
router.get('/healthz', (req, res) => res.json({ ok: true }));

// Readiness
router.get('/readyz', async (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    let redisUp = true;

    if (process.env.RATE_BACKEND === 'redis') {
        try {
            await redis.ping();
        } catch {
            redisUp = false;
        }
    }

    const ok = dbUp && redisUp;
    return res.status(ok ? 200 : 503).json({ dbUp, redisUp });
});

export default router;
