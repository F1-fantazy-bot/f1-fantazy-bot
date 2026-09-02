// Pure formatting helpers for dates that are shown by the web agent.  Keeping
// the timezone here prevents a tool response from mixing raw UTC timestamps
// with the local times rendered by the rich UI.

const USER_TIME_ZONE = 'Asia/Jerusalem';

function languageLocale(lang) {
  return lang === 'he' ? 'he-IL' : 'en-GB';
}

function formatUserLocalDateTime(value, lang = 'en') {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(languageLocale(lang), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: USER_TIME_ZONE,
  }).format(date);
}

module.exports = {
  USER_TIME_ZONE,
  languageLocale,
  formatUserLocalDateTime,
};
