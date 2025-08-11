// /backend/middleware/authMiddleware.js
import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';

/**
 * Auth middleware
 * Expects header: Authorization: Bearer <token>
 * Attaches minimal user info to req.user on success, including emailVerified.
 */
export const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Access denied. No token provided.' });
        }

        const token = authHeader.slice(7).trim();
        if (!token) {
            return res.status(401).json({ message: 'Access denied. No token provided.' });
        }

        const decoded = verifyToken(token); // may contain { sub | id, role, iat, ... }
        const userId = decoded.sub || decoded.id;
        if (!userId) {
            return res.status(401).json({ message: 'Invalid token payload.' });
        }

        // Fetch fresh user flags so requireVerified & role checks are accurate
        const user = await User.findById(userId).select(
            'role emailVerified isActive isBanned passwordChangedAt'
        );
        if (!user) return res.status(401).json({ message: 'User not found.' });

        // Optional: revoke old tokens after password change
        if (user.passwordChangedAt && decoded.iat && decoded.iat * 1000 < user.passwordChangedAt.getTime()) {
            return res.status(401).json({ message: 'Token revoked.' });
        }

        // Optional: block inactive/banned accounts
        if (!user.isActive || user.isBanned) {
            return res.status(403).json({ message: 'Account disabled.' });
        }

        // Attach exactly what downstream needs
        req.user = { id: user._id.toString(), role: user.role, emailVerified: user.emailVerified };
        return next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired.' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token.' });
        }
        return next(err);
    }
};

/**
 * Role-based authorization guard (unchanged)
 */
export const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user?.role) {
            return res.status(403).json({ message: 'Forbidden. No role assigned.' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden. Insufficient role.' });
        }
        return next();
    };
};
