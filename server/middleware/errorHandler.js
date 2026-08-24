const logger = require('../utils/logger');

// Small typed error for routes/repositories that need to signal a specific
// HTTP status (400/403/404/409) instead of falling through to the generic
// 500 — throw it and Express 5's native async-rejection forwarding routes
// it straight to errorHandler below, no try/catch needed in the route.
class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

// Centralizes the `res.status(500).json({error: err.message})` boilerplate
// that was repeated in nearly every route of the pre-Milestone-1 index.js.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) {
        (req.log || logger).error({ err }, err.message);
    }
    res.status(statusCode).json({ error: err.message || 'Internal server error' });
}

function notFoundHandler(req, res) {
    res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
}

module.exports = { HttpError, errorHandler, notFoundHandler };
