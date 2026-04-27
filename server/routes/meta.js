'use strict';

const express = require('express');
const { findUser, createToken } = require('../auth');
const { badRequest, unauthorized, asyncHandler } = require('../errors');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'UP', version: '0.1.0' });
});

router.post(
  '/auth/login',
  asyncHandler((req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      throw badRequest('INVALID_REQUEST', 'username and password are required', {
        missing: ['username', 'password'].filter((f) => !req.body?.[f]),
      });
    }
    const user = findUser(username, password);
    if (!user) {
      throw unauthorized('Authentication failed');
    }
    const accessToken = createToken(user);
    res.json({ accessToken, tokenType: 'Bearer' });
  })
);

module.exports = router;
