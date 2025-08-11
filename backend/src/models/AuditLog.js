import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema(
    {
        // Who performed the action (admin user id)
        actorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        // Who/what the action targeted (user id in this case)
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        // Action name, e.g., "UPDATE_ROLE"
        action: {
            type: String,
            required: true,
            trim: true,
            maxlength: 64,
            index: true,
        },
        // Free-form JSON for extra details (from→to, etc.)
        metadata: {
            type: Object,
            default: {},
        },
        // Request context (optional but useful)
        ip: {
            type: String,
            default: '',
            maxlength: 64,
        },
        userAgent: {
            type: String,
            default: '',
            maxlength: 512,
        },
    },
    { timestamps: true }
);

// Helpful compound index to query by actor/action/time
AuditLogSchema.index({ actorId: 1, action: 1, createdAt: -1 });
// And by target/time
AuditLogSchema.index({ targetId: 1, createdAt: -1 });

export default mongoose.model('AuditLog', AuditLogSchema);
