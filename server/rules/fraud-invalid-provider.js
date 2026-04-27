'use strict';

/**
 * FRAUD_INVALID_PROVIDER
 *
 * Fires when the billing provider is not eligible to perform the services
 * being billed:
 *   - provider.active === false  (sanctioned / terminated NPI), OR
 *   - any line's procedure has an allowedSpecialties list that does not
 *     include the provider's specialty (specialty mismatch).
 *
 * Real-world analog: NPI screening / sanction-list checks; specialty
 * credentialing edits.
 *
 * Severity: HIGH. Recommended action: DENY.
 *
 * False-positive guardrail: a procedure with no allowedSpecialties list
 * is treated as universal (no specialty constraint) and never fires this
 * rule on its own. An active provider performing a procedure within their
 * registered specialty is the canonical clean case.
 */

const { CATEGORIES, SEVERITIES, ACTIONS } = require('./_shared');

module.exports = {
  code: 'FRAUD_INVALID_PROVIDER',
  category: CATEGORIES.FRAUD,
  severity: SEVERITIES.HIGH,
  description: 'Billing provider is inactive or not credentialed for the procedure billed.',

  evaluate(ctx) {
    const { claim, provider, refData } = ctx;
    if (!provider) return null;

    if (provider.active === false) {
      return {
        explanation: `Provider ${provider.providerId} is marked inactive but is being used to bill claim ${claim.claimId}.`,
        evidence: {
          providerId: provider.providerId,
          active: false,
          npi: provider.npi,
        },
        recommendedAction: ACTIONS.DENY,
      };
    }

    for (const line of claim.lines || []) {
      const proc = refData.procedureByCode(line.procedureCode);
      if (!proc || !Array.isArray(proc.allowedSpecialties) || proc.allowedSpecialties.length === 0) {
        continue;
      }
      if (!proc.allowedSpecialties.includes(provider.specialty)) {
        return {
          explanation: `Provider specialty '${provider.specialty}' is not authorized to bill ${line.procedureCode} (allowed: ${proc.allowedSpecialties.join(', ')}).`,
          evidence: {
            providerId: provider.providerId,
            providerSpecialty: provider.specialty,
            procedureCode: line.procedureCode,
            allowedSpecialties: proc.allowedSpecialties,
          },
          recommendedAction: ACTIONS.DENY,
        };
      }
    }
    return null;
  },
};
