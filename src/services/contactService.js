'use strict';

const prisma = require('../db/prisma');
const { normalizePhone } = require('../utils/phone');
const timeline = require('./timelineService');

const DEFAULT_TAGS = [
  'Gold Customer',
  'Silver Customer',
  'Diamond Customer',
  'Bridal',
  'Wedding Lead',
  'VIP',
  'Existing Customer',
  'New Lead',
  'Gold Rate Subscriber',
  'Silver Rate Subscriber',
  'Website Lead',
  'WhatsApp Lead',
];

/** Idempotently create the default tag set. Safe to call repeatedly. */
async function ensureDefaultTags() {
  for (const name of DEFAULT_TAGS) {
    await prisma.tag.upsert({ where: { name }, update: {}, create: { name } });
  }
}

/**
 * Find a contact by WhatsApp number, creating it if it doesn't exist yet.
 * This is THE dedupe boundary — every caller (webhook, manual add, gold
 * rate form) must go through this rather than calling prisma directly,
 * so a customer never ends up duplicated over a formatting difference.
 */
async function findOrCreateByPhone({ whatsappNumber, name, source, optInSource }) {
  const normalized = normalizePhone(whatsappNumber);
  if (!normalized) throw new Error('A WhatsApp number is required.');

  const existing = await prisma.contact.findUnique({ where: { whatsappNumber: normalized } });
  if (existing) {
    // Fill in a name Meta/the form just gave us if we didn't have one yet —
    // never overwrite a name an admin already set.
    if (name && !existing.name) {
      return prisma.contact.update({ where: { id: existing.id }, data: { name } });
    }
    return existing;
  }

  const contact = await prisma.contact.create({
    data: {
      whatsappNumber: normalized,
      name: name || null,
      source: source || 'unknown',
      firstInteractionAt: new Date(),
    },
  });

  await timeline.logEvent({
    contactId: contact.id,
    action: 'contact_created',
    entity: 'contact',
    entityId: contact.id,
    meta: { source: source || 'unknown' },
  });

  return contact;
}

async function touchInteraction(contactId) {
  const now = new Date();
  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { firstInteractionAt: true } });
  return prisma.contact.update({
    where: { id: contactId },
    data: {
      lastInteractionAt: now,
      firstInteractionAt: contact && contact.firstInteractionAt ? undefined : now,
    },
  });
}

async function createContact(input, actorId) {
  const normalized = normalizePhone(input.whatsappNumber);
  if (!normalized) throw new Error('A valid WhatsApp number is required.');

  const contact = await prisma.contact.create({
    data: {
      whatsappNumber: normalized,
      name: input.name || null,
      email: input.email || null,
      city: input.city || null,
      birthday: input.birthday ? new Date(input.birthday) : null,
      anniversary: input.anniversary ? new Date(input.anniversary) : null,
      source: input.source || 'manual',
      customerType: input.customerType || null,
    },
  });

  await timeline.logEvent({
    contactId: contact.id,
    actorId,
    action: 'contact_created',
    entity: 'contact',
    entityId: contact.id,
    meta: { source: contact.source },
  });

  return contact;
}

async function updateContact(contactId, input) {
  const data = {};
  for (const field of ['name', 'email', 'city', 'source', 'customerType']) {
    if (input[field] !== undefined) data[field] = input[field] || null;
  }
  if (input.birthday !== undefined) data.birthday = input.birthday ? new Date(input.birthday) : null;
  if (input.anniversary !== undefined) data.anniversary = input.anniversary ? new Date(input.anniversary) : null;

  return prisma.contact.update({ where: { id: contactId }, data });
}

async function getContactById(id) {
  return prisma.contact.findUnique({
    where: { id },
    include: {
      tags: { include: { tag: true }, orderBy: { createdAt: 'asc' } },
      notes: { orderBy: { createdAt: 'desc' } },
      consents: { orderBy: { eventAt: 'desc' } },
    },
  });
}

async function listContacts({ search, tag, optIn, source, customerType, page = 1, pageSize = 25 } = {}) {
  const where = { AND: [] };

  if (search) {
    where.AND.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { whatsappNumber: { contains: normalizePhone(search) || search } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    });
  }
  if (tag) where.AND.push({ tags: { some: { tag: { name: tag } } } });
  if (optIn === 'opted_in') where.AND.push({ marketingOptIn: true });
  if (optIn === 'opted_out') where.AND.push({ marketingOptIn: false, marketingOptOutAt: { not: null } });
  if (source) where.AND.push({ source });
  if (customerType) where.AND.push({ customerType });
  if (!where.AND.length) delete where.AND;

  const [total, contacts] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      include: { tags: { include: { tag: true } } },
      orderBy: { lastInteractionAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { contacts, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function listAllTags() {
  return prisma.tag.findMany({ orderBy: { name: 'asc' } });
}

async function createTag(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Tag name is required.');
  return prisma.tag.upsert({ where: { name: trimmed }, update: {}, create: { name: trimmed } });
}

async function addTag(contactId, tagName, actorId) {
  const tag = await createTag(tagName);
  try {
    await prisma.contactTag.create({ data: { contactId, tagId: tag.id, addedById: actorId || null } });
  } catch (err) {
    if (err.code === 'P2002') return tag; // already tagged — no-op
    throw err;
  }
  await timeline.logEvent({
    contactId,
    actorId,
    action: 'tag_added',
    entity: 'tag',
    entityId: tag.id,
    meta: { tagName: tag.name },
  });
  return tag;
}

async function removeTag(contactId, tagId, actorId) {
  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  await prisma.contactTag.deleteMany({ where: { contactId, tagId } });
  await timeline.logEvent({
    contactId,
    actorId,
    action: 'tag_removed',
    entity: 'tag',
    entityId: tagId,
    meta: { tagName: tag ? tag.name : null },
  });
}

async function addNote(contactId, body, actorId) {
  const trimmed = String(body || '').trim();
  if (!trimmed) throw new Error('Note text is required.');

  const note = await prisma.contactNote.create({
    data: { contactId, authorId: actorId || null, body: trimmed },
  });

  await timeline.logEvent({
    contactId,
    actorId,
    action: 'note_added',
    entity: 'contact_note',
    entityId: note.id,
    meta: { preview: trimmed.slice(0, 120) },
  });

  return note;
}

/**
 * Records a consent event AND updates the contact's fast-state fields.
 * The Consent row is never deleted/overwritten — it's the permanent
 * audit trail; marketingOptIn/*At are just a cache of "what's true now".
 */
async function setConsent(contactId, { status, source, purpose = 'marketing', whatsappAccountId, rawPayload }, actorId) {
  if (status !== 'opted_in' && status !== 'opted_out') {
    throw new Error('Consent status must be "opted_in" or "opted_out".');
  }

  const consent = await prisma.consent.create({
    data: { contactId, whatsappAccountId: whatsappAccountId || null, purpose, status, source: source || null, rawPayload: rawPayload || undefined },
  });

  // Only a "marketing" consent event may change the contact's marketing
  // fast-state. A one-time service consent (e.g. "send me the rate I just
  // asked for") must never be mistaken for standing marketing permission.
  if (purpose === 'marketing') {
    const now = new Date();
    await prisma.contact.update({
      where: { id: contactId },
      data:
        status === 'opted_in'
          ? { marketingOptIn: true, marketingOptInAt: now, optInSource: source || null }
          : { marketingOptIn: false, marketingOptOutAt: now },
    });
  }

  await timeline.logEvent({
    contactId,
    actorId,
    action: 'consent_changed',
    entity: 'consent',
    entityId: consent.id,
    meta: { status, source: source || null, purpose },
  });

  return consent;
}

module.exports = {
  ensureDefaultTags,
  findOrCreateByPhone,
  touchInteraction,
  createContact,
  updateContact,
  getContactById,
  listContacts,
  listAllTags,
  createTag,
  addTag,
  removeTag,
  addNote,
  setConsent,
};
