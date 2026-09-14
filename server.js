'use strict';

const app = require('./src/app');
const config = require('./src/config');
const logger = require('./src/utils/logger');

const server = app.listen(config.port, config.host, () => {
  logger.info(
    `Bansal Jewellers site listening on http://${config.host}:${config.port}  (${config.env})`
  );
  logger.info(
    config.whatsapp.isConfigured
      ? 'WhatsApp Cloud API: configured — outbound + webhook active'
      : 'WhatsApp Cloud API: not configured — enquiries fall back to wa.me links'
  );
});

function shutdown(signal) {
  logger.info(`${signal} received — shutting down`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', reason);
});
