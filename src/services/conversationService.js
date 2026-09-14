'use strict';

const prisma = require('../db/prisma');
const timeline = require('./timelineService');

async function findOrCreateConversation({ contactId, whatsappAccountId }) {
  const existing = await prisma.conversation.findUnique({
    where: { contactId_whatsappAccountId: { contactId, whatsappAccountId } },
  });
  if (existing) return existing;

  try {
    return await prisma.conversation.create({ data: { contactId, whatsappAccountId, status: 'open' } });
  } catch (err) {
    // Two inbound webhooks racing each other for a brand-new contact —
    // the unique constraint on (contactId, whatsappAccountId) wins, just
    // fetch the row the other request created.
    if (err.code === 'P2002') {
      return prisma.conversation.findUnique({
        where: { contactId_whatsappAccountId: { contactId, whatsappAccountId } },
      });
    }
    throw err;
  }
}

/**
 * Persists one inbound message. Returns { message, isDuplicate }.
 * Idempotent: if Meta redelivers the same wamid, this is a no-op that
 * returns the already-stored message instead of creating a second row.
 */
async function recordInboundMessage({ contact, whatsappAccount, parsed }) {
  if (parsed.id) {
    const existing = await prisma.message.findUnique({ where: { whatsappMessageId: parsed.id } });
    if (existing) return { message: existing, isDuplicate: true };
  }

  const conversation = await findOrCreateConversation({
    contactId: contact.id,
    whatsappAccountId: whatsappAccount.id,
  });

  const sentAt = parsed.timestamp ? new Date(Number(parsed.timestamp) * 1000) : new Date();

  let message;
  try {
    message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        whatsappAccountId: whatsappAccount.id,
        whatsappMessageId: parsed.id || null,
        contextWhatsappMessageId: parsed.contextId || null,
        direction: 'inbound',
        type: parsed.type || 'text',
        textBody: parsed.text || null,
        mediaId: parsed.media ? parsed.media.id : null,
        mediaMimeType: parsed.media ? parsed.media.mimeType : null,
        mediaCaption: parsed.media ? parsed.media.caption : null,
        mediaFilename: parsed.media ? parsed.media.filename : null,
        status: 'delivered',
        sentAt,
        deliveredAt: sentAt,
        rawPayload: parsed.raw || undefined,
      },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      // Lost a race with another concurrent delivery of the same webhook.
      const dup = await prisma.message.findUnique({ where: { whatsappMessageId: parsed.id } });
      return { message: dup, isDuplicate: true };
    }
    throw err;
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: sentAt, unreadCount: { increment: 1 }, status: conversation.status === 'resolved' ? 'open' : conversation.status },
  });

  await timeline.logEvent({
    contactId: contact.id,
    action: 'message_inbound',
    entity: 'message',
    entityId: message.id,
    meta: { preview: (parsed.text || parsed.type || '').slice(0, 120) },
  });

  return { message, isDuplicate: false, conversation };
}

/**
 * Persists an outbound message the admin sent. `sendResult` is whatever
 * the Cloud API service returned — { skipped: true } when WhatsApp isn't
 * configured, or Meta's real response containing the new message id.
 */
async function recordOutboundMessage({ contact, whatsappAccount, text, actorId, sendResult, type = 'text', templateName = null }) {
  const conversation = await findOrCreateConversation({
    contactId: contact.id,
    whatsappAccountId: whatsappAccount.id,
  });

  const whatsappMessageId =
    sendResult && sendResult.messages && sendResult.messages[0] ? sendResult.messages[0].id : null;
  const status = sendResult && sendResult.skipped ? 'failed' : 'sent';
  const errorMessage = sendResult && sendResult.skipped
    ? sendResult.error || 'WhatsApp Cloud API is not configured.'
    : null;
  const now = new Date();

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      contactId: contact.id,
      whatsappAccountId: whatsappAccount.id,
      whatsappMessageId,
      direction: 'outbound',
      type,
      templateName,
      textBody: text,
      status,
      errorMessage,
      sentAt: status === 'sent' ? now : null,
      failedAt: status === 'failed' ? now : null,
    },
  });

  await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: now } });

  await timeline.logEvent({
    contactId: contact.id,
    actorId,
    action: 'message_outbound',
    entity: 'message',
    entityId: message.id,
    meta: { preview: text.slice(0, 120), status },
  });

  return { message, conversation };
}

/** Applies a Meta status webhook (sent/delivered/read/failed) to a stored message. */
async function applyStatusUpdate({ whatsappMessageId, status, timestamp, errorMessage, rawPayload }) {
  const message = await prisma.message.findUnique({ where: { whatsappMessageId } });
  if (!message) return { updated: false, reason: 'unknown_message' };

  const at = timestamp ? new Date(Number(timestamp) * 1000) : new Date();
  const data = { status };
  if (status === 'delivered') data.deliveredAt = at;
  if (status === 'read') data.readAt = at;
  if (status === 'failed') {
    data.failedAt = at;
    data.errorMessage = errorMessage || message.errorMessage;
  }

  await prisma.message.update({ where: { id: message.id }, data });

  try {
    await prisma.messageEvent.create({
      data: { messageId: message.id, eventType: status, eventAt: at, rawPayload: rawPayload || undefined },
    });
  } catch (err) {
    if (err.code !== 'P2002') throw err; // duplicate status webhook — event already recorded, fine
  }

  return { updated: true, messageId: message.id };
}

async function listConversations({ status, search, page = 1, pageSize = 30 } = {}) {
  const where = {};
  if (status) where.status = status;
  if (search) {
    where.contact = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { whatsappNumber: { contains: search.replace(/[^\d]/g, '') || search } },
      ],
    };
  }

  const [total, conversations] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      include: {
        contact: { include: { tags: { include: { tag: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { conversations, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function getConversationById(id) {
  return prisma.conversation.findUnique({
    where: { id },
    include: { contact: { include: { tags: { include: { tag: true } }, notes: { orderBy: { createdAt: 'desc' } } } } },
  });
}

async function getConversationMessages(conversationId, { limit = 200 } = {}) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

async function markConversationRead(conversationId) {
  return prisma.conversation.update({ where: { id: conversationId }, data: { unreadCount: 0 } });
}

async function setConversationStatus(conversationId, status) {
  if (!['open', 'pending', 'resolved'].includes(status)) throw new Error('Invalid conversation status.');
  return prisma.conversation.update({ where: { id: conversationId }, data: { status } });
}

module.exports = {
  findOrCreateConversation,
  recordInboundMessage,
  recordOutboundMessage,
  applyStatusUpdate,
  listConversations,
  getConversationById,
  getConversationMessages,
  markConversationRead,
  setConversationStatus,
};
