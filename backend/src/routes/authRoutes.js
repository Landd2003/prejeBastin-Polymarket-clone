// /backend/src/routes/authRoutes.js
import express from 'express';
import { registerUser, loginUser } from '../controllers/authController.js';
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../validators/authSchemas.js';

const router = express.Router();


/** POST /api/auth/register */
router.post('/register', validate(registerSchema), registerUser);

/** POST /api/auth/login */
router.post('/login', validate(loginSchema), loginUser);

/** GET /api/auth/me */
router.get('/me', authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
});

/** GET /api/auth/admin-check */
router.get('/admin-check', authenticateToken, authorizeRoles('admin'), (req, res) => {
    res.json({ success: true, message: 'You are an admin' });
});

export default router;
