'use strict';

const config = require('../config');
const whatsapp = require('./whatsapp');
const rateService = require('./rateService');
const conversationService = require('./conversationService');
const templateService = require('./templateService');
const logger = require('../utils/logger');

/**
 * Sends today's rate (or a safe fallback if it's missing/stale) to a
 * contact, through whichever mechanism is actually permitted:
 *
 * - mode 'bot': a reply to an inbound WhatsApp message — inside the open
 *   customer-service window, so free-form text is allowed.
 * - mode 'website': business-initiated, no open window — Meta requires an
 *   approved template. If one isn't configured, this NEVER fakes success;
 *   it records the honest attempt and reports pending_configuration.
 *
 * Every branch persists through conversationService.recordOutboundMessage
 * — no message persistence is duplicated here.
 */
async function sendRateMessage({ contact, whatsappAccount, mode, requestedType = 'all', actorId = null }) {
  const currentRates = await rateService.getCurrentRates();
  const isCurrent = rateService.allCurrentFor(currentRates, requestedType);

  if (!isCurrent) {
    const text = rateService.getFallbackMessage();
    let sendResult = { skipped: true, error: 'Rate not sent as today\'s rate — fallback message only.' };
    if (mode === 'bot') {
      try {
        sendResult = await whatsapp.sendText(contact.whatsappNumber, text);
      } catch (err) {
        sendResult = { skipped: true, error: err.message };
      }
    }
    const { message } = await conversationService.recordOutboundMessage({
      contact, whatsappAccount, text, actorId, sendResult,
    });
    return { delivered: false, status: 'rate_missing', message, rates: currentRates, textSent: text };
  }

  const text = rateService.formatRateMessage(currentRates, requestedType);

  if (mode === 'bot') {
    let sendResult;
    try {
      sendResult = await whatsapp.sendText(contact.whatsappNumber, text);
    } catch (err) {
      logger.error('rateDelivery: bot send failed', err.message);
      sendResult = { skipped: true, error: err.message };
    }
    const { message } = await conversationService.recordOutboundMessage({
      contact, whatsappAccount, text, actorId, sendResult,
    });
    return {
      delivered: Boolean(sendResult && !sendResult.skipped),
      status: message.status,
      message,
      rates: currentRates,
      textSent: text,
    };
  }

  // mode === 'website' — business-initiated, needs an approved template.
  // Resolved through the real Template Manager (Phase 3) — no hard-coded
  // variable order lives here anymore. The template itself is looked up
  // by name (config.whatsapp.rateTemplateName), and only used if Meta has
  // actually approved it; the local record is never trusted otherwise.
  const template = await templateService.getApprovedTemplateByName(config.whatsapp.rateTemplateName);
  if (!whatsapp.isConfigured() || !template) {
    const { message } = await conversationService.recordOutboundMessage({
      contact, whatsappAccount, text, actorId,
      sendResult: { skipped: true, error: 'The gold/silver rate WhatsApp template is not approved/configured yet.' },
    });
    return { delivered: false, status: 'pending_configuration', message, rates: currentRates, textSent: text };
  }

  let values;
  try {
    values = await templateService.resolveTemplate(template.id, contact);
  } catch (err) {
    // Should be rare here (allCurrentFor already checked), but never send
    // a template with an unresolved/stale variable value.
    logger.error('rateDelivery: template variable resolution failed', err.message);
    const { message } = await conversationService.recordOutboundMessage({
      contact, whatsappAccount, text, actorId,
      sendResult: { skipped: true, error: err.message },
    });
    return { delivered: false, status: 'rate_missing', message, rates: currentRates, textSent: text };
  }

  const message = await templateService.sendTemplateToContact(template, contact, whatsappAccount, values, actorId);
  return {
    delivered: message.status === 'sent',
    status: message.status,
    message,
    rates: currentRates,
    textSent: text,
  };
}

module.exports = { sendRateMessage };
