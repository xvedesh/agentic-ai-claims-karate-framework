'use strict';

/**
 * Rules registry.
 *
 * Each rule module must export:
 *   {
 *     code:      'FRAUD_DUPLICATE_CLAIM',     // unique rule code (string)
 *     category:  'FRAUD' | 'ABUSE' | 'WASTE',
 *     severity:  'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
 *     description: 'Plain-English summary of what the rule detects.',
 *     evaluate(ctx): null | AlertDraft
 *   }
 *
 * `ctx` (built by the pipeline) contains:
 *   {
 *     claim,        // full claim being adjudicated
 *     member,       // resolved member record
 *     provider,     // resolved provider record
 *     encounter,    // resolved encounter record (or null)
 *     allClaims,    // all claims currently in the store (for cross-claim rules)
 *     refData,      // store.refData (procedures, bundles, mue, etc.)
 *   }
 *
 * `evaluate` returns:
 *   - null               -> rule did not fire
 *   - AlertDraft object  -> rule fired, pipeline will assign id + claimId + emit event
 *
 * AlertDraft shape (id/claimId/timestamp added by the pipeline):
 *   {
 *     ruleCode, category, severity,
 *     explanation,                // human-readable
 *     evidence: { ... },          // structured supporting data
 *     recommendedAction: 'DENY' | 'REVIEW' | 'ADJUST' | 'INFORM'
 *   }
 *
 * Phase 2: registry is intentionally empty.
 * Phase 3 will register the 9 fraud / abuse / waste rules here.
 */

const rules = [
  // FRAUD
  require('./fraud-duplicate-claim'),
  require('./fraud-phantom-billing'),
  require('./fraud-invalid-provider'),
  // ABUSE
  require('./abuse-upcoding'),
  require('./abuse-excessive-frequency'),
  require('./abuse-unbundling'),
  // WASTE
  require('./waste-duplicate-service'),
  require('./waste-medically-unlikely-units'),
  require('./waste-unnecessary-pattern'),
];

module.exports = { rules };
