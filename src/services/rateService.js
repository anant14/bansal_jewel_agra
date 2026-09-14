'use strict';

const prisma = require('../db/prisma');
const content = require('./content');
const { todayIST, todayISTAsDate, dateOnly } = require('../utils/istDate');

/**
 * The single place every feature (website, WhatsApp bot, admin, future
 * campaigns/AI) goes through to read or write gold/silver rates. Nothing
 * else should query rate_types/rate_entries directly — that's what lets
 * "manual entry" become "manual + external API" later without touching
 * the website, bot or campaign code at all.
 */

async function getRateTypes({ activeOnly = true } = {}) {
  return prisma.rateType.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { displayOrder: 'asc' },
  });
}

/**
 * For every active rate type: today's entry if one exists (CURRENT), the
 * most recent entry if today's is missing (STALE, for admin visibility
 * ONLY — never customer-facing), or nothing at all (MISSING).
 */
async function getCurrentRates() {
  const types = await getRateTypes();
  const today = todayISTAsDate();

  return Promise.all(
    types.map(async (rateType) => {
      const [todayEntry, latestEntry] = await Promise.all([
        prisma.rateEntry.findUnique({
          where: { rateTypeId_rateDate: { rateTypeId: rateType.id, rateDate: today } },
        }),
        prisma.rateEntry.findFirst({
          where: { rateTypeId: rateType.id },
          orderBy: { rateDate: 'desc' },
        }),
      ]);

      let status;
      if (todayEntry) status = 'current';
      else if (latestEntry) status = 'stale';
      else status = 'missing';

      return { rateType, entry: todayEntry || null, latestEntry: latestEntry || null, status };
    })
  );
}

async function getRateByCode(code) {
  const all = await getCurrentRates();
  return all.find((r) => r.rateType.code === code) || null;
}

async function getRatesForDate(isoDateString) {
  const types = await getRateTypes({ activeOnly: false });
  const date = dateOnly(isoDateString);
  return Promise.all(
    types.map(async (rateType) => {
      const entry = await prisma.rateEntry.findUnique({
        where: { rateTypeId_rateDate: { rateTypeId: rateType.id, rateDate: date } },
      });
      return { rateType, entry: entry || null };
    })
  );
}

/**
 * Upserts today's (IST) rate for each {code, value} pair. Re-saving the
 * same day updates that day's row — it never creates a duplicate, and it
 * never touches any other day's history.
 */
async function saveRates(entries, actorId) {
  const today = todayISTAsDate();
  const results = [];
  for (const { code, value } of entries) {
    const rateType = await prisma.rateType.findUnique({ where: { code } });
    if (!rateType) throw new Error(`Unknown rate type code: ${code}`);
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new Error(`${rateType.name}: rate must be a positive number.`);
    }
    const saved = await prisma.rateEntry.upsert({
      where: { rateTypeId_rateDate: { rateTypeId: rateType.id, rateDate: today } },
      update: { value: numeric, source: 'manual', enteredById: actorId || null, effectiveAt: new Date() },
      create: { rateTypeId: rateType.id, rateDate: today, value: numeric, source: 'manual', enteredById: actorId || null },
    });
    results.push(saved);
  }
  return results;
}

async function getRateHistory({ from, to, metal, rateTypeCode, page = 1, pageSize = 30 } = {}) {
  const where = {};
  if (rateTypeCode) {
    const rt = await prisma.rateType.findUnique({ where: { code: rateTypeCode } });
    where.rateTypeId = rt ? rt.id : '__none__';
  } else if (metal) {
    const types = await prisma.rateType.findMany({ where: { metal }, select: { id: true } });
    where.rateTypeId = { in: types.map((t) => t.id) };
  }
  if (from || to) {
    where.rateDate = {};
    if (from) where.rateDate.gte = dateOnly(from);
    if (to) where.rateDate.lte = dateOnly(to);
  }

  const [total, entries] = await Promise.all([
    prisma.rateEntry.count({ where }),
    prisma.rateEntry.findMany({
      where,
      include: { rateType: true, enteredBy: { select: { name: true, email: true } } },
      orderBy: [{ rateDate: 'desc' }, { rateType: { displayOrder: 'asc' } }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { entries, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** True only when every rate needed for `requestedType` is CURRENT (never stale/missing). */
function allCurrentFor(currentRates, requestedType) {
  const relevant =
    requestedType === 'gold'
      ? currentRates.filter((r) => r.rateType.metal === 'gold')
      : requestedType === 'silver'
      ? currentRates.filter((r) => r.rateType.metal === 'silver')
      : currentRates;
  return relevant.length > 0 && relevant.every((r) => r.status === 'current');
}

/**
 * The one place the customer-facing rate message is composed. Only ever
 * call this with fully CURRENT data — check allCurrentFor() first.
 */
function formatRateMessage(currentRates, requestedType = 'all') {
  const relevant =
    requestedType === 'gold'
      ? currentRates.filter((r) => r.rateType.metal === 'gold')
      : requestedType === 'silver'
      ? currentRates.filter((r) => r.rateType.metal === 'silver')
      : currentRates;

  const dateLabel = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const lines = relevant.map(
    (r) => `${r.rateType.displayName}: ₹${Number(r.entry.value).toLocaleString('en-IN')} / ${r.rateType.unit}`
  );

  return (
    `*${content.brand.name}*\n\n` +
    `Today's ${requestedType === 'gold' ? 'Gold' : requestedType === 'silver' ? 'Silver' : 'Gold & Silver'} Rate${lines.length > 1 ? 's' : ''}\n` +
    `${dateLabel}\n\n` +
    lines.join('\n') +
    `\n\nRates are indicative and may change. Please contact us for the final jewellery price.`
  );
}

function getFallbackMessage() {
  return "Today's Gold & Silver rates are currently being updated. Our team will share the latest rates with you shortly.";
}

module.exports = {
  getRateTypes,
  getCurrentRates,
  getRateByCode,
  getRatesForDate,
  saveRates,
  getRateHistory,
  allCurrentFor,
  formatRateMessage,
  getFallbackMessage,
  todayIST,
};
