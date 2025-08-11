import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';

/**
 * POST /api/auth/register
 * Body: { username, email, password }
 */
export const registerUser = async (req, res, next) => {
    try {
        let { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Username, email, and password are required.' });
        }

        email = email.toLowerCase().trim();

        const existingByEmail = await User.findOne({ email });
        if (existingByEmail) return res.status(400).json({ message: 'Email already registered.' });

        const existingByUsername = await User.findOne({ username });
        if (existingByUsername) return res.status(400).json({ message: 'Username already taken.' });

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await User.create({
            username: username.trim(),
            email,
            passwordHash,
            // role defaults to 'user' from schema
        });

        const token = generateToken({ id: user._id, username: user.username, role: user.role });

        return res.status(201).json({
            token,
            user: user.toJSON(), // hides passwordHash per model method
        });
    } catch (err) {
        next(err);
    }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
// wherever loginUser lives
export const loginUser = async (req, res, next) => {
    try {
        // Prefer validated input from the middleware
        const { emailOrUsername, password } = req.valid?.body ?? req.body;

        // This should already be enforced by Zod, but keep a guard just in case
        if (!emailOrUsername || !password) {
            return res.status(400).json({ message: 'Email/username and password are required.' });
        }

        const identifier = String(emailOrUsername).trim();
        const isEmail = identifier.includes('@');

        // Normalize email to lowercase; usernames are often case-insensitive too
        const emailQuery = { email: identifier.toLowerCase() };
        const usernameQueryExactCaseInsensitive = { username: identifier };

        // Use collation for case-insensitive username lookup (MongoDB)
        let user = await User.findOne(
            isEmail ? emailQuery : usernameQueryExactCaseInsensitive
        ).collation({ locale: 'en', strength: 2 });

        // To support login by either, also try the other key if first didn’t match
        if (!user && !isEmail) {
            // user typed a username but maybe they actually typed an email-looking value without '@'
            user = await User.findOne(emailQuery);
        }
        if (!user && isEmail) {
            // user typed an email but maybe they registered with that as username
            user = await User.findOne(usernameQueryExactCaseInsensitive).collation({ locale: 'en', strength: 2 });
        }

        // Uniform error to avoid hinting which field failed
        if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials.' });

        // Optional: honor rememberMe from schema for longer TTLs if you use it elsewhere
        const { rememberMe } = req.valid?.body ?? {};
        const token = generateToken(
            { id: user._id, username: user.username, role: user.role },
            // e.g., pass TTL hint to your token helper if supported
            rememberMe ? { expiresIn: '30d' } : undefined
        );

        return res.json({
            token,
            user: user.toJSON(),
        });
    } catch (err) {
        next(err);
    }
};

