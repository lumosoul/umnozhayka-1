// Форматы заданий и близкие дистракторы.
// Выбор (4 варианта, «верно/неверно») — новым и изучаемым фактам,
// ввод (ответ, пропущенный множитель) — закрепляемым.

import { STATUS } from './constants.js';
import { parseKey } from './facts.js';
import { shuffle, weightedPick } from './random.js';

/**
 * Правдоподобные ошибки для a×b с весами: соседние примеры столбца (p ± a, p ± b),
 * соседние числа, перепутанные десятки, переставленные цифры, сложение вместо умножения.
 */
export function distractorCandidates(a, b) {
  const p = a * b;
  const c = new Map();
  const add = (v, w) => {
    if (Number.isInteger(v) && v > 0 && v !== p && v <= 100) c.set(v, Math.max(c.get(v) || 0, w));
  };
  add(p + a, 4); add(p - a, 4); add(p + b, 4); add(p - b, 4);
  add(p + 1, 2); add(p - 1, 2); add(p + 2, 1.5); add(p - 2, 1.5);
  add(p + 10, 2); add(p - 10, 2);
  add((a + 1) * (b + 1), 1); add((a - 1) * (b - 1), 1);
  if (p >= 10 && p < 100 && p % 11 !== 0) add(Number(String(p).split('').reverse().join('')), 2);
  if (a + b !== p) add(a + b, 1);
  return c;
}

/** Три неверных близких варианта. */
export function pickDistractors(a, b, rng, count = 3) {
  const p = a * b;
  const pool = [...distractorCandidates(a, b).entries()].map(([value, weight]) => ({ value, weight }));
  const out = [];
  while (out.length < count && pool.length) {
    const v = weightedPick(rng, pool);
    out.push(v);
    pool.splice(pool.findIndex((x) => x.value === v), 1);
  }
  for (let d = 1; out.length < count; d++) {
    for (const v of [p + d, p - d]) {
      if (out.length < count && v > 0 && v !== p && !out.includes(v)) out.push(v);
    }
  }
  return out;
}

export function makeChoices(a, b, rng) {
  return shuffle(rng, [a * b, ...pickDistractors(a, b, rng, 3)]);
}

/** Выбор формата по статусу факта, с чередованием относительно предыдущего задания. */
export function chooseFormat(status, { prev = null, first = false, rng }) {
  if (first) return 'choice';
  const recognition = status === STATUS.NEW || status === STATUS.LEARNING;
  const opts = recognition ? [['choice', 0.6], ['tf', 0.4]] : [['input', 0.6], ['missing', 0.4]];
  return weightedPick(rng, opts.map(([value, w]) => ({ value, weight: value === prev ? w * 0.3 : w })));
}

/**
 * Готовое задание для показа.
 * input:   a × b = ?         answer: a·b
 * choice:  a × b = ? (4 варианта)
 * missing: ? × b = a·b  или  a × ? = a·b  answer: скрытый множитель
 * tf:      a × b = shown — верно ли?  answer: true|false
 */
export function makeQuestion(k, fmt, rng) {
  const { a, b } = parseKey(k);
  const p = a * b;
  const q = { k, a, b, p, fmt };
  if (fmt === 'choice') {
    q.options = makeChoices(a, b, rng);
    q.answer = p;
  } else if (fmt === 'missing') {
    q.hide = rng() < 0.5 ? 'a' : 'b';
    q.answer = q.hide === 'a' ? a : b;
  } else if (fmt === 'tf') {
    const truth = rng() < 0.5;
    q.shown = truth ? p : pickDistractors(a, b, rng, 1)[0];
    q.answer = q.shown === p;
  } else {
    q.fmt = 'input';
    q.answer = p;
  }
  return q;
}

/** Проверка ответа. value — число (или true/false для «верно/неверно»). */
export function isCorrect(q, value) {
  if (q.fmt === 'tf') return value === q.answer;
  return Number(value) === q.answer;
}

/** Какой неверный результат запомнить для статистики ошибок (только произведения). */
export function wrongProduct(q, value) {
  if (q.fmt === 'tf') return value === true && q.shown !== q.p ? q.shown : null;
  if (q.fmt === 'missing') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
