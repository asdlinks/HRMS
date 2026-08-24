const pino = require('pino');
const { getEnv } = require('../config/env');

// Pretty-prints in development, structured JSON in production (what a log
// aggregator / IIS log shipper actually wants). Replaces the console.error
// calls previously scattered across errorHandler.js and route catch blocks.
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: getEnv().isProduction ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
});

module.exports = logger;
