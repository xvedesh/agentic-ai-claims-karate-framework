'use strict';

const express = require('express');
const store = require('../store');

const router = express.Router();

router.post('/reset', (_req, res) => {
  store.reset();
  res.json({ status: 'RESET_OK' });
});

module.exports = router;
