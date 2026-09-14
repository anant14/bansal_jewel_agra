'use strict';

// One-time bootstrap: creates the first admin user from ADMIN_EMAIL /
// ADMIN_PASSWORD env vars. Never overwrites an existing user's password —
// safe to re-run on every deploy.

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.log('seed: ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin bootstrap.');
    return;
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`seed: admin user ${email} already exists — leaving it untouched.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminUser.create({
    data: { email, passwordHash, name: 'Admin', role: 'owner' },
  });
  console.log(`seed: created admin user ${email}`);
}

const DEFAULT_RATE_TYPES = [
  { code: 'GOLD_24K', name: 'Gold 24K', metal: 'gold', purity: '24K', displayName: '24K Gold', unit: '10g', displayOrder: 1 },
  { code: 'GOLD_22K', name: 'Gold 22K', metal: 'gold', purity: '22K', displayName: '22K Gold', unit: '10g', displayOrder: 2 },
  { code: 'GOLD_18K', name: 'Gold 18K', metal: 'gold', purity: '18K', displayName: '18K Gold', unit: '10g', displayOrder: 3 },
  { code: 'SILVER', name: 'Silver', metal: 'silver', purity: null, displayName: 'Silver', unit: 'kg', displayOrder: 4 },
];

// Idempotent: only creates rate types that don't exist yet by code. Never
// touches an existing row, so an admin's later edits (unit, display name,
// active flag) are never clobbered by a redeploy.
async function seedRateTypes() {
  for (const rt of DEFAULT_RATE_TYPES) {
    const existing = await prisma.rateType.findUnique({ where: { code: rt.code } });
    if (existing) continue;
    await prisma.rateType.create({ data: rt });
    console.log(`seed: created rate type ${rt.code}`);
  }
}

async function run() {
  await main();
  await seedRateTypes();
}

run()
  .catch((err) => {
    console.error('seed: failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
