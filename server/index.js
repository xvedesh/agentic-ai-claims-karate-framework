'use strict';

/**
 * Layer A entry point - Healthcare Claims Analytics Sandbox.
 *
 * - In-memory store, seeded from server/data/seed-data.json.
 * - JWT-protected /api/** namespace (any valid Bearer token works for the demo).
 * - Public surface: /health and /auth/login.
 * - Synthetic data only. NO real PHI.
 */

const express = require('express');
const store = require('./store');
const { authMiddleware } = require('./auth');
const { errorMiddleware } = require('./errors');

const meta = require('./routes/meta');
const members = require('./routes/members');
const providers = require('./routes/providers');
const encounters = require('./routes/encounters');
const claims = require('./routes/claims');
const alerts = require('./routes/alerts');
const pipeline = require('./routes/pipeline');
const admin = require('./routes/admin');

const app = express();
app.use(express.json({ limit: '256kb' }));

// Public routes (no JWT).
app.use('/', meta);

// Protected /api namespace.
app.use('/api', authMiddleware);
app.use('/api/members', members);
app.use('/api/providers', providers);
app.use('/api/encounters', encounters);
app.use('/api/claims', claims);
app.use('/api/alerts', alerts);
app.use('/api/pipeline', pipeline);
app.use('/api/admin', admin);

// 404 fallback (must come AFTER all real routes).
app.use((req, res) => {
  res
    .status(404)
    .json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
});

app.use(errorMiddleware);

const PORT = parseInt(process.env.PORT || '3000', 10);

function start() {
  store.loadSeed();
  const server = app.listen(PORT, () => {
    console.log(`[claims-sandbox] listening on http://localhost:${PORT}`);
  });
  process.on('SIGTERM', () => {
    console.log('[claims-sandbox] SIGTERM received, shutting down');
    server.close(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    console.log('[claims-sandbox] SIGINT received, shutting down');
    server.close(() => process.exit(0));
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
