'use strict';

/**
 * ABUSE_UNBUNDLING
 *
 * Fires when a claim's lines bill TWO OR MORE component procedures that
 * appear together in the same bundle (per `refData.bundles()`), without
 * the parent code being billed instead. This is the synthetic equivalent
 * of NCCI Procedure-to-Procedure (PTP) edits.
 *
 * Real-world analog: provider splits a combined procedure into its
 * component CPT codes to bill more than the bundled rate.
 *
 * Severity: MEDIUM. Recommended action: ADJUST.
 *
 * False-positive guardrail: a single line with the parent code does NOT
 * fire; only multiple components from the same bundle on the same claim do.
 * Future Phase-4 modifier guardrail: lines with MOD-59 (distinct procedural
 * service) could be excepted - documented but not yet implemented.
 */

const { CATEGORIES, SEVERITIES, ACTIONS } = require('./_shared');

module.exports = {
  code: 'ABUSE_UNBUNDLING',
  category: CATEGORIES.ABUSE,
  severity: SEVERITIES.MEDIUM,
  description: 'Multiple bundle components billed separately when a single parent code applies.',

  evaluate(ctx) {
    const { claim, refData } = ctx;
    const bundles = refData.bundles();
    if (!Array.isArray(bundles) || bundles.length === 0) return null;

    const billedCodes = new Set((claim.lines || []).map((l) => l.procedureCode));

    for (const bundle of bundles) {
      const componentsBilled = bundle.components.filter((c) => billedCodes.has(c));
      if (componentsBilled.length < 2) continue;
      if (billedCodes.has(bundle.parentCode)) continue;

      return {
        explanation: `Components ${componentsBilled.join(', ')} of bundle ${bundle.parentCode} were billed separately on the same claim.`,
        evidence: {
          bundleParentCode: bundle.parentCode,
          componentsBilled,
          rationale: bundle.rationale,
        },
        recommendedAction: ACTIONS.ADJUST,
      };
    }
    return null;
  },
};
