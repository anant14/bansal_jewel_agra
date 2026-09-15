'use strict';

const express = require('express');
const requireAdmin = require('../../middleware/requireAdmin');
const content = require('../../services/content');
const authRouter = require('./auth');
const contactsRouter = require('./contacts');
const whatsappRouter = require('./whatsapp');
const ratesRouter = require('./rates');
const templatesRouter = require('./templates');
const mediaRouter = require('./media');
const NAV = require('./nav');

const router = express.Router();

router.use(authRouter); // /admin/login, /admin/logout — public

router.use(requireAdmin); // everything below requires a session

function renderStub(activeKey, title, blurb) {
  return (req, res) => {
    res.render('admin/stub', {
      page: { title: `${title} — Admin` },
      brand: content.brand,
      nav: NAV,
      activeKey,
      adminName: req.session.adminName,
      title,
      blurb,
    });
  };
}

router.get('/', (req, res) => res.redirect('/admin/whatsapp'));

router.use(whatsappRouter); // /admin/whatsapp + /admin/api/whatsapp/*
router.use(contactsRouter); // /admin/contacts + /admin/api/contacts/*
router.use(ratesRouter); // /admin/rates + /admin/rates/update
router.use(templatesRouter); // /admin/templates + /admin/templates/*
router.use(mediaRouter); // /admin/media + /admin/api/media

router.get(
  '/campaigns',
  renderStub('campaigns', 'Campaigns', 'Campaign builder, audience targeting, queue and analytics — Phase 4.')
);
router.get(
  '/automations',
  renderStub('automations', 'Automations', 'Keyword bot and rule-based automation — Phase 5.')
);
router.get(
  '/bot-flow',
  renderStub('botflow', 'Bot Flow', 'Visual/rule-based automation flow builder — Phase 5.')
);
router.get(
  '/ai-assistant',
  renderStub('ai', 'AI Assistant', 'Configurable AI assistant with human handoff — Phase 6.')
);
router.get(
  '/reports',
  renderStub('reports', 'Reports', 'Messaging, campaign, template and agent analytics — Phase 7.')
);
router.get('/logs', renderStub('logs', 'Logs', 'Webhook, API, campaign and automation logs — Phase 7.'));
router.get(
  '/settings',
  renderStub(
    'settings',
    'Settings',
    'Meta app, WABA, phone numbers, AI and consent configuration — added as each phase needs it.'
  )
);

module.exports = router;
