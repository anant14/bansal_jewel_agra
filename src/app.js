'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const config = require('./config');
const logger = require('./utils/logger');

const pagesRouter = require('./routes/pages');
const apiRouter = require('./routes/api');
const ratesRouter = require('./routes/rates');
const whatsappRouter = require('./routes/whatsapp');
const adminRouter = require('./routes/admin');
const adminSession = require('./middleware/session');

const app = express();

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

/* ───────────────────────── security ───────────────────────── */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https://images.unsplash.com'],
        connectSrc: ["'self'"],
        formAction: ["'self'", 'https://wa.me', 'https://api.whatsapp.com'],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(compression());
app.use(
  morgan(config.isProd ? 'combined' : 'dev', {
    stream: { write: (line) => logger.info(line.trim()) },
    skip: (req) => req.path === '/healthz',
  })
);

/* ─────────────────────── body parsing ─────────────────────── */
// Keep the raw body around so the WhatsApp webhook can verify the
// X-Hub-Signature-256 header.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: false }));

/* ─────────────────────── static assets ────────────────────── */
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: config.isProd ? '7d' : 0,
    etag: true,
  })
);

/* ───────────────────────── routes ─────────────────────────── */
app.use('/', pagesRouter);
app.use('/api', apiRouter);
app.use('/api/rates', ratesRouter);
app.use('/whatsapp', whatsappRouter);
// Session middleware is scoped to /admin only — the public site stays
// cookie-free for anonymous visitors.
app.use('/admin', adminSession, adminRouter);

/* ─────────────────────── error handling ───────────────────── */
app.use((req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/whatsapp')) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.status(404).render('404', {
    page: { title: 'Page not found — Bansal Jewellers' },
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('unhandled error', err.stack || err.message);
  if (req.path.startsWith('/api') || req.path.startsWith('/whatsapp')) {
    return res.status(500).json({ error: 'server_error' });
  }
  res.status(500).render('404', {
    page: { title: 'Something went wrong — Bansal Jewellers' },
    serverError: true,
  });
});

module.exports = app;
