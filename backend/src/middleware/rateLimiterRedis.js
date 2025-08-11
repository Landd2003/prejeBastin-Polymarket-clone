// /backend/middleware/rateLimiterRedis.js
import { redis } from '../config/redisClient.js';

const LUA_SLIDING_WINDOW = `
local key     = KEYS[1]
local now     = tonumber(ARGV[1])
local window  = tonumber(ARGV[2])
local max     = tonumber(ARGV[3])
local ttlsec  = math.floor(window/1000) + 1

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfter = 1
  if oldest and oldest[2] then
    retryAfter = math.ceil(((tonumber(oldest[2]) + window) - now) / 1000)
  end
  return {0, retryAfter}
else
  redis.call('ZADD', key, now, tostring(now))
  redis.call('EXPIRE', key, ttlsec)
  return {1, 0}
end
`;

const nowMs = () => Date.now();

const getLimits = () => {
    const windowMs = Number(process.env.RATE_WINDOW_MS || 15 * 60 * 1000);
    const max = Number(process.env.RATE_MAX || 100);
    return { windowMs, max };
};

const ipKey = (req, prefix) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    return `${prefix}${ip}`;
};

export const makeRedisRateLimiter = ({ windowMs, max, prefix = 'rl:' } = {}) => {
    return async (req, res, next) => {
        try {
            const base = getLimits();
            const wMs = Number(windowMs ?? base.windowMs);
            const m = Number(max ?? base.max);

            const key = ipKey(req, prefix);
            const now = nowMs();

            const [allowed, retryAfterSec] = await redis.eval(LUA_SLIDING_WINDOW, {
                keys: [key],
                arguments: [String(now), String(wMs), String(m)],
            });

            if (allowed === 1) return next();

            const sec = Math.max(1, Number(retryAfterSec) || 1);
            res.set('Retry-After', String(sec));
            return res.status(429).json({
                message: 'Too many requests. Please try again later.',
                retryAfterSeconds: sec,
            });
        } catch (err) {
            console.error('Rate limiter (Redis) error:', err);
            return next(); // fail-open
        }
    };
};

// Convenience default middleware using env vars
export const redisRateLimiter = makeRedisRateLimiter();
