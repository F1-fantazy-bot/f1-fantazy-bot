const translations = {
  en: {},
  he: {
    'What type is this photo?': 'איזה סוג תמונה זו?',
    'Drivers': 'נהגים',
    'Constructors': 'קבוצות',
    'Current Team': 'קבוצה נוכחית',
    'Sorry, I only support text and image messages.': 'מצטער, אני תומך רק בהודעות טקסט ותמונות.',
    'Photo labeled as {TYPE}. Wait for extracted JSON data...': 'התמונה סומנה כ{TYPE}. נא להמתין לחילוץ נתונים...',
    'An error occurred while extracting data from the photo.': 'אירעה שגיאה בעת חילוץ הנתונים מהתמונה.',
    'Selected chip: {CHIP}.': 'צ\'יפ נבחר: {CHIP}.',
    'Note: best team calculation was deleted.\nrerun {CMD} command to recalculate best teams.': 'לתשומת לבך: החישוב נמחק.\nהפעל את הפקודה {CMD} מחדש לחישוב.',
    'which chip do you want to use?': 'איזה צ\'יפ תרצה להשתמש?',
    'Extra DRS': 'DRS נוסף',
    'Limitless': 'ללא הגבלה',
    'Wildcard': 'ווילדקארד',
    'Without Chip': 'ללא צ\'יפ',
    'Sorry, only admins can use this command.': 'מצטער, רק מנהלים יכולים להשתמש בפקודה זו.',
    'Simulation data fetched and cached successfully.': 'נתוני הסימולציה נטענו ונשמרו בהצלחה.',
    'Failed to load simulation data: {ERROR}': 'נכשל לטעון נתוני סימולציה: {ERROR}',
    'Cache has been reset for your chat.': 'המטמון אופס עבור הצ\'אט שלך.',
    'Next race information is currently unavailable.': 'מידע על המרוץ הבא אינו זמין כעת.'
    ,
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
    'Sorry, only admins can access billing statistics.': 'מצטער, רק מנהלים יכולים לצפות בסטטיסטיקת החיוב.',
    '❌ Error fetching billing statistics: {ERROR}\n\nPlease check your Azure configuration and permissions.':
      '❌ שגיאה בקבלת סטטיסטיקת חיוב: {ERROR}\n\nאנא בדוק את ההגדרות וההרשאות של Azure.',
    'No billing data available for this period.': 'אין נתוני חיוב לתקופה זו.',
    'Azure Billing Statistics': 'סטטיסטיקת חיוב Azure',
    'Current Month': 'חודש נוכחי',
    'Previous Month': 'חודש קודם',
    'Month-over-Month Comparison:': 'השוואת חודש לחודש:',
    'Increase': 'עלייה',
    'Decrease': 'ירידה',
    'No change': 'ללא שינוי',
    'Unknown menu action': 'פעולת תפריט לא ידועה',
    '🎯 *F1 Fantasy Bot Menu*\n\nChoose a category:': '🎯 *תפריט הבוט*\n\nבחר קטגוריה:',
    'Tip:': 'טיפ:',
    'Use {CMD} for quick text-based help': 'השתמש ב-{CMD} לעזרה מהירה',
    '❓ Help': '❓ עזרה',
    '⬅️ Back to Main Menu': '⬅️ חזרה לתפריט הראשי',
    'Choose a command:': 'בחר פקודה:',
    'Executing {CMD}...': 'מריץ את {CMD}...',
    'Error executing command': 'שגיאה בהרצת פקודה',
    'Command not found': 'הפקודה לא נמצאה',
    'Showing help...': 'מציג עזרה...',
    'Error showing help': 'שגיאה בהצגת עזרה',
    'Drivers cache is empty. Please send drivers image or valid JSON data.':
      'מטמון הנהגים ריק. אנא שלח תמונת נהגים או נתוני JSON תקינים.',
    'Selected Chip: {CHIP}': 'צ\'יפ שנבחר: {CHIP}',
    'No chip selected.': 'לא נבחר צ\'יפ.',
    'Team {NUM} Required Changes:': 'שינויים דרושים לקבוצה {NUM}:',
    'Drivers To Add': 'נהגים להוספה',
    'Drivers To Remove': 'נהגים להסרה',
    'Constructors To Add': 'קבוצות להוספה',
    'Constructors To Remove': 'קבוצות להסרה',
    'Extra DRS Driver': 'נהג DRS נוסף',
    'New ': 'חדש ',
    'DRS Driver': 'נהג DRS',
    'Chip To Activate': 'צ\'יפ להפעלה',
    'Team {NUM} Info:': 'מידע לקבוצה {NUM}:',
    'Projected Points': 'נקודות צפויות',
    'Expected Price Change': 'שינוי מחיר צפוי',
    'Δ Points': 'Δ נקודות',
    'Δ Price': 'Δ מחיר',
    'Weather Forecast': 'תחזית מזג אוויר',
    'Sprint Qualifying': 'מקצה דירוג ספרינט',
    'Sprint': 'ספרינט',
    'Qualifying': 'דירוג',
    'Race': 'מרוץ',
    'Next Race Information': 'מידע על המרוץ הבא',
    'Race Name': 'שם המרוץ',
    'Track': 'מסלול',
    'Location': 'מיקום',
    'Sprint Qualifying Date': 'תאריך דירוג ספרינט',
    'Sprint Qualifying Time': 'שעת דירוג ספרינט',
    'Sprint Date': 'תאריך ספרינט',
    'Sprint Time': 'שעת ספרינט',
    'Qualifying Date': 'תאריך דירוג',
    'Qualifying Time': 'שעת דירוג',
    'Race Date': 'תאריך מרוץ',
    'Race Time': 'שעת מרוץ',
    'Weekend Format': 'פורמט סוף שבוע',
    'Historical Race Stats (Last Decade)': 'סטטיסטיקת מרוצים היסטורית (עשור אחרון)',
    'Pole': 'פול',
    'Winner': 'מנצח',
    '2nd': 'מקום שני',
    '3rd': 'מקום שלישי',
    'Cars Finished': 'מכוניות שסיימו',
    'Overtakes': 'עקיפות',
    'Safety Cars': 'מכוניות בטיחות',
    'Red Flags': 'דגלים אדומים',
    'No historical data available for this track.': 'אין נתונים היסטוריים למסלול זה.',
    'Track History': 'היסטוריית מסלול',
    'F1 Fantasy Bot - Available Commands': 'פקודות זמינות - F1 Fantasy Bot',
    'Other Messages': 'הודעות נוספות',
    'Send an image (drivers, constructors, or current team screenshot) to automatically extract and cache the relevant data.':
      'שלח תמונה (נהגים, קבוצות או צילום של הקבוצה הנוכחית) לחילוץ אוטומטי ושמירת הנתונים.',
    'Send valid JSON data to update your drivers, constructors, and current team cache.':
      'שלח נתוני JSON תקינים לעדכון המטמון של הנהגים, הקבוצות והקבוצה הנוכחית שלך.',
    'Send a number (e.g., 1) to get the required changes to reach that team from your current team (after using {CMD}).':
      'שלח מספר (לדוגמה, 1) כדי לקבל את השינויים הנדרשים להגיע לקבוצה זו מהקבוצה הנוכחית (לאחר שימוש ב-{CMD}).'
    ,
    'Unknown': 'לא ידוע',
    'Invalid date': 'תאריך לא תקין'
    ,
    'Language changed to {LANG}.': 'השפה שונתה ל{LANG}.',
    'Invalid language. Supported languages: {LANGS}':
      'שפה לא תקינה. השפות הזמינות: {LANGS}',
    'Usage: {CMD} <LANG>': 'שימוש: {CMD} <שפה>',
    '🌐 Set Language': '🌐 הגדר שפה',
    'Change bot language for this session': 'שנה את שפת הבוט להפעלה זו'
  }
};

let currentLanguage = process.env.BOT_LANGUAGE || 'en';

function setLanguage(lang) {
  if (translations[lang]) {
    currentLanguage = lang;

    return true;
  }

  return false;
}

function getLanguage() {
  return currentLanguage;
}

function getSupportedLanguages() {
  return Object.keys(translations);
}

function t(message, params = {}, lang = currentLanguage) {
  let text = (translations[lang] && translations[lang][message]) || message;
  for (const [key, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`{${key}}`, 'g'), value);
  }

  return text;
}

module.exports = { t, setLanguage, getLanguage, getSupportedLanguages };
