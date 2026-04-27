'use strict';

/**
 * FRAUD_PHANTOM_BILLING
 *
 * Fires when the claim cannot be tied to a real encounter:
 *   - encounterId is missing, OR
 *   - encounterId references an encounter that does not match the claim's
 *     member, provider, or service date.
 *
 * Real-world analog: "services not rendered" - the provider bills for a
 * visit that never happened (no chart, no encounter record).
 *
 * Severity: CRITICAL. Recommended action: DENY.
 *
 * False-positive guardrail: the create-time validator already rejects
 * unknown encounterIds, so this rule sees only two cases at submit time:
 *   - encounterId omitted entirely (the canonical phantom case);
 *   - encounterId present but pointing at the wrong member/provider/DOS
 *     (catch for later store mutations).
 */

const { CATEGORIES, SEVERITIES, ACTIONS } = require('./_shared');

module.exports = {
  code: 'FRAUD_PHANTOM_BILLING',
  category: CATEGORIES.FRAUD,
  severity: SEVERITIES.CRITICAL,
  description: 'Claim has no matching encounter (services-not-rendered indicator).',

  evaluate(ctx) {
    const { claim, encounter } = ctx;

    if (!claim.encounterId) {
      return {
        explanation: 'Claim was submitted without an encounterId; no underlying clinical encounter to substantiate the services billed.',
        evidence: {
          claimId: claim.claimId,
          memberId: claim.memberId,
          providerId: claim.providerId,
          serviceDate: claim.serviceDate,
          encounterId: null,
        },
        recommendedAction: ACTIONS.DENY,
      };
    }

    if (!encounter) {
      // Should not happen - validator catches unknown encounterIds. Defensive.
      return {
        explanation: `Claim references encounterId ${claim.encounterId}, but no such encounter exists in the store.`,
        evidence: { claimId: claim.claimId, encounterId: claim.encounterId },
        recommendedAction: ACTIONS.DENY,
      };
    }

    const memberMismatch = encounter.memberId !== claim.memberId;
    const providerMismatch = encounter.providerId !== claim.providerId;
    const dateMismatch = encounter.serviceDate !== claim.serviceDate;

    if (memberMismatch || providerMismatch || dateMismatch) {
      return {
        explanation: `Encounter ${encounter.encounterId} does not align with the claim header (member/provider/serviceDate mismatch).`,
        evidence: {
          claimId: claim.claimId,
          encounterId: encounter.encounterId,
          claim: {
            memberId: claim.memberId,
            providerId: claim.providerId,
            serviceDate: claim.serviceDate,
          },
          encounter: {
            memberId: encounter.memberId,
            providerId: encounter.providerId,
            serviceDate: encounter.serviceDate,
          },
          mismatches: { memberMismatch, providerMismatch, dateMismatch },
        },
        recommendedAction: ACTIONS.DENY,
      };
    }
    return null;
  },
};
