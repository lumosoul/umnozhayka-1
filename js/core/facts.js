// Модель знаний: 100 фактов a×b (a, b = 1…10). По каждому факту хранится
// история ответов, точность, среднее время, серия верных ответов, коробка
// Лейтнера и день следующего показа. Пары 3×7 и 7×3 связаны через twinKey().

import {
  COLUMN_ORDER, FAST_MS, SLOW_MS, TIME_CAP_MS, KNOW_STREAK, AUTO_SESSIONS,
  AUTO_MIN_DAYS, HISTORY_LIMIT, SESS_LIMIT, WRONG_LIMIT, STATUS,
} from './constants.js';
import { dayKey } from './dates.js';
import { leitnerStep, isDue } from './leitner.js';

export const factKey = (a, b) => `${a}x${b}`;

export function parseKey(k) {
  const [a, b] = k.split('x').map(Number);
  return { a, b };
}

/** Все 100 ключей в порядке строк сетки. */
export const ALL_KEYS = (() => {
  const keys = [];
  for (let b = 1; b <= 10; b++) for (let a = 1; a <= 10; a++) keys.push(factKey(a, b));
  return keys;
})();

export const isValidKey = (k) => typeof k === 'string' && /^(10|[1-9])x(10|[1-9])$/.test(k);

/** Связанная пара: 3×7 ↔ 7×3 (у квадратов пара — сам факт). */
export function twinKey(k) {
  const { a, b } = parseKey(k);
  return factKey(b, a);
}

/** Уровень факта — индекс столбца в COLUMN_ORDER, в котором факт вводится впервые. */
export function levelOf(k) {
  const { a, b } = parseKey(k);
  return Math.min(COLUMN_ORDER.indexOf(a), COLUMN_ORDER.indexOf(b));
}

/** Столбец (множитель), к которому относится факт в учебном порядке. */
export function columnOf(k) {
  return COLUMN_ORDER[levelOf(k)];
}

/** Пустая запись факта. */
export function newFact(k) {
  return {
    k,
    box: 1,       // коробка Лейтнера 1…5
    due: '',      // день следующего показа ('' — ещё не назначен)
    streak: 0,    // верных ответов подряд
    n: 0,         // всего ответов
    ok: 0,        // верных ответов
    tSum: 0,      // сумма времени ответов (мс, с обрезкой TIME_CAP_MS)
    slow: 0,      // верных, но медленных (> SLOW_MS) ответов
    h: [],        // история: [время (с), верно 0|1, мс, формат]
    s: [],        // итоги сессий для «автоматизма»: [день, id сессии, быстро 0|1]
    wa: [],       // последние неверные ответы (сами числа)
    intro: 0,     // когда факт был введён (0 — ещё не вводился)
    src: '',      // 'diag' — отмечен известным по диагностике, ещё не проверен в занятиях
    last: 0,      // время последнего ответа
    upd: 0,       // время последнего изменения (для объединения при импорте)
  };
}

/** Полный набор фактов профиля: объект { ключ: запись }. Недостающие дополняются. */
export function completeFacts(facts = {}) {
  const out = {};
  for (const k of ALL_KEYS) out[k] = facts[k] ? { ...newFact(k), ...facts[k], k } : newFact(k);
  return out;
}

export function cloneFact(rec) {
  return {
    ...rec,
    h: rec.h.map((e) => e.slice()),
    s: rec.s.map((e) => e.slice()),
    wa: rec.wa.slice(),
  };
}

/** «Автоматизм»: верно быстрее 3 с в трёх сессиях подряд, среди них минимум два разных дня. */
export function isAutomatic(rec) {
  if (!rec || rec.s.length < AUTO_SESSIONS || rec.streak < 1) return false;
  const lastSessions = rec.s.slice(-AUTO_SESSIONS);
  if (!lastSessions.every((e) => e[2] === 1)) return false;
  return new Set(lastSessions.map((e) => e[0])).size >= AUTO_MIN_DAYS;
}

/** Статус факта: новый → изучается → знает (3 верно подряд) → автоматизм. */
export function factStatus(rec) {
  if (!rec) return STATUS.NEW;
  if (!rec.intro && rec.streak < KNOW_STREAK) return STATUS.NEW;
  if (isAutomatic(rec)) return STATUS.AUTO;
  if (rec.streak >= KNOW_STREAK) return STATUS.KNOW;
  return STATUS.LEARNING;
}

export const isMastered = (rec) => {
  const st = factStatus(rec);
  return st === STATUS.KNOW || st === STATUS.AUTO;
};

/** Точность 0…1 или null, если ответов ещё не было. */
export function accuracy(rec) {
  return rec && rec.n ? rec.ok / rec.n : null;
}

/** Среднее время ответа, мс, или null. */
export function avgTime(rec) {
  return rec && rec.n ? rec.tSum / rec.n : null;
}

/**
 * Применяет ответ ребёнка к записи факта и возвращает новую запись.
 * ans: { correct, ms, fmt, sid, now, given }
 */
export function applyAnswer(rec, ans) {
  const { correct, fmt, sid, now } = ans;
  const ms = Math.max(0, Math.round(ans.ms));
  const today = dayKey(now);
  const r = cloneFact(rec);
  const wasDue = isDue(r, today);

  r.n += 1;
  if (correct) r.ok += 1;
  r.tSum += Math.min(ms, TIME_CAP_MS);
  if (correct && ms > SLOW_MS) r.slow += 1;

  r.h.push([Math.round(now / 1000), correct ? 1 : 0, ms, fmt]);
  if (r.h.length > HISTORY_LIMIT) r.h.splice(0, r.h.length - HISTORY_LIMIT);

  // Итог сессии для «автоматизма»: сессия «быстрая», если все ответы в ней верные и быстрее FAST_MS.
  const fastNow = correct && ms < FAST_MS ? 1 : 0;
  const lastSess = r.s[r.s.length - 1];
  if (lastSess && lastSess[1] === sid) {
    lastSess[2] = lastSess[2] && fastNow ? 1 : 0;
  } else {
    r.s.push([today, sid, fastNow]);
    if (r.s.length > SESS_LIMIT) r.s.splice(0, r.s.length - SESS_LIMIT);
  }

  r.streak = correct ? r.streak + 1 : 0;
  if (!correct && ans.given !== undefined && ans.given !== null && ans.given !== '') {
    r.wa.push(ans.given);
    if (r.wa.length > WRONG_LIMIT) r.wa.splice(0, r.wa.length - WRONG_LIMIT);
  }

  const next = leitnerStep({ box: r.box, due: r.due }, { correct, ms, today, wasDue });
  r.box = next.box;
  r.due = next.due;

  r.src = '';
  if (!r.intro) r.intro = now;
  r.last = now;
  r.upd = now;
  return r;
}

/** Отмечает факт введённым (показана карточка «Новый пример»). */
export function markIntroduced(rec, now) {
  if (rec.intro) return rec;
  const r = cloneFact(rec);
  r.intro = now;
  r.box = 1;
  r.due = dayKey(now);
  r.upd = now;
  return r;
}

/**
 * «Слабость» факта: чем больше, тем нужнее практика. Учитывает недавние ошибки,
 * медленные ответы, общую точность, низкую коробку и сброшенную серию.
 */
export function weakness(rec) {
  if (!rec || !rec.n) return 0;
  let w = 0;
  for (const e of rec.h.slice(-6)) {
    if (!e[1]) w += 2;
    else if (e[2] > SLOW_MS) w += 1;
    else if (e[2] > FAST_MS) w += 0.25;
  }
  w += (1 - rec.ok / rec.n) * 3;
  if (rec.box === 1) w += 1.5;
  else if (rec.box === 2) w += 0.5;
  if (rec.streak === 0) w += 1;
  return w;
}

/** Подсчёт статусов по всем фактам. */
export function statusCounts(facts) {
  const c = { new: 0, learning: 0, know: 0, auto: 0 };
  for (const k of ALL_KEYS) c[factStatus(facts[k])] += 1;
  return c;
}

/** Процент освоения: доля фактов со статусом «знает» или «автоматизм». */
export function masteryPercent(facts) {
  const c = statusCounts(facts);
  return Math.round(((c.know + c.auto) / ALL_KEYS.length) * 100);
}
