'use strict';

/**
 * Submission pipeline orchestrator.
 *
 * Flow (deterministic, synchronous, in-memory):
 *
 *   DRAFT
 *     |--> POST /api/claims/:id/submit
 *     v
 *   [validator] --(REJECTED)--> ack with errors, claim stays DRAFT, no events
 *     |
 *   (ACCEPTED) -> emit CLAIM_SUBMITTED, claim.status = SUBMITTED
 *     v
 *   [structural ok]            -> emit CLAIM_VALIDATED, claim.status = VALIDATED
 *     v
 *   [rulesEngine.evaluate]     -> alert drafts (Phase 3)
 *     v
 *   [adjudicator]              -> 835-like response with terminal status
 *     v
 *   alerts persisted -> emit ALERT_RAISED for each
 *     v
 *   emit CLAIM_ADJUDICATED, claim.status = PAID|DENIED|ADJUSTED
 *
 * Idempotency: a non-DRAFT claim is rejected with code CLAIM_ALREADY_SUBMITTED.
 * The submitter sees the existing adjudicationId so they can fetch it directly.
 *
 * No LLMs, no async work, no external services. The pipeline is intentionally
 * boring so Karate scenarios can assert exact values.
 */

const store = require('../store');
const { validate } = require('./validator');
const { buildAdjudication } = require('./adjudicator');
const { evaluate: evaluateRules } = require('../rules/rulesEngine');

function emit(eventType, claimId, correlationId, metadata = {}) {
  return store.events.append({
    eventId: store.nextId('event'),
    eventType,
    claimId,
    correlationId,
    timestamp: new Date().toISOString(),
    metadata,
  });
}

function buildContext(claim) {
  return {
    claim,
    member: store.members.get(claim.memberId),
    provider: store.providers.get(claim.providerId),
    encounter: claim.encounterId ? store.encounters.get(claim.encounterId) : null,
    allClaims: store.claims.list(),
    refData: store.refData,
  };
}

function persistAlerts(claim, drafts, correlationId) {
  return drafts.map((draft) => {
    const alert = store.alerts.add({
      alertId: store.nextId('alert'),
      claimId: claim.claimId,
      memberId: claim.memberId,
      providerId: claim.providerId,
      ruleCode: draft.ruleCode,
      category: draft.category,
      severity: draft.severity,
      explanation: draft.explanation,
      evidence: draft.evidence || {},
      recommendedAction: draft.recommendedAction,
      raisedAt: new Date().toISOString(),
    });
    emit('ALERT_RAISED', claim.claimId, correlationId, {
      alertId: alert.alertId,
      ruleCode: alert.ruleCode,
      category: alert.category,
      severity: alert.severity,
      recommendedAction: alert.recommendedAction,
    });
    return alert;
  });
}

/**
 * Submit a claim. Returns one of:
 *   { kind: 'NOT_FOUND' }
 *   { kind: 'ALREADY_SUBMITTED', currentStatus, adjudicationId }
 *   { kind: 'REJECTED', ack }
 *   { kind: 'ACCEPTED', ack, claim, adjudication, alerts, events }
 */
function submit(claimId) {
  const existing = store.claims.get(claimId);
  if (!existing) return { kind: 'NOT_FOUND' };

  if (existing.status !== 'DRAFT') {
    const adj = store.adjudications.getByClaimId(claimId);
    return {
      kind: 'ALREADY_SUBMITTED',
      currentStatus: existing.status,
      adjudicationId: adj ? adj.adjudicationId : null,
    };
  }

  const ack = {
    ackId: store.nextId('ack'),
    claimId,
    ...validate(existing),
  };

  if (!ack.accepted) {
    // Claim stays DRAFT. No SUBMITTED event - submission was never accepted.
    return { kind: 'REJECTED', ack };
  }

  const correlationId = store.nextId('trn');

  const submittedClaim = store.claims.transition(claimId, 'SUBMITTED');
  const submittedEvent = emit('CLAIM_SUBMITTED', claimId, correlationId, {
    ackId: ack.ackId,
    payerId: submittedClaim.payerId,
  });

  const validatedClaim = store.claims.transition(claimId, 'VALIDATED');
  const validatedEvent = emit('CLAIM_VALIDATED', claimId, correlationId, {
    lineCount: (validatedClaim.lines || []).length,
  });

  const ctx = buildContext(validatedClaim);
  const alertDrafts = evaluateRules(ctx);

  const adjudication = buildAdjudication(validatedClaim, alertDrafts, correlationId);

  const persistedAlerts = persistAlerts(validatedClaim, alertDrafts, correlationId);
  adjudication.alerts = persistedAlerts.map((a) => a.alertId);

  store.adjudications.save(adjudication);
  store.claims.update(claimId, {
    submittedAt: submittedEvent.timestamp,
    adjudicatedAt: adjudication.adjudicatedAt,
    adjudicationId: adjudication.adjudicationId,
    correlationId,
  });
  store.claims.transition(claimId, adjudication.status);

  const adjudicatedEvent = emit('CLAIM_ADJUDICATED', claimId, correlationId, {
    adjudicationId: adjudication.adjudicationId,
    terminalStatus: adjudication.status,
    paidAmount: adjudication.paidAmount,
    alertCount: persistedAlerts.length,
  });

  return {
    kind: 'ACCEPTED',
    ack,
    claim: store.claims.get(claimId),
    adjudication,
    alerts: persistedAlerts,
    events: [submittedEvent, validatedEvent, adjudicatedEvent],
  };
}

module.exports = { submit };
