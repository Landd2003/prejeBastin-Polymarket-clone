// /backend/middleware/requireVerified.js
import { errors } from '../lib/errors.js';

export const requireVerified = (req, res, next) => {
    if (!req.user?.emailVerified) {
        return next(errors.forbidden('Email verification required'));
    }
    next();
};
