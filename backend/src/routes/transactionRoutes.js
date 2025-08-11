import express from 'express';
import { getUserTransactions, listTransactions } from '../controllers/transactionController.js';
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// User: view own transactions (admin can view anyone's via userId)
router.get('/user/:userId', authenticateToken, getUserTransactions);

// Admin: list transactions across users with filters/pagination
router.get('/', authenticateToken, authorizeRoles('admin'), listTransactions);

export default router;
