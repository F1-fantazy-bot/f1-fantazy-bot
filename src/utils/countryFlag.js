// Country names used by the season schedule, including common aliases.
const COUNTRY_CODES = {
  australia: 'AU', austria: 'AT', azerbaijan: 'AZ', bahrain: 'BH',
  belgium: 'BE', brazil: 'BR', canada: 'CA', china: 'CN', france: 'FR',
  germany: 'DE', hungary: 'HU', india: 'IN', italy: 'IT', japan: 'JP',
  malaysia: 'MY', mexico: 'MX', monaco: 'MC', netherlands: 'NL',
  portugal: 'PT', qatar: 'QA', russia: 'RU', 'san marino': 'SM',
  'saudi arabia': 'SA', singapore: 'SG', 'south korea': 'KR', korea: 'KR',
  spain: 'ES', turkey: 'TR', vietnam: 'VN',
  uk: 'GB', 'united kingdom': 'GB', 'great britain': 'GB',
  usa: 'US', 'united states': 'US', 'united states of america': 'US',
  uae: 'AE', 'united arab emirates': 'AE',
};

function countryFlag(country) {
  const code = typeof country === 'string' ? COUNTRY_CODES[country.trim().toLowerCase()] : null;
  if (!code) {
    return '';
  }

  return [...code].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('');
}

module.exports = { countryFlag };
