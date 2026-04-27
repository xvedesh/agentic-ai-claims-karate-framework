'use strict';

/**
 * WASTE_MEDICALLY_UNLIKELY_UNITS
 *
 * Fires when any line's `units` exceeds the per-procedure MUE limit
 * defined in `mue-limits.json` (`refData.mueLimit(code)`).
 *
 * Real-world analog: CMS Medically Unlikely Edits - a hard cap on units
 * per code per date of service.
 *
 * Severity: MEDIUM. Recommended action: ADJUST.
 *
 * False-positive guardrail: lines whose code has no MUE entry are skipped.
 * Lines with `units` exactly at the limit do not fire (limit is inclusive).
 */

const { CATEGORIES, SEVERITIES, ACTIONS } = require('./_shared');

module.exports = {
  code: 'WASTE_MEDICALLY_UNLIKELY_UNITS',
  category: CATEGORIES.WASTE,
  severity: SEVERITIES.MEDIUM,
  description: 'Line units exceed the synthetic per-procedure MUE limit.',

  evaluate(ctx) {
    const { claim, refData } = ctx;
    for (const line of claim.lines || []) {
      const limit = refData.mueLimit(line.procedureCode);
      if (limit == null) continue;
      if ((line.units || 0) <= limit) continue;
      return {
        explanation: `${line.procedureCode} billed with ${line.units} units; MUE limit is ${limit}.`,
        evidence: {
          procedureCode: line.procedureCode,
          units: line.units,
          mueLimit: limit,
        },
        recommendedAction: ACTIONS.ADJUST,
      };
    }
    return null;
  },
};
