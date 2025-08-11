import mongoose from 'mongoose';
import Market from '../models/Market.js';
import Bet from '../models/Bet.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';


/**
 * POST /api/markets
 * Body: { title, description?, options: string[], closingDate? }
 */
export const createMarket = async (req, res, next) => {
    try {
        const body = req.valid?.body ?? req.body ?? {};
        const {
            title,
            description = '',
            options,
            closingDate = null,
            visibility = 'public', // new
        } = body;

        if (!title || !Array.isArray(options) || options.length < 2) {
            return res.status(400).json({ message: 'Invalid request' });
        }
        if (!['public', 'private'].includes(visibility)) {
            return res.status(400).json({ message: 'visibility must be public|private' });
        }
        const optUnique = [...new Set(options.map(s => String(s).trim()))];
        if (optUnique.length < 2) {
            return res.status(400).json({ message: 'Options must be unique (>=2)' });
        }

        const market = await Market.create({
            title: String(title).trim(),
            description: String(description).trim(),
            options: optUnique.map(name => ({ name, totalStaked: 0 })),
            status: 'open',
            closingDate: closingDate ? new Date(closingDate) : null,
            resolvedOption: null,
            isSettled: false,
            visibility,
            createdBy: req.user?.id ?? null, // requires auth on this route (you already have it)
        });

        return res.status(201).json({
            market: {
                id: market._id,
                title: market.title,
                description: market.description,
                options: market.options,
                status: market.status,
                closingDate: market.closingDate,
                resolvedOption: market.resolvedOption,
                isSettled: market.isSettled,
                visibility: market.visibility,     // new
                createdBy: market.createdBy,       // new
                createdAt: market.createdAt,
                updatedAt: market.updatedAt,
            },
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/markets/:id/resolve
 * Body: { winningOption: string }
 * Effect: sets market to resolved, then settles winners/fees.
 * Note: Protect this route with authenticateToken + authorizeRoles('admin') in routes.
 */
export async function resolveMarket(req, res, next) {
    const session = await mongoose.startSession();
    try {
        const { id } = req.params;
        const { winningOption } = req.body || {};
        const resolveKey = req.get('Idempotency-Key') ?? new mongoose.Types.ObjectId().toString();

        if (!winningOption || typeof winningOption !== 'string') {
            return res.status(400).json({ message: 'winningOption is required' });
        }

        await session.withTransaction(async () => {
            const market = await Market.findById(id).session(session);
            if (!market) return res.status(404).json({ message: 'Market not found' });

            // Validate option exists
            const optionNames = (market.options || []).map(o => o.name);
            if (!optionNames.includes(winningOption)) {
                return res.status(400).json({ message: 'winningOption must match one of the market options.' });
            }

            // If not yet resolved, resolve now
            if (market.status === 'open') {
                market.status = 'resolved';
                market.resolvedOption = winningOption;
                await market.save({ session });
            }

            // If already settled, idempotent success
            if (market.isSettled === true) {
                return res.status(200).json({
                    message: 'Already settled',
                    resolvedOption: market.resolvedOption,
                    isSettled: true,
                });
            }

            // --- Settlement ---
            const [allBets, winningBets] = await Promise.all([
                Bet.find({ market: market._id }).session(session),
                Bet.find({ market: market._id, optionName: market.resolvedOption }).session(session),
            ]);

            const totalAll = allBets.reduce((s, b) => s + b.amount, 0);
            const totalWin = winningBets.reduce((s, b) => s + b.amount, 0);

            // Edge case: no winners -> just mark settled
            if (totalWin === 0) {
                market.isSettled = true;
                await market.save({ session });
                return res.status(200).json({
                    message: 'Settled (no winners)',
                    resolvedOption: market.resolvedOption,
                    totals: { totalAll, totalWin },
                });
            }

            const multiplier = totalAll / totalWin;

            // Pay each winner; idempotent via unique idempotencyKey per payout
            for (const bet of winningBets) {
                const payout = Math.round(bet.amount * multiplier);
                const payoutKey = `settle:${resolveKey}:${bet._id}`;

                // skip if we already created this payout in a prior retry
                const exists = await Transaction.exists({ idempotencyKey: payoutKey }).session(session);
                if (exists) continue;

                await User.updateOne(
                    { _id: bet.user },
                    { $inc: { balance: payout } },
                    { session }
                );

                await Transaction.create([{
                    user: bet.user,
                    type: 'payout',
                    amount: payout,
                    marketId: market._id,
                    ref: bet._id,
                    idempotencyKey: payoutKey,
                    createdAt: new Date(),
                }], { session });
            }

            market.isSettled = true;
            await market.save({ session });

            return res.status(200).json({
                message: 'Resolved + settled',
                resolvedOption: market.resolvedOption,
                multiplier,
                totals: { totalAll, totalWin },
                winners: winningBets.length,
            });
        });
    } catch (err) {
        next(err);
    } finally {
        session.endSession();
    }
}

/**
 * GET /api/markets/:id
 * Query: include=pool,userBet,totals
 * - pool: total amount staked across all options
 * - userBet: caller's aggregate bet (requires auth)
 * - totals: recompute per-option totals from Bet collection (fresh snapshot)
 */
export const getMarketById = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid market id.' });
        }
        const m = await Market.findById(id);
        if (!m) return res.status(404).json({ message: 'Market not found.' });

        const isAdmin = req.user?.role === 'admin';
        const isCreator = req.user?.id && String(req.user.id) === String(m.createdBy);
        if (m.visibility === 'private' && !isAdmin && !isCreator) {
            return res.status(403).json({ message: 'Forbidden: private market.' });
        }

        const include = String(req.query.include || '')
            .split(',').map(s => s.trim()).filter(Boolean);

        const resp = {
            id: m._id,
            title: m.title,
            description: m.description,
            options: m.options,
            status: m.status,
            closingDate: m.closingDate,
            resolvedOption: m.resolvedOption,
            isSettled: m.isSettled,
            visibility: m.visibility,
            createdBy: m.createdBy,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
        };

        if (include.includes('pool')) {
            const poolAgg = await Bet.aggregate([
                { $match: { market: m._id } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]);
            resp.pool = poolAgg[0]?.total ?? 0;
        }

        if (include.includes('userBet') && req.user?.id) {
            const myAgg = await Bet.aggregate([
                { $match: { market: m._id, user: new mongoose.Types.ObjectId(req.user.id) } },
                { $group: { _id: '$option', total: { $sum: '$amount' } } },
            ]);
            resp.userBet = myAgg.reduce((acc, r) => (acc[r._id] = r.total, acc), {});
        }

        if (include.includes('totals')) {
            const perOptionAgg = await Bet.aggregate([
                { $match: { market: m._id } },
                { $group: { _id: '$option', total: { $sum: '$amount' } } },
            ]);
            const totalsMap = new Map(perOptionAgg.map(r => [r._id, r.total]));
            resp.options = m.options.map(o => ({
                name: o.name,
                totalStaked: totalsMap.get(o.name) ?? 0,
            }));
        }

        return res.json(resp);
    } catch (err) {
        next(err);
    }
};


export const getAllMarkets = async (req, res, next) => {
    try {
        const { status, q, visibility, page = 1, limit = 20, sort = '-createdAt' } = req.query;

        const where = {};
        if (status) where.status = status;
        if (q) where.$text = { $search: q };

        const isAdmin = req.user?.role === 'admin';

        // If caller is not admin, force public visibility regardless of query
        if (!isAdmin) {
            where.visibility = 'public';
        } else if (visibility) {
            // Admin can filter visibility explicitly
            where.visibility = visibility;
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [items, total] = await Promise.all([
            Market.find(where).sort(sort).skip(skip).limit(Number(limit)),
            Market.countDocuments(where),
        ]);

        return res.json({
            page: Number(page),
            limit: Number(limit),
            total,
            items: items.map(m => ({
                id: m._id,
                title: m.title,
                description: m.description,
                options: m.options,
                status: m.status,
                closingDate: m.closingDate,
                resolvedOption: m.resolvedOption,
                isSettled: m.isSettled,
                visibility: m.visibility,   // new
                createdBy: m.createdBy,     // new
                createdAt: m.createdAt,
                updatedAt: m.updatedAt,
            })),
        });
    } catch (err) {
        next(err);
    }
};
