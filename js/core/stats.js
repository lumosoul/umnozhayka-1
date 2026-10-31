// Статистика для родительского экрана и подробностей по клетке сетки.

import { ALL_KEYS, accuracy, avgTime, weakness, factStatus, parseKey } from './facts.js';
import { STATUS } from './constants.js';
import { addDays } from './dates.js';

/** Общая точность по всем ответам (0…1) или null. */
export function overallAccuracy(facts) {
  let n = 0; let ok = 0;
  for (const k of ALL_KEYS) { n += facts[k].n; ok += facts[k].ok; }
  return n ? ok / n : null;
}

/** Среднее время ответа по всем ответам, мс, или null. */
export function overallAvgTime(facts) {
  let n = 0; let t = 0;
  for (const k of ALL_KEYS) { n += facts[k].n; t += facts[k].tSum; }
  return n ? t / n : null;
}

/** Ряд по дням (последние days дней до today включительно) по журналу занятий. */
export function dailySeries(sessions, today, days = 14) {
  const map = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    map.set(d, { day: d, sessions: 0, answered: 0, correct: 0, tSum: 0, ms: 0, stars: 0 });
  }
  for (const s of sessions) {
    const row = map.get(s.day);
    if (!row || !s.answered) continue;
    row.sessions += 1;
    row.answered += s.answered;
    row.correct += s.correct;
    row.tSum += s.tSum;
    row.ms += Math.max(0, (s.end || s.start) - s.start);
    row.stars += s.done ? s.stars || 0 : 0;
  }
  return [...map.values()].map((r) => ({
    ...r,
    avgMs: r.answered ? r.tSum / r.answered : null,
    accuracy: r.answered ? r.correct / r.answered : null,
    minutes: r.ms / 60000,
  }));
}

/** Точность за последние days дней по журналу занятий. */
export function recentAccuracy(sessions, today, days = 7) {
  const from = addDays(today, -(days - 1));
  let n = 0; let ok = 0;
  for (const s of sessions) {
    if (s.day >= from && s.day <= today) { n += s.answered || 0; ok += s.correct || 0; }
  }
  return n ? ok / n : null;
}

/** Самые трудные из уже изучаемых примеров: по «слабости», затем по точности и времени. */
export function hardestFacts(facts, count = 8) {
  return ALL_KEYS
    .filter((k) => facts[k].n > 0 && ![STATUS.AUTO, STATUS.NEW].includes(factStatus(facts[k])))
    .map((k) => ({
      k,
      ...parseKey(k),
      weakness: weakness(facts[k]),
      accuracy: accuracy(facts[k]),
      avgMs: avgTime(facts[k]),
      wrong: facts[k].n - facts[k].ok,
      status: factStatus(facts[k]),
    }))
    .filter((x) => x.weakness > 0.5)
    .sort((x, y) => y.weakness - x.weakness || x.accuracy - y.accuracy || y.avgMs - x.avgMs)
    .slice(0, count);
}

/** Подробности для клетки сетки. */
export function factDetails(facts, k) {
  const f = facts[k];
  return {
    k,
    ...parseKey(k),
    status: factStatus(f),
    accuracy: accuracy(f),
    avgMs: avgTime(f),
    answers: f.n,
    wrong: f.n - f.ok,
    wrongAnswers: f.wa.slice(),
    box: f.box,
    due: f.due,
    streak: f.streak,
    fromDiagnostic: f.src === 'diag',
    history: f.h.slice(),
  };
}

/** Журнал занятий, сгруппированный по дням (новые сверху). */
export function sessionsByDay(sessions) {
  const groups = new Map();
  for (const s of sessions.filter((x) => x.answered > 0).sort((a, b) => b.start - a.start)) {
    if (!groups.has(s.day)) groups.set(s.day, []);
    groups.get(s.day).push(s);
  }
  return [...groups.entries()].map(([day, list]) => ({ day, list }));
}
