'use strict';

/**
 * Cross-claim alerts query.
 *
 * Phase 2: returns an empty list (no rules registered).
 * Phase 3+: filtered by category / severity / ruleCode / claimId.
 */

const express = require('express');
const store = require('../store');

const router = express.Router();

const ALLOWED_CATEGORIES = new Set(['FRAUD', 'ABUSE', 'WASTE', 'SYSTEM']);
const ALLOWED_SEVERITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

router.get('/', (req, res) => {
  const filters = {};
  if (req.query.claimId) filters.claimId = String(req.query.claimId);
  if (req.query.category) {
    const cat = String(req.query.category).toUpperCase();
    if (ALLOWED_CATEGORIES.has(cat)) filters.category = cat;
  }
  if (req.query.severity) {
    const sev = String(req.query.severity).toUpperCase();
    if (ALLOWED_SEVERITIES.has(sev)) filters.severity = sev;
  }
  if (req.query.ruleCode) filters.ruleCode = String(req.query.ruleCode);

  res.json({ items: store.alerts.list(filters), filters });
});

module.exports = router;
