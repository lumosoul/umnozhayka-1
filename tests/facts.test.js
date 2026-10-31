// Модель знаний: статусы, история, точность, время, связанные пары.

import { test, assert } from './harness.js';
import { day, emptyFacts, answer } from './helpers.js';
import {
  ALL_KEYS, factStatus, twinKey, levelOf, columnOf, markIntroduced, accuracy, avgTime, isAutomatic,
  weakness, masteryPercent, statusCounts,
} from '../js/core/facts.js';
import { HISTORY_LIMIT } from '../js/core/constants.js';

test('Факты: 100 уникальных фактов от 1×1 до 10×10', () => {
  assert.equal(ALL_KEYS.length, 100);
  assert.equal(new Set(ALL_KEYS).size, 100);
  assert.ok(ALL_KEYS.includes('1x1') && ALL_KEYS.includes('10x10') && ALL_KEYS.includes('7x3'));
});

test('Факты: пары связаны — 3×7 ↔ 7×3, квадрат связан сам с собой', () => {
  assert.equal(twinKey('3x7'), '7x3');
  assert.equal(twinKey('7x3'), '3x7');
  assert.equal(twinKey('6x6'), '6x6');
  for (const k of ALL_KEYS) {
    assert.equal(levelOf(k), levelOf(twinKey(k)), `пара ${k} в одном уровне`);
  }
});

test('Факты: столбец введения по порядку ×1, ×10, ×2, ×5, ×9, ×3, ×4, ×6, ×7, ×8', () => {
  assert.equal(columnOf('7x1'), 1);
  assert.equal(columnOf('10x7'), 10);
  assert.equal(columnOf('7x2'), 2);
  assert.equal(columnOf('9x5'), 5);
  assert.equal(columnOf('3x9'), 9);
  assert.equal(columnOf('4x3'), 3);
  assert.equal(columnOf('6x4'), 4);
  assert.equal(columnOf('7x6'), 6);
  assert.equal(columnOf('8x7'), 7);
  assert.equal(columnOf('8x8'), 8);
});

test('Статусы: новый → изучается → знает (3 верно подряд)', () => {
  const f = emptyFacts();
  let r = f['6x7'];
  assert.equal(factStatus(r), 'new');
  r = markIntroduced(r, day(0));
  assert.equal(factStatus(r), 'learning');
  r = answer(r, true, 4000, 's1', day(0));
  r = answer(r, true, 4000, 's1', day(0) + 1000);
  assert.equal(factStatus(r), 'learning', 'два верных — ещё изучается');
  r = answer(r, true, 4000, 's1', day(0) + 2000);
  assert.equal(factStatus(r), 'know', 'три верных подряд — знает');
  r = answer(r, false, 4000, 's1', day(0) + 3000);
  assert.equal(factStatus(r), 'learning', 'после ошибки серия начинается заново');
  assert.equal(r.streak, 0);
});

test('Статусы: автоматизм — быстрее 3 с в трёх сессиях подряд минимум в два дня', () => {
  const f = emptyFacts();
  let r = markIntroduced(f['4x8'], day(0));
  r = answer(r, true, 2500, 'a', day(0));
  r = answer(r, true, 2000, 'b', day(0, 18));
  r = answer(r, true, 2900, 'c', day(0, 19));
  assert.equal(factStatus(r), 'know', 'три сессии в один день — ещё не автоматизм');
  r = answer(r, true, 1800, 'd', day(1));
  assert.ok(isAutomatic(r));
  assert.equal(factStatus(r), 'auto', 'сессии b, c, d за два дня');

  let s = markIntroduced(f['4x9'], day(0));
  s = answer(s, true, 2500, 'a', day(0));
  s = answer(s, true, 3100, 'b', day(1));
  s = answer(s, true, 2500, 'c', day(2));
  assert.equal(factStatus(s), 'know', 'медленный ответ в одной из сессий');
  s = answer(s, true, 2000, 'd', day(3));
  assert.equal(factStatus(s), 'know', 'нужны три быстрые сессии подряд');
  s = answer(s, true, 2000, 'e', day(4));
  assert.equal(factStatus(s), 'auto');

  let e = markIntroduced(f['3x9'], day(0));
  e = answer(e, true, 2000, 'a', day(0));
  e = answer(e, true, 2000, 'b', day(1));
  e = answer(e, false, 2000, 'b', day(1) + 1000);
  e = answer(e, true, 2000, 'b', day(1) + 2000);
  e = answer(e, true, 2000, 'c', day(2));
  assert.notEqual(factStatus(e), 'auto', 'сессия с ошибкой не считается быстрой');
});

test('История: точность, среднее время, последние ответы, неверные ответы', () => {
  const f = emptyFacts();
  let r = markIntroduced(f['7x8'], day(0));
  r = answer(r, true, 2000, 's', day(0));
  r = answer(r, false, 4000, 's', day(0) + 1000);
  r = answer(r, true, 3000, 's', day(0) + 2000);
  r = answer(r, true, 30000, 's', day(0) + 3000);
  assert.equal(r.n, 4);
  assert.equal(r.ok, 3);
  assert.approx(accuracy(r), 0.75, 1e-9);
  assert.approx(avgTime(r), (2000 + 4000 + 3000 + 20000) / 4, 1e-9, 'время обрезается до 20 с');
  assert.equal(r.slow, 1);
  assert.deepEqual(r.wa, [1]);
  assert.equal(r.h.length, 4);
  assert.deepEqual(r.h[1].slice(1, 3), [0, 4000]);
  for (let i = 0; i < 30; i++) r = answer(r, true, 1000, 's', day(0) + 5000 + i);
  assert.equal(r.h.length, HISTORY_LIMIT, 'история ограничена');
  assert.equal(r.n, 34, 'счётчики хранят всю историю');
});

test('Слабость: ошибки и медленные ответы делают факт слабее', () => {
  const f = emptyFacts();
  let good = markIntroduced(f['2x3'], day(0));
  for (let i = 0; i < 4; i++) good = answer(good, true, 1500, 's', day(0) + i);
  let bad = markIntroduced(f['7x8'], day(0));
  bad = answer(bad, false, 5000, 's', day(0));
  bad = answer(bad, true, 8000, 's', day(0) + 1);
  assert.ok(weakness(bad) > weakness(good) + 2);
  assert.equal(weakness(f['9x9']), 0, 'без ответов слабости нет');
});

test('Процент освоения: доля фактов «знает» и «автоматизм»', () => {
  const f = emptyFacts();
  for (const k of ALL_KEYS.slice(0, 25)) {
    let r = markIntroduced(f[k], day(0));
    for (let i = 0; i < 3; i++) r = answer(r, true, 2000, 's', day(0) + i);
    f[k] = r;
  }
  assert.equal(masteryPercent(f), 25);
  assert.deepEqual(statusCounts(f), { new: 75, learning: 0, know: 25, auto: 0 });
});
