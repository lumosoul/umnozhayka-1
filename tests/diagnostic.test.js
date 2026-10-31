// Адаптивная диагностика: 20 примеров, ≤ 5 минут, от лёгких к трудным, вывод о 100 фактах.

import { test, assert } from './harness.js';
import { day, emptyFacts, makeRng } from './helpers.js';
import { Diagnostic, applyPlacement } from '../js/core/diagnostic.js';
import { LEVELS } from '../js/core/curriculum.js';
import { ALL_KEYS, factStatus, levelOf, parseKey } from '../js/core/facts.js';
import { COLUMN_ORDER, DIAG_ITEMS } from '../js/core/constants.js';

/** Проводит диагностику с «ребёнком» oracle(k) → { correct, ms, skipped }. */
function runDiag(oracle, { seed = 1, start = day(0) } = {}) {
  const diag = new Diagnostic({ rng: makeRng(seed), start });
  let now = start;
  const asked = [];
  for (;;) {
    const k = diag.next(now);
    if (!k) break;
    const r = oracle(k);
    now += r.ms + 800;
    asked.push(k);
    diag.answer({ k, correct: r.correct, ms: r.ms, skipped: !!r.skipped, given: r.correct ? parseKey(k).a * parseKey(k).b : 0, now });
  }
  return { diag, asked, end: now };
}

const knowsLevels = (levels, ms = 2200) => (k) => (levels.includes(levelOf(k)) ? { correct: true, ms } : { correct: false, ms: 4000, skipped: true });

test('Диагностика: ребёнок знает всё — 20 примеров, все 100 фактов отмечены', () => {
  const { diag, asked } = runDiag(() => ({ correct: true, ms: 2000 }));
  assert.equal(asked.length, DIAG_ITEMS);
  assert.equal(new Set(asked).size, asked.length, 'примеры не повторяются');
  const { facts } = applyPlacement(emptyFacts(), diag, { now: day(0), sid: 'd' });
  assert.equal(ALL_KEYS.filter((k) => factStatus(facts[k]) === 'know').length, 100);
});

test('Диагностика: идёт от лёгких к трудным — первый проход по уровням по порядку', () => {
  const { asked } = runDiag(() => ({ correct: true, ms: 2000 }));
  const firstSeen = [];
  for (const k of asked) if (!firstSeen.includes(levelOf(k))) firstSeen.push(levelOf(k));
  assert.deepEqual(firstSeen, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const firstPass = asked.slice(0, asked.findIndex((k) => levelOf(k) === 9) + 1).map(levelOf);
  for (let i = 1; i < firstPass.length; i++) assert.ok(firstPass[i] >= firstPass[i - 1], 'уровни не убывают');
});

test('Диагностика: следующий пример зависит от предыдущих ответов', () => {
  const a = runDiag(() => ({ correct: true, ms: 2000 }), { seed: 5 }).asked;
  let failedOnce = false;
  const b = runDiag((k) => {
    if (levelOf(k) === 2 && !failedOnce) { failedOnce = true; return { correct: false, ms: 5000 }; }
    return { correct: true, ms: 2000 };
  }, { seed: 5 }).asked;
  const i = a.findIndex((k, idx) => k !== b[idx]);
  assert.ok(i > 0, 'последовательности расходятся');
  assert.ok(b.filter((k) => levelOf(k) === 2).length >= 3, 'спорный уровень получает дополнительный пример');
});

test('Диагностика: новичок — все 20 примеров, к концу самые лёгкие, ничего не отмечено известным', () => {
  const { diag, asked } = runDiag(() => ({ correct: false, ms: 1500, skipped: true }));
  assert.equal(asked.length, DIAG_ITEMS, 'всегда 20 примеров');
  assert.ok(new Set(asked.map(levelOf)).size === LEVELS.length, 'каждый уровень проверен');
  assert.ok(asked.slice(-4).every((k) => levelOf(k) <= 1), `последние примеры — ×1 и ×10: ${asked.slice(-4)}`);
  const { facts } = applyPlacement(emptyFacts(), diag, { now: day(0), sid: 'd' });
  assert.equal(ALL_KEYS.filter((k) => factStatus(facts[k]) !== 'new').length, 0);
  assert.ok(facts[asked[0]].n === 1, 'ответы записаны в историю');
});

test('Диагностика: знает ×1, ×10, ×2, ×5 — отмечены ровно эти уровни', () => {
  const { diag } = runDiag(knowsLevels([0, 1, 2, 3]));
  const { facts } = applyPlacement(emptyFacts(), diag, { now: day(0), sid: 'd' });
  for (const k of ALL_KEYS) {
    const expected = levelOf(k) <= 3 ? 'know' : 'new';
    assert.equal(factStatus(facts[k]), expected, k);
  }
});

test('Диагностика: школьный порядок (знает ×3, ×4, но не ×9) тоже распознаётся', () => {
  const known = [0, 1, 2, 3, 5, 6];
  const { diag } = runDiag(knowsLevels(known));
  const v = diag.result().verdicts;
  assert.deepEqual(v.map((x, i) => (known.includes(i) ? x === 'known' : x !== 'known')), Array(10).fill(true));
  const { facts } = applyPlacement(emptyFacts(), diag, { now: day(0), sid: 'd' });
  assert.equal(factStatus(facts['3x7']), 'know', '×3 отмечен');
  assert.equal(factStatus(facts['9x7']), 'new', '×9 — новый');
});

test('Диагностика: не дольше 5 минут', () => {
  const { asked, end } = runDiag(() => ({ correct: true, ms: 19000 }));
  assert.ok(asked.length < DIAG_ITEMS);
  assert.ok(end - day(0) <= 5 * 60 * 1000 + 20000, 'последний пример начат до 5 минут');
});

test('Диагностика: медленный верный ответ — «знает» в первой коробке, ошибка — «новый», пара верного — известна', () => {
  const diag = new Diagnostic({ rng: makeRng(3), start: day(0) });
  diag.answer({ k: '6x7', correct: true, ms: 9000, now: day(0) });
  diag.answer({ k: '8x9', correct: false, ms: 4000, given: 63, now: day(0) });
  diag.answer({ k: '3x4', correct: true, ms: 2000, now: day(0) });
  const { facts } = applyPlacement(emptyFacts(), diag, { now: day(0), sid: 'd' });
  assert.equal(factStatus(facts['6x7']), 'know', 'верно — значит знает');
  assert.equal(facts['6x7'].box, 1, 'но медленно: первая коробка, скорость тренируем сразу');
  assert.equal(factStatus(facts['7x6']), 'know', 'пара медленного тоже известна');
  assert.equal(facts['7x6'].box, 1);
  assert.equal(factStatus(facts['8x9']), 'new');
  assert.deepEqual(facts['8x9'].wa, [63]);
  assert.equal(factStatus(facts['3x4']), 'know');
  assert.equal(facts['3x4'].box, 3, 'быстрый ответ — третья коробка');
  assert.equal(factStatus(facts['4x3']), 'know', 'пара 4×3 отмечена по перестановке');
  assert.equal(facts['4x3'].src, 'diag');
});

test('Диагностика: медленный, но верный ребёнок не считается «застрявшим»', () => {
  const { diag, asked } = runDiag(() => ({ correct: true, ms: 7000 }));
  assert.equal(asked.length, 20, 'все 20 примеров, без раннего конца');
  assert.equal(diag.missStreak, 0);
  const { facts } = applyPlacement(emptyFacts(), diag, { now: day(0), sid: 'd' });
  const asList = ALL_KEYS.map((k) => factStatus(facts[k]));
  assert.equal(asList.filter((x) => x === 'learning').length, 0, 'никого не записали в «изучается»');
  assert.ok(asList.filter((x) => x === 'know').length >= 60, 'известные уровни отмечены');
  assert.ok(ALL_KEYS.every((k) => factStatus(facts[k]) !== 'know' || facts[k].box === 1), 'всё медленное — в первой коробке');
  assert.equal(diag.answers.filter((x) => x.hard).length, 0, 'режим «трудно» не включался');
});

test('Диагностика: медленно только на трудных — без ложного режима «трудно»', () => {
  const { diag } = runDiag((k) => {
    const { a, b } = parseKey(k);
    return { correct: true, ms: a * b > 30 ? 7500 : 2500 };
  });
  assert.equal(diag.answers.filter((x) => x.hard).length, 0, 'самые лёгкие примеры не подставлялись');
  const v = diag.result().verdicts;
  assert.ok(v.every((x) => x === 'known' || x === 'slow'), v.join(','));
});

test('Диагностика: в каждом уровне спрашиваются разные факты, пары не дублируются', () => {
  const { asked } = runDiag(() => ({ correct: true, ms: 2500 }), { seed: 11 });
  for (const k of asked) {
    const [a, b] = k.split('x');
    if (a !== b) assert.ok(!asked.includes(`${b}x${a}`), `пара ${k} не спрашивается дважды`);
  }
  assert.equal(COLUMN_ORDER.length, 10);
});
