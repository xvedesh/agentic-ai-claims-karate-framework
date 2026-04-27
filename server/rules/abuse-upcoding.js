'use strict';

/**
 * ABUSE_UPCODING
 *
 * Fires when an Evaluation-and-Management (E/M) procedure of complexity
 * tier >= 2 is billed but the encounter's diagnosis codes do not include
 * any of the procedure's `supportingDiagnoses`.
 *
 * Real-world analog: billing 99214/99215 (high-complexity E/M) when the
 * documentation only supports 99213 (mid) or lower - i.e. coding to a
 * higher level than the visit warrants.
 *
 * Severity: HIGH. Recommended action: MANUAL_REVIEW (clinical judgement).
 *
 * False-positive guardrail: tier-1 visits never fire. Visits with at least
 * one supporting diagnosis on the encounter never fire. If the procedure
 * has no `supportingDiagnoses` list defined, the rule is silent.
 */

const { CATEGORIES, SEVERITIES, ACTIONS } = require('./_shared');

const MIN_TIER = 2;

module.exports = {
  code: 'ABUSE_UPCODING',
  category: CATEGORIES.ABUSE,
  severity: SEVERITIES.HIGH,
  description: 'High-complexity E/M code billed without a supporting chronic/serious diagnosis.',

  evaluate(ctx) {
    const { claim, encounter, refData } = ctx;
    if (!encounter || !Array.isArray(encounter.diagnosisCodes)) return null;
    const dxOnEncounter = new Set(encounter.diagnosisCodes);

    for (const line of claim.lines || []) {
      const proc = refData.procedureByCode(line.procedureCode);
      if (!proc) continue;
      if (proc.category !== 'EM') continue;
      if ((proc.complexityTier || 0) < MIN_TIER) continue;
      const supporting = proc.supportingDiagnoses;
      if (!Array.isArray(supporting) || supporting.length === 0) continue;
      const hasSupport = supporting.some((dx) => dxOnEncounter.has(dx));
      if (hasSupport) continue;

      return {
        explanation: `Tier-${proc.complexityTier} E/M code ${line.procedureCode} billed against encounter ${encounter.encounterId} whose diagnoses (${[...dxOnEncounter].join(', ') || 'none'}) do not include any supporting condition.`,
        evidence: {
          procedureCode: line.procedureCode,
          complexityTier: proc.complexityTier,
          encounterDiagnoses: [...dxOnEncounter],
          supportingDiagnoses: supporting,
        },
        recommendedAction: ACTIONS.MANUAL_REVIEW,
      };
    }
    return null;
  },
};
