'use strict';

/**
 * FRAUD_DUPLICATE_CLAIM
 *
 * Fires when the current claim looks like an exact rebill of a prior
 * non-DRAFT claim:
 *   - same memberId,
 *   - same providerId,
 *   - same serviceDate,
 *   - some line shares the same procedureCode AND billedAmount,
 *   - and the prior claim is within the last 90 days (defensive cap).
 *
 * Real-world analog: classic duplicate-billing detection. Provider submits
 * the same encounter twice (often hours or days apart) hoping one slips
 * through.
 *
 * Severity: CRITICAL. Recommended action: DENY.
 *
 * False-positive guardrail: a "different procedure on the same day" looks
 * superficially similar but does NOT trigger this rule because the
 * procedureCode comparison is per-line. Bilateral procedures (-50 modifier)
 * would also not collide because units/modifiers differ on the line - this
 * rule is intentionally narrow.
 */

const {
  CATEGORIES,
  SEVERITIES,
  ACTIONS,
  amountsEqual,
  comparableHistory,
  daysBetween,
} = require('./_shared');

const WINDOW_DAYS = 90;

module.exports = {
  code: 'FRAUD_DUPLICATE_CLAIM',
  category: CATEGORIES.FRAUD,
  severity: SEVERITIES.CRITICAL,
  description: 'Same {member, provider, DOS, procedure, amount} as a prior non-DRAFT claim within 90 days.',

  evaluate(ctx) {
    const { claim } = ctx;
    const history = comparableHistory(ctx.allClaims, claim.claimId);

    for (const other of history) {
      if (other.memberId !== claim.memberId) continue;
      if (other.providerId !== claim.providerId) continue;
      if (other.serviceDate !== claim.serviceDate) continue;
      if (daysBetween(claim.serviceDate, other.serviceDate) > WINDOW_DAYS) continue;

      for (const line of claim.lines || []) {
        const match = (other.lines || []).find(
          (l) =>
            l.procedureCode === line.procedureCode && amountsEqual(l.billedAmount, line.billedAmount)
        );
        if (!match) continue;
        return {
          explanation: `Duplicate of ${other.claimId}: same member, provider, service date, procedure (${line.procedureCode}), and billed amount.`,
          evidence: {
            duplicateOf: other.claimId,
            memberId: claim.memberId,
            providerId: claim.providerId,
            serviceDate: claim.serviceDate,
            procedureCode: line.procedureCode,
            billedAmount: line.billedAmount,
            priorStatus: other.status,
          },
          recommendedAction: ACTIONS.DENY,
        };
      }
    }
    return null;
  },
};
