// /backend/middleware/errorMiddleware.js
import mongoose from 'mongoose';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

// Optional: support Zod if you use it for env/body validation
let ZodError;
try { ({ ZodError } = await import('zod')); } catch (_) { }

const isProd = process.env.NODE_ENV === 'production';

function toAppError(err) {
    // 1) Already normalized
    if (err instanceof AppError) return err;

    // 2) Zod (validation)
    if (ZodError && err instanceof ZodError) {
        return new AppError(
            'VALIDATION_ERROR',
            'Request validation failed',
            { http: 400, details: err.issues }
        );
    }

    // 3) Mongoose / Mongo
    if (err instanceof mongoose.Error.ValidationError) {
        return new AppError('MODEL_VALIDATION', 'Invalid document', {
            http: 422,
            details: Object.values(err.errors).map(e => ({ path: e.path, message: e.message })),
        });
    }
    if (err instanceof mongoose.Error.CastError) {
        return new AppError('BAD_ID', `Invalid ${err.path}`, { http: 400, details: { value: err.value } });
    }
    if (err?.code === 11000) { // duplicate key
        return new AppError('DUPLICATE', 'Duplicate value', {
            http: 409,
            details: { key: err.keyPattern, value: err.keyValue },
        });
    }

    // 4) JWT
    if (err?.name === 'JsonWebTokenError') {
        return new AppError('AUTH_INVALID', 'Invalid token', { http: 401 });
    }
    if (err?.name === 'TokenExpiredError') {
        return new AppError('AUTH_EXPIRED', 'Token expired', { http: 401, details: { expiredAt: err.expiredAt } });
    }

    // 5) Rate limit libs sometimes throw with status 429
    if (err?.status === 429 || err?.statusCode === 429) {
        return new AppError('RATE_LIMITED', err.message || 'Too many requests', { http: 429 });
    }

    // 6) Generic HTTP-style errors
    if (typeof err?.statusCode === 'number' && err.statusCode >= 400) {
        return new AppError('HTTP_ERROR', err.message || 'Request error', { http: err.statusCode });
    }

    // 7) Fallback → 500
    return new AppError('INTERNAL', err?.message || 'Internal error', { http: 500 });
}

export const errorHandler = (err, req, res, _next) => {
    const appErr = toAppError(err);

    // Decide log level
    const meta = {
        code: appErr.code,
        http: appErr.http,
        path: req.path,
        method: req.method,
        requestId: req.id, // set by requestId middleware
    };

    if (appErr.http >= 500) {
        logger.error({ err, ...meta }, 'Server error');
    } else {
        // don’t spam error level for expected 4xx
        logger.warn({ err: appErr, ...meta }, 'Handled error');
    }

    const body = {
        success: false,
        error: {
            code: appErr.code,
            message: appErr.message,
            details: appErr.details ?? null,
            requestId: req.id,
        },
    };

    // Only include stack in non‑prod (useful during dev)
    if (!isProd) body.error.stack = err.stack;

    res.status(appErr.http).json(body);
};
