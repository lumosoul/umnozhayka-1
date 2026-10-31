// Интервальное повторение: 5 коробок Лейтнера, интервалы 0, 1, 3, 7, 14 дней.

import { test, assert } from './harness.js';
import { day, emptyFacts, answer } from './helpers.js';
import { leitnerStep, intervalFor, isDue, clampBox } from '../js/core/leitner.js';
import { addDays, dayKey, daysBetween } from '../js/core/dates.js';
import { markIntroduced } from '../js/core/facts.js';

const T = '2026-10-10';

test('Лейтнер: интервалы коробок 0, 1, 3, 7, 14 дней', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(intervalFor), [0, 1, 3, 7, 14]);
  assert.equal(clampBox(0), 1);
  assert.equal(clampBox(9), 5);
});

test('Лейтнер: верный быстрый ответ двигает факт в следующую коробку', () => {
  for (let box = 1; box <= 4; box++) {
    const r = leitnerStep({ box, due: T }, { correct: true, ms: 2000, today: T });
    assert.equal(r.box, box + 1, `из коробки ${box}`);
    assert.equal(r.due, addDays(T, intervalFor(box + 1)), `дата из коробки ${box}`);
  }
});

test('Лейтнер: верный ответ дольше 6 секунд оставляет факт на месте', () => {
  for (let box = 1; box <= 5; box++) {
    const r = leitnerStep({ box, due: T }, { correct: true, ms: 6001, today: T });
    assert.equal(r.box, box);
    assert.equal(r.due, addDays(T, intervalFor(box)));
  }
  const edge = leitnerStep({ box: 2, due: T }, { correct: true, ms: 6000, today: T });
  assert.equal(edge.box, 3, 'ровно 6 секунд — ещё не медленно');
});

test('Лейтнер: ошибка возвращает факт в первую коробку с показом сегодня', () => {
  for (let box = 1; box <= 5; box++) {
    const r = leitnerStep({ box, due: addDays(T, 5) }, { correct: false, ms: 1000, today: T });
    assert.equal(r.box, 1);
    assert.equal(r.due, T);
  }
});

test('Лейтнер: коробка 5 — потолок, интервал 14 дней', () => {
  const r = leitnerStep({ box: 5, due: T }, { correct: true, ms: 1000, today: T });
  assert.equal(r.box, 5);
  assert.equal(r.due, addDays(T, 14));
});

test('Лейтнер: внеплановый повтор (день ещё не наступил) не двигает факт', () => {
  const due = addDays(T, 3);
  const r = leitnerStep({ box: 3, due }, { correct: true, ms: 1000, today: T });
  assert.deepEqual(r, { box: 3, due });
  const w = leitnerStep({ box: 3, due }, { correct: false, ms: 1000, today: T });
  assert.deepEqual(w, { box: 1, due: T }, 'а ошибка всё равно возвращает в первую');
});

test('Лейтнер: путь факта по дням 0 → 1 → 4 → 11 → 25', () => {
  const facts = emptyFacts();
  let r = markIntroduced(facts['7x8'], day(0));
  assert.equal(r.box, 1);
  assert.ok(isDue(r, dayKey(day(0))));
  r = answer(r, true, 2000, 's1', day(0));
  assert.equal(r.box, 2); assert.equal(r.due, dayKey(day(1)));
  r = answer(r, true, 2000, 's1', day(0) + 60000);
  assert.equal(r.box, 2, 'повтор в том же занятии не перескакивает интервал');
  r = answer(r, true, 2000, 's2', day(1));
  assert.equal(r.box, 3); assert.equal(r.due, dayKey(day(4)));
  r = answer(r, true, 2000, 's3', day(4));
  assert.equal(r.box, 4); assert.equal(r.due, dayKey(day(11)));
  r = answer(r, true, 2000, 's4', day(11));
  assert.equal(r.box, 5); assert.equal(r.due, dayKey(day(25)));
  r = answer(r, false, 2000, 's5', day(25));
  assert.equal(r.box, 1); assert.equal(r.due, dayKey(day(25)));
  r = answer(r, true, 2000, 's5', day(25) + 60000);
  assert.equal(r.box, 2, 'после ошибки повтор в тот же день поднимает во вторую');
});

test('Лейтнер: просроченный факт тоже считается готовым к показу', () => {
  const facts = emptyFacts();
  let r = markIntroduced(facts['3x4'], day(0));
  r = answer(r, true, 1500, 's', day(0));
  assert.ok(!isDue(r, dayKey(day(0))));
  assert.ok(isDue(r, dayKey(day(1))));
  assert.ok(isDue(r, dayKey(day(30))));
});

test('Даты: сдвиг через переход на летнее/зимнее время', () => {
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-03-28', '2026-04-04'), 7);
  assert.equal(daysBetween('2026-10-20', '2026-11-03'), 14);
});
