// Учебный план: порядок столбцов, не больше 3 новых фактов, приоритет пар.

import { test, assert } from './harness.js';
import { day, emptyFacts, knowFact, weakFact } from './helpers.js';
import { LEVELS, pickNewFacts, frontierLevel, newFactsAllowance, columnFacts, isColumnMastered } from '../js/core/curriculum.js';
import { ALL_KEYS, levelOf } from '../js/core/facts.js';
import { COLUMN_ORDER } from '../js/core/constants.js';

test('План: 10 уровней в порядке ×1, ×10, ×2, ×5, ×9, ×3, ×4, ×6, ×7, ×8 покрывают все 100 фактов', () => {
  assert.deepEqual(COLUMN_ORDER, [1, 10, 2, 5, 9, 3, 4, 6, 7, 8]);
  assert.deepEqual(LEVELS.map((l) => l.length), [19, 17, 15, 13, 11, 9, 7, 5, 3, 1]);
  const all = LEVELS.flat();
  assert.equal(new Set(all).size, 100);
  assert.deepEqual(LEVELS[9], ['8x8']);
  assert.deepEqual(LEVELS[8], ['7x7', '7x8', '8x7']);
  assert.deepEqual(LEVELS[2].slice(0, 5), ['2x2', '2x3', '3x2', '2x4', '4x2']);
});

test('План: новичку — первые три факта ×1, не больше трёх', () => {
  const f = emptyFacts();
  assert.deepEqual(pickNewFacts(f), ['1x1', '1x2', '2x1']);
  assert.equal(frontierLevel(f), 0);
  assert.ok(pickNewFacts(f, 10).length <= 10);
});

test('План: не перескакивает в следующий столбец, пока в текущем есть новые', () => {
  const f = emptyFacts();
  for (const k of LEVELS[0].slice(0, 17)) knowFact(f, k);
  const picked = pickNewFacts(f, 3);
  assert.deepEqual(picked, LEVELS[0].slice(17));
  assert.equal(picked.length, 2);
  for (const k of LEVELS[0]) knowFact(f, k);
  assert.deepEqual(pickNewFacts(f, 3), ['10x2', '2x10', '10x3']);
});

test('План: внутри столбца первыми идут факты, чья пара уже освоена', () => {
  const f = emptyFacts();
  for (const lvl of LEVELS.slice(0, 5)) for (const k of lvl) knowFact(f, k);
  knowFact(f, '3x6');
  knowFact(f, '3x7');
  const picked = pickNewFacts(f, 3);
  assert.deepEqual(picked.slice(0, 2), ['6x3', '7x3']);
  assert.ok(picked.every((k) => levelOf(k) === 5));
});

test('План: при большой нагрузке «изучаемыми» новых фактов меньше', () => {
  const f = emptyFacts();
  assert.equal(newFactsAllowance(f), 3);
  ALL_KEYS.slice(0, 7).forEach((k) => weakFact(f, k));
  assert.equal(newFactsAllowance(f), 2);
  ALL_KEYS.slice(7, 11).forEach((k) => weakFact(f, k));
  assert.equal(newFactsAllowance(f), 1);
  ALL_KEYS.slice(11, 16).forEach((k) => weakFact(f, k));
  assert.equal(newFactsAllowance(f), 0);
});

test('План: столбец k×1…k×10 освоен, когда все его факты знает', () => {
  const f = emptyFacts();
  assert.deepEqual(columnFacts(2), ['2x1', '2x2', '2x3', '2x4', '2x5', '2x6', '2x7', '2x8', '2x9', '2x10']);
  for (const k of columnFacts(2).slice(0, 9)) knowFact(f, k, day(0));
  assert.ok(!isColumnMastered(f, 2));
  knowFact(f, '2x10', day(0));
  assert.ok(isColumnMastered(f, 2));
});
