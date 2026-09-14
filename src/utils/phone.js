'use strict';

/**
 * Normalize any WhatsApp number to digits-only (Meta's own wa_id format,
 * e.g. "918826481301"). Every lookup/write against Contact.whatsappNumber
 * must go through this so the same customer never gets duplicated just
 * because a number arrived with +, spaces, dashes or a leading 0.
 */
function normalizePhone(input) {
  const digits = String(input || '').replace(/[^\d]/g, '');
  // Indian numbers are sometimes typed with a leading 0 instead of the
  // country code (e.g. "08826481301") — strip it so it still matches the
  // canonical "918826481301" form already used elsewhere in this project.
  if (digits.length === 11 && digits.startsWith('0')) {
    return '91' + digits.slice(1);
  }
  return digits;
}

function isValidPhone(input) {
  const digits = normalizePhone(input);
  return digits.length >= 10 && digits.length <= 15;
}

module.exports = { normalizePhone, isValidPhone };
