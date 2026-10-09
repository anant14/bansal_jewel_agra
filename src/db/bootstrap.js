'use strict';

const path = require('path');
const { execFile } = require('child_process');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Applies pending migrations and runs the (idempotent) seed on every boot.
 *
 * render.yaml does this in the build command, but a service created from
 * the dashboard keeps its own build command, so the schema could silently
 * fall behind the code. Doing it at startup makes the app self-sufficient.
 * Failures are logged, never fatal: the public site works without a DB.
 */

const ROOT = path.join(__dirname, '..', '..');
let status = config.hasDatabase ? 'pending' : 'not_configured';

function run(label, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd: ROOT, timeout: timeoutMs, env: process.env }, (err, stdout, stderr) => {
      const output = `${stdout || ''}${stderr || ''}`.trim();
      if (err) {
        logger.error(`db bootstrap: ${label} failed`, output.split('\n').slice(-5).join(' | ') || err.message);
        resolve(false);
        return;
      }
      output.split('\n').filter((line) => /seed:|Applying migration|applied|No pending/i.test(line)).forEach((line) => {
        logger.info(`db bootstrap: ${line.trim()}`);
      });
      resolve(true);
    });
  });
}

async function prepareDatabase() {
  if (!config.hasDatabase) return;

  let prismaCli;
  try {
    prismaCli = require.resolve('prisma/build/index.js');
  } catch (err) {
    status = 'error: prisma CLI not installed';
    logger.error('db bootstrap: prisma CLI not installed — cannot apply migrations');
    return;
  }

  const migrated = await run('migrate deploy', [prismaCli, 'migrate', 'deploy'], 120000);
  if (!migrated) {
    status = 'error: migrations failed (see logs)';
    return;
  }
  const seeded = await run('seed', [path.join(ROOT, 'prisma', 'seed.js')], 60000);
  status = seeded ? 'ok' : 'error: seed failed (see logs)';
}

module.exports = {
  prepareDatabase,
  get status() {
    return status;
  },
};
