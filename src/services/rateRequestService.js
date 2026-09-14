'use strict';

const prisma = require('../db/prisma');
const contactService = require('./contactService');
const timeline = require('./timelineService');

/**
 * Shared bookkeeping for a rate request, called identically from the
 * website endpoint and the WhatsApp bot — tags, the reporting log row,
 * and timeline events, so neither caller reimplements this.
 */
async function recordRateRequest({ contact, whatsappAccount, source, requestedType, marketingOptIn, deliveryResult, ipHash }) {
  if (source === 'website') {
    await contactService.addTag(contact.id, 'Website Rate Lead', null);
  }
  if (requestedType === 'gold' || requestedType === 'all' || requestedType === 'both') {
    await contactService.addTag(contact.id, 'Gold Rate Enquiry', null);
  }
  if (requestedType === 'silver' || requestedType === 'all' || requestedType === 'both') {
    await contactService.addTag(contact.id, 'Silver Rate Enquiry', null);
  }
  // Marketing/subscriber tags only ever follow real marketing consent —
  // never just because a rate was requested.
  if (marketingOptIn) {
    if (requestedType === 'gold' || requestedType === 'all' || requestedType === 'both') {
      await contactService.addTag(contact.id, 'Gold Rate Subscriber', null);
    }
    if (requestedType === 'silver' || requestedType === 'all' || requestedType === 'both') {
      await contactService.addTag(contact.id, 'Silver Rate Subscriber', null);
    }
  }

  const rateRequest = await prisma.rateRequest.create({
    data: {
      contactId: contact.id,
      whatsappAccountId: whatsappAccount ? whatsappAccount.id : null,
      source,
      requestedType,
      rateSnapshot: deliveryResult.rates.map((r) => ({
        code: r.rateType.code,
        displayName: r.rateType.displayName,
        unit: r.rateType.unit,
        value: r.entry ? String(r.entry.value) : null,
        status: r.status,
      })),
      marketingOptIn: Boolean(marketingOptIn),
      deliveryStatus: deliveryResult.status === 'sent' || deliveryResult.delivered ? 'sent'
        : deliveryResult.status === 'rate_missing' ? 'rate_missing'
        : deliveryResult.status === 'pending_configuration' ? 'pending_configuration'
        : 'failed',
      messageId: deliveryResult.message ? deliveryResult.message.id : null,
      ipHash: ipHash || null,
    },
  });

  await timeline.logEvent({
    contactId: contact.id,
    action: 'rate_requested',
    entity: 'rate_request',
    entityId: rateRequest.id,
    meta: { source, requestedType },
  });

  await timeline.logEvent({
    contactId: contact.id,
    action: deliveryResult.delivered ? 'rate_sent' : deliveryResult.status === 'rate_missing' ? 'rate_missing' : 'rate_delivery_failed',
    entity: 'message',
    entityId: deliveryResult.message ? deliveryResult.message.id : null,
    meta: { source, status: deliveryResult.status },
  });

  if (marketingOptIn) {
    await timeline.logEvent({
      contactId: contact.id,
      action: 'marketing_optin_from_rate_form',
      entity: 'contact',
      entityId: contact.id,
      meta: { source },
    });
  }

  return rateRequest;
}

module.exports = { recordRateRequest };
