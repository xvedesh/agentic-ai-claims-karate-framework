'use strict';

/**
 * Pipeline event log query.
 *
 * Read-only view of every event the submission pipeline has emitted since
 * the last reset. Useful for Karate scenarios that assert "submitting a claim
 * produced exactly these events in this order".
 */

const express = require('express');
const store = require('../store');

const router = express.Router();

const KNOWN_EVENT_TYPES = new Set([
  'CLAIM_SUBMITTED',
  'CLAIM_VALIDATED',
  'CLAIM_ADJUDICATED',
  'ALERT_RAISED',
]);

router.get('/events', (req, res) => {
  const filters = {};
  if (req.query.claimId) filters.claimId = String(req.query.claimId);
  if (req.query.eventType) {
    const t = String(req.query.eventType).toUpperCase();
    if (KNOWN_EVENT_TYPES.has(t)) filters.eventType = t;
  }
  res.json({ items: store.events.list(filters), filters });
});

module.exports = router;
