'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * File-backed enquiry log. This is intentionally a thin, swappable
 * layer — replace the read/write below with a real database (Mongo,
 * Postgres, Prisma…) later without changing callers.
 */
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'enquiries.json');
const INBOX_PATH = path.join(DATA_DIR, 'whatsapp-inbox.json');

function ensureFile(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]\n', 'utf8');
}
ensureFile(STORE_PATH);
ensureFile(INBOX_PATH);

async function readAll(file) {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.error('enquiryStore: read failed', err.message);
    return [];
  }
}

async function writeAll(file, list) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(list, null, 2) + '\n', 'utf8');
  await fsp.rename(tmp, file);
}

/** Persist a new website enquiry and return the stored record. */
async function addEnquiry(input) {
  const record = {
    id: crypto.randomUUID(),
    type: input.type || 'general',
    name: input.name,
    phone: input.phone,
    email: input.email || null,
    message: input.message || null,
    productSku: input.productSku || null,
    productName: input.productName || null,
    source: input.source || 'website',
    status: 'new',
    createdAt: new Date().toISOString(),
  };

  const list = await readAll(STORE_PATH);
  list.push(record);
  await writeAll(STORE_PATH, list);
  logger.info('enquiryStore: enquiry saved', record.id, record.type);
  return record;
}

async function listEnquiries() {
  const list = await readAll(STORE_PATH);
  return list.slice().reverse();
}

/** Persist an inbound WhatsApp message (from the webhook). */
async function addInboundMessage(message) {
  const record = {
    id: message.id,
    from: message.from,
    name: message.name || null,
    type: message.type,
    text: message.text || null,
    receivedAt: new Date().toISOString(),
  };
  const list = await readAll(INBOX_PATH);
  if (list.some((m) => m.id === record.id)) return record; // de-dupe retries
  list.push(record);
  await writeAll(INBOX_PATH, list);
  return record;
}

module.exports = {
  addEnquiry,
  listEnquiries,
  addInboundMessage,
};
