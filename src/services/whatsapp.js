'use strict';

const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

const WA = config.whatsapp;
const GRAPH = `https://graph.facebook.com/${WA.graphVersion}`;

/* ───────────────────────── outbound ───────────────────────── */

function isConfigured() {
  return WA.isConfigured;
}

async function graphPost(pathname, body) {
  if (!isConfigured()) {
    logger.warn('whatsapp: Cloud API not configured — outbound message skipped');
    return { skipped: true };
  }

  const res = await fetch(`${GRAPH}/${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('whatsapp: Graph API error', res.status, JSON.stringify(data));
    const err = new Error(`WhatsApp Graph API ${res.status}`);
    err.details = data;
    throw err;
  }
  return data;
}

/** Send a plain text message to a WhatsApp user (E.164 digits, no +). */
function sendText(to, body, { previewUrl = false } = {}) {
  return graphPost(`${WA.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(to).replace(/[^\d]/g, ''),
    type: 'text',
    text: { preview_url: previewUrl, body },
  });
}

/**
 * Send a pre-approved message template. Use this to message a user
 * outside the 24-hour customer-service window.
 */
function sendTemplate(to, templateName, languageCode = 'en_US', components = []) {
  return graphPost(`${WA.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: String(to).replace(/[^\d]/g, ''),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {}),
    },
  });
}

function markRead(messageId) {
  return graphPost(`${WA.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  });
}

/**
 * Notify the shop about a website enquiry. Falls back to brand.phoneRaw
 * when WHATSAPP_NOTIFY_TO is not set. No-ops safely when unconfigured.
 */
async function notifyBusiness(enquiry) {
  const content = require('./content');
  const to = WA.notifyTo || content.brand.phoneRaw;
  if (!to) return { skipped: true };

  const lines = [
    '🔔 *New website enquiry — Bansal Jewellers*',
    `*Type:* ${enquiry.type}`,
    `*Name:* ${enquiry.name}`,
    `*Phone:* ${enquiry.phone}`,
    enquiry.email ? `*Email:* ${enquiry.email}` : null,
    enquiry.productName ? `*Product:* ${enquiry.productName} (${enquiry.productSku || '-'})` : null,
    enquiry.message ? `*Message:* ${enquiry.message}` : null,
    `*Received:* ${new Date(enquiry.createdAt).toLocaleString('en-IN')}`,
  ].filter(Boolean);

  try {
    return await sendText(to, lines.join('\n'));
  } catch (err) {
    logger.error('whatsapp: notifyBusiness failed', err.message);
    return { error: true };
  }
}

/* ───────────────────────── webhook ───────────────────────── */

/**
 * GET verification handshake. Returns the challenge string to echo,
 * or null when the token does not match.
 */
function verifyWebhook(query) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token === WA.verifyToken) return challenge;
  return null;
}

/**
 * Validate the X-Hub-Signature-256 header against the raw request body.
 * Returns true when no app secret is configured (verification disabled).
 */
function verifySignature(rawBody, signatureHeader) {
  if (!WA.appSecret) return true;
  if (!rawBody || !signatureHeader) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', WA.appSecret).update(rawBody).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'];

function extractMedia(msg) {
  if (!MEDIA_TYPES.includes(msg.type)) return null;
  const obj = msg[msg.type];
  if (!obj) return null;
  return {
    id: obj.id || null,
    mimeType: obj.mime_type || null,
    caption: obj.caption || null,
    filename: obj.filename || null,
  };
}

/** Flatten an incoming webhook payload into a list of message objects. */
function parseIncoming(payload) {
  const out = [];
  const entries = Array.isArray(payload && payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change.value || {};
      const contacts = value.contacts || [];
      const messages = value.messages || [];
      for (const msg of messages) {
        const contact = contacts.find((c) => c.wa_id === msg.from) || contacts[0];
        out.push({
          id: msg.id,
          from: msg.from,
          name: contact && contact.profile ? contact.profile.name : null,
          timestamp: msg.timestamp,
          type: msg.type,
          text: msg.text ? msg.text.body : null,
          media: extractMedia(msg),
          contextId: msg.context ? msg.context.id : null,
          raw: msg,
        });
      }
    }
  }
  return out;
}

/** Flatten an incoming webhook payload into a list of status update objects. */
function parseStatuses(payload) {
  const out = [];
  const entries = Array.isArray(payload && payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const statuses = (change.value || {}).statuses || [];
      for (const status of statuses) {
        out.push({
          whatsappMessageId: status.id,
          status: status.status, // sent | delivered | read | failed
          timestamp: status.timestamp,
          recipientId: status.recipient_id,
          errorMessage:
            Array.isArray(status.errors) && status.errors[0]
              ? status.errors[0].title || status.errors[0].message
              : null,
          raw: status,
        });
      }
    }
  }
  return out;
}

/** Fetch a media object's temporary download URL, then stream its bytes back. */
async function fetchMedia(mediaId) {
  if (!isConfigured()) throw new Error('WhatsApp Cloud API is not configured.');

  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${WA.token}` },
  });
  if (!metaRes.ok) throw new Error(`Failed to resolve media (${metaRes.status})`);
  const meta = await metaRes.json();

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${WA.token}` } });
  if (!fileRes.ok) throw new Error(`Failed to download media (${fileRes.status})`);

  return { mimeType: meta.mime_type, buffer: Buffer.from(await fileRes.arrayBuffer()) };
}

module.exports = {
  isConfigured,
  sendText,
  sendTemplate,
  markRead,
  notifyBusiness,
  verifyWebhook,
  verifySignature,
  parseIncoming,
  parseStatuses,
  fetchMedia,
};
