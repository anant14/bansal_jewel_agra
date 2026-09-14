'use strict';

const prisma = require('../db/prisma');
const config = require('../config');
const content = require('./content');

let cached = null;

/**
 * Every conversation/message/consent row needs a WhatsappAccount to
 * belong to (multi-number readiness from day one), but Phase 1 doesn't
 * build the multi-number UI yet — so we lazily bootstrap a single
 * "default" row from the configured Phone Number ID the first time it's
 * needed, rather than requiring a manual setup step.
 */
async function getDefaultAccount() {
  if (cached) return cached;

  const phoneNumberId = config.whatsapp.phoneNumberId || 'unconfigured-default';

  cached = await prisma.whatsappAccount.upsert({
    where: { phoneNumberId },
    update: {},
    create: {
      phoneNumberId,
      label: `${content.brand.name} — Main`,
      wabaId: config.whatsapp.businessAccountId || null,
      isDefault: true,
    },
  });
  return cached;
}

module.exports = { getDefaultAccount };
