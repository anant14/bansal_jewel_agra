'use strict';

const express = require('express');
const config = require('../config');
const whatsapp = require('../services/whatsapp');
const enquiryStore = require('../services/enquiryStore');
const content = require('../services/content');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Meta WhatsApp Cloud API webhook.
 *
 * Configure in the Meta App dashboard → WhatsApp → Configuration:
 *   Callback URL:  {BASE_URL}/whatsapp/webhook
 *   Verify token:  value of WHATSAPP_VERIFY_TOKEN
 *   Subscribe to:  messages
 */

// 1. Verification handshake (GET)
router.get('/webhook', (req, res) => {
  const challenge = whatsapp.verifyWebhook(req.query);
  if (challenge) {
    logger.info('whatsapp: webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2. Event delivery (POST)
router.post('/webhook', async (req, res) => {
  if (!whatsapp.verifySignature(req.rawBody, req.get('x-hub-signature-256'))) {
    logger.warn('whatsapp: webhook signature mismatch');
    return res.sendStatus(401);
  }

  // Meta expects a fast 200; process asynchronously.
  res.sendStatus(200);

  try {
    const messages = whatsapp.parseIncoming(req.body);
    for (const message of messages) {
      await handleInbound(message);
    }
  } catch (err) {
    logger.error('whatsapp: webhook processing failed', err.message);
  }
});

async function handleInbound(message) {
  logger.info('whatsapp: inbound message', message.from, message.type);
  await enquiryStore.addInboundMessage(message);

  if (!config.whatsapp.autoReply || !whatsapp.isConfigured()) return;

  try {
    await whatsapp.markRead(message.id);
    const brand = content.brand;
    const reply =
      `Namaste 🙏 Thank you for messaging *${brand.name}*.\n\n` +
      `Our team is on it and will reply personally very soon. ` +
      `For anything urgent, call us at ${brand.phoneDisplay}.\n\n` +
      `— ${brand.name}, ${brand.addressShort} · ${brand.since}`;
    await whatsapp.sendText(message.from, reply);
  } catch (err) {
    logger.error('whatsapp: auto-reply failed', err.message);
  }
}

// Small status page for debugging the integration.
router.get('/status', (req, res) => {
  res.json({
    configured: whatsapp.isConfigured(),
    graphVersion: config.whatsapp.graphVersion,
    phoneNumberIdSet: Boolean(config.whatsapp.phoneNumberId),
    verifyTokenSet: Boolean(config.whatsapp.verifyToken),
    appSecretSet: Boolean(config.whatsapp.appSecret),
    autoReply: config.whatsapp.autoReply,
    webhookUrl: `${config.baseUrl}/whatsapp/webhook`,
  });
});

module.exports = router;
