// /backend/src/config/redisClient.js
import { createClient } from 'redis';
import { env } from './env.js';
import { logger } from '../lib/logger.js';

const url = env.REDIS_URL;

// Require URL only if you're actually using the Redis backend
if (env.RATE_BACKEND === 'redis' && !url) {
    throw new Error('REDIS_URL is required when RATE_BACKEND=redis');
}

export const redis = createClient({
    url,
    socket: {
        tls: url?.startsWith('rediss://') || false,
    },
});

redis.on('error', (err) => {
    logger.error({ err }, 'Redis error');
    if (err?.errors) {
        for (const e of err.errors) logger.error({ err: e }, 'Redis inner error');
    }
});

redis.on('connect', () => logger.info('Redis connecting...'));
redis.on('ready', () => logger.info('Redis ready'));

await redis.connect();

try {
    const pong = await redis.ping();
    logger.info({ pong }, 'Redis ping');
} catch (e) {
    logger.error({ err: e }, 'Redis ping failed');
}

export async function disconnectRedis(timeoutMs = 3000) {
    try {
        await Promise.race([
            redis.quit(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Redis quit timeout')), timeoutMs)
            ),
        ]);
        logger.info('Redis disconnected cleanly');
    } catch (err) {
        logger.error({ err }, 'Error during Redis disconnect');
    }
}
