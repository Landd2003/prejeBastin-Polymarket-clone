import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ['bet', 'payout', 'win', 'fee', 'deposit', 'withdrawal'],
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: [0, 'Transaction amount cannot be negative'],
        },
        marketId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Market',
            default: null,
            index: true,
        },
        // External system reference (e.g., checkout/session/payment intent)
        ref: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            trim: true,
        },
        metadata: {
            type: Object,
            default: {},
        },
        // Idempotency to prevent duplicate money ops per user
        idempotencyKey: {
            type: String,
            required: true,
            trim: true,
        },
    },
    { timestamps: true, versionKey: false }
);

/* ------------ Indexes ------------ */
TransactionSchema.index({ user: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, createdAt: -1 });
TransactionSchema.index({ marketId: 1, createdAt: -1 });
TransactionSchema.index({ ref: 1 }, { sparse: true });

// Critical: prevent duplicate transactions for the same logical request
TransactionSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });

/* ------------ Immutability guard (financial history) ------------ */
// Allow inserts; block updates after creation (adjust if you support explicit reversals)
TransactionSchema.pre('findOneAndUpdate', function (next) {
    return next(new Error('Transactions are immutable; create a compensating entry instead.'));
});
TransactionSchema.pre('updateOne', function (next) {
    return next(new Error('Transactions are immutable; create a compensating entry instead.'));
});
TransactionSchema.pre('updateMany', function (next) {
    return next(new Error('Transactions are immutable; create a compensating entry instead.'));
});
TransactionSchema.pre('save', function (next) {
    // On existing docs, block save() that modifies fields
    if (!this.isNew) {
        return next(new Error('Transactions are immutable; create a compensating entry instead.'));
    }
    next();
});

/* ------------ Serialization ------------ */
TransactionSchema.methods.toJSON = function () {
    const obj = this.toObject();
    // keep everything else; __v is already disabled via versionKey:false
    return obj;
};

export default mongoose.model('Transaction', TransactionSchema);
