import mongoose from 'mongoose';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

/**
 * PATCH /api/admin/users/:id/role
 * Body: { role: 'user' | 'admin' }
 * Requires: authenticateToken + authorizeRoles('admin')
 */
export const updateUserRole = async (req, res, next) => {
    try {
        const { id: targetUserId } = req.params;
        let { role } = req.body;

        // 1) Validate inputs
        if (!mongoose.isValidObjectId(targetUserId)) {
            return res.status(400).json({ message: 'Invalid user id.' });
        }

        role = String(role || '').trim().toLowerCase();
        const allowedRoles = ['user', 'admin'];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ message: `Role must be one of: ${allowedRoles.join(', ')}` });
        }

        // 2) Load target user
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // 3) No-op check
        if (targetUser.role === role) {
            return res.status(200).json({ message: 'Role unchanged (already set).', user: targetUser.toJSON() });
        }

        // 4) Safety checks
        const actorId = req.user?.id; // set by authenticateToken
        const isSelf = actorId && targetUserId === actorId;

        // Prevent demoting the last admin (whether self or another user)
        if (role !== 'admin' && targetUser.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin' });
            if (adminCount <= 1) {
                return res.status(409).json({
                    message: 'Cannot demote this user: they are the only admin. Create another admin first.',
                });
            }
        }

        // Optional: prevent self-demotion if your policy forbids it even when multiple admins exist
        // if (isSelf && role !== 'admin') {
        //   return res.status(403).json({ message: 'You cannot change your own role.' });
        // }

        // 5) Apply update
        const prevRole = targetUser.role;
        targetUser.role = role;
        await targetUser.save();

        // 6) Audit log (best practice; non-fatal on failure)
        try {
            await AuditLog.create({
                actorId,
                targetId: targetUser._id,
                action: 'UPDATE_ROLE',
                metadata: { prevRole, newRole: role },
                ip: req.ip,
                userAgent: req.headers['user-agent'] || '',
            });
        } catch (logErr) {
            console.error('AuditLog write failed:', logErr?.message || logErr);
        }

        // 7) Respond
        return res.status(200).json({
            message: `Role updated: ${prevRole} → ${role}`,
            user: targetUser.toJSON(),
        });
    } catch (err) {
        next(err);
    }
};
