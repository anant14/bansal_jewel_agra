'use strict';

/**
 * Tiny dependency-free logger. Swap for pino/winston later without
 * touching call sites.
 */
function stamp() {
  return new Date().toISOString();
}

function write(level, args) {
  const line = `[${stamp()}] ${level.toUpperCase()}`;
  if (level === 'error') console.error(line, ...args);
  else if (level === 'warn') console.warn(line, ...args);
  else console.log(line, ...args);
}

module.exports = {
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
  debug: (...args) => {
    if (process.env.DEBUG) write('debug', args);
  },
};
