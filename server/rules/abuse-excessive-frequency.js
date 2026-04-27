'use strict';

/**
 * ABUSE_EXCESSIVE_FREQUENCY
 *
 * Fires when the same procedureCode has been billed for the same member
 * more than `maxOccurrences` times within `windowDays`, where those
 * thresholds come from `refData.frequencyWindow(code)` (synthetic version
 * of CMS frequency edits, sourced from `mue-limits.json._frequencyWindows`).
 *
 * Real-world analog: too-many-visits-too-fast patterns; CMS frequency limits.
 *
 * Severity: MEDIUM. Recommended action: ADJUST.
 *
 * False-positive guardrail: claims spaced beyond the procedure-specific
 * window do not count; procedures with no frequency window defined are
 * skipped entirely. Cross-provider repeats are still counted (frequency is
 * a member-level construct, not a provider-level one).
 */

const {
  CATEGORIES,
  SEVERITIES,
  ACTIONS,
  comparableHistory,
  daysBetween,
} = require('./_shared');

module.exports = {
  code: 'ABUSE_EXCESSIVE_FREQUENCY',
  category: CATEGORIES.ABUSE,
  severity: SEVERITIES.MEDIUM,
  description: 'Same procedure billed for the same member beyond the synthetic frequency-edit threshold.',

  evaluate(ctx) {
    const { claim, refData } = ctx;
    const history = comparableHistory(ctx.allClaims, claim.claimId);

    for (const line of claim.lines || []) {
      const window = refData.frequencyWindow(line.procedureCode);
      if (!window) continue;

      const matchingHistorical = history.filter((other) => {
        if (other.memberId !== claim.memberId) return false;
        if (daysBetween(claim.serviceDate, other.serviceDate) > window.windowDays) return false;
        return (other.lines || []).some((l) => l.procedureCode === line.procedureCode);
      });

      const totalOccurrences = matchingHistorical.length + 1; // include the current claim
      if (totalOccurrences <= window.maxOccurrences) continue;

      return {
        explanation: `${line.procedureCode} billed ${totalOccurrences} times for ${claim.memberId} within ${window.windowDays} days (limit ${window.maxOccurrences}).`,
        evidence: {
          procedureCode: line.procedureCode,
          memberId: claim.memberId,
          windowDays: window.windowDays,
          maxOccurrences: window.maxOccurrences,
          observedOccurrences: totalOccurrences,
          priorClaimIds: matchingHistorical.map((c) => c.claimId),
        },
        recommendedAction: ACTIONS.ADJUST,
      };
    }
    return null;
  },
};
