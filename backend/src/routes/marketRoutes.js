import express from 'express';
import {
    createMarket,
    getAllMarkets,
    resolveMarket,
    getMarketById
} from '../controllers/marketController.js';
import { authenticateToken, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// view a market
router.get('/:id', getMarketById);

// Public: view markets
router.get('/', getAllMarkets);

// Authenticated: create a market (could be admin-only or public depending on your app rules)
router.post('/', authenticateToken, authorizeRoles('admin'), createMarket);

// Admin only: resolve + settle a market
router.post('/:id/resolve', authenticateToken, authorizeRoles('admin'), resolveMarket);

export default router;
