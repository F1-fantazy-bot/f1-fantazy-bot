// Map of country names (as they appear in Ergast / the Jolpica F1 API
// `Circuit.Location.country` field) to flag emojis.
// Keys are lower-cased for case-insensitive matching.
const COUNTRY_FLAG_MAP = {
  australia: '🇦🇺',
  austria: '🇦🇹',
  azerbaijan: '🇦🇿',
  bahrain: '🇧🇭',
  belgium: '🇧🇪',
  brazil: '🇧🇷',
  canada: '🇨🇦',
  china: '🇨🇳',
  france: '🇫🇷',
  germany: '🇩🇪',
  hungary: '🇭🇺',
  india: '🇮🇳',
  italy: '🇮🇹',
  japan: '🇯🇵',
  korea: '🇰🇷',
  'south korea': '🇰🇷',
  malaysia: '🇲🇾',
  mexico: '🇲🇽',
  monaco: '🇲🇨',
  morocco: '🇲🇦',
  netherlands: '🇳🇱',
  portugal: '🇵🇹',
  qatar: '🇶🇦',
  russia: '🇷🇺',
  'saudi arabia': '🇸🇦',
  singapore: '🇸🇬',
  spain: '🇪🇸',
  sweden: '🇸🇪',
  switzerland: '🇨🇭',
  turkey: '🇹🇷',
  uae: '🇦🇪',
  'united arab emirates': '🇦🇪',
  uk: '🇬🇧',
  'united kingdom': '🇬🇧',
  'great britain': '🇬🇧',
  britain: '🇬🇧',
  usa: '🇺🇸',
  'united states': '🇺🇸',
  'united states of america': '🇺🇸',
  america: '🇺🇸',
  vietnam: '🇻🇳',
};

function getFlagForCountry(country) {
  if (!country || typeof country !== 'string') {
    return '';
  }

  return COUNTRY_FLAG_MAP[country.trim().toLowerCase()] || '';
}

module.exports = {
  COUNTRY_FLAG_MAP,
  getFlagForCountry,
};
