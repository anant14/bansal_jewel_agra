'use strict';

require('dotenv').config();

const port = parseInt(process.env.PORT || '4000', 10);

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port,
  host: process.env.HOST || '0.0.0.0',
  baseUrl: process.env.BASE_URL || `http://localhost:${port}`,

  whatsapp: {
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v21.0',
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'bansal-jewellers-verify',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    notifyTo: process.env.WHATSAPP_NOTIFY_TO || '',
    autoReply: process.env.WHATSAPP_AUTO_REPLY !== 'false',
    // Approved Meta template for business-initiated rate messages (website
    // flow). Free-form text is only allowed inside an open customer-service
    // window (e.g. replying to an inbound WhatsApp message) — a
    // website-triggered send has no such window, so it needs a template.
    rateTemplateName: process.env.WHATSAPP_RATE_TEMPLATE_NAME || '',
    rateTemplateLang: process.env.WHATSAPP_RATE_TEMPLATE_LANG || 'en_US',
  },
};

/**
 * True when enough is configured to make outbound Cloud API calls.
 * When false the site still runs; enquiries fall back to wa.me links.
 */
config.whatsapp.isConfigured = Boolean(
  config.whatsapp.token && config.whatsapp.phoneNumberId
);

module.exports = config;
