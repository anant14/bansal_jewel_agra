'use strict';

const express = require('express');
const content = require('../../services/content');
const config = require('../../config');
const whatsapp = require('../../services/whatsapp');
const templateService = require('../../services/templateService');
const mediaService = require('../../services/mediaService');
const whatsappAccountService = require('../../services/whatsappAccountService');
const contactService = require('../../services/contactService');
const { isValidPhone, normalizePhone } = require('../../utils/phone');
const NAV = require('./nav');

const router = express.Router();

function metaConfigStatus() {
  return {
    wabaConfigured: Boolean(config.whatsapp.businessAccountId),
    phoneNumberConfigured: Boolean(config.whatsapp.phoneNumberId),
    tokenConfigured: Boolean(config.whatsapp.token),
    syncAvailable: whatsapp.isBusinessManagementConfigured(),
  };
}

router.get('/templates', async (req, res, next) => {
  try {
    const { search, status, category, language } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const result = await templateService.listLocalTemplates({ search, status, category, language, page, pageSize: 25 });

    res.render('admin/templates', {
      page: { title: 'Templates — Admin' },
      brand: content.brand,
      nav: NAV,
      activeKey: 'templates',
      adminName: req.session.adminName,
      result,
      filters: { search: search || '', status: status || '', category: category || '', language: language || '' },
      metaConfig: metaConfigStatus(),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/templates/new', async (req, res, next) => {
  try {
    const media = await mediaService.listMedia({ pageSize: 100 });
    res.render('admin/template-new', {
      page: { title: 'New Template — Admin' },
      brand: content.brand,
      nav: NAV,
      activeKey: 'templates',
      adminName: req.session.adminName,
      variableSources: templateService.VARIABLE_SOURCES,
      mediaAssets: media.assets,
      error: null,
      formValues: {},
    });
  } catch (err) {
    next(err);
  }
});

router.post('/templates', async (req, res, next) => {
  try {
    const b = req.body;
    const variables = [];
    for (let i = 1; i <= 5; i += 1) {
      const source = b[`var_source_${i}`];
      const example = b[`var_example_${i}`];
      if (source) variables.push({ position: i, source, example });
    }
    const buttons = [];
    for (let i = 1; i <= 3; i += 1) {
      const type = b[`button_type_${i}`];
      if (!type) continue;
      buttons.push({ type, text: b[`button_text_${i}`], url: b[`button_url_${i}`], phoneNumber: b[`button_phone_${i}`] });
    }

    const account = await whatsappAccountService.getDefaultAccount();
    const template = await templateService.createTemplate(
      {
        name: (b.name || '').trim(),
        category: b.category,
        language: b.language,
        headerType: b.headerType || 'none',
        headerText: b.headerText || null,
        headerMediaId: b.headerMediaId || null,
        bodyText: b.bodyText || '',
        footerText: b.footerText || null,
        buttons,
        variables,
      },
      account.id,
      req.session.adminUserId
    );
    res.redirect(`/admin/templates/${template.id}`);
  } catch (err) {
    if (err.message && !err.message.startsWith('Unknown')) {
      const media = await mediaService.listMedia({ pageSize: 100 });
      return res.status(400).render('admin/template-new', {
        page: { title: 'New Template — Admin' },
        brand: content.brand,
        nav: NAV,
        activeKey: 'templates',
        adminName: req.session.adminName,
        variableSources: templateService.VARIABLE_SOURCES,
        mediaAssets: media.assets,
        error: err.message,
        formValues: req.body,
      });
    }
    next(err);
  }
});

router.get('/templates/:id', async (req, res, next) => {
  try {
    const template = await templateService.getTemplate(req.params.id);
    if (!template) return res.status(404).render('admin/stub', {
      page: { title: 'Template not found — Admin' }, brand: content.brand, nav: NAV, activeKey: 'templates',
      adminName: req.session.adminName, title: 'Template not found', blurb: 'This template does not exist.',
    });
    res.render('admin/template-detail', {
      page: { title: `${template.name} — Templates — Admin` },
      brand: content.brand,
      nav: NAV,
      activeKey: 'templates',
      adminName: req.session.adminName,
      template,
      metaConfig: metaConfigStatus(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/templates/sync', async (req, res, next) => {
  try {
    const account = await whatsappAccountService.getDefaultAccount();
    const result = await templateService.syncFromMeta(account.id, req.session.adminUserId);
    res.redirect(`/admin/templates?synced=${result.created}-${result.updated}`);
  } catch (err) {
    res.status(400).send(`Sync failed: ${err.message} <a href="/admin/templates">Go back</a>`);
  }
});

router.post('/templates/:id/submit', async (req, res, next) => {
  try {
    await templateService.submitToMeta(req.params.id, req.session.adminUserId);
    res.redirect(`/admin/templates/${req.params.id}`);
  } catch (err) {
    res.status(400).send(`Submission failed: ${err.message} <a href="/admin/templates/${req.params.id}">Go back</a>`);
  }
});

router.post('/templates/:id/refresh', async (req, res, next) => {
  try {
    await templateService.refreshTemplateStatus(req.params.id, req.session.adminUserId);
    res.redirect(`/admin/templates/${req.params.id}`);
  } catch (err) {
    res.status(400).send(`Refresh failed: ${err.message} <a href="/admin/templates/${req.params.id}">Go back</a>`);
  }
});

router.post('/templates/:id/test-send', async (req, res, next) => {
  try {
    const template = await templateService.getTemplate(req.params.id);
    if (!template || template.status !== 'approved') {
      return res.status(400).send('Only an approved template may be test-sent. <a href="javascript:history.back()">Go back</a>');
    }
    if (!isValidPhone(req.body.testNumber)) {
      return res.status(400).send('Enter a valid WhatsApp number. <a href="javascript:history.back()">Go back</a>');
    }
    const number = normalizePhone(req.body.testNumber);
    const contact = await contactService.findOrCreateByPhone({ whatsappNumber: number, source: 'manual' });
    const account = await whatsappAccountService.getDefaultAccount();

    const values = (template.variablesJson || []).sort((a, b) => a.position - b.position).map((v, i) => {
      const override = req.body[`test_value_${i + 1}`];
      return override && override.trim() ? override.trim() : v.example || '';
    });

    await templateService.sendTemplateToContact(template, contact, account, values, req.session.adminUserId);
    res.redirect(`/admin/templates/${req.params.id}?testSent=1`);
  } catch (err) {
    res.status(400).send(`Test send failed: ${err.message} <a href="/admin/templates/${req.params.id}">Go back</a>`);
  }
});

module.exports = router;
