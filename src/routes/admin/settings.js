'use strict';

const express = require('express');
const content = require('../../services/content');
const config = require('../../config');
const metaConfigService = require('../../services/metaConfigService');
const whatsappAccountService = require('../../services/whatsappAccountService');
const NAV = require('./nav');

const router = express.Router();

function webhookUrlFor(req) {
  // Derived from the actual incoming request, not the (previously stale)
  // BASE_URL env var — always correct regardless of custom-domain setup.
  return `${req.protocol}://${req.get('host')}/whatsapp/webhook`;
}

async function renderSettings(req, res, next, extra = {}) {
  try {
    const [settings, health, coexistence, checklist, account] = await Promise.all([
      metaConfigService.getDisplaySettings(),
      metaConfigService.getHealthDashboard(),
      metaConfigService.getCoexistenceReadiness(),
      metaConfigService.getAppReviewChecklist(),
      whatsappAccountService.getDefaultAccount(),
    ]);

    res.render('admin/settings', {
      page: { title: 'Settings — Admin' },
      brand: content.brand,
      nav: NAV,
      activeKey: 'settings',
      adminName: req.session.adminName,
      settings,
      health,
      coexistence,
      checklist,
      account,
      webhookUrl: webhookUrlFor(req),
      verifyTokenConfigured: Boolean(config.whatsapp.verifyToken),
      signatureVerificationEnabled: Boolean(settings.appSecretConfigured),
      encryptionAvailable: metaConfigService.encryptionAvailable(),
      ...extra,
    });
  } catch (err) {
    next(err);
  }
}

router.get('/settings', (req, res, next) => renderSettings(req, res, next));

router.post('/settings/meta', async (req, res, next) => {
  try {
    if (!metaConfigService.encryptionAvailable() && (req.body.token || req.body.appSecret)) {
      return renderSettings(req, res, next, {
        saveError: 'SETTINGS_ENCRYPTION_KEY is not set on the server — secrets cannot be saved securely until it is. Non-secret fields were not saved either, to avoid a confusing partial state.',
      });
    }
    await metaConfigService.saveSettings(req.body, req.session.adminUserId);
    res.redirect('/admin/settings?saved=1');
  } catch (err) {
    renderSettings(req, res, next, { saveError: err.message });
  }
});

router.post('/settings/test-connection', async (req, res, next) => {
  try {
    const result = await metaConfigService.testConnection(req.session.adminUserId);
    renderSettings(req, res, next, { connectionResult: result });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/check-permissions', async (req, res, next) => {
  try {
    const result = await metaConfigService.checkPermissions();
    renderSettings(req, res, next, { permissionResult: result });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/discover-phone-numbers', async (req, res, next) => {
  try {
    const numbers = await metaConfigService.discoverPhoneNumbers();
    renderSettings(req, res, next, { discoveredNumbers: numbers });
  } catch (err) {
    renderSettings(req, res, next, { discoverError: err.message });
  }
});

router.post('/settings/select-phone-number', async (req, res, next) => {
  try {
    await metaConfigService.selectPhoneNumber(req.body.phoneNumberId, req.session.adminUserId);
    res.redirect('/admin/settings?numberSelected=1');
  } catch (err) {
    renderSettings(req, res, next, { discoverError: err.message });
  }
});

module.exports = router;
