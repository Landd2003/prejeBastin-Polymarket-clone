import mongoose from 'mongoose';
import Bet from '../models/Bet.js';
import User from '../models/User.js';
import Market from '../models/Market.js';
import Transaction from '../models/Transaction.js';

// helper: throw to abort tx and return proper http later
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/**
 * POST /api/bets
 * Body (validated): { marketId: string, optionName: string, amount: number }
 * Notes:
 *  - Requires authenticateToken
 *  - Uses req.user.id from JWT
 *  - Runs as a Mongo transaction: deduct balance, create bet, increment option pool
 */
export const placeBet = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        const userId = req.user?.id; // set by authenticateToken
        if (!userId) throw new HttpError(401, 'Unauthorized.');

        const { marketId, optionName, amount } = req.valid?.body || {};

        const MAX_BET = Number(process.env.MAX_BET || 1_000_000);
        if (amount > MAX_BET) throw new HttpError(400, `Amount exceeds max bet limit (${MAX_BET}).`);

        const marketExists = mongoose.isValidObjectId(marketId) && await Market.exists({ _id: marketId });
        if (!marketExists) throw new HttpError(404, 'Market not found.');

        // ✅ NEW: grab idempotency key from header (fallback for safety)
        const idempotencyKey =
            req.get('Idempotency-Key') || new mongoose.Types.ObjectId().toString();

        await session.withTransaction(async () => {
            const [user, market] = await Promise.all([
                User.findById(userId).session(session),
                Market.findById(marketId).session(session),
            ]);

            if (!user) throw new HttpError(404, 'User not found.');
            if (!market) throw new HttpError(404, 'Market not found.');

            if (market.status !== 'open') throw new HttpError(400, 'Market is not open for betting.');
            if (market.closingDate && new Date() >= new Date(market.closingDate)) {
                throw new HttpError(400, 'Market is closed (deadline passed).');
            }

            const idx = market.options.findIndex(o => o.name === optionName);
            if (idx === -1) throw new HttpError(400, 'Invalid option for this market.');

            if (user.balance < amount) throw new HttpError(400, 'Insufficient balance.');

            user.balance -= amount;
            await user.save({ session });

            // Increment option pool atomically (safer than mutating array element)
            const incRes = await Market.updateOne(
                { _id: market._id, 'options.name': optionName },
                { $inc: { 'options.$.totalStaked': amount } },
                { session }
            );
            if (incRes.modifiedCount !== 1) {
                throw new HttpError(500, 'Failed to update market pool.');
            }


            const [bet] = await Bet.create([{
                user: user._id,
                market: market._id,
                optionName,
                amount,
                idempotencyKey,
                createdAt: new Date(),
            }], { session });

            // ✅ NEW: include idempotencyKey (your model requires it)
            await Transaction.create([{
                user: user._id,
                type: 'bet',
                amount,
                marketId: market._id,
                idempotencyKey,
                createdAt: new Date(),
            }], { session });

            res.status(201).json({
                message: 'Bet placed successfully.',
                bet,
                balance: user.balance,
            });
        });

    } catch (err) {
        if (err instanceof HttpError) {
            return res.status(err.status).json({ message: err.message });
        }
        next(err);
    } finally {
        session.endSession();
    }
};


/**
 * GET /api/bets/user/:userId
 * Requires authenticateToken.
 * Only allow self or admin.
 */
export const getUserBets = async (req, res, next) => {
    try {
        const requester = req.user; // { id, role }
        const { userId } = req.valid.params; // validated param
        const { page = 1, limit = 20 } = req.valid.query || {};

        if (requester.role !== 'admin' && requester.id !== userId) {
            return res.status(403).json({ message: 'Forbidden.' });
        }

        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            Bet.find({ user: userId })
                .populate('market')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Bet.countDocuments({ user: userId }),
        ]);

        return res.json({ total, page, limit, items });
    } catch (err) {
        next(err);
    }
};

export async function listBets(req, res, next) {
    try {
        const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? '10', 10)));
        const skip = (page - 1) * limit;

        const { market, user } = req.query;

        const filter = {};
        if (market) {
            if (!mongoose.isValidObjectId(market)) return res.status(400).json({ message: 'Invalid market id' });
            filter.market = market;
        }
        if (user === 'me') {
            filter.user = req.user.id;
        } else if (user) {
            if (!mongoose.isValidObjectId(user)) return res.status(400).json({ message: 'Invalid user id' });
            filter.user = user;
        }

        const [items, total] = await Promise.all([
            Bet.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Bet.countDocuments(filter),
        ]);

        return res.json({ page, limit, total, items });
    } catch (err) {
        next(err);
    }
}
