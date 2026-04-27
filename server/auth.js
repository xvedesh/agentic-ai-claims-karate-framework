'use strict';

const jwt = require('jsonwebtoken');
const { unauthorized } = require('./errors');

const SECRET_KEY =
  process.env.SANDBOX_JWT_SECRET ||
  '36bc4058ddcb5b7d71a2c9a1700bc1f467910e032c3891143eb0ae489f3c0289';

const TOKEN_TTL = process.env.SANDBOX_JWT_TTL || '1h';

const USERS = [
  { id: 1, username: 'user1', password: 'password1' },
  { id: 2, username: 'user2', password: 'password2' },
];

function findUser(username, password) {
  return USERS.find((u) => u.username === username && u.password === password) || null;
}

function createToken(user) {
  return jwt.sign({ sub: user.username }, SECRET_KEY, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET_KEY);
}

function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return next(unauthorized('Bearer token required'));
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    req.user = verifyToken(token);
    return next();
  } catch (e) {
    return next(unauthorized(`Invalid or expired token: ${e.message}`));
  }
}

module.exports = { findUser, createToken, verifyToken, authMiddleware, SECRET_KEY };
