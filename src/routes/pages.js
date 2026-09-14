'use strict';

const express = require('express');
const config = require('../config');
const content = require('../services/content');

const router = express.Router();

router.get('/', (req, res) => {
  const model = content.homeViewModel();
  res.render('index', {
    ...model,
    page: { title: `${model.brand.name} | ${model.brand.since} — Gold, Diamond & Polki, Agra` },
    config: { baseUrl: config.baseUrl, whatsappLive: config.whatsapp.isConfigured },
  });
});

// Simple health endpoint (handy for uptime checks / the reverse proxy).
router.get('/healthz', (req, res) => {
  res.json({ ok: true, service: 'bansal-jewellers', env: config.env, uptime: process.uptime() });
});

module.exports = router;
