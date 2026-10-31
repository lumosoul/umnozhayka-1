// Объяснения и приёмы. Здесь только данные и тексты; картинки (группы, сетка
// точек, числовой луч, пальцы) рисует интерфейс по полю type.
// Запись a × b читается как «a взять b раз»: 3 × 4 = 3 + 3 + 3 + 3.

import { parseKey, factKey, columnOf, twinKey, isMastered } from './facts.js';
import { plural } from './ru.js';

const TIMES = '×';

function repeatSum(a, b) {
  return Array.from({ length: b }, () => a).join(' + ');
}

/** Короткое правило столбца для заголовков и библиотеки приёмов. */
export const COLUMN_RULES = {
  1: 'Умножаешь на 1 — число не меняется.',
  10: 'Умножаешь на 10 — припиши к числу ноль.',
  2: 'Умножить на 2 — значит удвоить.',
  5: '×5 — это половина от ×10.',
  9: '×9 — считаем на пальцах.',
  3: '×3 — удвой и добавь ещё раз.',
  4: '×4 — удвой два раза.',
  6: '×6 — это ×5 и ещё одна группа.',
  7: '×7 — это ×5 и ×2 вместе.',
  8: '×8 — удвой три раза.',
};

/** Пример для объяснения столбца: k взять 3 раза (для ×1 — 1 × 4). */
function columnExample(k) {
  if (k === 1) return { a: 1, b: 4 };
  if (k === 10) return { a: 10, b: 3 };
  return { a: k, b: 3 };
}

/** Текст приёма для столбца k и второго множителя o. */
function trickText(c, o) {
  const p = c * o;
  switch (c) {
    case 1: return `Умножаешь на 1 — число не меняется: ${o} ${TIMES} 1 = ${o}.`;
    case 10: return `Умножаешь на 10 — припиши к ${o} ноль: ${p}.`;
    case 2: return `Удвой ${o}: ${o} + ${o} = ${p}.`;
    case 5: return `Половина от ×10: ${o} ${TIMES} 10 = ${o * 10}, половина — ${p}.`;
    case 9: return o >= 1 && o <= 10
      ? `Пальцы: загни ${o}-й палец. Слева ${o - 1}, справа ${10 - o} — это ${p}. Или так: ${o} ${TIMES} 10 − ${o} = ${p}.`
      : `${o} ${TIMES} 10 − ${o} = ${p}.`;
    case 3: return `Удвой и добавь ещё раз: ${o} ${TIMES} 2 = ${o * 2}, ${o * 2} + ${o} = ${p}.`;
    case 4: return `Удвой два раза: ${o} → ${o * 2} → ${p}.`;
    case 6: return `×5 и ещё одна группа: ${o} ${TIMES} 5 = ${o * 5}, ${o * 5} + ${o} = ${p}.`;
    case 7: return `×5 и ×2: ${o} ${TIMES} 5 = ${o * 5}, ${o} ${TIMES} 2 = ${o * 2}, вместе ${p}.`;
    case 8: return `Удвой три раза: ${o} → ${o * 2} → ${o * 4} → ${p}.`;
    default: return `${o} ${TIMES} ${c} = ${p}.`;
  }
}

/**
 * Подсказка-приём для факта. facts (необязательно) — чтобы предложить
 * перестановку, если пара уже освоена.
 * Возвращает { trick, swap, fingers, column }.
 */
export function hintFor(k, facts = null) {
  const { a, b } = parseKey(k);
  const c = columnOf(k);
  const o = c === a ? b : a;
  const p = a * b;
  const tk = twinKey(k);
  let swap = '';
  if (tk !== k) {
    swap = facts && isMastered(facts[tk])
      ? `Перестановка: ${b} ${TIMES} ${a} = ${p} — это ты уже знаешь!`
      : `Перестановка: ${a} ${TIMES} ${b} = ${b} ${TIMES} ${a} = ${p}.`;
  }
  return {
    column: c,
    trick: trickText(c, o),
    swap,
    fingers: c === 9 ? o : 0,
  };
}

/**
 * Слайды объяснения столбца k. Каждый слайд: { type, title, text, a, b, ... }.
 * known — факты столбца, уже знакомые по перестановке (для слайда «swap»).
 */
export function columnIntroSlides(k, facts = null) {
  const { a, b } = columnExample(k);
  const p = a * b;
  const slides = [];
  if (k === 1) {
    slides.push({
      type: 'groups', a: 2, b: 3,
      title: 'Что такое умножение',
      text: `Умножение — это сложение одинаковых групп. 2 ${TIMES} 3 — это 2 взять 3 раза: 2 + 2 + 2 = 6.`,
    });
    slides.push({
      type: 'array', a: 2, b: 3,
      title: 'Сетка точек',
      text: 'Сложи группы рядами — получится сетка: 3 ряда по 2 точки. Всего 6 точек.',
    });
    slides.push({
      type: 'line', a: 2, b: 3,
      title: 'Числовой луч',
      text: 'Прыгай по лучу: 3 прыжка по 2. Ты попадёшь на 2, 4 и 6.',
    });
    slides.push({
      type: 'swap', a: 2, b: 3,
      title: 'Перестановка множителей',
      text: `Поверни сетку — точек столько же. 2 ${TIMES} 3 = 3 ${TIMES} 2 = 6. Это очень помогает!`,
    });
    slides.push({
      type: 'groups', a: 1, b: 4,
      title: 'Умножение на 1',
      text: `1 ${TIMES} 4 = 1 + 1 + 1 + 1 = 4. А 4 ${TIMES} 1 — одна группа из 4, это 4. ${COLUMN_RULES[1]}`,
    });
    return slides;
  }
  slides.push({
    type: 'groups', a, b,
    title: `Умножение на ${k}`,
    text: `${a} ${TIMES} ${b} — это ${a} взять ${b} ${plural(b, 'раз', 'раза', 'раз')}: ${repeatSum(a, b)} = ${p}.`,
  });
  slides.push({
    type: 'array', a, b,
    title: 'Сетка точек',
    text: `${b} ${plural(b, 'ряд', 'ряда', 'рядов')} по ${a} ${plural(a, 'точке', 'точки', 'точек')}. Всего ${p}.`,
  });
  const jumps = k === 10 ? 4 : 5;
  slides.push({
    type: 'line', a: k, b: jumps,
    title: 'Прыжки по лучу',
    text: `Прыгай по ${k}: ${Array.from({ length: jumps }, (_, i) => k * (i + 1)).join(', ')}…`,
  });
  const o = k === 9 ? 4 : (k === 8 ? 8 : (k === 10 ? 4 : 6));
  slides.push({
    type: k === 9 ? 'fingers' : 'trick', a: k, b: o, fingers: k === 9 ? o : 0,
    title: 'Приём',
    text: `${COLUMN_RULES[k]} ${trickText(k, o)}`,
  });
  const knownViaSwap = [];
  if (facts) {
    for (let n = 1; n <= 10; n++) {
      const key = factKey(k, n);
      if (columnOf(key) !== k && isMastered(facts[key])) knownViaSwap.push(key);
    }
  }
  slides.push({
    type: 'swap', a: k, b: 3, known: knownViaSwap,
    title: 'Перестановка',
    text: knownViaSwap.length
      ? `${k} ${TIMES} 3 = 3 ${TIMES} ${k}. Многие примеры ты уже знаешь: ${knownViaSwap.map((x) => x.replace('x', ` ${TIMES} `)).join(', ')}.`
      : `${k} ${TIMES} 3 = 3 ${TIMES} ${k} = ${k * 3}. Переставляй множители, если так легче.`,
  });
  return slides;
}

/** Слайды правила умножения на 0 и вопросы мини-проверки. */
export function zeroRuleSlides() {
  return [
    {
      type: 'zero-groups', a: 0, b: 4,
      title: 'Умножение на 0',
      text: `0 ${TIMES} 4 — это ноль взять 4 раза: 0 + 0 + 0 + 0 = 0.`,
    },
    {
      type: 'zero-empty', a: 4, b: 0,
      title: 'Ни одной группы',
      text: `4 ${TIMES} 0 — четыре взять ноль раз. Групп нет совсем, значит, получается 0.`,
    },
    {
      type: 'zero-rule', a: 0, b: 0,
      title: 'Правило нуля',
      text: 'Если один из множителей 0, ответ всегда 0. Даже 100 × 0 = 0!',
    },
  ];
}

export const ZERO_QUIZ = [
  { a: 0, b: 7, options: [0, 7, 70, 1] },
  { a: 6, b: 0, options: [6, 0, 60, 1] },
  { a: 0, b: 0, options: [1, 0, 10, 2] },
];

/** Текст для карточки «Новый пример». */
export function newFactCard(k, facts = null) {
  const { a, b } = parseKey(k);
  const hint = hintFor(k, facts);
  return {
    a, b, p: a * b,
    title: 'Новый пример',
    sum: b >= 2 && b <= 5 ? `${repeatSum(a, b)} = ${a * b}` : '',
    ...hint,
  };
}
