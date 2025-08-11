// /backend/src/validators/betSchemas.js
import { z } from 'zod';

// If amount may arrive as a string, coerce to number
export const createBetSchema = z.object({
    body: z.object({
        marketId: z.string().min(1, 'Market ID required'),
        optionName: z.string().min(1, 'Option name required').trim(),
        amount: z.coerce.number().positive('Amount must be positive'),
    }),
});

export const getUserBetsSchema = z.object({
    params: z.object({
        userId: z.string().min(1, 'User ID required'),
    }),
    query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
    }).partial(), // allow empty query
});
