// Звёзды за занятия, серия дней подряд и награды за освоенные столбцы.
// Хвалим за старание: звезда за само занятие даётся всегда.

import { COLUMN_ORDER } from './constants.js';
import { addDays } from './dates.js';
import { columnFacts, isColumnAutomatic } from './curriculum.js';
import { ALL_KEYS, isMastered } from './facts.js';

/**
 * Освоен и подтверждён в занятиях. Факты, отмеченные только диагностикой
 * (src = 'diag'), считаются известными, но награды за них не выдаются, пока
 * ребёнок не ответит на них в занятии.
 */
export const isVerifiedMastered = (rec) => isMastered(rec) && rec.src !== 'diag';

export function verifiedInColumn(facts, k) {
  return columnFacts(k).filter((key) => isVerifiedMastered(facts[key])).length;
}

/**
 * Звёзды за занятие (1–3):
 * ★ — за то, что занимался;
 * ★ — за старание: не меньше 60 % верно с первого раза или все повторы после ошибок решены;
 * ★ — за точность: не меньше 85 % верно.
 */
export function sessionStars({ answered, correct, retries = 0, retriesSolved = 0 }) {
  if (!answered) return 0;
  const acc = correct / answered;
  let stars = 1;
  if (acc >= 0.6 || (retries > 0 && retriesSolved >= retries)) stars += 1;
  if (acc >= 0.85) stars += 1;
  return stars;
}

/** Дни, в которые было завершено хотя бы одно занятие или блиц. */
export function activeDays(sessions) {
  const days = new Set();
  for (const s of sessions) if (s.done && s.type !== 'diag') days.add(s.day);
  return days;
}

/**
 * Серия дней подряд. Если сегодня ещё не занимались, серия продолжается от вчера
 * (её можно продлить сегодня).
 */
export function streakInfo(sessions, today) {
  const days = activeDays(sessions);
  const todayDone = days.has(today);
  let current = 0;
  let d = todayDone ? today : addDays(today, -1);
  while (days.has(d)) {
    current += 1;
    d = addDays(d, -1);
  }
  let best = 0;
  const sorted = [...days].sort();
  let run = 0;
  let prev = null;
  for (const day of sorted) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return { current, best: Math.max(best, current), todayDone };
}

export function totalStars(sessions) {
  return sessions.reduce((s, x) => s + (x.done && x.type !== 'diag' ? x.stars || 0 : 0), 0);
}

/** Все награды: id → описание. */
export const AWARDS = (() => {
  const list = {};
  for (const k of COLUMN_ORDER) {
    list[`col-${k}`] = { title: `Столбец ×${k}`, text: `Ты знаешь все примеры ${k} × 1 … ${k} × 10!`, icon: 'column', k };
    list[`gold-${k}`] = { title: `Молния ×${k}`, text: `Весь столбец ×${k} — на автомате!`, icon: 'bolt', k };
  }
  list['first-lesson'] = { title: 'Первое занятие', text: 'Начало положено!', icon: 'star' };
  list['streak-3'] = { title: '3 дня подряд', text: 'Три дня занятий подряд!', icon: 'fire' };
  list['streak-7'] = { title: 'Неделя', text: 'Семь дней подряд — вот это упорство!', icon: 'fire' };
  list['streak-14'] = { title: 'Две недели', text: 'Четырнадцать дней подряд!', icon: 'fire' };
  list['stars-50'] = { title: '50 звёзд', text: 'Целое созвездие!', icon: 'star' };
  list['half'] = { title: 'Половина пути', text: 'Освоена половина таблицы!', icon: 'owl' };
  list['all'] = { title: 'Вся таблица', text: 'Ты знаешь всю таблицу умножения!', icon: 'crown' };
  return list;
})();

/**
 * Какие награды заработаны сейчас и ещё не выданы (только за подтверждённые факты).
 * awards — уже полученные { id: время }. Возвращает массив id.
 */
export function newAwards(facts, sessions, awards, today) {
  const got = [];
  const has = (id) => awards && awards[id];
  for (const k of COLUMN_ORDER) {
    if (!has(`col-${k}`) && verifiedInColumn(facts, k) === 10) got.push(`col-${k}`);
    if (!has(`gold-${k}`) && isColumnAutomatic(facts, k)) got.push(`gold-${k}`);
  }
  const lessons = sessions.filter((s) => s.done && s.type === 'lesson').length;
  if (!has('first-lesson') && lessons >= 1) got.push('first-lesson');
  const { current } = streakInfo(sessions, today);
  for (const n of [3, 7, 14]) if (!has(`streak-${n}`) && current >= n) got.push(`streak-${n}`);
  if (!has('stars-50') && totalStars(sessions) >= 50) got.push('stars-50');
  const verified = ALL_KEYS.filter((k) => isVerifiedMastered(facts[k])).length;
  if (!has('half') && verified >= 50) got.push('half');
  if (!has('all') && verified >= 100) got.push('all');
  return got;
}
