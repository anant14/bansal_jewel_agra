'use strict';

const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const whatsapp = require('../services/whatsapp');
const content = require('../services/content');
const prisma = require('../db/prisma');
const whatsappAccountService = require('../services/whatsappAccountService');
const contactService = require('../services/contactService');
const conversationService = require('../services/conversationService');
const rateBot = require('../services/rateBot');
const rateDelivery = require('../services/rateDelivery');
const rateRequestService = require('../services/rateRequestService');
const logger = require('../utils/logger');

const router = express.Router();

// Opt-out keywords are matched as an exact, case-insensitive, trimmed
// match against the whole message body (not "contains"), so a customer
// saying "can you stop by" doesn't accidentally unsubscribe themselves.
const OPT_OUT_KEYWORDS = new Set(['stop', 'unsubscribe']);

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

  // Raw-payload audit log, deduped on the exact bytes Meta sent. This is
  // a debugging aid, NOT the idempotency mechanism for messages/statuses
  // themselves — those are protected by their own unique constraints
  // further down, since one POST can bundle multiple items.
  const eventId = crypto.createHash('sha256').update(req.rawBody || Buffer.from('')).digest('hex');
  let webhookEvent;
  try {
    webhookEvent = await prisma.webhookEvent.upsert({
      where: { eventId },
      update: {},
      create: { eventId, payload: req.body },
    });
  } catch (err) {
    logger.error('whatsapp: failed to log webhook event', err.message);
  }

  try {
    const account = await whatsappAccountService.getDefaultAccount();

    const messages = whatsapp.parseIncoming(req.body);
    for (const parsed of messages) {
      await handleInboundMessage(parsed, account);
    }

    const statuses = whatsapp.parseStatuses(req.body);
    for (const status of statuses) {
      await handleStatusUpdate(status);
    }

    if (webhookEvent) {
      await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { processedAt: new Date() } });
    }
  } catch (err) {
    logger.error('whatsapp: webhook processing failed', err.message);
    if (webhookEvent) {
      await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { error: err.message } }).catch(() => {});
    }
  }
});

async function handleInboundMessage(parsed, account) {
  logger.info('whatsapp: inbound message', parsed.from, parsed.type);

  const contact = await contactService.findOrCreateByPhone({
    whatsappNumber: parsed.from,
    name: parsed.name,
    source: 'whatsapp_lead',
  });

  const { message, isDuplicate } = await conversationService.recordInboundMessage({
    contact,
    whatsappAccount: account,
    parsed,
  });

  if (isDuplicate) {
    logger.info('whatsapp: duplicate webhook delivery ignored', parsed.id);
    return;
  }

  await contactService.touchInteraction(contact.id);

  const bodyText = (parsed.text || '').trim().toLowerCase();
  if (parsed.type === 'text' && OPT_OUT_KEYWORDS.has(bodyText)) {
    await contactService.setConsent(
      contact.id,
      { status: 'opted_out', source: 'whatsapp_stop_keyword', whatsappAccountId: account.id, rawPayload: parsed.raw },
      null
    );
    logger.info('whatsapp: contact opted out via keyword', contact.whatsappNumber);
    return; // STOP is terminal — no bot reply, no generic auto-reply
  }

  // Deterministic routing: a specialized intent (rate) takes priority
  // over, and suppresses, the generic auto-reply — never both.
  if (parsed.type === 'text') {
    const intent = rateBot.detectRateIntent(parsed.text);
    if (intent) {
      const handled = await handleRateIntent({ contact, account, intent, message });
      if (handled) return;
    }
  }

  if (!config.whatsapp.autoReply || !whatsapp.isConfigured()) return;

  try {
    await whatsapp.markRead(message.whatsappMessageId);
    const brand = content.brand;
    const reply =
      `Namaste 🙏 Thank you for messaging *${brand.name}*.\n\n` +
      `Our team is on it and will reply personally very soon. ` +
      `For anything urgent, call us at ${brand.phoneDisplay}.\n\n` +
      `— ${brand.name}, ${brand.addressShort} · ${brand.since}`;
    const sendResult = await whatsapp.sendText(contact.whatsappNumber, reply);
    await conversationService.recordOutboundMessage({ contact, whatsappAccount: account, text: reply, sendResult });
  } catch (err) {
    logger.error('whatsapp: auto-reply failed', err.message);
  }
}

/** Returns true if the rate bot fully handled this message (send attempted + logged either way). */
async function handleRateIntent({ contact, account, intent, message }) {
  try {
    await whatsapp.markRead(message.whatsappMessageId);
    const deliveryResult = await rateDelivery.sendRateMessage({
      contact,
      whatsappAccount: account,
      mode: 'bot',
      requestedType: intent,
      actorId: null,
    });
    await rateRequestService.recordRateRequest({
      contact,
      whatsappAccount: account,
      source: 'whatsapp_bot',
      requestedType: intent,
      marketingOptIn: false,
      deliveryResult,
      ipHash: null,
    });
    logger.info('whatsapp: rate bot replied', contact.whatsappNumber, intent, deliveryResult.status);
    return true;
  } catch (err) {
    logger.error('whatsapp: rate bot failed', err.message);
    return false;
  }
}

async function handleStatusUpdate(status) {
  const result = await conversationService.applyStatusUpdate({
    whatsappMessageId: status.whatsappMessageId,
    status: status.status,
    timestamp: status.timestamp,
    errorMessage: status.errorMessage,
    rawPayload: status.raw,
  });
  if (!result.updated) {
    logger.info('whatsapp: status update for unknown message', status.whatsappMessageId, status.status);
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
