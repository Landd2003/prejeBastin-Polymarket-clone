// /backend/src/config/db.js
import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../lib/logger.js';

// import models here so indexes can be synced
import User from '../models/User.js';
import Bet from '../models/Bet.js';
import Transaction from '../models/Transaction.js';

mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB.
 * @param {Object} opts
 * @param {boolean} opts.syncIndexes - Whether to run syncIndexes() for all models.
 */
export async function connectDB({ syncIndexes = true } = {}) {
    const start = Date.now();

    await mongoose.connect(env.MONGO_URI, { autoIndex: false });
    logger.info({ uri: redact(env.MONGO_URI) }, 'Mongo connected');

    if (syncIndexes) {
        try {
            const iStart = Date.now();
            await Promise.all([
                User.syncIndexes(),
                Bet.syncIndexes(),
                Transaction.syncIndexes(),
            ]);
            logger.info({ ms: Date.now() - iStart }, 'Mongo indexes synced');
        } catch (err) {
            logger.error({ err }, 'Failed to sync indexes');
            throw err;
        }
    }

    logger.debug({ ms: Date.now() - start }, 'DB init complete');

    mongoose.connection.on('disconnected', () => logger.warn('Mongo disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('Mongo reconnected'));
}

export async function disconnectDB() {
    try {
        await mongoose.disconnect();
        logger.info('Mongo disconnected cleanly');
    } catch (err) {
        logger.error({ err }, 'Error during Mongo disconnect');
    }
}

function redact(uri) {
    return uri?.replace(/\/\/(.*?):(.*?)@/, '//<user>:<pass>@');
}
