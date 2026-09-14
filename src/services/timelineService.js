'use strict';

const prisma = require('../db/prisma');

/**
 * Every customer-facing event (tag change, note, consent change, message,
 * contact creation) writes one small row here, keyed by contactId. The
 * timeline is then a single ordered query — no merge-sorting several
 * tables at read time, and no duplicating message bodies (messages are
 * referenced by entityId and re-fetched for display, not copied here).
 */
async function logEvent({ contactId, actorId = null, action, entity = null, entityId = null, meta = null }) {
  return prisma.auditLog.create({
    data: { contactId, actorId, action, entity, entityId, meta },
  });
}

async function getTimeline(contactId, { limit = 100 } = {}) {
  const events = await prisma.auditLog.findMany({
    where: { contactId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const messageIds = events.filter((e) => e.entity === 'message' && e.entityId).map((e) => e.entityId);

  const messages = messageIds.length
    ? await prisma.message.findMany({
        where: { id: { in: messageIds } },
        select: { id: true, direction: true, type: true, textBody: true, status: true, createdAt: true },
      })
    : [];
  const messageById = new Map(messages.map((m) => [m.id, m]));

  return events.map((event) => ({
    ...event,
    message: event.entity === 'message' && event.entityId ? messageById.get(event.entityId) || null : null,
  }));
}

module.exports = { logEvent, getTimeline };
