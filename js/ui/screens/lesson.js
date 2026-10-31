// Экран занятия: 20 заданий, объяснения новых столбцов и фактов, правило нуля,
// разбор ошибок и возврат примера через 2–3 задания. Ответы сохраняются сразу.

import { h, clear, delay, announce } from '../dom.js';
import { topbar, closeButton, screen } from '../shell.js';
import { owlLine, bounce } from '../owl.js';
import { askQuestion } from '../task.js';
import { runCorrection } from '../coach.js';
import { runColumnIntro, runZeroRule, runFactCard } from '../intro.js';
import { confirmModal } from '../modal.js';
import { sound } from '../sound.js';
import { store } from '../../data/store.js';
import { Lesson } from '../../core/lesson.js';
import { makeRng } from '../../core/random.js';
import { dayKey } from '../../core/dates.js';
import { FORMATS } from '../../core/constants.js';
import { PRAISE, CALM, EFFORT_PRAISE, pickPhrase } from '../../core/ru.js';

const PROMPTS = {
  input: 'Сколько будет?',
  choice: 'Выбери ответ.',
  missing: 'Какое число спряталось?',
  tf: 'Верно или нет?',
};

export function progressTrack(total, index) {
  const track = h('div', {
    class: 'progress-track', role: 'progressbar', 'aria-label': 'Сколько заданий решено',
    'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(index),
  });
  for (let i = 0; i < total; i++) track.append(h('span', { class: `dot${i < index ? ' done' : i === index ? ' now' : ''}` }));
  return track;
}

export function lessonScreen(ctx) {
  const rng = makeRng(Date.now());
  const cur = store.current;
  const lesson = new Lesson({ facts: cur.facts, profile: cur.profile, today: dayKey(), rng });
  let alive = true;
  let session = null;
  const middle = h('div', { class: 'grow', style: { display: 'flex' } });
  const exit = async () => {
    const ok = await confirmModal('Закончить занятие?', 'Все ответы уже сохранены. Можно вернуться позже.', { yes: 'Закончить', no: 'Продолжить' });
    if (ok) { alive = false; ctx.go('home'); }
  };
  const owl = owlLine('Начинаем!', { size: 'small' });
  const stage = h('div', { class: 'stack' });
  const el = h('div', {}, topbar({ left: [closeButton(exit, 'Закончить занятие')], middle }), screen([owl.el, stage], { label: 'Занятие' }));

  const renderProgress = () => {
    clear(middle);
    middle.append(progressTrack(lesson.total, lesson.index));
  };

  async function run() {
    session = await store.startSession('lesson', lesson.total);
    while (alive) {
      renderProgress();
      const step = lesson.next(store.current.facts);
      if (step.type === 'end') break;
      if (step.type === 'zero') {
        owl.say('Сначала — одно важное правило!', 'think');
        await runZeroRule(stage, (t, m) => owl.say(t, m));
        if (!alive) return;
        await store.markZeroSeen();
        lesson.ackZero();
        continue;
      }
      if (step.type === 'column') {
        owl.say(`Новый столбец: умножение на ${step.column}!`, 'cheer');
        sound.play('star');
        await runColumnIntro(stage, step.column, store.current.facts);
        if (!alive) return;
        await store.markIntroSeen(step.column);
        lesson.ackColumn(step.column);
        continue;
      }
      if (step.type === 'fact') {
        owl.say('Новый пример! Посмотри внимательно.', '');
        await runFactCard(stage, step.k, store.current.facts);
        if (!alive) return;
        await store.introduce(session, step.k);
        continue;
      }
      const q = step.question;
      owl.say(q.kind === 'retry' ? 'Этот пример уже был. Вспомнишь?' : PROMPTS[q.fmt], '');
      const ans = await askQuestion(stage, q);
      if (!alive) return;
      const res = lesson.answer(ans.value);
      await store.recordAnswer(session, q.k, { correct: res.correct, ms: ans.ms, fmt: FORMATS[q.fmt], given: res.given });
      if (res.correct) {
        sound.play('correct');
        const praise = pickPhrase(PRAISE, rng);
        owl.say(praise, 'happy');
        announce(praise);
        bounce(owl.owl);
        if (ans.button) ans.button.classList.add('chosen-right');
        await delay(q.fmt === 'input' || q.fmt === 'missing' ? 550 : 750);
      } else {
        sound.play('gentle');
        owl.say(pickPhrase(CALM, rng), 'think');
        await runCorrection(stage, q, store.current.facts, { owlSay: (t, m) => owl.say(t, m) });
        if (!alive) return;
        owl.say(pickPhrase(EFFORT_PRAISE, rng), 'happy');
        await delay(600);
      }
      lesson.advance();
    }
    if (!alive) return;
    const result = await store.finishSession(session, { retries: lesson.retries, retriesSolved: lesson.retriesSolved });
    ctx.go('summary', { type: 'lesson', session, ...result }, { replace: true });
  }

  return {
    el,
    start() {
      run().catch((e) => ctx.fail(e));
    },
    destroy() { alive = false; },
    onBack: exit,
  };
}
