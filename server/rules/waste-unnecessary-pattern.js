'use strict';

/**
 * WASTE_UNNECESSARY_PATTERN
 *
 * Fires when a high-cost non-E/M procedure (IMG or PROC, complexityTier
 * >= 3) is billed but the encounter's diagnosis codes do not include any
 * of the procedure's `supportingDiagnoses`.
 *
 * Real-world analog: medical-necessity edits - expensive imaging or
 * surgical work without a documented clinical reason.
 *
 * Severity: LOW. Recommended action: MANUAL_REVIEW (clinical sign-off).
 *
 * False-positive guardrail: tier-1/2 procedures, EM/LAB categories, and
 * procedures with no `supportingDiagnoses` list are skipped. Encounters
 * with at least one supporting diagnosis present do not trigger the rule.
 *
 * Distinction from ABUSE_UPCODING:
 *   - upcoding   covers EM procedures (over-coded visit complexity)
 *   - this rule  covers IMG / PROC procedures (over-utilized expensive work)
 * Both can co-fire; the adjudicator's action priority resolves the
 * terminal status deterministically.
 */

const { CATEGORIES, SEVERITIES, ACTIONS } = require('./_shared');

const COSTLY_CATEGORIES = new Set(['IMG', 'PROC']);
const MIN_TIER = 3;

module.exports = {
  code: 'WASTE_UNNECESSARY_PATTERN',
  category: CATEGORIES.WASTE,
  severity: SEVERITIES.LOW,
  description: 'High-cost imaging/procedure billed without a supporting diagnosis on the encounter.',

  evaluate(ctx) {
    const { claim, encounter, refData } = ctx;
    if (!encounter || !Array.isArray(encounter.diagnosisCodes)) return null;
    const dxOnEncounter = new Set(encounter.diagnosisCodes);

    for (const line of claim.lines || []) {
      const proc = refData.procedureByCode(line.procedureCode);
      if (!proc) continue;
      if (!COSTLY_CATEGORIES.has(proc.category)) continue;
      if ((proc.complexityTier || 0) < MIN_TIER) continue;
      const supporting = proc.supportingDiagnoses;
      if (!Array.isArray(supporting) || supporting.length === 0) continue;
      const hasSupport = supporting.some((dx) => dxOnEncounter.has(dx));
      if (hasSupport) continue;

      return {
        explanation: `High-cost ${proc.category} procedure ${line.procedureCode} (tier ${proc.complexityTier}) billed without a supporting diagnosis. Encounter diagnoses: ${[...dxOnEncounter].join(', ') || 'none'}.`,
        evidence: {
          procedureCode: line.procedureCode,
          procedureCategory: proc.category,
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
