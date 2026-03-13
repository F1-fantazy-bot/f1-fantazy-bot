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
    'Selected chip: {CHIP}.': "צ'יפ נבחר: {CHIP}.",
    'Note: best team calculation was deleted.\nrerun {CMD} command to recalculate best teams.':
      'לתשומת לבך: החישוב נמחק.\nהפעל את הפקודה {CMD} מחדש לחישוב.',
    'which chip do you want to use?': "איזה צ'יפ תרצה להשתמש?",
    'Extra DRS': 'DRS נוסף',
    Limitless: 'ללא הגבלה',
    Wildcard: 'ווילדקארד',
    'Without Chip': "ללא צ'יפ",
    'Sorry, only admins can use this command.':
      'מצטער, רק מנהלים יכולים להשתמש בפקודה זו.',
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
    'Extra DRS Driver': 'נהג DRS נוסף',
    'New ': 'חדש ',
    'DRS Driver': 'נהג DRS',
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
    'Send an image (drivers, constructors, or current team screenshot) to automatically extract and cache the relevant data.':
      'שלח תמונה (נהגים, קבוצות או צילום של הקבוצה הנוכחית) לחילוץ אוטומטי ושמירת הנתונים.',
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
    '⚖️ Set Best Team Weights': '⚖️ הגדרת משקלי קבוצה מיטבית',
    'Set points/price-change weights for best teams ranking':
      'הגדר משקלים לנקודות/שינוי מחיר בדירוג הקבוצות המיטביות',
    'Usage: /set_best_team_weights <points%> <price_change%>\nExample: /set_best_team_weights 80 20\nDefault: 100 0':
      'שימוש: /set_best_team_weights <אחוז נקודות> <אחוז שינוי מחיר>\nדוגמה: /set_best_team_weights 80 20\nברירת מחדל: 100 0',
    'Weights must be non-negative numbers.': 'המשקלים חייבים להיות מספרים אי-שליליים.',
    'At least one weight must be greater than 0.':
      'לפחות אחד מהמשקלים חייב להיות גדול מ-0.',
    'Best team weights set: points {POINTS}% | price change {PRICE}%.':
      'משקלי הקבוצות המיטביות עודכנו: נקודות {POINTS}% | שינוי מחיר {PRICE}%.',
    'Choose best-team ranking preference:':
      'בחר העדפת דירוג לקבוצות המיטביות:',
    '🎯 100/0 - Maximum Points': '🎯 100/0 - מקסימום נקודות',
    '⚖️ 90/10 - Strong Points Bias': '⚖️ 90/10 - הטיה חזקה לנקודות',
    '📊 80/20 - Points Focused': '📊 80/20 - מיקוד בנקודות',
    '🤝 70/30 - Balanced with Points Edge': '🤝 70/30 - מאוזן עם עדיפות לנקודות',
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
    'Invalid JSON data. Please ensure it contains 22 drivers under "Drivers" property.':
      'נתוני JSON אינם תקינים. ודא שהם מכילים 22 נהגים תחת "Drivers".',
    'Invalid JSON data. Please ensure it contains 11 constructors under "Constructors" property.':
      'נתוני JSON אינם תקינים. ודא שהם מכילים 11 קבוצות תחת "Constructors".',
    'Invalid JSON data. Please ensure it contains the required properties under "CurrentTeam" property.':
      'נתוני JSON אינם תקינים. ודא שהם מכילים את המאפיינים הנדרשים תחת "CurrentTeam".',
    'Invalid cache snapshot. Paste the JSON output of /print_cache.':
      'צילום המטמון אינו תקין. הדבק את פלט ה-JSON של /print_cache.',
    'Everything looks good. You can now manage your teams.':
      'הכול נראה תקין. עכשיו אפשר לנהל את הקבוצות שלך.',
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
    DRS: 'DRS',
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
    Nickname: 'כינוי',
    'Select Team': 'בחירת קבוצה',
    'Select your active team:': 'בחר קבוצה פעילה:',
    'Active team switched to {TEAM}.': 'הקבוצה הפעילה הוחלפה ל-{TEAM}.',
    '🔄 Active team auto-switched to {TEAM}.':
      '🔄 הקבוצה הפעילה הוחלפה אוטומטית ל-{TEAM}.',
    'No teams found. Please upload a team screenshot first.':
      'לא נמצאו קבוצות. אנא העלה צילום מסך של קבוצה.',
    'You have multiple teams. Please run /select_team to choose your active team.':
      'יש לך מספר קבוצות. אנא הפעל /select_team כדי לבחור קבוצה פעילה.',
    'Which team is this screenshot from?': 'לאיזו קבוצה שייך צילום המסך הזה?',
    'Selected Team: {TEAM}': 'קבוצה נבחרת: {TEAM}',
    '🔀 Select Team': '🔀 בחירת קבוצה',
    'Switch between your fantasy teams': 'מעבר בין הקבוצות שלך',
  },
};

const LANGUAGE_NAME_KEYS = {
  en: 'English',
  he: 'Hebrew',
};

module.exports = { translations, LANGUAGE_NAME_KEYS };
