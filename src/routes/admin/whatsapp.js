'use strict';

const express = require('express');
const content = require('../../services/content');
const whatsapp = require('../../services/whatsapp');
const whatsappAccountService = require('../../services/whatsappAccountService');
const conversationService = require('../../services/conversationService');
const logger = require('../../utils/logger');
const NAV = require('./nav');

const router = express.Router();

/* ───────────────────────────── page ───────────────────────────────── */

router.get('/whatsapp', (req, res) => {
  res.render('admin/whatsapp', {
    page: { title: `WhatsApp Inbox — ${content.brand.name}` },
    brand: content.brand,
    nav: NAV,
    activeKey: 'whatsapp',
    adminName: req.session.adminName,
    whatsappConfigured: whatsapp.isConfigured(),
  });
});

/* ───────────────────────────── JSON API ─────────────────────────────── */

router.get('/api/whatsapp/conversations', async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const result = await conversationService.listConversations({ status, search, page, pageSize: 50 });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/api/whatsapp/conversations/:id', async (req, res, next) => {
  try {
    const conversation = await conversationService.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'not_found' });
    res.json(conversation);
  } catch (err) {
    next(err);
  }
});

router.get('/api/whatsapp/conversations/:id/messages', async (req, res, next) => {
  try {
    const messages = await conversationService.getConversationMessages(req.params.id);
    await conversationService.markConversationRead(req.params.id);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

router.post('/api/whatsapp/conversations/:id/messages', async (req, res, next) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text_required' });

    const conversation = await conversationService.getConversationById(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'not_found' });

    const account = await whatsappAccountService.getDefaultAccount();
    let sendResult;
    try {
      sendResult = await whatsapp.sendText(conversation.contact.whatsappNumber, text);
    } catch (err) {
      logger.error('admin/whatsapp: send failed', err.message);
      sendResult = { skipped: true, error: err.message };
    }

    const { message } = await conversationService.recordOutboundMessage({
      contact: conversation.contact,
      whatsappAccount: account,
      text,
      actorId: req.session.adminUserId,
      sendResult,
    });

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

router.post('/api/whatsapp/conversations/:id/status', async (req, res, next) => {
  try {
    const conversation = await conversationService.setConversationStatus(req.params.id, req.body.status);
    res.json(conversation);
  } catch (err) {
    next(err);
  }
});

// Streams inbound media (photos customers send) without ever exposing the
// Meta access token to the browser — the token stays server-side here.
router.get('/api/whatsapp/media/:mediaId', async (req, res, next) => {
  try {
    const { mimeType, buffer } = await whatsapp.fetchMedia(req.params.mediaId);
    res.set('Content-Type', mimeType || 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) {
    logger.error('admin/whatsapp: media fetch failed', err.message);
    res.status(502).json({ error: 'media_unavailable' });
  }
});

router.use('/api/whatsapp', (err, req, res, next) => { // eslint-disable-line no-unused-vars
  logger.error('admin/whatsapp api: request failed', err.message);
  res.status(500).json({ error: 'server_error' });
});

module.exports = router;
