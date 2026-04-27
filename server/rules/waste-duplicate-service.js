'use strict';

/**
 * WASTE_DUPLICATE_SERVICE
 *
 * Fires when a routine LAB or IMG procedure is billed for the same member
 * within 30 days of another non-DRAFT claim for the same procedureCode.
 *
 * Real-world analog: low-value-care patterns - repeating routine labs or
 * imaging without a clinical reason to do so. NOT the same as
 * FRAUD_DUPLICATE_CLAIM (which requires identical provider, DOS, and
 * amount), and NOT the same as ABUSE_EXCESSIVE_FREQUENCY (which uses the
 * MUE frequency-edit table). All three can co-fire; the action priority
 * model in the adjudicator chooses the terminal status.
 *
 * Severity: LOW. Recommended action: MANUAL_REVIEW.
 *
 * False-positive guardrail: only LAB/IMG procedures are considered.
 * Office visits and surgical procedures do not trigger this rule.
 */

const {
  CATEGORIES,
  SEVERITIES,
  ACTIONS,
  comparableHistory,
  daysBetween,
} = require('./_shared');

const ROUTINE_CATEGORIES = new Set(['LAB', 'IMG']);
const WINDOW_DAYS = 30;

module.exports = {
  code: 'WASTE_DUPLICATE_SERVICE',
  category: CATEGORIES.WASTE,
  severity: SEVERITIES.LOW,
  description: 'Routine lab/imaging procedure repeated for the same member within 30 days.',

  evaluate(ctx) {
    const { claim, refData } = ctx;
    const history = comparableHistory(ctx.allClaims, claim.claimId);

    for (const line of claim.lines || []) {
      const proc = refData.procedureByCode(line.procedureCode);
      if (!proc || !ROUTINE_CATEGORIES.has(proc.category)) continue;

      const priors = history.filter((other) => {
        if (other.memberId !== claim.memberId) return false;
        if (daysBetween(claim.serviceDate, other.serviceDate) > WINDOW_DAYS) return false;
        return (other.lines || []).some((l) => l.procedureCode === line.procedureCode);
      });
      if (priors.length === 0) continue;

      return {
        explanation: `Routine ${proc.category} procedure ${line.procedureCode} repeated for ${claim.memberId} within ${WINDOW_DAYS} days of ${priors.map((p) => p.claimId).join(', ')}.`,
        evidence: {
          procedureCode: line.procedureCode,
          procedureCategory: proc.category,
          windowDays: WINDOW_DAYS,
          priorClaimIds: priors.map((p) => p.claimId),
          memberId: claim.memberId,
        },
        recommendedAction: ACTIONS.MANUAL_REVIEW,
      };
    }
    return null;
  },
};
