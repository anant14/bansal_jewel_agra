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

/* ─────────────────── legal / Meta compliance pages ─────────────────── */

const LEGAL_UPDATED = 'September 2026';

function renderLegal(view, title) {
  return (req, res) => {
    res.render(view, {
      brand: content.brand,
      page: { title: `${title} — ${content.brand.name}` },
      config: { baseUrl: config.baseUrl },
      updated: LEGAL_UPDATED,
    });
  };
}

router.get('/privacy-policy', renderLegal('privacy-policy', 'Privacy Policy'));
router.get('/terms-of-service', renderLegal('terms-of-service', 'Terms of Service'));
router.get('/data-deletion', renderLegal('data-deletion', 'Data Deletion Instructions'));

module.exports = router;
