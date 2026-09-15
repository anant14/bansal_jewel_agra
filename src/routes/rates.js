'use strict';

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../db/prisma');
const contactService = require('../services/contactService');
const whatsappAccountService = require('../services/whatsappAccountService');
const rateDelivery = require('../services/rateDelivery');
const rateRequestService = require('../services/rateRequestService');
const { normalizePhone, isValidPhone } = require('../utils/phone');
const logger = require('../utils/logger');

const router = express.Router();

// This is a public, unauthenticated endpoint (same pattern as the
// existing /api/enquiries) — there's no session/cookie ambient authority
// for a CSRF token to protect, so abuse is bounded instead by rate
// limiting, per-contact cooldown, and the site's same-origin CSP
// (form-action 'self'), matching how /api/enquiries is already protected.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again later.' },
});

const COOLDOWN_MS = 5 * 60 * 1000;

router.post('/whatsapp-request', limiter, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 100);
    const marketingOptIn = req.body.marketingOptIn === true || req.body.marketingOptIn === 'true';

    if (!isValidPhone(req.body.whatsappNumber)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid WhatsApp number.' });
    }
    const normalized = normalizePhone(req.body.whatsappNumber);

    const contact = await contactService.findOrCreateByPhone({
      whatsappNumber: normalized,
      name: name || undefined,
      source: 'website_gold_rate',
    });

    // Per-contact cooldown, independent of the per-IP limiter above —
    // stops the same number being messaged repeatedly regardless of
    // which device/IP is submitting the form.
    const recent = await prisma.rateRequest.findFirst({
      where: { contactId: contact.id, createdAt: { gte: new Date(Date.now() - COOLDOWN_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      return res.json({
        ok: true,
        delivered: false,
        message: "You've already requested today's rate recently — please check your WhatsApp, or try again shortly.",
      });
    }

    // Mandatory: permission to send the ONE requested rate reply. Never
    // implies marketing consent on its own.
    await contactService.setConsent(
      contact.id,
      { status: 'opted_in', source: 'website_gold_rate', purpose: 'service_rate_request' },
      null
    );
    // Optional: only recorded if the visitor explicitly ticked the box.
    if (marketingOptIn) {
      await contactService.setConsent(
        contact.id,
        { status: 'opted_in', source: 'website_gold_rate', purpose: 'marketing' },
        null
      );
    }

    const account = await whatsappAccountService.getDefaultAccount();
    const deliveryResult = await rateDelivery.sendRateMessage({
      contact,
      whatsappAccount: account,
      mode: 'website',
      requestedType: 'all',
      actorId: null,
    });

    const ipHash = crypto.createHash('sha256').update(String(req.ip || '')).digest('hex');
    await rateRequestService.recordRateRequest({
      contact,
      whatsappAccount: account,
      source: 'website',
      requestedType: 'all',
      marketingOptIn,
      deliveryResult,
      ipHash,
    });

    res.json({
      ok: true,
      delivered: deliveryResult.delivered,
      message: deliveryResult.delivered
        ? "Today's rates have been sent to your WhatsApp."
        : "Your request has been received. We're currently unable to send the WhatsApp message automatically — our team will follow up.",
    });
  } catch (err) {
    logger.error('rates: whatsapp-request failed', err.message);
    // TEMPORARY diagnostic while verifying Phase 2 end-to-end.
    res.status(500).json({ ok: false, error: 'Something went wrong. Please try again or contact us directly.', debug: err.message, stack: err.stack });
  }
});

module.exports = router;
