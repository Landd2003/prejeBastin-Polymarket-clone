// /backend/models/User.js
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 32, index: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
        passwordHash: { type: String, required: true, minlength: 6 },

        balance: { type: Number, default: 1000, min: 0, index: true },
        role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },

        // ✅ add these:
        emailVerified: { type: Boolean, default: false, index: true },
        passwordChangedAt: { type: Date, default: null }, // useful for token revocation later

        // optional status flags
        isActive: { type: Boolean, default: true, index: true },
        isBanned: { type: Boolean, default: false, index: true },
    },
    { timestamps: true, versionKey: false }
);

// Normalization
UserSchema.pre('save', function (next) {
    if (this.isModified('email') && this.email) this.email = this.email.toLowerCase().trim();
    if (this.isModified('username') && this.username) this.username = this.username.trim();
    next();
});

// Hide internals
UserSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.passwordHash;
    return obj;
};

// Balance helpers
UserSchema.methods.credit = function (amount) { /* unchanged */ };
UserSchema.methods.debit = function (amount) { /* unchanged */ };

UserSchema.index({ createdAt: -1 });

export default mongoose.model('User', UserSchema);
