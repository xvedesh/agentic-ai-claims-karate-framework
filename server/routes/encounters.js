'use strict';

const express = require('express');
const store = require('../store');
const { badRequest, notFound, conflict, asyncHandler } = require('../errors');

const router = express.Router();

const REQUIRED = ['memberId', 'providerId', 'serviceDate', 'diagnosisCodes'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateBody(body) {
  const missing = REQUIRED.filter((f) => !body || body[f] === undefined || body[f] === '');
  if (missing.length > 0) {
    throw badRequest('INVALID_REQUEST', 'Missing required field(s)', { missing });
  }
  if (!ISO_DATE.test(body.serviceDate)) {
    throw badRequest('INVALID_REQUEST', 'serviceDate must be ISO YYYY-MM-DD', {
      field: 'serviceDate',
    });
  }
  if (!Array.isArray(body.diagnosisCodes) || body.diagnosisCodes.length === 0) {
    throw badRequest('INVALID_REQUEST', 'diagnosisCodes must be a non-empty array', {
      field: 'diagnosisCodes',
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
  const unknown = body.diagnosisCodes.filter((d) => !store.refData.diagnosisByCode(d));
  if (unknown.length > 0) {
    throw badRequest('UNKNOWN_DIAGNOSIS', 'One or more diagnosis codes are not registered', {
      unknown,
    });
  }
}

router.get('/', (_req, res) => {
  res.json({ items: store.encounters.list() });
});

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const e = store.encounters.get(req.params.id);
    if (!e) throw notFound('Encounter', req.params.id);
    res.json(e);
  })
);

router.post(
  '/',
  asyncHandler((req, res) => {
    validateBody(req.body);
    try {
      const created = store.encounters.create(req.body);
      res.status(201).json(created);
    } catch (e) {
      if (e.code === 'DUPLICATE_ID') {
        throw conflict('DUPLICATE_ID', 'encounterId already exists', {
          encounterId: req.body.encounterId,
        });
      }
      throw e;
    }
  })
);

module.exports = router;
