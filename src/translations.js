const translations = {
  en: {},
  he: {
    'What type is this photo?': 'איזה סוג תמונה זו?',
    Drivers: 'נהגים',
    Constructors: 'קבוצות',
    'Current Team': 'קבוצה נוכחית',
    'Sorry, I only support text and image messages.':
      'מצטער, אני תומך רק בהודעות טקסט ותמונות.',
    'Photo labeled as {TYPE}. Wait for extracted JSON data...':
      'התמונה סומנה כ{TYPE}. נא להמתין לחילוץ נתונים...',
    'An error occurred while extracting data from the photo.':
      'אירעה שגיאה בעת חילוץ הנתונים מהתמונה.',
    'Please wait while data is extracted from the image.':
      'נא המתן לחילוץ הנתונים מהתמונה',
    'Selected chip: {CHIP}.': "צ'יפ נבחר: {CHIP}.",
    'Note: best team calculation was deleted.\nrerun {CMD} command to recalculate best teams.':
      'לתשומת לבך: החישוב נמחק.\nהפעל את הפקודה {CMD} מחדש לחישוב.',
    'which chip do you want to use?': "איזה צ'יפ תרצה להשתמש?",
    'Extra Boost': 'אקסטרה בוסט',
    Limitless: 'ללא הגבלה',
    Wildcard: 'ווילדקארד',
    'Without Chip': "ללא צ'יפ",
    'Sorry, only admins can use this command.':
      'מצטער, רק מנהלים יכולים להשתמש בפקודה זו.',
    'Please send a drivers screenshot.': 'אנא שלח צילום מסך של נהגים.',
    'Please send a constructors screenshot.': 'אנא שלח צילום מסך של קבוצות.',
    'We support only photo replies for this command. Please send a drivers screenshot.':
      'פקודה זו תומכת רק בתשובת תמונה. אנא שלח צילום מסך של נהגים.',
    'We support only photo replies for this command. Please send a constructors screenshot.':
      'פקודה זו תומכת רק בתשובת תמונה. אנא שלח צילום מסך של קבוצות.',
    'Sorry, only admins can get BotFather commands.':
      'מצטער, רק מנהלים יכולים לקבל פקודות BotFather.',
    'Simulation data fetched and cached successfully.':
      'נתוני הסימולציה נטענו ונשמרו בהצלחה.',
    'Failed to load simulation data: {ERROR}':
      'טעינת נתוני סימולציה נכשלה: {ERROR}',
    'Cache has been reset for your chat.': "המטמון אופס עבור הצ'אט שלך.",
    'Next race information is currently unavailable.':
      'מידע על המרוץ הבא אינו זמין כעת.',
    'No upcoming races found for this season.':
      'לא נמצאו מרוצים קרובים לעונה זו.',
    'Unable to fetch upcoming races. Please try again later.':
      'לא ניתן להביא את המרוצים הקרובים. נסה שוב מאוחר יותר.',
    'Upcoming Races': 'מרוצים קרובים',
    'Upcoming Races (continued)': 'מרוצים קרובים (המשך)',
    'Summary: {RACES_SUMMARY}, {SPRINT_SUMMARY}':
      'סיכום: {RACES_SUMMARY}, {SPRINT_SUMMARY}',
    '1 race left to go': 'מרוץ אחד נותר לסיום',
    '{COUNT} races left to go': '{COUNT} מרוצים נותרו לסיום',
    '1 of them is sprint format': 'אחד מהם בפורמט ספרינט',
    '{COUNT} of them are sprint format': '{COUNT} מהם בפורמט ספרינט',
    'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.':
      'נתוני מטמון חסרים. אנא שלח תמונות או קבצי JSON של נהגים, קבוצות וקבוצה נוכחית קודם.',
    'No selected best team found for {TEAM}. Please run /best_teams and send a number first.':
      'לא נמצאה קבוצה מומלצת שנבחרה עבור {TEAM}. הפעל /best_teams ושלח מספר קודם.',
    'Please send a number to get the required changes to that team.':
      'אנא שלח מספר לקבלת השינויים הדרושים לקבוצה הזו.',
    'You currently have data in your cache. To use data from a simulation, please run {CMD} first.':
      'יש לך נתונים במטמון. להפעלת נתוני סימולציה הפעל קודם את {CMD}.',
    'No simulation data is currently loaded. Please use {CMD} to load simulation data.':
      'אין נתוני סימולציה טעונים. השתמש ב-{CMD} כדי לטעון נתונים.',
    'Last updated: {TIME}': 'עודכן לאחרונה: {TIME}',
    'Current simulation: {NAME}\n{UPDATE}': 'סימולציה נוכחית: {NAME}\n{UPDATE}',
    '💡 Tip: If the simulation seems outdated, you can run {CMD} to update the current simulation.':
      '💡 טיפ: אם הסימולציה נראית מיושנת, ניתן להריץ את {CMD} לעדכון.',
    'Sorry, only admins can access billing statistics.':
      'מצטער, רק מנהלים יכולים לצפות בסטטיסטיקת החיוב.',
    '❌ Error fetching billing statistics: {ERROR}\n\nPlease check your Azure configuration and permissions.':
      '❌ שגיאה בקבלת סטטיסטיקת חיוב: {ERROR}\n\nאנא בדוק את ההגדרות וההרשאות של Azure.',
    'No billing data available for this period.': 'אין נתוני חיוב לתקופה זו.',
    'Azure Billing Statistics': 'סטטיסטיקת חיוב Azure',
    'Current Month': 'חודש נוכחי',
    'Previous Month': 'חודש קודם',
    'Month-over-Month Comparison:': 'השוואת חודש לחודש:',
    Increase: 'עלייה',
    Decrease: 'ירידה',
    'No change': 'ללא שינוי',
    'Unknown menu action': 'פעולת תפריט לא ידועה',
    '🎯 *F1 Fantasy Bot Menu*\n\nChoose a category:':
      '🎯 *תפריט הבוט*\n\nבחר קטגוריה:',
    'Tip:': 'טיפ:',
    'Use {CMD} for quick text-based help': 'השתמש ב-{CMD} לעזרה מהירה',
    '❓ Help': '❓ עזרה',
    'Show this help message.': 'הצג הודעת עזרה זו.',
    '⬅️ Back to Main Menu': '⬅️ חזרה לתפריט הראשי',
    'Choose a command:': 'בחר פקודה:',
    'Executing {CMD}...': 'מריץ את {CMD}...',
    'Error executing command': 'שגיאה בהרצת פקודה',
    'Command not found': 'הפקודה לא נמצאה',
    'Showing help...': 'מציג עזרה...',
    'Error showing help': 'שגיאה בהצגת עזרה',
    'Drivers cache is empty. Please send drivers image or valid JSON data.':
      'מטמון הנהגים ריק. אנא שלח תמונת נהגים או נתוני JSON תקינים.',
    'Selected Chip: {CHIP}': "צ'יפ שנבחר: {CHIP}",
    'No chip selected.': "לא נבחר צ'יפ.",
    'Team {NUM} Required Changes:': 'שינויים דרושים לקבוצה {NUM}:',
    'Drivers To Add': 'נהגים להוספה',
    'Drivers To Remove': 'נהגים להסרה',
    'Constructors To Add': 'קבוצות להוספה',
    'Constructors To Remove': 'קבוצות להסרה',
    'Extra Boost Driver': 'נהג אקסטרה בוסט',
    'New ': 'חדש ',
    'Boost Driver': 'נהג בוסט',
    'Chip To Activate': "צ'יפ להפעלה",
    'Team {NUM} Info:': 'מידע לקבוצה {NUM}:',
    'Projected Points': 'נקודות צפויות',
    'Expected Price Change': 'שינוי מחיר צפוי',
    'Total Price': 'מחיר כולל',
    'Transfers Needed': 'מספר העברות נדרש',
    Penalty: 'קנס',
    'Team {NUM} (Current Team)': 'קבוצה {NUM} (קבוצה נוכחית)',
    'Team {NUM}': 'קבוצה {NUM}',
    'Drivers & Constructors Total Price': 'מחיר כולל של נהגים וקבוצות',
    'Cost Cap Remaining': 'יתרת תקציב',
    'Total Budget': 'תקציב כולל',
    'Expected Points': 'נקודות צפויות',
    'Budget-Adjusted Points': 'נקודות מותאמות תקציב',
    'Best Team Scenarios': 'תרחישי קבוצה מיטבית',
    'Ranking Modes': 'מצבי דירוג',
    'Current Selection': 'הבחירה הנוכחית',
    'points per million': 'נקודות למיליון',
    Unavailable: 'לא זמין',
    'Δ Budget-Adjusted Points': 'Δ נקודות מותאמות תקציב',
    'Δ Points': 'Δ נקודות',
    'Δ Price': 'Δ מחיר',
    'Weather Forecast': 'תחזית מזג אוויר',
    'Next Race Weather Forecast': 'תחזית מזג האוויר למרוץ הבא',
    Hour: 'שעה',
    Temp: 'טמפרטורה',
    Humidity: 'לחות',
    'Cloud Cover': 'עננות',
    Rain: 'גשם',
    'Precipitation (mm)': 'משקעים (מ"מ)',
    Wind: 'רוח',
    'km/h': 'קמ"ש',
    mm: 'מ"מ',
    'Sprint Qualifying': 'מקצה דירוג ספרינט',
    Sprint: 'ספרינט',
    FP1: 'אימון 1',
    FP2: 'אימון 2',
    FP3: 'אימון 3',
    Regular: 'רגיל',
    Qualifying: 'דירוג',
    Race: 'מרוץ',
    Circuit: 'מסלול',
    Countdown: 'ספירה לאחור',
    Sessions: 'מקצים',
    'More Info': 'מידע נוסף',
    'Round {ROUND}: {NAME}': 'סבב {ROUND}: {NAME}',
    TBD: 'טרם נקבע',
    'Next Race Information': 'מידע על המרוץ הבא',
    'Race Name': 'שם המרוץ',
    Track: 'מסלול',
    Location: 'מיקום',
    'Sprint Qualifying Date': 'תאריך דירוג ספרינט',
    'Sprint Qualifying Time': 'שעת דירוג ספרינט',
    'Sprint Date': 'תאריך ספרינט',
    'Sprint Time': 'שעת ספרינט',
    'Qualifying Date': 'תאריך דירוג',
    'Qualifying Time': 'שעת דירוג',
    'Race Date': 'תאריך מרוץ',
    'Race Time': 'שעת מרוץ',
    'Weekend Format': 'פורמט סוף שבוע',
    'Historical Race Stats (Last Decade)':
      'סטטיסטיקת מרוצים היסטורית (עשור אחרון)',
    Pole: 'פול',
    Winner: 'מנצח',
    '2nd': 'מקום שני',
    '3rd': 'מקום שלישי',
    'Cars Finished': 'מכוניות שסיימו',
    Overtakes: 'עקיפות',
    'Safety Cars': 'מכוניות בטיחות',
    'Red Flags': 'דגלים אדומים',
    'No historical data available for this track.':
      'אין נתונים היסטוריים למסלול זה.',
    'Track History': 'היסטוריית מסלול',
    'F1 Fantasy Bot - Available Commands': 'פקודות זמינות - F1 Fantasy Bot',
    'Other Messages': 'הודעות נוספות',
    'Run `/follow_league` to track your F1 Fantasy league. You can also send a JSON dump or, as a fallback, a current-team screenshot to update the cache.':
      'הפעילו `/follow_league` כדי לעקוב אחרי הליגה שלכם ב-F1 Fantasy. אפשר גם לשלוח JSON או, כגיבוי, צילום מסך של הקבוצה הנוכחית כדי לעדכן את המטמון.',
    'Send valid JSON data to update your drivers, constructors, and current team cache.':
      'שלח נתוני JSON תקינים לעדכון המטמון של הנהגים, הקבוצות והקבוצה הנוכחית שלך.',
    'Send a number (e.g., 1) to get the required changes to reach that team from your current team (after using {CMD}).':
      'שלח מספר (לדוגמה, 1) כדי לקבל את השינויים הנדרשים להגיע לקבוצה זו מהקבוצה הנוכחית (לאחר שימוש ב-{CMD}).',
    Unknown: 'לא ידוע',
    'Invalid date': 'תאריך לא תקין',
    'Language changed to {LANG}.': 'השפה שונתה ל{LANG}.',
    'Invalid language. Supported languages: {LANGS}':
      'שפה לא תקינה. השפות הזמינות: {LANGS}',
    'Usage: {CMD} <LANG>': 'שימוש: {CMD} <שפה>',
    'Please select a language:': 'אנא בחר שפה:',
    English: 'אנגלית',
    Hebrew: 'עברית',
    '🌐 Set Language': '🌐 הגדר שפה',
    'Change bot language for this session': 'שנה את שפת הבוט',
    '⚖️ Set Best Team Ranking': '⚖️ הגדרת דירוג קבוצה מיטבית',
    '🧪 Best Team Scenarios': '🧪 תרחישי קבוצה מיטבית',
    'Set how budget changes affect best-team ranking suggestions':
      'הגדר כיצד שינויי תקציב משפיעים על דירוג הצעות לקבוצות מיטביות',
    'Compare the top best-team outcome across ranking and chip scenarios':
      "השווה את תוצאת הקבוצה המיטבית בתרחישי דירוג וצ'יפים שונים",
    '{ICON} {LABEL} ({VALUE})': '{ICON} {LABEL} ({VALUE})',
    'Best-team ranking set: {LABEL} ({VALUE} pts per 1M per remaining race).':
      'דירוג הקבוצות המיטביות עודכן: {LABEL} ({VALUE} נק׳ לכל 1M לכל מרוץ שנותר).',
    'Choose best-team ranking preference:':
      'בחר העדפת דירוג לקבוצות המיטביות:',
    'Value = points added for each 1M budget change per race left.':
      'ערך = כמה נקודות מתווספות על כל שינוי של 1M לכל מרוץ שנותר.',
    'Remaining races used now: {COUNT}.':
      'מספר המרוצים שמשמש כרגע בחישוב: {COUNT}.',
    'Remaining races used now: unavailable.':
      'מספר המרוצים שמשמש כרגע בחישוב: לא זמין.',
    'Pure Points': 'נקודות בלבד',
    'Points Lean': 'הטיה לנקודות',
    'Points Plus Budget': 'נקודות עם ערך לתקציב',
    'Balanced Budget Value': 'איזון עם ערך לתקציב',
    'Remaining race count is unavailable right now. Switch to Pure Points or try again later.':
      'מספר המרוצים שנותרו אינו זמין כרגע. עבור לנקודות בלבד או נסה שוב מאוחר יותר.',
    'Please provide a question.': 'אנא ספק שאלה.',
    '❓ Help & Menu': '❓ עזרה ותפריט',
    'Help and navigation commands': 'פקודות עזרה וניווט',
    '🏎️ Team Management': '🏎️ ניהול קבוצה',
    'Manage and optimize your F1 Fantasy team':
      'ניהול ואופטימיזציה של קבוצת F1 Fantasy',
    '📊 Analysis & Stats': '📊 ניתוח וסטטיסטיקה',
    'View race information and performance data':
      'צפה במידע על מרוצים ונתוני ביצועים',
    '🔧 Utilities': '🔧 כלי עזר',
    'Data management and maintenance tools': 'כלי ניהול ותחזוקה של נתונים',
    '👤 Admin Commands': '👤 פקודות מנהל',
    'Administrative tools and functions': 'כלים ופעולות ניהול',
    '📱 Menu': '📱 תפריט',
    'Show interactive menu with all available commands.':
      'הצג תפריט אינטראקטיבי עם כל הפקודות הזמינות.',
    '🏆 Best Teams': '🏆 הקבוצות הטובות ביותר',
    'Calculate and display the best possible teams based on your cached data':
      'חשב והצג את הקבוצות הטובות ביותר על סמך הנתונים במטמון',
    '👥 Current Team Info': '👥 מידע על הקבוצה הנוכחית',
    'Current Team Info': 'מידע על הקבוצה הנוכחית',
    'Calculate the current team info based on your cached data':
      'חשב את מידע הקבוצה הנוכחית על סמך הנתונים במטמון',
    '🎯 Chips Selection': "🎯 בחירת צ'יפ",
    'Choose a chip to use for the current race': "בחר צ'יפ לשימוש במרוץ הנוכחי",
    '🏁 Next Race Info': '🏁 מידע על המרוץ הבא',
    'Get detailed information about the next F1 race':
      'קבל מידע מפורט על המרוץ הבא',
    '🗓️ Upcoming Races': '🗓️ מרוצים קרובים',
    'View schedule details for the remaining races this season':
      'צפה בפרטי לוח הזמנים של המרוצים שנותרו בעונה',
    '📈 Current Simulation': '📈 סימולציה נוכחית',
    'Show the current simulation data and name':
      'הצג את נתוני הסימולציה הנוכחית ואת שמה',
    '📄 Print Cache': '📄 הדפסת מטמון',
    'Show the currently cached drivers, constructors, and current team':
      'הצג את הנהגים, הקבוצות והקבוצה הנוכחית במטמון',
    '🗑️ Reset Cache': '🗑️ איפוס מטמון',
    'Clear all cached data for this chat':
      "נקה את כל הנתונים במטמון עבור צ'אט זה",
    '📋 Load Simulation': '📋 טעינת סימולציה',
    'Load latest simulation data': 'טען את נתוני הסימולציה העדכניים ביותר',
    '🔄 Trigger Scraping': '🔄 הפעל סריקה',
    'Trigger web scraping for latest F1 Fantasy data':
      'הפעל סריקת רשת לקבלת נתוני F1 Fantasy העדכניים',
    '🤖 BotFather Commands': '🤖 פקודות BotFather',
    'Get commands for BotFather setup': 'קבל פקודות להגדרת BotFather',
    '💰 Billing Stats': '💰 סטטיסטיקת חיוב',
    'Get Azure billing statistics for the current month':
      'קבל סטטיסטיקת חיוב Azure לחודש הנוכחי',
    'ℹ️ Version': 'ℹ️ גרסה',
    'Show current deployed version': 'הצג את הגרסה המותקנת הנוכחית',
    '🔴 Live Score': '🔴 ניקוד חי',
    'Show current live points and price change for your team':
      'הצג את הניקוד החי ושינוי המחיר הנוכחיים של הקבוצה שלך',
    '⏳ Deadline': '⏳ דדליין',
    'Show time left until your next fantasy team lock deadline':
      'הצג את הזמן שנותר עד דדליין נעילת הקבוצה הבאה שלך',
    'Teams Lock Deadline': 'דדליין נעילת הקבוצה',
    Race: 'מרוץ',
    'Session type': 'סוג סשן',
    'Dont forget to lock the team before that time':
      'אל תשכח לנעול את הקבוצה לפני הזמן הזה',
    'This session already started.': 'הסשן הזה כבר התחיל.',
    '🔄 Refresh': '🔄 רענון',
    sprint: 'ספרינט',
    quali: 'דירוג',
    day: 'יום',
    days: 'ימים',
    hour: 'שעה',
    hours: 'שעות',
    minute: 'דקה',
    minutes: 'דקות',
    second: 'שנייה',
    seconds: 'שניות',
    and: 'ו-',
    'Live Score': 'ניקוד חי',
    'Live Score Summary': 'סיכום ניקוד בזמן אמת',
    'Updated At': 'עודכן ב',
    'Total Live Points': 'סך הכל נקודות בזמן אמת',
    'Total Live Price Change': 'סך הכל שינוי מחיר בזמן אמת',
    'Live Drivers': 'נהגים',
    'Live Constructors': 'יצרנים',
    'Drivers Breakdown': 'פירוט נהגים',
    'Constructors Breakdown': 'פירוט קבוצות',
    'Missing live data for: {MEMBERS}': 'חסרים נתוני לייב עבור: {MEMBERS}',
    'No data': 'אין נתונים',
    base: 'בסיס',
    pts: 'נק׳',
    Adj: 'מותאם',
    'Boost x2': 'בוסט כפול',
    '❌ Error fetching live score: {ERROR}':
      '❌ שגיאה בקבלת ניקוד חי: {ERROR}',
    'Invalid JSON data. Please ensure it contains 22 drivers under "Drivers" property.':
      'נתוני JSON אינם תקינים. ודא שהם מכילים 22 נהגים תחת "Drivers".',
    'Invalid JSON data. Please ensure it contains 11 constructors under "Constructors" property.':
      'נתוני JSON אינם תקינים. ודא שהם מכילים 11 קבוצות תחת "Constructors".',
    'Invalid JSON data. Please ensure it contains the required properties under "CurrentTeam" property.':
      'נתוני JSON אינם תקינים. ודא שהם מכילים את המאפיינים הנדרשים תחת "CurrentTeam".',
    'Invalid cache snapshot. Paste the JSON output of /print_cache.':
      'צילום המטמון אינו תקין. הדבק את פלט ה-JSON של /print_cache.',
    'Cache data saved successfully': 'נתוני המטמון נשמרו בהצלחה.',
    'Error: Scraping trigger URL is not configured.':
      'שגיאה: כתובת ההפעלה לסריקה אינה מוגדרת.',
    'Sorry, only admins can trigger scraping.':
      'מצטער, רק מנהלים יכולים להפעיל סריקה.',
    'Web scraping triggered successfully.': 'סריקת הרשת הופעלה בהצלחה.',
    'Failed to trigger web scraping: {ERROR}': 'הפעלת סריקה נכשלה: {ERROR}',
    'Commit ID: {ID}\nCommit message: {MSG}\nLink: {LINK}':
      'מזהה קומיט: {ID}\nהודעת קומיט: {MSG}\nקישור: {LINK}',
    '🏁 Usage Flow': '🏁 תהליך שימוש',
    'Explains the usage flow of the bot step by step.':
      'מסביר את תהליך השימוש בבוט צעד אחר צעד.',
    'What message would you like to send to the admins?':
      'איזו הודעה תרצה לשלוח למנהלים?',
    'Bug report from {NAME} ({ID}):\n\n{MESSAGE}':
      'דיווח באג מ{NAME} ({ID}):\n\n{MESSAGE}',
    'Your message has been sent to the admins. Thank you!':
      'ההודעה שלך נשלחה למנהלים. תודה!',
    '🐛 Report Bug': '🐛 דיווח באג',
    'Report a bug or send feedback to the admins':
      'דווח על באג או שלח משוב למנהלים',
    'Invalid reply. Please try again.': 'תגובה לא תקינה. אנא נסה שוב.',
    'We support only text. {PROMPT}': 'אנו תומכים רק בטקסט. {PROMPT}',
    'Registered Users': 'משתמשים רשומים',
    'Chat ID': "מזהה צ'אט",
    Language: 'שפה',
    'First Seen': 'נראה לראשונה',
    'Last Seen': 'נראה לאחרונה',
    'No registered users found.': 'לא נמצאו משתמשים רשומים.',
    '❌ Error fetching user list: {ERROR}':
      '❌ שגיאה בקבלת רשימת משתמשים: {ERROR}',
    '👥 List Users': '👥 רשימת משתמשים',
    'List all registered bot users': 'הצג את כל המשתמשים הרשומים בבוט',
    'You are already at team {TEAM}. No changes needed.':
      'אתה כבר בקבוצה {TEAM}. אין צורך בשינויים.',
    'No team found for number {NUM}.': 'לא נמצאה קבוצה עבור מספר {NUM}.',
    'No cached teams available. Please send full JSON data or images first and then run the {CMD} command.':
      'אין קבוצות שמורות במטמון. אנא שלח נתוני JSON מלאים או תמונות קודם ולאחר מכן הפעל את הפקודה {CMD}.',
    Boost: 'בוסט',
    '🌦️ Next Race Weather': '🌦️ מזג אוויר למרוץ הבא',
    'Get detailed weather forecast for the next race':
      'קבל תחזית מזג אוויר מפורטת למרוץ הבא',
    'Please enter the chat ID of the user you want to send a message to:':
      'אנא הזן את מזהה הצ׳אט של המשתמש שאליו תרצה לשלוח הודעה:',
    'What message do you want to send to {NAME}?':
      'איזו הודעה תרצה לשלוח ל{NAME}?',
    'Message sent successfully to user {ID}.':
      'ההודעה נשלחה בהצלחה למשתמש {ID}.',
    'User with ID {ID} not found. Please enter a valid chat ID:':
      'משתמש עם מזהה {ID} לא נמצא. אנא הזן מזהה צ׳אט תקין:',
    'Failed to send message to user {ID}: {ERROR}':
      'שליחת ההודעה למשתמש {ID} נכשלה: {ERROR}',
    '✉️ Send Message to User': '✉️ שלח הודעה למשתמש',
    'Send a message to a specific bot user': 'שלח הודעה למשתמש ספציפי של הבוט',
    'User not found. Please enter a valid chat ID:':
      'משתמש לא נמצא. אנא הזן מזהה צ׳אט תקין:',
    'We support only text. Please enter the message to send.':
      'אנו תומכים רק בטקסט. אנא הזן את ההודעה לשליחה.',
    '📩 Message from bot admin:\n\n{MESSAGE}':
      '📩 הודעה ממנהל הבוט:\n\n{MESSAGE}',
    'Please enter the message you want to broadcast to all users:':
      'אנא הזן את ההודעה שברצונך לשלוח לכל המשתמשים:',
    '📢 Broadcast from bot admin:\n\n{MESSAGE}':
      '📢 הודעה ממנהל הבוט:\n\n{MESSAGE}',
    'Broadcast complete.\n\n✅ Sent successfully: {SUCCESS}\n❌ Failed: {FAILED}':
      'השידור הושלם.\n\n✅ נשלח בהצלחה: {SUCCESS}\n❌ נכשל: {FAILED}',
    'Failed to send to:\n{DETAILS}': 'שליחה נכשלה אל:\n{DETAILS}',
    '📢 Broadcast': '📢 שידור',
    'Send a message to all bot users': 'שלח הודעה לכל משתמשי הבוט',
    'We support only text. Please enter the message to broadcast.':
      'אנו תומכים רק בטקסט. אנא הזן את ההודעה לשידור.',
    'No registered users found to broadcast to.':
      'לא נמצאו משתמשים רשומים לשידור.',
    'Please enter the chat ID of the user you want to set a nickname for:':
      'אנא הזן את מזהה הצ׳אט של המשתמש שעבורו תרצה להגדיר כינוי:',
    'Please enter the nickname for {NAME}:': 'אנא הזן כינוי עבור {NAME}:',
    'Nickname for {NAME} ({ID}) set to "{NICKNAME}".':
      'הכינוי עבור {NAME} ({ID}) הוגדר ל"{NICKNAME}".',
    '❌ Error setting nickname: {ERROR}': '❌ שגיאה בהגדרת כינוי: {ERROR}',
    'We support only text. Please enter the nickname.':
      'אנו תומכים רק בטקסט. אנא הזן את הכינוי.',
    '📛 Set Nickname': '📛 הגדר כינוי',
    'Set a nickname for a user to display in logs':
      'הגדר כינוי למשתמש להצגה ביומנים',
    '📤 Upload Drivers Photo': '📤 העלאת תמונת נהגים',
    'Upload a drivers screenshot for cache extraction':
      'העלה צילום מסך נהגים לחילוץ נתונים למטמון',
    '📤 Upload Constructors Photo': '📤 העלאת תמונת קבוצות',
    'Upload a constructors screenshot for cache extraction':
      'העלה צילום מסך קבוצות לחילוץ נתונים למטמון',
    Nickname: 'כינוי',
    'Select Team': 'בחירת קבוצה',
    'Select your active team:': 'בחר קבוצה פעילה:',
    'Active team switched to {TEAM}.': 'הקבוצה הפעילה הוחלפה ל-{TEAM}.',
    '🔄 Active team auto-switched to {TEAM}.':
      '🔄 הקבוצה הפעילה הוחלפה אוטומטית ל-{TEAM}.',
    'No teams found. Please run /follow_league to follow your F1 Fantasy league (if you haven\'t yet), then /teams_tracker to pick teams to track.':
      'לא נמצאו קבוצות. אנא הפעל /follow_league כדי לעקוב אחרי הליגה שלך (אם עוד לא עשית זאת), ולאחר מכן /teams_tracker כדי לבחור קבוצות לעקוב אחריהן.',
    'You have multiple teams. Please run /select_team to choose your active team.':
      'יש לך מספר קבוצות. אנא הפעל /select_team כדי לבחור קבוצה פעילה.',
    'Which team is this screenshot from?': 'לאיזו קבוצה שייך צילום המסך הזה?',
    'Selected Team: {TEAM}': 'קבוצה נבחרת: {TEAM}',
    '🔀 Select Team': '🔀 בחירת קבוצה',
    'Switch between your fantasy teams': 'מעבר בין הקבוצות שלך',
    'Please enter the league code you want to follow:':
      'אנא הזן את קוד הליגה שברצונך לעקוב אחריה:',
    'We support only text. Please enter the league code:':
      'אנחנו תומכים רק בטקסט. אנא הזן את קוד הליגה:',
    'League "{CODE}" not found. Please enter a valid league code:':
      'ליגה "{CODE}" לא נמצאה. אנא הזן קוד ליגה תקין:',
    '❌ Failed to load league data: {ERROR}':
      '❌ טעינת נתוני הליגה נכשלה: {ERROR}',
    '❌ Failed to follow league: {ERROR}':
      '❌ מעקב אחר הליגה נכשל: {ERROR}',
    'Now following league "{NAME}" ({CODE}).':
      'עוקב כעת אחר הליגה "{NAME}" ({CODE}).',
    'You are not following any league. Run {CMD} to follow one first.':
      'אינך עוקב אחר אף ליגה. הפעל {CMD} כדי לעקוב אחר ליגה.',
    'Which league leaderboard do you want to see?':
      'איזו טבלת ליגה ברצונך לראות?',
    'Which league do you want to unfollow?':
      'איזו ליגה להפסיק לעקוב?',
    'Unfollowed league {CODE}.': 'הופסק המעקב אחר הליגה {CODE}.',
    '❌ Failed to unfollow league: {ERROR}':
      '❌ הפסקת המעקב אחר הליגה נכשלה: {ERROR}',
    '❌ Failed to load your leagues: {ERROR}':
      '❌ טעינת הליגות שלך נכשלה: {ERROR}',
    'No leaderboard data is available yet for this league. Please try again later.':
      'עדיין אין נתוני טבלה עבור הליגה הזו. נסה שוב מאוחר יותר.',
    'No teams in this league yet.': 'אין עדיין קבוצות בליגה הזו.',
    '👥 {COUNT} teams · updated {TIME}':
      '👥 {COUNT} קבוצות · עודכן {TIME}',
    '➕ Follow League': '➕ מעקב אחר ליגה',
    'Follow an F1 Fantasy league by its code':
      'עקוב אחר ליגת F1 Fantasy לפי קוד',
    '➖ Unfollow League': '➖ הפסקת מעקב אחר ליגה',
    'Unfollow an F1 Fantasy league': 'הפסק לעקוב אחר ליגת F1 Fantasy',
    '🏆 Leaderboard': '🏆 טבלת ליגה',
    'View the leaderboard of a followed league':
      'צפה בטבלה של ליגה שאתה עוקב אחריה',
    '🏁 League Management': '🏁 ניהול ליגות',
    'Follow and view F1 Fantasy leagues':
      'עקוב וצפה בליגות F1 Fantasy',
    '🎯 Select Team From League': '🎯 בחר קבוצה מליגה',
    'Follow a team roster from a followed league (up to 6 followed teams)':
      'עקוב אחר קבוצה מליגה שאתה עוקב אחריה (עד 6 קבוצות במקביל)',
    '🗑️ Unfollow Team': '🗑️ הפסק לעקוב אחר קבוצה',
    'Stop following a league team': 'הפסק לעקוב אחר קבוצת ליגה',
    '📋 Teams Tracker': '📋 קבוצות במעקב',
    'Pick which league teams to follow (toggle up to 6 teams, then save)':
      'בחר אילו קבוצות מהליגה לעקוב אחריהן (עד 6 קבוצות, ושמור בסיום)',
    'Show league graphs: gap to leader, standings, or budget per race':
      'הצג גרפים של הליגה: פער מהמוביל, דירוג, או תקציב לכל מרוץ',
    'Pick a league to manage followed teams:':
      'בחר ליגה כדי לנהל את הקבוצות במעקב:',
    'Toggle teams to follow. Save when done.':
      'סמן קבוצות למעקב. שמור כשסיימת.',
    '💾 Save ({N}/{MAX})': '💾 שמור ({N}/{MAX})',
    '✖ Cancel': '✖ ביטול',
    '⬅ Back': '⬅ חזרה',
    'You can follow at most {MAX} teams. Deselect one first.':
      'ניתן לעקוב אחר עד {MAX} קבוצות. בטל סימון של אחת קודם.',
    '✅ Teams tracker updated. Following {N}/{MAX}. Active team: {TEAM}.':
      '✅ קבוצות המעקב עודכנו. במעקב {N}/{MAX}. קבוצה פעילה: {TEAM}.',
    '✅ Teams tracker updated. No teams are being followed.':
      '✅ קבוצות המעקב עודכנו. אין קבוצות במעקב.',
    '⚠️ {N} team(s) could not be added (league roster changed).':
      '⚠️ {N} קבוצה/ות לא נוספו (סגל הליגה השתנה).',
    'Teams tracker cancelled. No changes saved.':
      'קבוצות המעקב בוטלו. שום שינוי לא נשמר.',
    'This Teams Tracker view has expired. Open /teams_tracker again.':
      'תצוגת קבוצות המעקב פגה. הפעל /teams_tracker שוב.',
    '❌ Expired — reopen /teams_tracker':
      '❌ פג תוקף — הפעל /teams_tracker שוב',
    '❌ Failed to save teams tracker: {ERROR}':
      '❌ שמירת קבוצות המעקב נכשלה: {ERROR}',
    'no active team': 'אין קבוצה פעילה',
    '📊 Graphs': '📊 גרפים',
    'Render a line chart of gap to leader per race for every team in a followed league':
      'צייר גרף קווי של הפער מהמוביל בכל מרוץ עבור כל קבוצה בליגה במעקב',
    'Which league do you want to select a team from?':
      'מאיזו ליגה ברצונך לבחור קבוצה?',
    'Which team do you want to load?': 'איזו קבוצה ברצונך לטעון?',
    'No team roster is available yet for this league. Please try again later.':
      'עדיין אין נתוני הרכב קבוצות עבור הליגה הזו. נסה שוב מאוחר יותר.',
    '❌ Failed to load league teams data: {ERROR}':
      '❌ טעינת נתוני הקבוצות של הליגה נכשלה: {ERROR}',
    '❌ Could not find that team in the league anymore.':
      '❌ לא הצלחתי למצוא את הקבוצה הזו בליגה יותר.',
    '❌ Failed to save league team: {ERROR}':
      '❌ שמירת קבוצת הליגה נכשלה: {ERROR}',
    '✅ Now following team {TEAM} from league {LEAGUE}.':
      '✅ כעת עוקב אחר הקבוצה {TEAM} מהליגה {LEAGUE}.',
    '✅ Now following team {TEAM} from league {LEAGUE}. Your previous photo-uploaded teams were cleared.':
      '✅ כעת עוקב אחר הקבוצה {TEAM} מהליגה {LEAGUE}. הקבוצות שהועלו מתמונות נמחקו.',
    'ℹ️ You are already following team {TEAM}. Switched to it.':
      'ℹ️ אתה כבר עוקב אחר הקבוצה {TEAM}. עברתי אליה.',
    'You are already following {MAX} league teams. Pick one to unfollow so you can follow {TEAM}:':
      'אתה עוקב כבר אחר {MAX} קבוצות ליגה. בחר אחת להפסיק לעקוב כדי לעקוב אחר {TEAM}:',
    'Which team do you want to stop following?':
      'איזו קבוצה ברצונך להפסיק לעקוב אחריה?',
    'You are not following any league teams yet. Run {CMD} to follow one.':
      'אתה עדיין לא עוקב אחר אף קבוצת ליגה. הפעל {CMD} כדי לעקוב אחר קבוצה.',
    '✅ Stopped following team {TEAM}.': '✅ הפסקת לעקוב אחר הקבוצה {TEAM}.',
    '❌ Failed to stop following team: {ERROR}':
      '❌ הפסקת המעקב אחר הקבוצה נכשלה: {ERROR}',
    '❌ That followed team no longer exists.':
      '❌ הקבוצה שעקבת אחריה כבר לא קיימת.',
    '❌ The pending team to follow was lost. Please try /select_team_from_league again.':
      '❌ הקבוצה שהמתנת להוסיף אבדה. אנא נסה שוב את /select_team_from_league.',
    'To find your league code: go to the F1 Fantasy website, open the league you want to follow, click the share button, and copy the league code from there.':
      'כדי למצוא את קוד הליגה: היכנס לאתר \u2066F1 Fantasy\u2069, פתח את הליגה שברצונך לעקוב אחריה, לחץ על כפתור השיתוף והעתק את קוד הליגה משם.',
    '📩 If the code is correct but the league is not yet tracked, please report it to the admins via /report_bug with the league code and we will add the bot to the league as soon as possible.':
      '📩\u200F אם הקוד תקין אך הליגה עדיין לא מנוטרת, דווח לאדמינים עם קוד הליגה באמצעות \u2066/report_bug\u2069 ונוסיף את הבוט לליגה בהקדם האפשרי.',
    '💡 Send /cancel at any time to abort.':
      '💡\u200F שלח \u2066/cancel\u2069 בכל רגע כדי לבטל.',
    'Operation cancelled.': 'הפעולה בוטלה.',
    'Which league graph do you want to see?':
      'איזה גרף ליגה תרצה לראות?',
    'Which graph do you want to see?': 'איזה גרף תרצה לראות?',
    '📉 Gap to Leader': '📉 פער מהמוביל',
    '🏆 Standings': '🏆 דירוג',
    '💰 Budget': '💰 תקציב',
    'No budget data is available yet for this league. Please try again later.':
      'עדיין אין נתוני תקציב זמינים עבור הליגה הזו. נסה שוב מאוחר יותר.',
    'Not enough race data yet to render a graph for this league.':
      'אין עדיין מספיק נתוני מרוצים כדי לצייר גרף עבור הליגה הזו.',
    '❌ Failed to generate the league graph: {ERROR}':
      '❌ יצירת גרף הליגה נכשלה: {ERROR}',
    '❌ Failed to send the league graph: {ERROR}':
      '❌ שליחת גרף הליגה נכשלה: {ERROR}',
    '🏆 {LEAGUE} — gap to leader per race':
      '🏆 {LEAGUE} — פער מהמוביל לפי מרוץ',
    '💰 {LEAGUE} — budget per race':
      '💰 {LEAGUE} — תקציב לפי מרוץ',
    '🏆 {LEAGUE} — standings per race':
      '🏆 {LEAGUE} — דירוג לפי מרוץ',
  },
};

const LANGUAGE_NAME_KEYS = {
  en: 'English',
  he: 'Hebrew',
};

module.exports = { translations, LANGUAGE_NAME_KEYS };
