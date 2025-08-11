import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 64 },
        totalStaked: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
);

const marketSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, maxlength: 160 },
        description: { type: String, default: '', trim: true, maxlength: 5000 },

        // e.g., [{ name: 'Yes', totalStaked: 0 }, { name: 'No', totalStaked: 0 }]
        options: {
            type: [optionSchema],
            validate: {
                validator: (arr) => Array.isArray(arr) && arr.length >= 2,
                message: 'Market must have at least two options.',
            },
            default: [],
        },

        status: {
            type: String,
            enum: ['open', 'closed', 'resolved'],
            default: 'open',
            index: true,
        },

        // Optional deadline after which betting is blocked
        closingDate: { type: Date, default: null, index: true },

        // Set when resolved
        resolvedOption: { type: String, default: null },

        // Marked true after settlement to avoid double-settlement
        isSettled: { type: Boolean, default: false },

        visibility: {
            type: String,
            enum: ['public', 'private'],
            default: 'public',
            index: true,
        },

        // NEW (make required AFTER backfill)
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true,
        },

    },
    { timestamps: true }
);

// ---- Indexes for common queries ----
marketSchema.index({ status: 1, createdAt: -1 });
marketSchema.index({ createdAt: -1 });
marketSchema.index({ isSettled: 1 });

marketSchema.index({ visibility: 1, status: 1 });

// ---- Helpers ----
// Close market if past closingDate (you can call this in a cron/job)
marketSchema.methods.isClosedByTime = function () {
    if (!this.closingDate) return false;
    return new Date() >= new Date(this.closingDate);
};

// Ensure resolvedOption is one of the options
marketSchema.methods.isValidResolvedOption = function (opt) {
    return this.options.some((o) => o.name === opt);
};

export default mongoose.model('Market', marketSchema);
