'use strict';

/**
 * Claims router.
 *
 * Phase 1: draft CRUD (status = DRAFT only on POST).
 * Phase 2 adds:
 *   POST /:id/submit          - run the deterministic submission pipeline
 *   GET  /:id/adjudication    - 835-like adjudication response
 *   GET  /:id/alerts          - alerts raised for this claim (empty in Phase 2)
 */

const express = require('express');
const store = require('../store');
const { badRequest, notFound, conflict, asyncHandler } = require('../errors');
const { submit } = require('../pipeline/submit');

const router = express.Router();

const REQUIRED = ['memberId', 'providerId', 'payerId', 'serviceDate', 'lines'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw badRequest('INVALID_REQUEST', 'lines must be a non-empty array', { field: 'lines' });
  }
  lines.forEach((line, idx) => {
    if (!line || typeof line !== 'object') {
      throw badRequest('INVALID_REQUEST', `lines[${idx}] must be an object`, { index: idx });
    }
    const proc = store.refData.procedureByCode(line.procedureCode);
    if (!proc) {
      throw badRequest('UNKNOWN_PROCEDURE', `lines[${idx}].procedureCode is not registered`, {
        index: idx,
        procedureCode: line.procedureCode,
      });
    }
    if (!Number.isInteger(line.units) || line.units <= 0) {
      throw badRequest('INVALID_REQUEST', `lines[${idx}].units must be a positive integer`, {
        index: idx,
      });
    }
    if (typeof line.billedAmount !== 'number' || line.billedAmount < 0) {
      throw badRequest(
        'INVALID_REQUEST',
        `lines[${idx}].billedAmount must be a non-negative number`,
        { index: idx }
      );
    }
    if (line.modifiers !== undefined && !Array.isArray(line.modifiers)) {
      throw badRequest('INVALID_REQUEST', `lines[${idx}].modifiers must be an array if provided`, {
        index: idx,
      });
    }
  });
}

function validateBody(body) {
  const missing = REQUIRED.filter((f) => body == null || body[f] === undefined || body[f] === '');
  if (missing.length > 0) {
    throw badRequest('INVALID_REQUEST', 'Missing required field(s)', { missing });
  }
  if (!ISO_DATE.test(body.serviceDate)) {
    throw badRequest('INVALID_REQUEST', 'serviceDate must be ISO YYYY-MM-DD', {
      field: 'serviceDate',
    });
  }
  if (!store.members.get(body.memberId)) {
    throw badRequest('INVALID_MEMBER', 'memberId does not exist', { memberId: body.memberId });
  }
  if (!store.providers.get(body.providerId)) {
    throw badRequest('INVALID_PROVIDER', 'providerId does not exist', {
      providerId: body.providerId,
    });
  }
  // encounterId is optional in Phase 1 (the phantom-billing rule in Phase 3 *requires* a missing encounter).
  if (body.encounterId && !store.encounters.get(body.encounterId)) {
    throw badRequest('INVALID_ENCOUNTER', 'encounterId does not exist', {
      encounterId: body.encounterId,
    });
  }
  validateLines(body.lines);
}

router.get('/', (_req, res) => {
  res.json({ items: store.claims.list() });
});

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const c = store.claims.get(req.params.id);
    if (!c) throw notFound('Claim', req.params.id);
    res.json(c);
  })
);

router.post(
  '/',
  asyncHandler((req, res) => {
    validateBody(req.body);
    try {
      const created = store.claims.create(req.body);
      res.status(201).json(created);
    } catch (e) {
      if (e.code === 'DUPLICATE_ID') {
        throw conflict('DUPLICATE_ID', 'claimId already exists', { claimId: req.body.claimId });
      }
      throw e;
    }
  })
);

router.post(
  '/:id/submit',
  asyncHandler((req, res) => {
    const result = submit(req.params.id);
    if (result.kind === 'NOT_FOUND') {
      throw notFound('Claim', req.params.id);
    }
    if (result.kind === 'ALREADY_SUBMITTED') {
      throw conflict('CLAIM_ALREADY_SUBMITTED', 'Claim has already been submitted', {
        claimId: req.params.id,
        currentStatus: result.currentStatus,
        adjudicationId: result.adjudicationId,
      });
    }
    if (result.kind === 'REJECTED') {
      // 422 = the request was syntactically valid but the resource is in a state
      // that prevents the requested action. Mirrors the 999-reject pattern.
      return res.status(422).json({
        error: {
          code: 'CLAIM_REJECTED',
          message: 'Claim failed structural validation; submission not accepted',
          details: { ack: result.ack },
        },
      });
    }
    return res.status(200).json({
      ack: result.ack,
      claim: result.claim,
      adjudication: result.adjudication,
      events: result.events.map((e) => e.eventId),
    });
  })
);

router.get(
  '/:id/adjudication',
  asyncHandler((req, res) => {
    if (!store.claims.get(req.params.id)) throw notFound('Claim', req.params.id);
    const adj = store.adjudications.getByClaimId(req.params.id);
    if (!adj) throw notFound('Adjudication for claim', req.params.id);
    res.json(adj);
  })
);

router.get(
  '/:id/alerts',
  asyncHandler((req, res) => {
    if (!store.claims.get(req.params.id)) throw notFound('Claim', req.params.id);
    res.json({ items: store.alerts.list({ claimId: req.params.id }) });
  })
);

module.exports = router;
