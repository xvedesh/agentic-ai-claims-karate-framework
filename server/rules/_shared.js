'use strict';

/**
 * Constants and helpers shared by every rule module.
 *
 * Keep this file boring on purpose. Rule modules should not require any
 * stateful helper - everything here is a pure function or a constant table.
 */

const CATEGORIES = Object.freeze({
  FRAUD: 'FRAUD',
  ABUSE: 'ABUSE',
  WASTE: 'WASTE',
  SYSTEM: 'SYSTEM',
});

const SEVERITIES = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

const ACTIONS = Object.freeze({
  DENY: 'DENY',
  ADJUST: 'ADJUST',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  APPROVE: 'APPROVE',
});

// Priority tables. Higher number = higher priority. Used by the adjudicator
// to pick a deterministic terminal status when multiple rules fire.
const ACTION_PRIORITY = Object.freeze({
  DENY: 4,
  ADJUST: 3,
  MANUAL_REVIEW: 2,
  APPROVE: 1,
});
const SEVERITY_PRIORITY = Object.freeze({
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
});
const CATEGORY_PRIORITY = Object.freeze({
  FRAUD: 4,
  ABUSE: 3,
  WASTE: 2,
  SYSTEM: 1, // System errors do NOT outrank business findings.
});

function daysBetween(isoA, isoB) {
  const a = Date.parse(isoA);
  const b = Date.parse(isoB);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

function amountsEqual(a, b, epsilon = 0.01) {
  return Math.abs((a || 0) - (b || 0)) < epsilon;
}

function comparableHistory(allClaims, currentClaimId) {
  // History = every claim that is NOT the current one and is NOT a DRAFT.
  // DRAFTS are excluded so a freshly-created sibling draft never counts as
  // history for cross-claim rules.
  return allClaims.filter((c) => c.claimId !== currentClaimId && c.status !== 'DRAFT');
}

module.exports = {
  CATEGORIES,
  SEVERITIES,
  ACTIONS,
  ACTION_PRIORITY,
  SEVERITY_PRIORITY,
  CATEGORY_PRIORITY,
  daysBetween,
  amountsEqual,
  comparableHistory,
};
