'use strict';

const express = require('express');
const requireAdmin = require('../../middleware/requireAdmin');
const content = require('../../services/content');
const authRouter = require('./auth');

const router = express.Router();

router.use(authRouter); // /admin/login, /admin/logout — public

router.use(requireAdmin); // everything below requires a session

const NAV = [
  { key: 'whatsapp', label: 'WhatsApp', href: '/admin/whatsapp' },
  { key: 'contacts', label: 'Contacts', href: '/admin/contacts' },
  { key: 'templates', label: 'Templates', href: '/admin/templates' },
  { key: 'media', label: 'Media Library', href: '/admin/media' },
  { key: 'campaigns', label: 'Campaigns', href: '/admin/campaigns' },
  { key: 'automations', label: 'Automations', href: '/admin/automations' },
  { key: 'botflow', label: 'Bot Flow', href: '/admin/bot-flow' },
  { key: 'rates', label: 'Gold & Silver Rates', href: '/admin/rates' },
  { key: 'ai', label: 'AI Assistant', href: '/admin/ai-assistant' },
  { key: 'reports', label: 'Reports', href: '/admin/reports' },
  { key: 'logs', label: 'Logs', href: '/admin/logs' },
  { key: 'settings', label: 'Settings', href: '/admin/settings' },
];

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

router.get(
  '/whatsapp',
  renderStub(
    'whatsapp',
    'WhatsApp Inbox',
    'The real, database-backed inbox (conversations, statuses, assignment, labels) lands in the next phase. This page is Phase 0 — foundation, auth and navigation only.'
  )
);
router.get(
  '/contacts',
  renderStub('contacts', 'Contacts', 'CRM contact list, tags, notes and consent status — Phase 1.')
);
router.get(
  '/templates',
  renderStub('templates', 'Templates', 'Meta message template manager and jewellery presets — Phase 3.')
);
router.get(
  '/media',
  renderStub('media', 'Media Library', 'Reusable image/video/document library for campaigns and templates — Phase 3.')
);
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
  '/rates',
  renderStub(
    'rates',
    'Gold & Silver Rates',
    'Rate entry, history, and the website "Get Today\'s Rate on WhatsApp" flow — Phase 2.'
  )
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
