import { v4 as uuid } from 'uuid';
import { setCtx } from '../lib/requestContext.js';

export const requestId = (req, res, next) => {
    const id = req.header('X-Request-Id') || uuid();
    res.setHeader('X-Request-Id', id);
    req.id = id;
    setCtx('requestId', id);
    next();
};
