import mongoose from 'mongoose';

const BetSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        market: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Market',
            required: true,
            index: true,
        },
        optionName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 64,
        },
        // normalized key for indexing/uniqueness (lowercase)
        optionKey: {
            type: String,
            required: true,
            trim: true,
            maxlength: 64,
            lowercase: true,
        },
        amount: {
            type: Number,
            required: true,
            min: [1, 'Bet amount must be >= 1'],
        },
        // used to make POST /api/bets idempotent per user
        idempotencyKey: {
            type: String,
            required: true,
            trim: true,
        },
    },
    { timestamps: true, versionKey: false }
);

/* ------------ Indexes ------------ */
BetSchema.index({ market: 1, createdAt: -1 });
BetSchema.index({ user: 1, createdAt: -1 });

// Prevent duplicate money ops (same user + same key)
BetSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });

// Case-insensitive option uniqueness per market (if you want it unique, set unique: true)
BetSchema.index({ market: 1, optionKey: 1 }, { unique: false });

/* ------------ Guards / helpers ------------ */
BetSchema.pre('validate', function (next) {
    if (this.optionName && !this.optionKey) {
        this.optionKey = this.optionName.toLowerCase().trim();
    }
    // keep optionName tidy
    if (this.optionName) this.optionName = this.optionName.trim();
    next();
});

// Hide internals if serialized
BetSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.optionKey; // internal index field
    return obj;
};

export default mongoose.model('Bet', BetSchema);
