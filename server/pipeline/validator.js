'use strict';

/**
 * Submission-time structural / referential / logical validation.
 *
 * Returns an Ack999-like object:
 *   { accepted: boolean, status: 'ACCEPTED' | 'REJECTED', errors: [{code, message, details?}] }
 *
 * This is intentionally separate from the create-time validation in
 * routes/claims.js: that one runs at POST /api/claims and prevents bad
 * drafts from being created. The submit-time validator re-checks the world
 * because the store may have changed (e.g. encounter deleted, codes reloaded)
 * between draft creation and submission.
 *
 * The validator is the only gate that can REJECT a submission. Rule-engine
 * findings produce alerts but do not change the ack outcome.
 */

const store = require('../store');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pushError(errors, code, message, details) {
  errors.push({ code, message, ...(details ? { details } : {}) });
}

function validate(claim) {
  const errors = [];

  for (const field of ['memberId', 'providerId', 'payerId', 'serviceDate', 'lines']) {
    if (claim[field] === undefined || claim[field] === null || claim[field] === '') {
      pushError(errors, 'MISSING_FIELD', `Required field '${field}' is missing`, { field });
    }
  }

  if (claim.serviceDate && !ISO_DATE.test(claim.serviceDate)) {
    pushError(errors, 'INVALID_SERVICE_DATE', 'serviceDate must be ISO YYYY-MM-DD', {
      serviceDate: claim.serviceDate,
    });
  }

  if (claim.memberId && !store.members.get(claim.memberId)) {
    pushError(errors, 'UNKNOWN_MEMBER', 'memberId is not registered', { memberId: claim.memberId });
  }
  if (claim.providerId && !store.providers.get(claim.providerId)) {
    pushError(errors, 'UNKNOWN_PROVIDER', 'providerId is not registered', {
      providerId: claim.providerId,
    });
  }
  if (claim.encounterId && !store.encounters.get(claim.encounterId)) {
    pushError(errors, 'UNKNOWN_ENCOUNTER', 'encounterId is not registered', {
      encounterId: claim.encounterId,
    });
  }

  if (Array.isArray(claim.lines)) {
    if (claim.lines.length === 0) {
      pushError(errors, 'EMPTY_LINES', 'Claim must have at least one service line');
    }
    claim.lines.forEach((line, idx) => {
      if (!store.refData.procedureByCode(line.procedureCode)) {
        pushError(errors, 'UNKNOWN_PROCEDURE', `Unknown procedureCode at lines[${idx}]`, {
          index: idx,
          procedureCode: line.procedureCode,
        });
      }
      if (!Number.isInteger(line.units) || line.units <= 0) {
        pushError(errors, 'INVALID_UNITS', `units must be a positive integer at lines[${idx}]`, {
          index: idx,
        });
      }
      if (typeof line.billedAmount !== 'number' || line.billedAmount < 0) {
        pushError(
          errors,
          'INVALID_BILLED_AMOUNT',
          `billedAmount must be a non-negative number at lines[${idx}]`,
          { index: idx }
        );
      }
    });
  }

  return {
    accepted: errors.length === 0,
    status: errors.length === 0 ? 'ACCEPTED' : 'REJECTED',
    errors,
  };
}

module.exports = { validate };
