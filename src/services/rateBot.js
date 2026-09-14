'use strict';

// Deterministic, rule-based rate-intent matching for incoming WhatsApp
// text. Multi-word phrases are unambiguous enough to substring-match;
// the bare words "rate"/"rates" are matched on word boundaries only, so
// this doesn't fire on unrelated messages that merely contain "rate".

const GOLD_PHRASES = [
  'gold rate', 'gold rates', 'gold price', 'gold prices',
  'today gold rate', "today's gold rate", 'todays gold rate',
  'sona rate', 'sone ka rate', 'sone ka bhav', 'gold ka rate', 'gold ka bhav',
];
const SILVER_PHRASES = [
  'silver rate', 'silver rates', 'silver price', 'silver prices',
  'today silver rate', "today's silver rate", 'todays silver rate',
  'chandi rate', 'chandi ka rate', 'chandi ka bhav', 'silver ka rate', 'silver ka bhav',
];
const HINDI_GOLD = ['सोने का भाव', 'सोने का रेट'];
const HINDI_SILVER = ['चांदी का भाव', 'चांदी का रेट'];
const GENERIC_PHRASES = [
  'today rate', "today's rate", 'todays rate', 'aaj ka rate', 'aaj ka bhav',
];
const HINDI_GENERIC = ['आज का रेट', 'आज का भाव'];
const BARE_WORDS = ['rate', 'rates'];

function hasBareWord(text, word) {
  return new RegExp('(^|[^a-z])' + word + '([^a-z]|$)', 'i').test(text);
}

/**
 * Returns 'gold' | 'silver' | 'both' | null. Only ever called on text
 * messages, after the message is already persisted (so this never
 * affects idempotency — a replayed webhook short-circuits before
 * reaching this).
 */
function detectRateIntent(rawText) {
  if (!rawText) return null;
  const text = rawText.trim().toLowerCase();
  if (!text) return null;

  const hasGold = GOLD_PHRASES.some((p) => text.includes(p)) || HINDI_GOLD.some((p) => rawText.includes(p));
  const hasSilver = SILVER_PHRASES.some((p) => text.includes(p)) || HINDI_SILVER.some((p) => rawText.includes(p));

  if (hasGold && hasSilver) return 'both';
  if (hasGold) return 'gold';
  if (hasSilver) return 'silver';

  const hasGeneric =
    GENERIC_PHRASES.some((p) => text.includes(p)) ||
    HINDI_GENERIC.some((p) => rawText.includes(p)) ||
    BARE_WORDS.some((w) => hasBareWord(text, w));

  return hasGeneric ? 'both' : null;
}

module.exports = { detectRateIntent };
