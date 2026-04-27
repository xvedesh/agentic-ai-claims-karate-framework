'use strict';

/**
 * Lightweight rules engine.
 *
 * Iterates over every registered rule, evaluates it against the claim
 * context, and collects any AlertDraft objects the rules return. Rule
 * order is the order rules appear in `rules/index.js`; that order is the
 * deterministic tie-breaker when two rules emit alerts of equal action
 * priority.
 *
 * Rules that throw are isolated as a SYSTEM/INTERNAL_RULE_ERROR alert.
 * This is a framework safety mechanism, NOT a healthcare FWA finding.
 * Downstream consumers that count fraud/abuse/waste should filter by
 * category and ignore SYSTEM.
 */

const { rules } = require('./index');
const {
  CATEGORIES,
  SEVERITIES,
  ACTIONS,
  ACTION_PRIORITY,
  SEVERITY_PRIORITY,
  CATEGORY_PRIORITY,
} = require('./_shared');

function evaluate(ctx) {
  const drafts = [];
  for (const rule of rules) {
    try {
      const result = rule.evaluate(ctx);
      if (!result) continue;
      drafts.push({
        ruleCode: result.ruleCode || rule.code,
        category: result.category || rule.category,
        severity: result.severity || rule.severity,
        explanation: result.explanation,
        evidence: result.evidence || {},
        recommendedAction: result.recommendedAction,
      });
    } catch (err) {
      drafts.push({
        ruleCode: 'INTERNAL_RULE_ERROR',
        category: CATEGORIES.SYSTEM,
        severity: SEVERITIES.HIGH,
        explanation: `Rule ${rule.code} threw an unhandled error: ${err.message}. This is a framework-safety alert, not a fraud/abuse/waste finding.`,
        evidence: {
          failedRuleCode: rule.code,
          errorMessage: err.message,
          errorName: err.name,
        },
        recommendedAction: ACTIONS.MANUAL_REVIEW,
      });
    }
  }
  return drafts;
}

/**
 * Pick the highest-priority recommendedAction across a list of alert
 * drafts. Tie-breakers (in order):
 *   1. action priority   (DENY > ADJUST > MANUAL_REVIEW > APPROVE)
 *   2. severity priority (CRITICAL > HIGH > MEDIUM > LOW)
 *   3. category priority (FRAUD > ABUSE > WASTE > SYSTEM)
 *
 * Returns 'APPROVE' for an empty list (no rules fired).
 */
function pickWinningAction(drafts) {
  if (!drafts || drafts.length === 0) return ACTIONS.APPROVE;
  let winner = null;
  for (const d of drafts) {
    const score = [
      ACTION_PRIORITY[d.recommendedAction] || 0,
      SEVERITY_PRIORITY[d.severity] || 0,
      CATEGORY_PRIORITY[d.category] || 0,
    ];
    if (!winner || compareScore(score, winner.score) > 0) {
      winner = { score, draft: d };
    }
  }
  return winner.draft.recommendedAction;
}

function compareScore(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

module.exports = {
  evaluate,
  pickWinningAction,
  registeredRules: () => rules.map((r) => r.code),
};
