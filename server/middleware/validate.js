const { HttpError } = require('./errorHandler');

// Validates req.body against a zod schema, replacing it with the parsed
// (coerced/defaulted) value so downstream repositories only ever see
// well-formed input. Throws a 400 with a readable message on failure —
// picked up by the same centralized errorHandler as everything else.
function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const message = result.error.issues
                .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
                .join('; ');
            return next(new HttpError(400, message));
        }
        req.body = result.data;
        next();
    };
}

module.exports = { validateBody };
