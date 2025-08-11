// /backend/middleware/rateLimiter.js
// Simple in-memory rate limiter (no external libs)
// Tunable via env: RATE_WINDOW_MS, RATE_MAX
// Defaults: 15-minute window, 100 requests/IP

const buckets = new Map();

const nowMs = () => Date.now();

const getLimits = () => {
    const windowMs = Number(process.env.RATE_WINDOW_MS || 15 * 60 * 1000); // 15 min
    const max = Number(process.env.RATE_MAX || 100); // 100 reqs per window per IP
    return { windowMs, max };
}; // <- you were missing this closing brace

export const rateLimiter = (req, res, next) => {
    const { windowMs, max } = getLimits();
    const key = req.ip || req.connection?.remoteAddress || 'unknown';

    const now = nowMs();
    const bucket = buckets.get(key) || [];

    // Drop requests outside the window
    const cutoff = now - windowMs;
    const recent = bucket.filter((ts) => ts > cutoff);

    // Check limit
    if (recent.length >= max) {
        const retryAfterSec = Math.max(
            1,
            Math.ceil((recent[0] + windowMs - now) / 1000)
        );
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
            message: 'Too many requests. Please try again later.',
            retryAfterSeconds: retryAfterSec,
        });
    }

    // Record this request and proceed
    recent.push(now);
    buckets.set(key, recent);
    next();
};

// Optional: per-scope limiter (e.g., stricter on /api/auth/*)
// You can also pass a prefix to avoid sharing counters with the global limiter.
export const makeRateLimiter = ({ windowMs, max, prefix = '' }) => {
    // Basic validation to avoid NaN
    const wMs = Number(windowMs);
    const m = Number(max);
    if (!Number.isFinite(wMs) || !Number.isFinite(m)) {
        throw new Error('makeRateLimiter: windowMs and max must be numbers');
    }

    return (req, res, next) => {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        const key = `${prefix}${ip}`;

        const now = nowMs();
        const cutoff = now - wMs;
        const bucket = (buckets.get(key) || []).filter((ts) => ts > cutoff);

        if (bucket.length >= m) {
            const retryAfterSec = Math.max(
                1,
                Math.ceil((bucket[0] + wMs - now) / 1000)
            );
            res.set('Retry-After', String(retryAfterSec));
            return res.status(429).json({
                message: 'Too many requests. Please try again later.',
                retryAfterSeconds: retryAfterSec,
            });
        }

        bucket.push(now);
        buckets.set(key, bucket);
        next();
    };
};
