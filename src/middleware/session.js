'use strict';

const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

const pgSession = connectPgSimple(session);

const secret =
  process.env.SESSION_SECRET ||
  (() => {
    logger.warn(
      'SESSION_SECRET not set — using a random per-process secret (admin sessions will not survive a restart). Set SESSION_SECRET in production.'
    );
    return crypto.randomBytes(32).toString('hex');
  })();

let store;
if (process.env.DATABASE_URL) {
  store = new pgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'admin_sessions',
    createTableIfMissing: true,
  });
} else {
  logger.warn('DATABASE_URL not set — admin sessions will use in-memory storage (local dev only, not for production).');
}

module.exports = session({
  store,
  secret,
  resave: false,
  saveUninitialized: false,
  name: 'bj_admin_sid',
  cookie: {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 12, // 12 hours
  },
});
