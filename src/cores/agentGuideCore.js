const { MENU_CATEGORIES } = require('../constants');

const GUIDE_TOPICS = Object.freeze([
  'getting_started',
  'teams',
  'leagues',
  'races',
  'settings',
  'admin',
]);

const TASKS = Object.freeze({
  optimize_team: {
    topic: 'teams',
    icon: '🏆',
    title: { en: 'Optimize your team', he: 'שפר את הקבוצה שלך' },
    description: {
      en: 'Compare the strongest projected lineups, with driver and constructor filters.',
      he: 'השווה בין ההרכבים החזויים החזקים ביותר, כולל סינון נהגים וקבוצות.',
    },
    example: {
      en: 'Best teams for {TEAM} with Verstappen but without Alonso',
      he: 'מה הקבוצות הטובות ביותר ל-{TEAM} עם ורסטאפן ובלי אלונסו',
    },
  },
  inspect_team: {
    topic: 'teams',
    icon: '🔎',
    title: { en: 'Inspect your saved team', he: 'בדוק את הקבוצה השמורה' },
    description: {
      en: 'See your current roster, chip, budget, transfers, and projected performance.',
      he: 'ראה את ההרכב, הצ׳יפ, התקציב, ההעברות והתחזית של הקבוצה הנוכחית.',
    },
    example: {
      en: 'Show my current team',
      he: 'הצג את הקבוצה הנוכחית שלי',
    },
  },
  compare_scenarios: {
    topic: 'teams',
    icon: '🧪',
    title: { en: 'Compare strategies', he: 'השווה אסטרטגיות' },
    description: {
      en: 'Compare ranking weights and chip choices before making a decision.',
      he: 'השווה משקלי דירוג ובחירות צ׳יפ לפני קבלת החלטה.',
    },
    example: {
      en: 'Compare best-team scenarios for my selected team',
      he: 'השווה תרחישי קבוצה מיטבית עבור הקבוצה שבחרתי',
    },
  },
  manage_teams: {
    topic: 'teams',
    icon: '📋',
    title: { en: 'Manage tracked teams', he: 'נהל קבוצות במעקב' },
    description: {
      en: 'Add or remove league teams through guided league and team cards.',
      he: 'הוסף או הסר קבוצות ליגה באמצעות כרטיסי בחירה מודרכים.',
    },
    example: {
      en: 'I want to track another team',
      he: 'אני רוצה לעקוב אחרי קבוצה נוספת',
    },
  },
  league_standings: {
    topic: 'leagues',
    icon: '🏁',
    title: { en: 'Explore a league', he: 'חקור ליגה' },
    description: {
      en: 'View followed leagues, standings, and your selected team position.',
      he: 'צפה בליגות שבמעקב, בדירוג ובמיקום הקבוצה שבחרת.',
    },
    example: {
      en: 'Show the leaderboard for {LEAGUE}',
      he: 'הצג את טבלת הדירוג של {LEAGUE}',
    },
  },
  live_score: {
    topic: 'leagues',
    icon: '🔴',
    title: { en: 'Check live scoring', he: 'בדוק ניקוד חי' },
    description: {
      en: 'See a detailed live breakdown or compare every team in a followed league.',
      he: 'ראה פירוט ניקוד חי או השווה בין כל הקבוצות בליגה שבמעקב.',
    },
    example: {
      en: 'Show the live score leaderboard for {LEAGUE}',
      he: 'הצג את טבלת הניקוד החי של {LEAGUE}',
    },
  },
  manage_leagues: {
    topic: 'leagues',
    icon: '➕',
    title: { en: 'Manage followed leagues', he: 'נהל ליגות במעקב' },
    description: {
      en: 'Follow a league by share code or select a followed league to remove.',
      he: 'עקוב אחרי ליגה לפי קוד שיתוף או בחר ליגה להסרה מהמעקב.',
    },
    example: {
      en: 'I want to follow another league',
      he: 'אני רוצה לעקוב אחרי ליגה נוספת',
    },
  },
  race_schedule: {
    topic: 'races',
    icon: '🗓️',
    title: { en: 'Plan the race weekend', he: 'תכנן את סוף שבוע המרוץ' },
    description: {
      en: 'Get upcoming races, session times, the lock deadline, and track information.',
      he: 'קבל מרוצים קרובים, זמני מקצים, מועד נעילה ומידע על המסלול.',
    },
    example: {
      en: 'Tell me about the next race and its schedule',
      he: 'ספר לי על המרוץ הבא ועל לוח הזמנים שלו',
    },
  },
  race_weather: {
    topic: 'races',
    icon: '🌦️',
    title: { en: 'Check the forecast', he: 'בדוק את התחזית' },
    description: {
      en: 'Review rain, temperature, wind, and conditions for every locking session.',
      he: 'בדוק גשם, טמפרטורה, רוח ותנאים לכל מקצה ננעל.',
    },
    example: {
      en: 'Will it rain during the next race weekend?',
      he: 'האם צפוי גשם בסוף שבוע המרוץ הבא?',
    },
  },
  language: {
    topic: 'settings',
    icon: '🌐',
    title: { en: 'Choose your language', he: 'בחר שפה' },
    description: {
      en: 'Read or change the saved English/Hebrew preference.',
      he: 'בדוק או שנה את העדפת השפה השמורה לעברית או אנגלית.',
    },
    example: {
      en: 'Change my language to Hebrew',
      he: 'שנה את השפה שלי לאנגלית',
    },
  },
  report_problem: {
    topic: 'settings',
    icon: '🐛',
    title: { en: 'Report a problem', he: 'דווח על בעיה' },
    description: {
      en: 'Send feedback or a bug report to the administrators after confirmation.',
      he: 'שלח משוב או דיווח באג למנהלים לאחר אישור.',
    },
    example: {
      en: 'Report this bug: the live score card is empty',
      he: 'דווח על הבאג הזה: כרטיס הניקוד החי ריק',
    },
  },
  admin_rollout: {
    topic: 'admin',
    icon: '🛡️',
    title: { en: 'Administrative capabilities', he: 'יכולות ניהול' },
    description: {
      en: 'Admins can inspect deployed version, billing, user directories, web access, and BotFather setup here. Administrative changes remain available on Telegram while later parity phases are completed.',
      he: 'מנהלים יכולים לבדוק כאן גרסה, חיוב, ספריות משתמשים, גישת ווב והגדרות BotFather. שינויי ניהול נשארים זמינים בטלגרם עד להשלמת שלבי ההשוואה הבאים.',
    },
    example: {
      en: 'What admin capabilities are available here?',
      he: 'אילו יכולות ניהול זמינות כאן?',
    },
  },
});

const TELEGRAM_FLOW = Object.freeze({
  en: {
    title: '🏁 F1 Fantasy Bot - Usage Flow',
    intro: "Here's how to get the most out of this bot:",
    steps: [
      ['1️⃣', 'Follow Your League',
        'Run /follow\\_league and paste your league code from the F1 Fantasy app. Then run /teams\\_tracker to pick up to 6 teams from the league to track.'],
      ['2️⃣', 'Choose a Chip (Optional)',
        'Use /chips to select a chip (Extra Boost, Wildcard, or Limitless) before calculating best teams.\n   Use /reset\\_chip to calculate without any chip.'],
      ['3️⃣', 'Adjust Budget Change Ranking (Optional)',
        'Use /set\\_best\\_team\\_ranking to include expected price changes in the /best\\_teams ranking.'],
      ['4️⃣', 'Calculate Best Teams',
        'Run /best\\_teams to find the optimal team combinations based on your uploaded data.'],
      ['5️⃣', 'Get Team Details',
        'After /best\\_teams, send a team number (e.g., 1, 2, 3) to see the required transfers from your current team.'],
      ['6️⃣', 'Check Live Score',
        'Use /live\\_score to see the current live points and price changes for your selected team.'],
      ['7️⃣', 'Explore Race Info',
        '• /next\\_race\\_info - Details about the next race\n   • /next\\_races - Upcoming race schedule\n   • /next\\_race\\_weather - Weather forecast for the next race'],
      ['8️⃣', 'League Insights',
        '• /leaderboard - Current standings of a league you follow\n   • /league\\_graphs - Season-long charts: gap to leader, standings, and budget per race'],
    ],
    tipsTitle: '💡 Tips:',
    tips: [
      '• Use /menu for an interactive menu of all commands',
      '• Use /print\\_cache to verify your cached data',
      '• Use /reset\\_cache to start fresh',
      '• Just type any question naturally — the bot understands free text too!',
    ],
  },
  he: {
    title: '🏁 F1 Fantasy Bot - תהליך שימוש',
    intro: 'כך תפיקו את המרב מהבוט:',
    steps: [
      ['1️⃣', 'עקוב אחרי הליגה שלך',
        'הריצו /follow\\_league והדביקו את קוד הליגה שלכם מאפליקציית F1 Fantasy. לאחר מכן הריצו /teams\\_tracker כדי לבחור עד 6 קבוצות מהליגה שיהיו במעקב.'],
      ['2️⃣', "בחירת צ'יפ (אופציונלי)",
        'השתמשו ב-/chips כדי לבחור צ\'יפ (אקסטרה בוסט, Wildcard, או Limitless) לפני חישוב הקבוצות הטובות ביותר.\n   השתמשו ב-/reset\\_chip כדי לחשב ללא צ\'יפ.'],
      ['3️⃣', 'דירוג שינויי תקציב (אופציונלי)',
        'השתמשו ב-/set\\_best\\_team\\_ranking כדי לכלול שינויי מחיר צפויים בדירוג של /best\\_teams.'],
      ['4️⃣', 'חישוב הקבוצות הטובות ביותר',
        'הריצו /best\\_teams כדי למצוא את שילובי הקבוצה האופטימליים על סמך הנתונים שהעלאתם.'],
      ['5️⃣', 'פרטי קבוצה',
        'לאחר /best\\_teams, שלחו מספר קבוצה (לדוגמה: 1, 2, 3) כדי לראות את ההעברות הנדרשות מהקבוצה הנוכחית.'],
      ['6️⃣', 'ניקוד חי',
        'השתמשו ב-/live\\_score כדי לראות את הניקוד החי ושינויי המחיר של הקבוצה שבחרתם.'],
      ['7️⃣', 'מידע על מרוצים',
        '• /next\\_race\\_info - פרטים על המרוץ הבא\n   • /next\\_races - לוח זמנים למרוצים הקרובים\n   • /next\\_race\\_weather - תחזית מזג אוויר למרוץ הבא'],
      ['8️⃣', 'תובנות ליגה',
        '• /leaderboard - דירוג עדכני של ליגה שאתם עוקבים אחריה\n   • /league\\_graphs - גרפים לאורך העונה: פער מהמוביל, מיקומים, ותקציב לפי מרוץ'],
    ],
    tipsTitle: '💡 טיפים:',
    tips: [
      '• השתמשו ב-/menu לתפריט אינטראקטיבי',
      '• השתמשו ב-/print\\_cache כדי לבדוק את הנתונים השמורים',
      '• השתמשו ב-/reset\\_cache כדי להתחיל מחדש',
      '• פשוט כתבו שאלה בשפה חופשית — הבוט מבין גם טקסט רגיל!',
    ],
  },
});

function localize(value, lang) {
  return value[lang === 'he' ? 'he' : 'en'];
}

function interpolate(value, replacements) {
  return Object.entries(replacements).reduce(
    (text, [key, replacement]) =>
      text.replaceAll(`{${key}}`, () => replacement),
    value,
  );
}

function getTelegramHelpCategories({ isAdmin }) {
  return Object.values(MENU_CATEGORIES).filter(
    (category) => isAdmin || !category.adminOnly,
  );
}

function getTelegramUsageFlow(lang) {
  return TELEGRAM_FLOW[lang === 'he' ? 'he' : 'en'];
}

function recommendationIds(profile) {
  if (profile.leagueCount === 0) {
    return ['manage_leagues', 'race_schedule'];
  }
  if (profile.teamCount === 0) {
    return ['manage_teams', 'league_standings'];
  }

  return ['optimize_team', 'live_score', 'race_schedule'];
}

function taskIsAvailable(taskId, profile) {
  if (
    ['optimize_team', 'compare_scenarios'].includes(taskId) &&
    (!profile.hasProjectionData || profile.teamCount === 0)
  ) {
    return false;
  }
  if (taskId === 'inspect_team' && profile.teamCount === 0) {
    return false;
  }
  if (taskId === 'manage_teams' && profile.leagueCount === 0) {
    return false;
  }
  if (
    ['league_standings', 'live_score'].includes(taskId) &&
    profile.leagueCount === 0
  ) {
    return false;
  }

  return true;
}

function buildAgentGuide({
  lang = 'en',
  topic = 'getting_started',
  isAdmin = false,
  teamCount = 0,
  followedTeamCount = 0,
  leagueCount = 0,
  hasSimulationData = false,
  hasProjectionData = false,
  selectedTeamName = '',
  teamNames = [],
  leagueNames = [],
} = {}) {
  const normalizedLang = lang === 'he' ? 'he' : 'en';
  const normalizedTopic = GUIDE_TOPICS.includes(topic)
    ? topic
    : 'getting_started';
  if (normalizedTopic === 'admin' && !isAdmin) {
    return {
      status: 'forbidden',
      topic: normalizedTopic,
      lang: normalizedLang,
      summary: localize(
        {
          en: 'Administrative guidance is available only to administrators.',
          he: 'הדרכת ניהול זמינה למנהלים בלבד.',
        },
        normalizedLang,
      ),
    };
  }

  const profile = {
    teamCount,
    followedTeamCount,
    leagueCount,
    hasSimulationData,
    hasProjectionData,
  };
  const primaryTeamName =
    selectedTeamName || teamNames[0] ||
    localize({ en: 'my selected team', he: 'הקבוצה שבחרתי' }, normalizedLang);
  const primaryLeagueName =
    leagueNames[0] ||
    localize({ en: 'my league', he: 'הליגה שלי' }, normalizedLang);
  const availableTasks = Object.entries(TASKS)
    .filter(([, task]) => isAdmin || task.topic !== 'admin')
    .filter(([id]) => taskIsAvailable(id, profile))
    .map(([id, task]) => ({
      id,
      topic: task.topic,
      icon: task.icon,
      title: localize(task.title, normalizedLang),
      description: localize(task.description, normalizedLang),
      example: interpolate(localize(task.example, normalizedLang), {
        TEAM: primaryTeamName,
        LEAGUE: primaryLeagueName,
      }),
    }));
  const topicTasks = availableTasks.filter((task) =>
      normalizedTopic === 'getting_started'
        ? true
        : task.topic === normalizedTopic);
  const visibleTasks =
    topicTasks.length > 0 || normalizedTopic === 'getting_started'
      ? topicTasks
      : availableTasks.filter((task) =>
          recommendationIds(profile).includes(task.id),
        );
  const recommended = new Set(recommendationIds(profile));

  return {
    status: 'ok',
    topic: normalizedTopic,
    lang: normalizedLang,
    title: localize(
      { en: 'Your F1 Fantasy pit wall', he: 'עמדת הפיקוד שלך ל-F1 Fantasy' },
      normalizedLang,
    ),
    intro: localize(
      {
        en: 'Ask naturally. I will use your saved team and league context, show choices when needed, and request confirmation before changes.',
        he: 'אפשר לשאול באופן טבעי. אשתמש בהקשר הקבוצות והליגות שלך, אציג אפשרויות כשצריך ואבקש אישור לפני שינויים.',
      },
      normalizedLang,
    ),
    profile,
    recommendations: visibleTasks.filter((task) => recommended.has(task.id)),
    sections: GUIDE_TOPICS
      .filter((sectionTopic) => sectionTopic !== 'getting_started')
      .map((sectionTopic) => ({
        topic: sectionTopic,
        tasks: visibleTasks.filter((task) => task.topic === sectionTopic),
      }))
      .filter((section) => section.tasks.length > 0),
    notices: [
      ...(!hasProjectionData
        ? [
            localize(
              {
                en: 'Projection data is not ready, so optimization results may be unavailable.',
                he: 'נתוני התחזית עדיין אינם מוכנים, ולכן ייתכן שלא ניתן יהיה לחשב המלצות.',
              },
              normalizedLang,
            ),
          ]
        : []),
      ...(!hasSimulationData
        ? [
            localize(
              {
                en: 'No simulation metadata is currently loaded.',
                he: 'לא נטענו כרגע פרטי סימולציה.',
              },
              normalizedLang,
            ),
          ]
        : []),
    ],
  };
}

module.exports = {
  GUIDE_TOPICS,
  TASKS,
  buildAgentGuide,
  getTelegramHelpCategories,
  getTelegramUsageFlow,
};
