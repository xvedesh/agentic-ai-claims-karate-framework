'use strict';

const express = require('express');
const store = require('../store');
const { badRequest, notFound, conflict, asyncHandler } = require('../errors');

const router = express.Router();

const REQUIRED = ['name', 'npi', 'specialty'];

function validateBody(body) {
  const missing = REQUIRED.filter((f) => !body || body[f] === undefined || body[f] === '');
  if (missing.length > 0) {
    throw badRequest('INVALID_REQUEST', 'Missing required field(s)', { missing });
  }
  const specialties = store.refData.codes().specialties;
  if (!specialties.includes(body.specialty)) {
    throw badRequest('INVALID_REQUEST', 'Unknown specialty', {
      field: 'specialty',
      allowed: specialties,
    });
  }
  if (!/^\d{10}$/.test(String(body.npi))) {
    throw badRequest('INVALID_REQUEST', 'npi must be a 10-digit synthetic identifier', {
      field: 'npi',
    });
  }
}

router.get('/', (_req, res) => {
  res.json({ items: store.providers.list() });
});

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const p = store.providers.get(req.params.id);
    if (!p) throw notFound('Provider', req.params.id);
    res.json(p);
  })
);

router.post(
  '/',
  asyncHandler((req, res) => {
    validateBody(req.body);
    try {
      const created = store.providers.create(req.body);
      res.status(201).json(created);
    } catch (e) {
      if (e.code === 'DUPLICATE_ID') {
        throw conflict('DUPLICATE_ID', 'providerId already exists', {
          providerId: req.body.providerId,
        });
      }
      throw e;
    }
  })
);

module.exports = router;
