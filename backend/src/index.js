// /backend/src/index.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// ✅ correct relative paths (we are already in /src)
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import marketRoutes from './routes/marketRoutes.js';
import betRoutes from './routes/betRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

import { errorHandler } from './middleware/errorMiddleware.js';
import { skipPreflight } from './middleware/skipPreflight.js';

// logging + request context
import pinoHttp from 'pino-http';
import { runWithCtx } from './lib/requestContext.js';
import { requestId } from './middleware/requestId.js';
import { logger } from './lib/logger.js';

// Redis (optional)
let redisModule = null;
try {
    // matches /backend/src/config/redisClient.js
    redisModule = await import('./config/redisClient.js'); // { redis, disconnectRedis }
} catch {
    // no redis client available; shutdown will skip it
}

const app = express();

/* ------------ Core app setup ------------ */
app.set('trust proxy', 1);

app.use(runWithCtx);
app.use(requestId);
app.use(
    pinoHttp({
        logger,
        genReqId: (req) => req.id,
        customSuccessMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,
        customErrorMessage: (req, res, err) => `Error on ${req.method} ${req.url}: ${err.message}`,
    })
);

app.use(
    helmet({
        crossOriginResourcePolicy: false,
    })
);

app.use(
    cors({
        origin: (env.CORS_ORIGIN || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        credentials: true,
    })
);

app.use(express.json({ limit: '1mb' }));
app.use(compression());
app.use(skipPreflight);


/* ------------ Rate limiter selection (env-driven) ------------ */
let rateLimiterMiddleware;
let authRateLimiterMiddleware;

const AUTH_WINDOW_MS = Number(env.AUTH_RATE_WINDOW_MS || 60 * 1000);
const AUTH_MAX = Number(env.AUTH_RATE_MAX || 5);

if (env.RATE_BACKEND === 'redis') {
    const { redisRateLimiter, makeRedisRateLimiter } = await import('./middleware/rateLimiterRedis.js');
    rateLimiterMiddleware = redisRateLimiter;
    authRateLimiterMiddleware = makeRedisRateLimiter({
        windowMs: AUTH_WINDOW_MS,
        max: AUTH_MAX,
        prefix: 'auth:',
    });
} else {
    const { rateLimiter, makeRateLimiter } = await import('./middleware/rateLimiter.js');
    rateLimiterMiddleware = rateLimiter;
    authRateLimiterMiddleware = makeRateLimiter({
        windowMs: AUTH_WINDOW_MS,
        max: AUTH_MAX,
        prefix: 'auth:',
    });
}

/* ------------ Apply limiters BEFORE routes ------------ */
app.use('/', healthRoutes);
app.use(rateLimiterMiddleware);
app.use('/api/auth', authRateLimiterMiddleware);

/* ------------ Routes ------------ */
// TEMP: Log auth header for bet requests
app.use((req, _res, next) => {
    if (req.path.startsWith('/api/bets')) {
        console.log('Auth header =>', req.headers.authorization);
    }
    next();
});

app.use('/api/auth', authRoutes);
app.use('/api/markets', marketRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/transactions', transactionRoutes);

/* ------------ Global error handler LAST ------------ */
app.use(errorHandler);

/* ------------ Start server after DB connects ------------ */
const PORT = env.PORT || 5000;

async function start() {
    try {
        const shouldSync = (env.DB_SYNC_INDEXES ?? 'true') !== 'false';
        await connectDB({ syncIndexes: shouldSync });

        const server = app.listen(PORT, () => {
            logger.info({ port: PORT }, 'Server started');
        });

        // Graceful shutdown
        const shutdown = async (sig) => {
            logger.warn({ sig }, 'Shutdown signal received');
            try {
                await new Promise((resolve) => server.close(resolve));
                await disconnectDB?.();

                // close redis if available
                if (redisModule?.disconnectRedis) {
                    await redisModule.disconnectRedis();
                } else if (redisModule?.redis?.quit) {
                    await Promise.race([
                        redisModule.redis.quit(),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Redis quit timeout')), 3000)),
                    ]);
                }

                logger.info('Shutdown complete');
                process.exit(0);
            } catch (err) {
                logger.error({ err }, 'Error during shutdown');
                process.exit(1);
            }
        };

        ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
    } catch (err) {
        logger.error({ err }, 'Failed to start server');
        process.exit(1);
    }
}

start();

export default app;
