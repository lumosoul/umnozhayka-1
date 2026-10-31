// Сборка занятия, повтор после ошибки, форматы и дистракторы.

import { test, assert } from './harness.js';
import { day, emptyFacts, knowFact, weakFact, answer, makeRng, ChildModel } from './helpers.js';
import { Lesson } from '../js/core/lesson.js';
import { applyAnswer as apply, markIntroduced } from '../js/core/facts.js';
import { FORMATS } from '../js/core/constants.js';
import { buildSession, LessonQueue, sessionPools, spreadRepeats } from '../js/core/session.js';
import { chooseFormat, makeChoices, pickDistractors, makeQuestion, isCorrect, wrongProduct } from '../js/core/choices.js';
import { LEVELS } from '../js/core/curriculum.js';
import { ALL_KEYS, factStatus } from '../js/core/facts.js';
import { dayKey } from '../js/core/dates.js';

function midStageFacts() {
  const f = emptyFacts();
  for (const lvl of LEVELS.slice(0, 4)) for (const k of lvl) knowFact(f, k, day(0));
  for (const k of LEVELS[4].slice(0, 6)) weakFact(f, k, day(1));
  return f;
}

const minGapOk = (tasks) => tasks.every((t, i) => i === 0 || tasks[i - 1].k !== t.k);

test('Занятие: новичок — 20 заданий по трём новым фактам, объяснение ×1', () => {
  const plan = buildSession(emptyFacts(), { today: dayKey(day(0)), rng: makeRng(1) });
  assert.equal(plan.tasks.length, 20);
  assert.deepEqual(plan.newFacts, ['1x1', '1x2', '2x1']);
  assert.deepEqual(plan.introColumns, [1]);
  assert.ok(!plan.zeroRule, 'правило нуля — не в первом занятии');
  for (const k of plan.newFacts) {
    const idx = plan.tasks.map((t, i) => (t.k === k ? i : -1)).filter((i) => i >= 0);
    assert.ok(idx.length >= 3, `${k} показывается несколько раз`);
    assert.ok(plan.tasks[idx[0]].first, 'первый показ помечен');
    assert.ok(idx.slice(1).every((i) => !plan.tasks[i].first));
  }
  assert.ok(minGapOk(plan.tasks), 'один факт не идёт два раза подряд');
});

test('Занятие: 70 % новых и слабых, 30 % повторения, не больше 3 новых', () => {
  const f = midStageFacts();
  const plan = buildSession(f, { today: dayKey(day(5)), rng: makeRng(2) });
  assert.equal(plan.tasks.length, 20);
  assert.ok(plan.newFacts.length <= 3);
  const focus = plan.tasks.filter((t) => t.kind === 'new' || t.kind === 'weak').length;
  const review = plan.tasks.filter((t) => t.kind === 'review').length;
  assert.equal(focus, 14);
  assert.equal(review, 6);
  for (const t of plan.tasks.filter((x) => x.kind === 'weak')) {
    assert.ok(['learning', 'know'].includes(factStatus(f[t.k])));
  }
  assert.ok(minGapOk(plan.tasks));
});

test('Занятие: повторение берёт факты, у которых наступил день показа', () => {
  const f = midStageFacts();
  const today = dayKey(day(5));
  const { dueReview, freeReview, weak } = sessionPools(f, today);
  assert.ok(dueReview.length > 0);
  assert.ok(weak.length >= 6);
  const plan = buildSession(f, { today, rng: makeRng(3) });
  const reviewKeys = plan.tasks.filter((t) => t.kind === 'review').map((t) => t.k);
  assert.ok(reviewKeys.every((k) => dueReview.includes(k)), 'сначала просроченные');
  assert.ok(freeReview.length === 0 || !reviewKeys.some((k) => freeReview.includes(k)));
});

test('Занятие: слабые факты (ошибки, медленные ответы) попадают в занятие', () => {
  const f = midStageFacts();
  let slow = f['2x7'];
  slow = answer(slow, true, 9000, 'x', day(4));
  slow = answer(slow, true, 8500, 'x', day(4) + 1000);
  f['2x7'] = slow;
  const plan = buildSession(f, { today: dayKey(day(5)), rng: makeRng(4) });
  const keys = plan.tasks.map((t) => t.k);
  assert.ok(keys.includes('2x7'), 'медленный факт включён');
  for (const k of LEVELS[4].slice(0, 6)) assert.ok(keys.includes(k), `ошибочный ${k} включён`);
});

test('Занятие: правило нуля объясняется отдельно, когда нет нового столбца', () => {
  const f = emptyFacts();
  for (const k of LEVELS[0].slice(0, 3)) knowFact(f, k);
  const plan = buildSession(f, { today: dayKey(day(1)), rng: makeRng(5), introsSeen: [1] });
  assert.deepEqual(plan.introColumns, []);
  assert.ok(plan.zeroRule);
  const later = buildSession(f, { today: dayKey(day(1)), rng: makeRng(5), introsSeen: [1], zeroSeen: true });
  assert.ok(!later.zeroRule, 'один раз');
});

test('Очередь: после ошибки пример возвращается через 2–3 задания, длина занятия та же', () => {
  const f = midStageFacts();
  const plan = buildSession(f, { today: dayKey(day(5)), rng: makeRng(6) });
  for (let seed = 1; seed <= 20; seed++) {
    const q = new LessonQueue(plan.tasks, { rng: makeRng(seed) });
    q.advance(); q.advance();
    const k = q.current.k;
    const due = q.scheduleRetry(k);
    const gap = due - q.index - 1;
    assert.ok(gap >= 2 && gap <= 3, `между ошибкой и повтором ${gap} задания`);
    assert.equal(q.total, 20, 'заданий по-прежнему 20');
    const between = [];
    q.advance();
    while (q.index < due) { between.push(q.current.k); q.advance(); }
    assert.equal(q.current.kind, 'retry');
    assert.equal(q.current.k, k);
    assert.ok(!between.includes(k), 'между ошибкой и повтором этого примера нет');
  }
});

test('Очередь: ошибка в конце занятия — повтор после «прокладки», не больше двух повторов', () => {
  const tasks = Array.from({ length: 20 }, (_, i) => ({ k: ALL_KEYS[i + 20], kind: 'weak', first: false }));
  const q = new LessonQueue(tasks, { rng: makeRng(1), fillers: ['1x1', '1x2', '1x3'] });
  while (q.index < 19) q.advance();
  const k = q.current.k;
  const due = q.scheduleRetry(k);
  assert.ok(due - q.index - 1 >= 2, 'перед повтором есть другие задания');
  q.advance();
  while (q.index < due) { assert.notEqual(q.current.k, k); q.advance(); }
  assert.equal(q.current.kind, 'retry');
  // Тот же пример ошибается снова на повторе — ещё один повтор; третьего не будет.
  const again = q.scheduleRetry(k);
  assert.ok(again >= 0, 'второй повтор');
  q.advance();
  while (q.index < again) q.advance();
  assert.equal(q.current.k, k);
  assert.equal(q.scheduleRetry(k), -1, 'третий повтор не планируется');
});

test('Форматы: выбор — новым и изучаемым, ввод — закрепляемым, с чередованием', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 200; i++) {
    assert.ok(['choice', 'tf'].includes(chooseFormat('learning', { rng })));
    assert.ok(['choice', 'tf'].includes(chooseFormat('new', { rng })));
    assert.ok(['input', 'missing'].includes(chooseFormat('know', { rng })));
    assert.ok(['input', 'missing'].includes(chooseFormat('auto', { rng })));
  }
  assert.equal(chooseFormat('learning', { first: true, rng }), 'choice', 'первое знакомство — выбор');
  let prev = 'input';
  let repeats = 0;
  for (let i = 0; i < 300; i++) {
    const fmt = chooseFormat('know', { prev, rng });
    if (fmt === prev) repeats++;
    prev = fmt;
  }
  assert.ok(repeats < 120, `повторов формата подряд: ${repeats}`);
});

test('Дистракторы: три разных близких неверных варианта', () => {
  const rng = makeRng(8);
  for (const k of ALL_KEYS) {
    const [a, b] = k.split('x').map(Number);
    const p = a * b;
    const opts = makeChoices(a, b, rng);
    assert.equal(opts.length, 4);
    assert.equal(new Set(opts).size, 4, `${k}: ${opts}`);
    assert.ok(opts.includes(p));
    for (const d of opts.filter((x) => x !== p)) {
      assert.ok(d > 0 && d <= 100, `${k}: ${d}`);
      const reversed = Number(String(p).split('').reverse().join(''));
      assert.ok(Math.abs(d - p) <= Math.max(a, b) + 10 || d === reversed || d === a + b, `${k}: ${d} далеко от ${p}`);
    }
  }
  assert.equal(pickDistractors(1, 1, rng).length, 3);
});

test('Задания: четыре формата и проверка ответа', () => {
  const rng = makeRng(9);
  const q1 = makeQuestion('7x8', 'input', rng);
  assert.ok(isCorrect(q1, 56) && !isCorrect(q1, 54));
  const q2 = makeQuestion('7x8', 'choice', rng);
  assert.ok(q2.options.includes(56) && isCorrect(q2, 56));
  const q3 = makeQuestion('7x8', 'missing', rng);
  assert.equal(q3.answer, q3.hide === 'a' ? 7 : 8);
  assert.equal(wrongProduct(q3, 6), null);
  let sawTrue = false; let sawFalse = false;
  for (let i = 0; i < 40; i++) {
    const q = makeQuestion('6x7', 'tf', rng);
    if (q.answer) { sawTrue = true; assert.equal(q.shown, 42); } else { sawFalse = true; assert.notEqual(q.shown, 42); }
    assert.ok(isCorrect(q, q.answer) && !isCorrect(q, !q.answer));
  }
  assert.ok(sawTrue && sawFalse);
});

test('Раскладка: между показами одного факта стараемся оставить два задания', () => {
  const seq = [
    { k: 'a', kind: 'weak' }, { k: 'a', kind: 'weak' }, { k: 'b', kind: 'weak' },
    { k: 'c', kind: 'weak' }, { k: 'd', kind: 'weak' }, { k: 'e', kind: 'weak' },
  ];
  const out = spreadRepeats(seq);
  const ia = out.map((t, i) => (t.k === 'a' ? i : -1)).filter((i) => i >= 0);
  assert.ok(ia[1] - ia[0] >= 3);
});

test('Очередь: повтор не встаёт вплотную к другому показу того же примера (1500 занятий)', () => {
  let lessons = 0; let doubles = 0; let retries = 0; let badGap = 0; let maxLen = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const child = new ChildModel({ seed });
    const rng = makeRng(seed);
    let facts = emptyFacts();
    const profile = { intros: [], zero: false };
    for (let d = 0; d < 5; d++) {
      const now = day(d, 17);
      const lesson = new Lesson({ facts, profile, today: dayKey(now), rng });
      const shown = [];
      const errorsAt = new Map();
      for (let g = 0; g < 200; g++) {
        const st = lesson.next(facts);
        if (st.type === 'end') break;
        if (st.type === 'zero') { lesson.ackZero(); profile.zero = true; continue; }
        if (st.type === 'column') { lesson.ackColumn(st.column); profile.intros.push(st.column); continue; }
        if (st.type === 'fact') { facts[st.k] = markIntroduced(facts[st.k], now); child.learnFromIntro(st.k); continue; }
        const q = st.question;
        if (q.kind === 'retry') {
          retries++;
          const gap = shown.length - errorsAt.get(q.k) - 1;
          if (gap < 2 || gap > 3) badGap++;
        }
        const r = child.respond(q.k);
        const v = r.correct ? q.answer : q.fmt === 'tf' ? !q.answer : q.fmt === 'choice' ? q.options.find((o) => o !== q.answer) : q.answer + 1;
        const res = lesson.answer(v);
        if (!res.correct) errorsAt.set(q.k, shown.length);
        facts[q.k] = apply(facts[q.k], { correct: res.correct, ms: r.ms, fmt: FORMATS[q.fmt], sid: `s${d}`, now, given: res.given });
        shown.push(q.k);
        lesson.advance();
      }
      lessons++;
      maxLen = Math.max(maxLen, shown.length);
      if (shown.some((k, i) => i > 0 && shown[i - 1] === k)) doubles++;
    }
  }
  assert.ok(retries > 300, `повторов: ${retries}`);
  assert.equal(doubles, 0, `занятий с одним примером дважды подряд: ${doubles} из ${lessons}`);
  assert.equal(badGap, 0, `повторов не через 2–3 задания: ${badGap} из ${retries}`);
  assert.ok(maxLen <= 26, `самое длинное занятие: ${maxLen}`);
});

test('Очередь: у новичка без освоенных фактов ошибка в последнем задании — повтор после двух других', () => {
  const plan = buildSession(emptyFacts(), { today: dayKey(day(0)), rng: makeRng(3) });
  const q = new LessonQueue(plan.tasks, { rng: makeRng(5), fillers: [] });
  while (q.total - q.index > 1) q.advance();
  const k = q.current.k;
  const due = q.scheduleRetry(k);
  assert.ok(due - q.index - 1 >= 2, `между ошибкой и повтором ${due - q.index - 1}`);
  q.advance();
  let prev = k;
  while (q.index < due) { assert.notEqual(q.current.k, k); assert.notEqual(q.current.k, prev); prev = q.current.k; q.advance(); }
  assert.equal(q.current.k, k);
  assert.equal(q.current.kind, 'retry');
});
