// /backend/src/middleware/idempotency.js
// Requires Redis in production (uses your existing redisClient)
import { redis } from '../config/redisClient.js';

export const idempotency = (ttlSec = 300) => async (req, res, next) => {
    const key = req.header('Idempotency-Key');
    if (!key) return next();

    const redisKey = `idem:bet:${key}`;
    try {
        // Set if not exists; expire after ttlSec
        const ok = await redis.set(redisKey, '1', { NX: true, EX: ttlSec });
        if (ok === null) {
            return res.status(409).json({ message: 'Duplicate request' });
        }
        next();
    } catch (e) {
        // Fail-open: don't block if Redis has an issue
        next();
    }
};
