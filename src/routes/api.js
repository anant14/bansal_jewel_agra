'use strict';

const express = require('express');
const config = require('../config');
const content = require('../services/content');
const whatsapp = require('../services/whatsapp');
const enquiryStore = require('../services/enquiryStore');
const logger = require('../utils/logger');

const router = express.Router();

const ENQUIRY_TYPES = new Set(['product', 'bespoke', 'wholesale', 'general', 'appointment']);

/* ─────────────────── read-only content API ─────────────────── */

router.get('/brand', (req, res) => res.json(content.brand));

router.get('/products', (req, res) => {
  const { category } = req.query;
  res.json(content.productsByCategory(category));
});

router.get('/products/:sku', (req, res) => {
  const product = content.findProduct(req.params.sku);
  if (!product) return res.status(404).json({ error: 'not_found' });
  res.json(product);
});

router.get('/reviews', (req, res) => {
  res.json({ summary: content.reviewSummary(), items: content.reviews });
});

/* ─────────────────────── enquiry intake ────────────────────── */

function validateEnquiry(body) {
  const errors = [];
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  let type = String(body.type || 'general').trim().toLowerCase();

  if (!ENQUIRY_TYPES.has(type)) type = 'general';
  if (name.length < 2) errors.push('A name is required.');
  if (phone.replace(/[^\d]/g, '').length < 8) errors.push('A valid phone number is required.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('That email address looks invalid.');
  if (message.length > 2000) errors.push('Message is too long.');

  // Honeypot: bots fill hidden fields.
  if (body.company) errors.push('spam');

  return {
    errors,
    value: {
      type,
      name,
      phone,
      email: email || null,
      message: message || null,
      productSku: body.productSku ? String(body.productSku).trim() : null,
      productName: body.productName ? String(body.productName).trim() : null,
      source: 'website',
    },
  };
}

function customerMessage(enquiry) {
  if (enquiry.type === 'product' && enquiry.productName) {
    return `Hello Bansal Jewellers, I'm interested in "${enquiry.productName}"${
      enquiry.productSku ? ` (${enquiry.productSku})` : ''
    }. ${enquiry.message || 'Please share details, price and availability.'}`;
  }
  if (enquiry.type === 'wholesale') {
    return `Hello Bansal Jewellers, I am a retailer interested in wholesale supply. ${
      enquiry.message || 'Please share your wholesale catalogue and terms.'
    }`;
  }
  if (enquiry.type === 'bespoke') {
    return `Hello Bansal Jewellers, I would like to start a bespoke jewellery enquiry. ${
      enquiry.message || 'Here is my idea:'
    }`;
  }
  if (enquiry.type === 'appointment') {
    return `Hello Bansal Jewellers, I would like to book a showroom appointment. ${enquiry.message || ''}`.trim();
  }
  return enquiry.message
    ? `Hello Bansal Jewellers, ${enquiry.message}`
    : content.brand.whatsappDefaultMessage;
}

router.post('/enquiries', async (req, res) => {
  const { errors, value } = validateEnquiry(req.body || {});
  if (errors.length) {
    if (errors.includes('spam')) return res.status(200).json({ ok: true }); // silently swallow bots
    return res.status(422).json({ ok: false, errors });
  }

  let record;
  try {
    record = await enquiryStore.addEnquiry(value);
  } catch (err) {
    logger.error('api: failed to store enquiry', err.message);
    return res.status(500).json({ ok: false, errors: ['Could not save your enquiry. Please WhatsApp us directly.'] });
  }

  // Fire-and-forget: alert the shop over the Cloud API when it's live.
  whatsapp.notifyBusiness(record).catch((err) => logger.error('api: notifyBusiness', err.message));

  const waMessage = customerMessage(record);
  res.status(201).json({
    ok: true,
    id: record.id,
    whatsappUrl: content.waLink(waMessage),
    whatsappLive: config.whatsapp.isConfigured,
    message: 'Thank you — our team will contact you shortly. You can also continue on WhatsApp.',
  });
});

module.exports = router;
