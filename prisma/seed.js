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

main()
  .catch((err) => {
    console.error('seed: failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
