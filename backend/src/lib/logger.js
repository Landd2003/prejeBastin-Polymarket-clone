import pino from 'pino';
import { getCtx } from './requestContext.js';

export const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    base: undefined,
    formatters: {
        log(obj) {
            const requestId = getCtx('requestId');
            return requestId ? { ...obj, requestId } : obj;
        }
    }
});
