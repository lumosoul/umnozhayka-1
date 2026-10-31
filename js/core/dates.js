// Работа с календарными днями в местном времени. День — строка «ГГГГ-ММ-ДД»:
// такие строки сравниваются лексикографически так же, как даты.

const pad = (n) => String(n).padStart(2, '0');

/** Ключ дня для момента времени (мс). */
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Разбирает ключ дня в Date (полночь местного времени). */
export function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Ключ дня, сдвинутый на n дней (корректно через переход на летнее время). */
export function addDays(key, n) {
  const d = parseDay(key);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime());
}

/** Сколько дней от a до b (b − a). */
export function daysBetween(a, b) {
  const da = parseDay(a);
  const db = parseDay(b);
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) -
    Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
}

/** Номер дня с 1970-01-01 (для компактного хранения). */
export function dayNumber(key) {
  return daysBetween('1970-01-01', key);
}

export function dayFromNumber(n) {
  return addDays('1970-01-01', n);
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «31 окт» — короткая подпись дня для графиков. */
export function shortDayLabel(key) {
  const d = parseDay(key);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** «31.10.2026» */
export function fullDayLabel(key) {
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;
}
