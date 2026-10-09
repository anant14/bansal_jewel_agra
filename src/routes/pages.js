'use strict';

const express = require('express');
const config = require('../config');
const content = require('../services/content');
const catalogService = require('../services/catalogService');
const sitePhotoService = require('../services/sitePhotoService');
const mediaService = require('../services/mediaService');
const rateService = require('../services/rateService');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [model, products, heroSlides, showroomPhotos, goldRates] = await Promise.all([
      content.homeViewModel(),
      catalogService.listForWebsite(),
      sitePhotoService.heroSlides(),
      sitePhotoService.showroomPhotos(),
      rateService.getWebsiteGoldRates().catch((err) => {
        logger.error('home: gold rates unavailable', err.message);
        return null;
      }),
    ]);

    res.render('index', {
      ...model,
      hero: heroSlides ? { ...model.hero, slides: heroSlides } : model.hero,
      catalogue: { ...model.catalogue, products },
      showroom: showroomPhotos ? { ...model.showroom, photos: showroomPhotos } : model.showroom,
      goldRates,
      page: { title: `${model.brand.name} | ${model.brand.since} — Gold, Diamond & Polki, Agra` },
      config: { baseUrl: config.baseUrl, whatsappLive: config.whatsapp.isConfigured },
    });
  } catch (err) {
    next(err);
  }
});

// Photos uploaded from the admin for the website. Only assets actually used
// on the site are public — the rest of the media library stays admin-only.
// An asset's bytes never change (a new photo gets a new id), so browsers
// can cache them indefinitely.
router.get('/media/:id', async (req, res, next) => {
  try {
    if (!config.hasDatabase || !/^[a-z0-9]{10,40}$/i.test(req.params.id)) return res.sendStatus(404);
    if (!(await sitePhotoService.isPublicAsset(req.params.id))) return res.sendStatus(404);

    const file = await mediaService.getMediaFile(req.params.id);
    if (!file) return res.sendStatus(404);
    res.set('Content-Type', file.mimeType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(file.buffer);
  } catch (err) {
    next(err);
  }
});

// Simple health endpoint (handy for uptime checks / the reverse proxy).
router.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    service: 'bansal-jewellers',
    env: config.env,
    uptime: process.uptime(),
    googleReviews: content.googleReviewsStatus,
  });
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
