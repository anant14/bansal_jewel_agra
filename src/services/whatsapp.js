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

/* ───────────────────────── template management ───────────────────────── */
// Meta's WhatsApp Business Management API for templates lives at the WABA
// level (not per phone number) — https://graph.facebook.com/{v}/{waba-id}/message_templates.

function isBusinessManagementConfigured() {
  return Boolean(WA.token && WA.businessAccountId);
}

async function graphGet(pathname) {
  const res = await fetch(`${GRAPH}/${pathname}`, {
    headers: { Authorization: `Bearer ${WA.token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('whatsapp: Graph API GET error', res.status, JSON.stringify(data));
    const err = new Error(`WhatsApp Graph API ${res.status}`);
    err.details = data;
    throw err;
  }
  return data;
}

/** Creates a template on Meta. Returns Meta's response — a new template id and status (typically PENDING). */
function createMetaTemplate(payload) {
  if (!isBusinessManagementConfigured()) throw new Error('WhatsApp Business Account is not configured.');
  return graphPostRaw(`${WA.businessAccountId}/message_templates`, payload);
}

/** Same as graphPost, but usable even when isConfigured() (phone-number send config) is false — template management only needs the token + WABA id. */
async function graphPostRaw(pathname, body) {
  const res = await fetch(`${GRAPH}/${pathname}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('whatsapp: Graph API error', res.status, JSON.stringify(data));
    const err = new Error((data.error && data.error.message) || `WhatsApp Graph API ${res.status}`);
    err.details = data;
    throw err;
  }
  return data;
}

/** Lists all templates for the configured WABA, following pagination. */
async function listMetaTemplates() {
  if (!isBusinessManagementConfigured()) throw new Error('WhatsApp Business Account is not configured.');
  const templates = [];
  let next = `${WA.businessAccountId}/message_templates?limit=100`;
  let guard = 0;
  while (next && guard < 20) {
    const page = await graphGet(next);
    templates.push(...(page.data || []));
    // Meta's paging.next is a full URL; we follow it via our own cursor
    // param instead, so every request still goes through our GRAPH base.
    const hasNext = page.paging && page.paging.next && page.paging.cursors && page.paging.cursors.after;
    next = hasNext ? `${WA.businessAccountId}/message_templates?limit=100&after=${page.paging.cursors.after}` : null;
    guard += 1;
  }
  return templates;
}

/** Fetches a single template's current state directly by its Meta template id. */
function getMetaTemplate(metaTemplateId) {
  if (!isBusinessManagementConfigured()) throw new Error('WhatsApp Business Account is not configured.');
  return graphGet(String(metaTemplateId));
}

/** Uploads bytes to Meta's normal media endpoint, for use as a message's media_id. */
async function uploadMedia(buffer, mimeType, filename) {
  if (!isConfigured()) throw new Error('WhatsApp Cloud API is not configured.');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([buffer], { type: mimeType }), filename || 'file');
  const res = await fetch(`${GRAPH}/${WA.phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA.token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('whatsapp: media upload failed', res.status, JSON.stringify(data));
    throw new Error((data.error && data.error.message) || `Media upload failed (${res.status})`);
  }
  return data; // { id: "..." }
}

/**
 * The resumable-upload protocol Meta requires for template HEADER sample
 * media — deliberately NOT the same as uploadMedia() above, which is for
 * ordinary outbound message media. Two steps: start a session against the
 * Meta App (not the WABA/phone number), then PATCH the bytes to get back
 * a reusable `h` handle to reference in the template's header example.
 */
async function uploadTemplateHeaderSample(buffer, mimeType, filename) {
  if (!WA.token || !WA.appId) {
    throw new Error('WHATSAPP_APP_ID (and a valid token) is required to upload template header samples.');
  }

  const startRes = await fetch(
    `${GRAPH}/${WA.appId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${encodeURIComponent(WA.token)}`,
    { method: 'POST' }
  );
  const startData = await startRes.json().catch(() => ({}));
  if (!startRes.ok || !startData.id) {
    logger.error('whatsapp: upload session start failed', startRes.status, JSON.stringify(startData));
    throw new Error((startData.error && startData.error.message) || 'Could not start Meta upload session.');
  }

  const uploadRes = await fetch(`${GRAPH}/${startData.id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${WA.token}`, 'Content-Type': mimeType, 'file_offset': '0' },
    body: buffer,
  });
  const uploadData = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok || !uploadData.h) {
    logger.error('whatsapp: upload session finish failed', uploadRes.status, JSON.stringify(uploadData));
    throw new Error((uploadData.error && uploadData.error.message) || 'Could not complete Meta upload.');
  }
  return uploadData.h; // the header handle, e.g. "4::aW1hZ2U..."
}

module.exports = {
  isConfigured,
  isBusinessManagementConfigured,
  sendText,
  sendTemplate,
  markRead,
  notifyBusiness,
  verifyWebhook,
  verifySignature,
  parseIncoming,
  parseStatuses,
  fetchMedia,
  createMetaTemplate,
  listMetaTemplates,
  getMetaTemplate,
  uploadMedia,
  uploadTemplateHeaderSample,
};
