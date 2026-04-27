'use strict';

const express = require('express');
const store = require('../store');
const { badRequest, notFound, conflict, asyncHandler } = require('../errors');

const router = express.Router();

const REQUIRED = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'payerId'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateBody(body) {
  const missing = REQUIRED.filter((f) => !body || body[f] === undefined || body[f] === '');
  if (missing.length > 0) {
    throw badRequest('INVALID_REQUEST', 'Missing required field(s)', { missing });
  }
  if (!ISO_DATE.test(body.dateOfBirth)) {
    throw badRequest('INVALID_REQUEST', 'dateOfBirth must be ISO YYYY-MM-DD', {
      field: 'dateOfBirth',
    });
  }
  if (!['M', 'F', 'X'].includes(body.gender)) {
    throw badRequest('INVALID_REQUEST', 'gender must be one of M, F, X', { field: 'gender' });
  }
}

router.get('/', (_req, res) => {
  res.json({ items: store.members.list() });
});

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const m = store.members.get(req.params.id);
    if (!m) throw notFound('Member', req.params.id);
    res.json(m);
  })
);

router.post(
  '/',
  asyncHandler((req, res) => {
    validateBody(req.body);
    try {
      const created = store.members.create(req.body);
      res.status(201).json(created);
    } catch (e) {
      if (e.code === 'DUPLICATE_ID') {
        throw conflict('DUPLICATE_ID', 'memberId already exists', { memberId: req.body.memberId });
      }
      throw e;
    }
  })
);

module.exports = router;
