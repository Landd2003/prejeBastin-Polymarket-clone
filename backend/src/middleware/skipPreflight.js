// /backend/middleware/skipPreflight.js
export const skipPreflight = (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
};
