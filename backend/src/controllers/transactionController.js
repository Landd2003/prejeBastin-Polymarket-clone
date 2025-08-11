import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';

/**
 * GET /api/transactions/user/:userId
 * Query (optional): page=1&limit=20&type=bet|win|fee|deposit|withdrawal&from=ISO&to=ISO&sort=-createdAt
 * Auth: authenticateToken
 * Access: the user themselves, or admin
 */
export const getUserTransactions = async (req, res, next) => {
    try {
        const { userId } = req.params;

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ message: 'Invalid user id.' });
        }

        const isAdmin = req.user?.role === 'admin';
        const isSelf = req.user?.id === userId;
        if (!isSelf && !isAdmin) {
            return res.status(403).json({ message: 'Forbidden.' });
        }

        // Filters
        const {
            page = 1,
            limit = 20,
            type,         // 'bet' | 'win' | 'fee' | 'deposit' | 'withdrawal'
            from,         // ISO date
            to,           // ISO date
            sort = '-createdAt',
        } = req.query;

        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

        const q = { user: userId };
        if (type) q.type = type;

        // Date range filter
        if (from || to) {
            q.createdAt = {};
            if (from) {
                const dFrom = new Date(from);
                if (isNaN(dFrom.getTime())) return res.status(400).json({ message: 'Invalid from date.' });
                q.createdAt.$gte = dFrom;
            }
            if (to) {
                const dTo = new Date(to);
                if (isNaN(dTo.getTime())) return res.status(400).json({ message: 'Invalid to date.' });
                q.createdAt.$lte = dTo;
            }
        }

        const [items, total] = await Promise.all([
            Transaction.find(q)
                .sort(sort)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            Transaction.countDocuments(q),
        ]);

        return res.json({
            data: items,
            meta: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum) || 1,
            },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * (Optional) Admin endpoint to list transactions across users
 * GET /api/transactions
 * Query (optional): same as above + user=<userId>
 * Access: admin only (enforce in route with authorizeRoles('admin'))
 */
export const listTransactions = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 20,
            type,
            from,
            to,
            user,          // optional user filter
            sort = '-createdAt',
        } = req.query;

        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));

        const q = {};
        if (type) q.type = type;
        if (user) {
            if (!mongoose.isValidObjectId(user)) {
                return res.status(400).json({ message: 'Invalid user filter.' });
            }
            q.user = user;
        }

        if (from || to) {
            q.createdAt = {};
            if (from) {
                const dFrom = new Date(from);
                if (isNaN(dFrom.getTime())) return res.status(400).json({ message: 'Invalid from date.' });
                q.createdAt.$gte = dFrom;
            }
            if (to) {
                const dTo = new Date(to);
                if (isNaN(dTo.getTime())) return res.status(400).json({ message: 'Invalid to date.' });
                q.createdAt.$lte = dTo;
            }
        }

        const [items, total] = await Promise.all([
            Transaction.find(q)
                .sort(sort)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            Transaction.countDocuments(q),
        ]);

        return res.json({
            data: items,
            meta: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum) || 1,
            },
        });
    } catch (err) {
        next(err);
    }
};
