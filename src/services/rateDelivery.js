'use strict';

const config = require('../config');
const whatsapp = require('./whatsapp');
const rateService = require('./rateService');
const conversationService = require('./conversationService');
const logger = require('../utils/logger');

/**
 * Builds the Meta template body-parameter components for the
 * `today_gold_silver_rate` template. The exact variable order must match
 * whatever gets approved in Meta Business Manager — this is a reasonable
 * default (date, then each active rate type's formatted value) that will
 * likely need adjusting once the real template exists (see Phase 2 report).
 */
function buildTemplateComponents(currentRates) {
  const dateLabel = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const params = [{ type: 'text', text: dateLabel }].concat(
    currentRates.map((r) => ({
      type: 'text',
      text: `₹${Number(r.entry.value).toLocaleString('en-IN')} / ${r.rateType.unit}`,
    }))
  );
  return [{ type: 'body', parameters: params }];
}

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
  if (!config.whatsapp.isConfigured() || !config.whatsapp.rateTemplateName) {
    const { message } = await conversationService.recordOutboundMessage({
      contact, whatsappAccount, text, actorId,
      sendResult: { skipped: true, error: 'WhatsApp rate template is not configured yet.' },
    });
    return { delivered: false, status: 'pending_configuration', message, rates: currentRates, textSent: text };
  }

  let sendResult;
  try {
    sendResult = await whatsapp.sendTemplate(
      contact.whatsappNumber,
      config.whatsapp.rateTemplateName,
      config.whatsapp.rateTemplateLang,
      buildTemplateComponents(currentRates)
    );
  } catch (err) {
    logger.error('rateDelivery: website template send failed', err.message);
    sendResult = { skipped: true, error: err.message };
  }
  const { message } = await conversationService.recordOutboundMessage({
    contact, whatsappAccount, text, actorId, sendResult,
    type: 'template', templateName: config.whatsapp.rateTemplateName,
  });
  return {
    delivered: Boolean(sendResult && !sendResult.skipped),
    status: message.status,
    message,
    rates: currentRates,
    textSent: text,
  };
}

module.exports = { sendRateMessage };
