// Date/time labels for check-in lists, alerts and report text that follow the APP language without depending on the
// phone's Intl/ICU locale data (same idea as monthLabel.ts). Table-based, all 10 app languages.
// Digits: Western digits for every language including Arabic (matches the rest of the app).
// Clock: keeps each language's own default convention, as the app already did via Intl without an hour12 override:
// en/hi/ar 12-hour with am/pm marker, the others 24-hour. `force24` keeps screens that always forced 24-hour (hour12:false).
import { monthShort } from './monthLabel';

type Style = 'short' | 'long';

const WEEKDAYS: Record<string, { short: string[]; long: string[] }> = {
  en: { short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], long: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
  pt: { short: ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'], long: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'] },
  es: { short: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], long: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] },
  fr: { short: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], long: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] },
  de: { short: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], long: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'] },
  it: { short: ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'], long: ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'] },
  ru: { short: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], long: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'] },
  hi: { short: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'], long: ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'] },
  zh: { short: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'], long: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] },
  ar: { short: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'], long: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] },
};

const AMPM: Record<string, [string, string]> = { en: ['AM', 'PM'], hi: ['am', 'pm'], ar: ['ص', 'م'] };
const TWELVE_HOUR = new Set(['en', 'hi', 'ar']);
const pad2 = (n: number) => String(n).padStart(2, '0');
const valid = (d: Date) => d instanceof Date && !isNaN(d.getTime());
const lang = (language?: string) => (language && WEEKDAYS[language] ? language : 'en');

/** Weekday name, dayIndex = Date.getDay() (0 = Sunday). */
export const weekdayName = (dayIndex: number, language: string, style: Style = 'short'): string =>
  WEEKDAYS[lang(language)][style][((dayIndex % 7) + 7) % 7];

/** "14:05" (24-hour languages) or "2:05 PM" / "2:05 pm" / "2:05 م" (en / hi / ar). twoDigitHour pads the 12-hour clock ("02:05 PM"). */
export function formatTime(input: Date | string | number, language: string, opts: { force24?: boolean; twoDigitHour?: boolean } = {}): string {
  const d = new Date(input);
  if (!valid(d)) return '';
  const l = lang(language);
  if (opts.force24 || !TWELVE_HOUR.has(l)) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${opts.twoDigitHour ? pad2(h12) : h12}:${pad2(d.getMinutes())} ${AMPM[l][h24 < 12 ? 0 : 1]}`;
}

/** Day + short month in the language's own order, optional weekday and year: "Sep 10" / "10 sept." / "9月10日" / "Thu, Sep 10, 2026". */
export function formatShortDate(input: Date | string | number, language: string, opts: { weekday?: Style; year?: boolean } = {}): string {
  const d = new Date(input);
  if (!valid(d)) return '';
  const l = lang(language);
  const day = d.getDate(), y = d.getFullYear();
  // chart-axis short months are capitalised ("Set", "Сен"); inside a date line the lower-case languages use lower case ("10 set.", "10 сен.")
  let mon = monthShort(d.getMonth() + 1, l);
  if (l === 'pt' || l === 'ru') mon = mon.toLowerCase() + '.';
  else if (l === 'es' || l === 'fr' || l === 'it') mon = mon.toLowerCase();
  const wd = opts.weekday ? weekdayName(d.getDay(), l, opts.weekday) : '';
  switch (l) {
    case 'en': return `${wd ? wd + ', ' : ''}${mon} ${day}${opts.year ? ', ' + y : ''}`;
    case 'zh': return `${opts.year ? y + '年' : ''}${mon}${day}日${wd}`;
    case 'de': return `${wd ? wd + ', ' : ''}${day}. ${mon}${opts.year ? ' ' + y : ''}`;
    case 'fr':
    case 'it': return `${wd ? wd + ' ' : ''}${day} ${mon}${opts.year ? ' ' + y : ''}`;
    case 'ar': return `${wd ? wd + '، ' : ''}${day} ${mon}${opts.year ? ' ' + y : ''}`;
    default: return `${wd ? wd + ', ' : ''}${day} ${mon}${opts.year ? ' ' + y : ''}`; // pt, es, ru, hi
  }
}

/** Short date + time: "Sep 10, 2:05 PM" / "10 sept., 14:05" / "9月10日 14:05". */
export function formatShortDateTime(input: Date | string | number, language: string, opts: { weekday?: Style; year?: boolean; force24?: boolean; twoDigitHour?: boolean } = {}): string {
  const d = new Date(input);
  if (!valid(d)) return '';
  const date = formatShortDate(d, language, { weekday: opts.weekday, year: opts.year });
  const time = formatTime(d, language, { force24: opts.force24, twoDigitHour: opts.twoDigitHour });
  return lang(language) === 'zh' ? `${date} ${time}` : `${date}, ${time}`;
}

/** Numeric date in the language's usual order: en 9/10/2026, de/ru 10.09.2026, pt/es/fr/it 10/09/2026, hi/ar 10/9/2026, zh 2026/9/10. */
export function formatNumericDate(input: Date | string | number, language: string): string {
  const d = new Date(input);
  if (!valid(d)) return '';
  const l = lang(language);
  const day = d.getDate(), m = d.getMonth() + 1, y = d.getFullYear();
  switch (l) {
    case 'en': return `${m}/${day}/${y}`;
    case 'zh': return `${y}/${m}/${day}`;
    case 'de':
    case 'ru': return `${pad2(day)}.${pad2(m)}.${y}`;
    case 'pt':
    case 'es':
    case 'fr':
    case 'it': return `${pad2(day)}/${pad2(m)}/${y}`;
    default: return `${day}/${m}/${y}`; // hi, ar
  }
}

/** Numeric date + time (replacement for toLocaleString()). */
export function formatNumericDateTime(input: Date | string | number, language: string): string {
  const d = new Date(input);
  if (!valid(d)) return '';
  return `${formatNumericDate(d, language)} ${formatTime(d, language)}`;
}
