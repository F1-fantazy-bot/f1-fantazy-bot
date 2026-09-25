// User-facing agent actions. The IDs are registered agent tools; internal
// orchestration tools (approval, choice resolution, workflow proposal) are
// deliberately absent. A card sends its prompt to the agent, so argument
// selection and the existing write confirmation remain in force.
const COMMAND_GROUPS = Object.freeze(['teams', 'leagues', 'races', 'settings', 'admin']);

const entries = [
  // Teams and optimization
  ['list_user_teams', 'teams', '📋', 'My teams', 'הקבוצות שלי', 'List my saved teams', 'הצג את הקבוצות השמורות שלי'],
  ['get_current_team', 'teams', '🔎', 'Current team', 'הקבוצה הנוכחית', 'Show my current team', 'הצג את הקבוצה הנוכחית שלי'],
  ['get_best_teams', 'teams', '🏆', 'Best teams', 'קבוצות מיטביות', 'Calculate the best teams for my selected team', 'חשב את הקבוצות המיטביות לקבוצה שבחרתי'],
  ['get_best_team_changes', 'teams', '🔄', 'Recommended transfers', 'העברות מומלצות', 'Show the transfers for team 1 in my latest best-team results', 'הצג את ההעברות לקבוצה מספר 1 בתוצאות הקבוצות המיטביות האחרונות שלי'],
  ['get_best_team_scenarios', 'teams', '🧪', 'Compare strategies', 'השוואת אסטרטגיות', 'Compare best-team scenarios for my selected team', 'השווה תרחישי קבוצה מיטבית עבור הקבוצה שבחרתי'],
  ['select_team', 'teams', '🎯', 'Select a team', 'בחירת קבוצה', 'Let me choose my active team', 'אני רוצה לבחור את הקבוצה הפעילה שלי'],
  ['set_best_team_ranking', 'teams', '📊', 'Ranking preference', 'העדפת דירוג', 'Let me choose how to rank my best teams', 'אני רוצה לבחור איך לדרג את הקבוצות המיטביות שלי'],
  ['activate_chip', 'teams', '⚡', 'Select a chip', 'בחירת צ׳יפ', 'Let me choose a chip for my selected team', 'אני רוצה לבחור צ׳יפ לקבוצה שבחרתי'],
  ['list_followed_teams', 'teams', '👀', 'Tracked teams', 'קבוצות במעקב', 'Show the teams I follow', 'הצג את הקבוצות שאני עוקב אחריהן'],
  ['follow_team', 'teams', '➕', 'Manage tracked teams', 'ניהול קבוצות במעקב', 'Help me add or remove a team I follow', 'עזור לי להוסיף או להסיר קבוצה מהמעקב'],

  // Leagues
  ['list_user_leagues', 'leagues', '📋', 'My leagues', 'הליגות שלי', 'Show the leagues I follow', 'הצג את הליגות שאני עוקב אחריהן'],
  ['follow_league', 'leagues', '➕', 'Follow a league', 'מעקב אחרי ליגה', 'I want to follow a new league', 'אני רוצה לעקוב אחרי ליגה חדשה'],
  ['unfollow_league', 'leagues', '➖', 'Unfollow a league', 'הסרת ליגה מהמעקב', 'Let me choose a league to unfollow', 'אני רוצה לבחור ליגה להסרה מהמעקב'],
  ['list_league_teams', 'leagues', '👥', 'League teams', 'קבוצות בליגה', 'Show me the teams in a league I follow', 'הצג את הקבוצות בליגה שאני עוקב אחריה'],
  ['get_leaderboard', 'leagues', '🏁', 'League standings', 'דירוג ליגה', 'Show the standings for a league I follow', 'הצג את טבלת הדירוג של ליגה שאני עוקב אחריה'],
  ['get_live_score_for_team', 'leagues', '🔴', 'Team live score', 'ניקוד חי לקבוצה', 'Show the live score for my selected team', 'הצג את הניקוד החי של הקבוצה שבחרתי'],
  ['get_live_score_leaderboard', 'leagues', '🔴', 'Live league standings', 'דירוג ליגה חי', 'Show the live score leaderboard for a league I follow', 'הצג את טבלת הניקוד החי של ליגה שאני עוקב אחריה'],
  ['get_league_changes', 'leagues', '🔁', 'League roster changes', 'שינויים בהרכבי הליגה', 'Show the roster changes in a league I follow', 'הצג את השינויים בהרכבים בליגה שאני עוקב אחריה'],
  ['get_league_graph', 'leagues', '📈', 'League graphs', 'גרפים של הליגה', 'Show the standings graph for a league I follow', 'הצג את גרף הדירוג של ליגה שאני עוקב אחריה'],
  ['get_race_summary', 'leagues', '📰', 'Race summary', 'סיכום מרוץ', 'Show the race summary for a league I follow', 'הצג את סיכום המרוץ של ליגה שאני עוקב אחריה'],

  // Races and data
  ['get_next_races', 'races', '🗓️', 'Upcoming races', 'מרוצים קרובים', 'Show the upcoming races', 'הצג את המרוצים הקרובים'],
  ['get_next_race_info', 'races', '🏎️', 'Next race', 'המרוץ הבא', 'Tell me about the next race', 'ספר לי על המרוץ הבא'],
  ['get_race_weather', 'races', '🌦️', 'Race weather', 'מזג האוויר במרוץ', 'Show the weather forecast for the next race', 'הצג את תחזית מזג האוויר למרוץ הבא'],
  ['get_deadline', 'races', '⏱️', 'Lock deadline', 'מועד הנעילה', 'When is the next team lock deadline?', 'מתי מועד נעילת הקבוצות הבא?'],
  ['get_simulation_status', 'races', '🧮', 'Simulation status', 'מצב הסימולציה', 'Show the current simulation status', 'הצג את מצב הסימולציה הנוכחית'],
  ['get_data_status', 'races', '📡', 'Data status', 'מצב הנתונים', 'Show the current data status', 'הצג את מצב הנתונים הנוכחי'],
  ['load_latest_simulation', 'races', '🔄', 'Refresh simulation', 'רענון סימולציה', 'Load the latest simulation', 'טען את הסימולציה העדכנית ביותר'],

  // Preferences and support
  ['get_agent_guide', 'settings', '❓', 'Getting started', 'איך מתחילים', 'Show me how to get started with the agent', 'הצג לי איך מתחילים להשתמש באייג׳נט'],
  ['get_language', 'settings', '🌐', 'Current language', 'השפה הנוכחית', 'What is my saved language?', 'מה השפה השמורה שלי?'],
  ['set_language', 'settings', '🌐', 'Change language', 'שינוי שפה', 'Let me choose my language', 'אני רוצה לבחור את השפה שלי'],
  ['get_whats_new', 'settings', '✨', 'What’s new', 'מה חדש', 'Show me what is new in the bot', 'הצג לי מה חדש בבוט'],
  ['report_bug', 'settings', '🐛', 'Report a problem', 'דיווח על בעיה', 'I want to report a problem', 'אני רוצה לדווח על בעיה'],
  ['get_workflow_status', 'settings', '📍', 'Action status', 'מצב פעולות', 'Show the status of my latest agent workflows', 'הצג את מצב הפעולות האחרונות שביצע האייג׳נט'],
  ['reset_user_data', 'settings', '🗑️', 'Reset my data', 'איפוס הנתונים שלי', 'I want to reset my saved user data', 'אני רוצה לאפס את הנתונים השמורים שלי'],

  // Administrator actions: never sent to a non-admin user.
  ['get_admin_version', 'admin', '🏷️', 'Deployed version', 'גרסה מותקנת', 'Show the deployed application version', 'הצג את גרסת היישום המותקנת'],
  ['get_billing_stats', 'admin', '💰', 'Billing', 'נתוני חיוב', 'Show the billing statistics', 'הצג את נתוני החיוב'],
  ['list_bot_users', 'admin', '👥', 'Bot users', 'משתמשי הבוט', 'Show the registered bot users', 'הצג את המשתמשים הרשומים בבוט'],
  ['list_web_users', 'admin', '🖥️', 'Web users', 'משתמשי האתר', 'Show the users with web access', 'הצג את המשתמשים בעלי גישה לאתר'],
  ['get_botfather_setup', 'admin', '🤖', 'Bot setup', 'הגדרות הבוט', 'Show the BotFather setup', 'הצג את הגדרות BotFather'],
  ['set_user_nickname', 'admin', '✏️', 'Set nickname', 'עדכון כינוי', 'Let me choose a user whose nickname to change', 'אני רוצה לבחור משתמש ולעדכן את הכינוי שלו'],
  ['allow_web_user', 'admin', '✅', 'Grant web access', 'מתן גישה לאתר', 'I want to grant a user access to the web agent', 'אני רוצה לתת למשתמש גישה לאייג׳נט באתר'],
  ['revoke_web_user', 'admin', '🚫', 'Revoke web access', 'ביטול גישה לאתר', 'Let me choose a web user whose access to revoke', 'אני רוצה לבחור משתמש ולבטל את הגישה שלו לאתר'],
  ['send_user_message', 'admin', '✉️', 'Message a user', 'שליחת הודעה למשתמש', 'I want to send a message to a bot user', 'אני רוצה לשלוח הודעה למשתמש בבוט'],
  ['broadcast_message', 'admin', '📣', 'Broadcast', 'הודעה לכולם', 'I want to send a broadcast message to bot users', 'אני רוצה לשלוח הודעה לכל משתמשי הבוט'],
  ['trigger_scraping', 'admin', '🔄', 'Run scraper', 'הרצת סריקה', 'Start the F1 Fantasy data scraping job', 'הפעל את סריקת נתוני F1 Fantasy'],
  ['trigger_api_data', 'admin', '📊', 'Refresh API data', 'רענון נתוני API', 'Start the current API data refresh job', 'הפעל את רענון נתוני ה-API הנוכחיים'],
  ['trigger_api_data_locked', 'admin', '🔒', 'Refresh locked data', 'רענון נתונים נעולים', 'Start the locked API data refresh job', 'הפעל את רענון נתוני ה-API הנעולים'],
  ['trigger_next_race_info', 'admin', '🏁', 'Refresh next race', 'רענון המרוץ הבא', 'Start the next-race information job', 'הפעל את עדכון המידע על המרוץ הבא'],
  ['trigger_live_score_scheduler', 'admin', '🔴', 'Start live score job', 'הפעלת ניקוד חי', 'Start the live score scheduler job', 'הפעל את משימת הניקוד החי'],
];

const AGENT_COMMANDS = Object.freeze(entries.map(
  ([id, topic, icon, enTitle, heTitle, enExample, heExample]) =>
    Object.freeze({
      id,
      topic,
      icon,
      title: { en: enTitle, he: heTitle },
      example: { en: enExample, he: heExample },
    }),
));

module.exports = { AGENT_COMMANDS, COMMAND_GROUPS };
