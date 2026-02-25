const { getLanguage } = require('../i18n');

function buildFlowMessage(chatId) {
  const lang = getLanguage(chatId);

  if (lang === 'he') {
    return `🏁 F1 Fantasy Bot - תהליך שימוש

כך תפיקו את המרב מהבוט:

1️⃣ העלאת נתונים
   שלחו צילום מסך של הקבוצה הנוכחית מאפליקציית F1 Fantasy

2️⃣ בחירת צ'יפ (אופציונלי)
   השתמשו ב-/chips כדי לבחור צ'יפ (Extra DRS, Wildcard, או Limitless) לפני חישוב הקבוצות הטובות ביותר.
   השתמשו ב-/reset\\_chip כדי לחשב ללא צ'יפ.

3️⃣ חישוב הקבוצות הטובות ביותר
   הריצו /best\\_teams כדי למצוא את שילובי הקבוצה האופטימליים על סמך הנתונים שהעלאתם.

4️⃣ פרטי קבוצה
   לאחר /best\\_teams, שלחו מספר קבוצה (לדוגמה: 1, 2, 3) כדי לראות את ההעברות הנדרשות מהקבוצה הנוכחית.

5️⃣ מידע על מרוצים
   • /next\\_race\\_info - פרטים על המרוץ הבא
   • /next\\_races - לוח זמנים למרוצים הקרובים
   • /next\\_race\\_weather - תחזית מזג אוויר למרוץ הבא

💡 טיפים:
• השתמשו ב-/menu לתפריט אינטראקטיבי
• השתמשו ב-/print\\_cache כדי לבדוק את הנתונים השמורים
• השתמשו ב-/reset\\_cache כדי להתחיל מחדש
• פשוט כתבו שאלה בשפה חופשית — הבוט מבין גם טקסט רגיל!`;
  }

  return `🏁 F1 Fantasy Bot - Usage Flow

Here's how to get the most out of this bot:

1️⃣ Upload Your Data
   Send Current team screenshot from the F1 Fantasy app

2️⃣ Choose a Chip (Optional)
   Use /chips to select a chip (Extra DRS, Wildcard, or Limitless) before calculating best teams.
   Use /reset\\_chip to calculate without any chip.

3️⃣ Calculate Best Teams
   Run /best\\_teams to find the optimal team combinations based on your uploaded data.

4️⃣ Get Team Details
   After /best\\_teams, send a team number (e.g., 1, 2, 3) to see the required transfers from your current team.

5️⃣ Explore Race Info
   • /next\\_race\\_info - Details about the next race
   • /next\\_races - Upcoming race schedule
   • /next\\_race\\_weather - Weather forecast for the next race

💡 Tips:
• Use /menu for an interactive menu of all commands
• Use /print\\_cache to verify your cached data
• Use /reset\\_cache to start fresh
• Just type any question naturally — the bot understands free text too!`;
}

async function handleFlowCommand(bot, msg) {
  const chatId = msg.chat.id;
  const flowMessage = buildFlowMessage(chatId);

  await bot
    .sendMessage(chatId, flowMessage, { parse_mode: 'Markdown' })
    .catch((err) => console.error('Error sending flow message:', err));
}

module.exports = { handleFlowCommand };
