// /backend/src/validators/authSchemas.js
import { z } from 'zod';

const email = z.string().email('Invalid email').trim();
const username = z.string().min(3).max(32).trim();
const password = z.string().min(6).max(128);

// POST /api/auth/register
export const registerSchema = z.object({
    body: z.object({
        username,
        email,
        password,
    }),
});

// POST /api/auth/login
// You can log in via email or username; controller should accept either.
export const loginSchema = z.object({
    body: z.object({
        emailOrUsername: z.string().min(3, 'Email or username is required').trim(),
        password,
        rememberMe: z.boolean().optional(), // if you want longer refresh TTL
    }),
});

// POST /api/auth/refresh
// Accept refresh token in body OR (if you use cookies) allow empty body and read cookie in controller.
export const refreshSchema = z.object({
    body: z.object({
        refreshToken: z.string().min(20, 'refreshToken required').optional(),
    }),
});

// POST /api/auth/verify-email
export const verifyEmailSchema = z.object({
    body: z.object({
        token: z.string().min(20, 'Verification token required'),
    }),
});
