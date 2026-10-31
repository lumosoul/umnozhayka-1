// Интервальное повторение по 5 коробкам Лейтнера с интервалами 0, 1, 3, 7, 14 дней.
// Верный ответ двигает факт вперёд, верный дольше 6 секунд оставляет на месте,
// ошибка возвращает в первую коробку. Факт продвигается только на «плановом»
// показе (когда наступил его день): повторы внутри занятия не перескакивают через
// интервалы, поэтому за день факт поднимается не больше чем на одну коробку.

import { LEITNER_INTERVALS, BOX_MIN, BOX_MAX, SLOW_MS } from './constants.js';
import { addDays } from './dates.js';

export function clampBox(box) {
  const b = Math.round(Number(box) || BOX_MIN);
  return Math.min(BOX_MAX, Math.max(BOX_MIN, b));
}

/** Интервал коробки в днях. */
export function intervalFor(box) {
  return LEITNER_INTERVALS[clampBox(box) - 1];
}

/** Наступил ли день показа факта. Факт без даты считается готовым к показу. */
export function isDue(rec, today) {
  return !rec.due || rec.due <= today;
}

/**
 * Один шаг Лейтнера.
 * state: { box, due }; ans: { correct, ms, today, wasDue }
 * Возвращает { box, due }.
 */
export function leitnerStep(state, ans) {
  const { correct, ms, today } = ans;
  const wasDue = ans.wasDue !== undefined ? ans.wasDue : isDue(state, today);
  let box = clampBox(state.box);
  if (!correct) {
    return { box: BOX_MIN, due: addDays(today, intervalFor(BOX_MIN)) };
  }
  if (!wasDue) {
    // Внеплановый повтор: коробка и дата не меняются.
    return { box, due: state.due || today };
  }
  if (ms > SLOW_MS) {
    return { box, due: addDays(today, intervalFor(box)) };
  }
  box = Math.min(BOX_MAX, box + 1);
  return { box, due: addDays(today, intervalFor(box)) };
}
