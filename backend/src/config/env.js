import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Tolerant schema: allows empty NODE_ENV and single JWT_SECRET fallback
const EnvSchema = z.object({
    NODE_ENV: z
        .string()
        .transform(v => (v && v.trim() ? v.trim() : 'development'))
        .pipe(z.enum(['development', 'test', 'production'])),
    PORT: z.string().default('4000'),
    LOG_LEVEL: z.string().optional(),

    MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

    // You only have JWT_SECRET in .env; these are optional and will be filled from it
    JWT_ACCESS_SECRET: z.string().optional(),
    JWT_REFRESH_SECRET: z.string().optional(),
    JWT_SECRET: z.string().optional(),

    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('7d'),

    RATE_BACKEND: z.string().optional(), // 'redis' or 'memory'
    REDIS_URL: z.string().optional(),

    CORS_ORIGIN: z.string().optional(),
    RATE_WINDOW_MS: z.string().optional(),
    RATE_MAX: z.string().optional(),
    AUTH_RATE_WINDOW_MS: z.string().optional(),
    AUTH_RATE_MAX: z.string().optional(),
});

// Parse without crashing on your current .env
const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('\n❌ Invalid environment variables:');
    parsed.error.issues?.forEach?.(i =>
        console.error(`- ${i.path?.join('.')}: ${i.message}`)
    );
    process.exit(1);
}

const e = parsed.data;

// ✅ Fallbacks: if only JWT_SECRET is set, use it for both tokens
if (!e.JWT_ACCESS_SECRET && e.JWT_SECRET) e.JWT_ACCESS_SECRET = e.JWT_SECRET;
if (!e.JWT_REFRESH_SECRET && e.JWT_SECRET) e.JWT_REFRESH_SECRET = e.JWT_SECRET;

// Optional: normalize CORS_ORIGIN into a list (keep original string too if you use it elsewhere)
if (typeof e.CORS_ORIGIN === 'string') {
    e.CORS_ORIGIN_LIST = e.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean);
}

// Export named env object
export const env = e;
