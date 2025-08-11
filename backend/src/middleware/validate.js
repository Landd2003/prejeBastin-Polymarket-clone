// /backend/middleware/validate.js
export const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse({
        body: req.body,
        params: req.params,
        query: req.query,
    });

    if (!result.success) {
        // Zod uses `error.issues` (not `errors`)
        return res.status(400).json({
            message: 'Invalid request',
            issues: result.error.issues.slice(0, 5),
        });
    }

    // Attach the validated data so downstream code can trust it
    req.valid = result.data;
    next();
};
