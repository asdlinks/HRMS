const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const pinoHttp = require('pino-http');
const path = require('path');
const fs = require('fs');

const { getEnv } = require('./config/env');
const apiRoutes = require('./routes');
const platformAdminRoutes = require('./routes/platformAdmin');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const env = getEnv(); // validates required secrets/config at boot, before the server starts accepting requests

const app = express();

// credentials: true + an explicit origin (not '*') is required for the
// httpOnly refresh-token cookie to be sent/accepted cross-origin (Vite dev
// server <-> this API, and the production IIS origin).
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(cookieParser(env.cookieSecret));
app.use(bodyParser.json());
app.use(pinoHttp({
    logger,
    autoLogging: { ignore: (req) => !req.url.startsWith('/api') },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
}));

// Serve static files from the React frontend
let distPath = path.join(__dirname, '../client/dist');
if (!fs.existsSync(path.join(distPath, 'index.html'))) {
    distPath = path.join(__dirname, '../dist');
}
if (!fs.existsSync(path.join(distPath, 'index.html'))) {
    distPath = path.join(__dirname, '..');
}
app.use(express.static(distPath));

// Mounted as a sibling of apiRoutes, not nested inside it — Platform Admin
// (Phase 9) is a separate principal type with its own auth chain
// (authenticatePlatformAdmin) and never passes through apiRoutes' own
// authenticate/requireActiveTenant middleware.
app.use('/api/platform-admin', platformAdminRoutes);
app.use('/api', apiRoutes);

app.use('/api', notFoundHandler);

// Catch-all to serve React's index.html for any other GET request
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
});

app.use(errorHandler);

app.listen(env.port, () => {
    logger.info(`Server running on http://localhost:${env.port}`);
});
