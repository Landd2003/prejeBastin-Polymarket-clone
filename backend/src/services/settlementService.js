import mongoose from 'mongoose';
import Market from '../models/Market.js';
import Bet from '../models/Bet.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

/**
 * Settles a RESOLVED market:
 * - Pays winners proportionally from the losing pool
 * - Takes a platform fee from the total pool (basis points)
 * - Writes Transaction logs for transparency
 *
 * @param {string} marketId - Mongo ObjectId string
 * @param {{ feeBps?: number }} options - e.g., { feeBps: 300 } = 3% fee
 * @returns {Promise<{marketId: string, winningOption: string, totalPool: number, feeTaken: number, winnersPaid: number, winnersCount: number}>}
 */
export const settleResolvedMarket = async (marketId, { feeBps = 300 } = {}) => {
    if (!mongoose.isValidObjectId(marketId)) {
        throw new Error('Invalid market id');
    }
    if (feeBps < 0 || feeBps > 10_000) {
        throw new Error('feeBps must be between 0 and 10000');
    }

    const session = await mongoose.startSession();
    try {
        let summary = {};
        await session.withTransaction(async () => {
            // 1) Load market (must be resolved and have resolvedOption)
            const market = await Market.findById(marketId).session(session);
            if (!market) throw new Error('Market not found');
            if (market.status !== 'resolved' || !market.resolvedOption) {
                throw new Error('Market must be resolved with a winning option before settlement');
            }

            // 2) Load all bets for this market
            const bets = await Bet.find({ market: market._id }).session(session);
            if (!bets.length) {
                // Nothing to settle; still record a no-op summary
                summary = {
                    marketId: market._id.toString(),
                    winningOption: market.resolvedOption,
                    totalPool: 0,
                    feeTaken: 0,
                    winnersPaid: 0,
                    winnersCount: 0,
                };
                return;
            }

            // 3) Compute pools
            let totalPool = 0;
            let winnersPool = 0;
            let losersPool = 0;

            for (const b of bets) {
                totalPool += b.amount;
                if (b.optionName === market.resolvedOption) {
                    winnersPool += b.amount;
                } else {
                    losersPool += b.amount;
                }
            }

            // 4) Platform fee from total pool
            const feeTaken = Math.floor((totalPool * feeBps) / 10_000);

            // 5) Distributable amount = totalPool - fee
            const distributable = totalPool - feeTaken;

            // If no winners (edge case): fee taken, no payouts; house keeps distributable
            // If winnersPool == 0, nobody placed on winning side; do nothing except fee log.
            // If losersPool == 0 (everyone on winners): everyone just gets back proportionally (= no gain),
            // still apply fee against totalPool to keep economics consistent.

            // 6) Pay winners proportionally to their stake share
            let winnersPaid = 0;
            if (winnersPool > 0) {
                // Payout formula:
                // Each winner gets distributable * (winnerStake / winnersPool)
                // (This returns stake + profit proportionally)
                const winners = bets.filter(b => b.optionName === market.resolvedOption);

                for (const w of winners) {
                    const payout = Math.floor((distributable * w.amount) / winnersPool);

                    if (payout > 0) {
                        // Credit user balance
                        const user = await User.findById(w.user).session(session);
                        if (!user) throw new Error('Winner user not found (data integrity issue)');
                        user.balance += payout;
                        await user.save({ session });

                        winnersPaid += payout;

                        // Log transaction
                        await Transaction.create([{
                            user: user._id,
                            type: 'win',
                            amount: payout,
                            marketId: market._id,
                            createdAt: new Date(),
                        }], { session });
                    }
                }
            }

            // 7) Record platform fee as a Transaction (optional: route to a "system" user)
            if (feeTaken > 0) {
                // For transparency, you can record fee with a null user or a designated system account
                await Transaction.create([{
                    user: null,               // or a SYSTEM_USER_ID if you have one
                    type: 'fee',
                    amount: feeTaken,
                    marketId: market._id,
                    createdAt: new Date(),
                }], { session });
            }

            // 8) (Optional) Mark market as "settled" to avoid double settlement
            // Add a field like `isSettled: true` in Market schema if you want idempotency.
            // For now we rely on controller to ensure settle runs only once.

            summary = {
                marketId: market._id.toString(),
                winningOption: market.resolvedOption,
                totalPool,
                feeTaken,
                winnersPaid,
                winnersCount: winnersPool > 0 ? bets.filter(b => b.optionName === market.resolvedOption).length : 0,
            };
        });

        return summary;
    } catch (err) {
        throw err;
    } finally {
        session.endSession();
    }
};
