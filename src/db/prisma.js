'use strict';

const { PrismaClient } = require('@prisma/client');

// Reuse a single client across nodemon/dev reloads to avoid exhausting
// Postgres connections; a fresh singleton per process in production.
const g = globalThis;

const prisma = g.__bjPrisma || new PrismaClient();

if ((process.env.NODE_ENV || 'development') !== 'production') {
  g.__bjPrisma = prisma;
}

module.exports = prisma;
