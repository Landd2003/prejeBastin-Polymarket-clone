export class AppError extends Error {
    constructor(code, message, { http = 400, details } = {}) {
        super(message);
        this.name = 'AppError';
        this.code = code;         // e.g., 'AUTH_INVALID', 'BET_DUPLICATE'
        this.http = http;         // 4xx/5xx
        this.details = details;   // optional extra context
    }
}

// Convenience factories
export const errors = {
    badRequest: (code, msg, details) => new AppError(code, msg, { http: 400, details }),
    unauthorized: (msg = 'Unauthorized') => new AppError('AUTH_REQUIRED', msg, { http: 401 }),
    forbidden: (msg = 'Forbidden') => new AppError('AUTH_FORBIDDEN', msg, { http: 403 }),
    notFound: (code = 'NOT_FOUND', msg = 'Not found') => new AppError(code, msg, { http: 404 }),
    conflict: (code, msg, details) => new AppError(code, msg, { http: 409, details }),
    unprocessable: (code, msg, details) => new AppError(code, msg, { http: 422, details }),
    tooMany: (code = 'RATE_LIMITED', msg = 'Too many requests') => new AppError(code, msg, { http: 429 }),
    server: (msg = 'Internal error', details) => new AppError('INTERNAL', msg, { http: 500, details }),
};
