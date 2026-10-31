// Имитация 30 дней занятий через тот же движок, что и в интерфейсе:
// слабые примеры появляются заметно чаще освоенных, новых — не больше трёх за занятие.

import { test, assert } from './harness.js';
import { day, emptyFacts, ChildModel, makeRng } from './helpers.js';
import { Lesson } from '../js/core/lesson.js';
import { Diagnostic, applyPlacement } from '../js/core/diagnostic.js';
import { ALL_KEYS, applyAnswer, markIntroduced, factStatus, weakness, levelOf, masteryPercent, parseKey } from '../js/core/facts.js';
import { FORMATS, STATUS } from '../js/core/constants.js';
import { dayKey } from '../js/core/dates.js';
import { LEVELS } from '../js/core/curriculum.js';

function wrongValue(q) {
  if (q.fmt === 'tf') return !q.answer;
  if (q.fmt === 'choice') return q.options.find((o) => o !== q.answer);
  return q.answer + 1;
}

/** Одно занятие: возвращает журнал показов. */
function runLesson(state, child, d, rng) {
  const { facts, profile } = state;
  let now = day(d, 17);
  const lesson = new Lesson({ facts, profile, today: dayKey(now), rng });
  const sid = `s${d}`;
  const log = { introduced: [], shown: [], plan: lesson.plan };
  for (let guard = 0; guard < 200; guard++) {
    const step = lesson.next(facts);
    if (step.type === 'end') break;
    if (step.type === 'zero') { lesson.ackZero(); profile.zero = true; continue; }
    if (step.type === 'column') { lesson.ackColumn(step.column); profile.intros.push(step.column); continue; }
    if (step.type === 'fact') {
      facts[step.k] = markIntroduced(facts[step.k], now);
      child.learnFromIntro(step.k);
      log.introduced.push(step.k);
      continue;
    }
    const q = step.question;
    const resp = child.respond(q.k);
    const value = resp.correct ? q.answer : wrongValue(q);
    const res = lesson.answer(value);
    facts[q.k] = applyAnswer(facts[q.k], { correct: res.correct, ms: resp.ms, fmt: FORMATS[q.fmt], sid, now, given: res.given });
    log.shown.push(q.k);
    now += resp.ms + 1500;
    lesson.advance();
  }
  return log;
}

function classify(facts) {
  const cls = {};
  for (const k of ALL_KEYS) {
    const st = factStatus(facts[k]);
    if (st === STATUS.NEW) cls[k] = 'new';
    else if (st === STATUS.LEARNING || weakness(facts[k]) >= 2) cls[k] = 'weak';
    else cls[k] = 'mastered';
  }
  return cls;
}

test('Имитация 30 дней: слабые примеры показываются во много раз чаще освоенных', () => {
  const state = { facts: emptyFacts(), profile: { intros: [], zero: false } };
  const child = new ChildModel({ seed: 42 });
  const rng = makeRng(42);
  const exposures = { weak: 0, mastered: 0 };
  const factDays = { weak: 0, mastered: 0 };
  const introOrder = [];
  for (let d = 0; d < 30; d++) {
    const cls = classify(state.facts);
    for (const k of ALL_KEYS) if (cls[k] !== 'new') factDays[cls[k]] += 1;
    const log = runLesson(state, child, d, rng);
    assert.ok(log.introduced.length <= 3, `день ${d}: новых ${log.introduced.length}`);
    assert.ok(log.plan.tasks.length === 20, `день ${d}: заданий в плане ${log.plan.tasks.length}`);
    for (const k of log.shown) if (cls[k] !== 'new') exposures[cls[k]] += 1;
    introOrder.push(...log.introduced);
  }
  const perWeak = exposures.weak / Math.max(1, factDays.weak);
  const perMastered = exposures.mastered / Math.max(1, factDays.mastered);
  assert.ok(factDays.mastered > 100, 'освоенные факты появились');
  assert.ok(perWeak >= 3 * perMastered, `слабый: ${perWeak.toFixed(2)} показа в день, освоенный: ${perMastered.toFixed(2)}`);
  for (let i = 1; i < introOrder.length; i++) {
    assert.ok(levelOf(introOrder[i]) >= levelOf(introOrder[i - 1]), 'столбцы вводятся по порядку');
  }
  const m = masteryPercent(state.facts);
  assert.ok(m >= 35, `освоено ${m} %`);
});

test('Имитация: после диагностики занятия начинаются с первого незнакомого столбца', () => {
  const state = { facts: emptyFacts(), profile: { intros: [], zero: false } };
  const known = [...LEVELS[0], ...LEVELS[1], ...LEVELS[2]];
  const child = new ChildModel({ known, seed: 9 });
  const rng = makeRng(9);
  const diag = new Diagnostic({ rng, start: day(0, 10) });
  let now = day(0, 10);
  for (let k = diag.next(now); k; k = diag.next(now)) {
    const r = known.includes(k) ? { correct: true, ms: 2000 } : { correct: false, ms: 3000 };
    now += r.ms;
    diag.answer({ k, ...r, skipped: !r.correct, now, given: r.correct ? parseKey(k).a * parseKey(k).b : null });
  }
  state.facts = applyPlacement(state.facts, diag, { now, sid: 'diag' }).facts;
  const log = runLesson(state, child, 0, rng);
  assert.ok(log.introduced.length > 0);
  assert.ok(log.introduced.every((k) => levelOf(k) === 3), `введены ${log.introduced}`);
  assert.deepEqual(state.profile.intros, [5], 'показано объяснение ×5');
});

test('Имитация: если ребёнку трудно, новых фактов становится меньше', () => {
  const state = { facts: emptyFacts(), profile: { intros: [1], zero: true } };
  for (const k of LEVELS[0].slice(0, 12)) {
    let r = markIntroduced(state.facts[k], day(0));
    r = applyAnswer(r, { correct: false, ms: 8000, fmt: 1, sid: 'x', now: day(0) });
    state.facts[k] = r;
  }
  const lesson = new Lesson({ facts: state.facts, profile: state.profile, today: dayKey(day(1)), rng: makeRng(1) });
  assert.ok(lesson.plan.newFacts.length <= 1, `новых ${lesson.plan.newFacts.length}`);
  const keys = new Set(lesson.plan.tasks.map((t) => t.k));
  assert.ok(LEVELS[0].slice(0, 12).filter((k) => keys.has(k)).length >= 10, 'слабые факты в фокусе');
});
