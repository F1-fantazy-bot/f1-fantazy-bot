// Map of F1 Fantasy chip names (as they appear in league-standings.json) to emojis.
// Keys are lower-cased for case-insensitive matching.
const CHIP_EMOJI_MAP = {
  limitless: '🚀',
  'extra drs boost': '⚡',
  'extra boost': '⚡',
  wildcard: '🃏',
  'final fix': '🎯',
  'no negative': '🛡️',
  'auto pilot': '🤖',
};

const DEFAULT_CHIP_EMOJI = '🎖️';

function getChipEmoji(name) {
  if (!name || typeof name !== 'string') {
    return DEFAULT_CHIP_EMOJI;
  }

  return CHIP_EMOJI_MAP[name.trim().toLowerCase()] || DEFAULT_CHIP_EMOJI;
}

module.exports = {
  CHIP_EMOJI_MAP,
  DEFAULT_CHIP_EMOJI,
  getChipEmoji,
};
