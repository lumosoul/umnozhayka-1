// Блиц: 60 секунд по освоенным фактам. Единственное место, где виден таймер.
// Во время разбора ошибки таймер стоит — спешить с исправлением не нужно.

import { h, clear, delay } from '../dom.js';
import { topbar, screen, closeButton } from '../shell.js';
import { owlLine, bounce } from '../owl.js';
import { askQuestion } from '../task.js';
import { runCorrection } from '../coach.js';
import { confirmModal } from '../modal.js';
import { sound } from '../sound.js';
import { store } from '../../data/store.js';
import { Blitz } from '../../core/lesson.js';
import { makeRng } from '../../core/random.js';
import { FORMATS, BLITZ_MS } from '../../core/constants.js';
import { PRAISE, pickPhrase } from '../../core/ru.js';

export function blitzScreen(ctx) {
  const rng = makeRng(Date.now());
  let alive = true;
  let remaining = BLITZ_MS;
  let running = false;
  let correcting = false;
  let lastTick = 0;
  let raf = 0;
  const secs = h('span', { class: 'timer', role: 'timer', 'aria-live': 'off' }, '60');
  const bar = h('span', { style: { width: '100%' } });
  const timerRow = h('div', { class: 'grow row', style: { flexWrap: 'nowrap' } }, h('div', { class: 'timer-bar', 'aria-hidden': 'true' }, bar), secs);
  const owl = owlLine('Блиц! 60 секунд — решай, сколько успеешь.', { size: 'small' });
  const stage = h('div', { class: 'stack' });
  const exit = async () => {
    running = false;
    const ok = await confirmModal('Закончить блиц?', 'Ответы уже сохранены.', { yes: 'Закончить', no: 'Продолжить' });
    if (ok) { alive = false; ctx.go('home'); } else if (!correcting) { resume(); }
  };
  const el = h('div', {}, topbar({ left: [closeButton(exit, 'Закончить блиц')], middle: timerRow }), screen([owl.el, stage], { label: 'Блиц' }));

  const draw = () => {
    const s = Math.ceil(remaining / 1000);
    secs.textContent = String(Math.max(0, s));
    bar.style.width = `${Math.max(0, (remaining / BLITZ_MS) * 100)}%`;
  };
  const frame = (t) => {
    if (!alive) return;
    if (running) {
      const before = Math.ceil(remaining / 1000);
      remaining -= t - lastTick;
      if (Math.ceil(remaining / 1000) !== before && remaining > 0 && remaining <= 5000) sound.play('tick');
    }
    lastTick = t;
    draw();
    raf = requestAnimationFrame(frame);
  };
  function resume() { lastTick = performance.now(); running = true; }

  let timeUp = null;
  const timeUpPromise = new Promise((r) => { timeUp = r; });
  const watch = setInterval(() => { if (remaining <= 0) { clearInterval(watch); timeUp(); } }, 100);

  async function run() {
    const blitz = new Blitz({ facts: store.current.facts, rng });
    const session = await store.startSession('blitz', 0);
    clear(stage);
    const startBtn = h('button', { type: 'button', class: 'btn primary big block', dataset: { action: 'start' } }, 'Старт!');
    stage.append(h('section', { class: 'sheet stack' },
      h('p', { style: { fontSize: '20px', fontWeight: 650 } }, 'Только примеры, которые ты уже знаешь. Ошибся — разберём спокойно, а таймер подождёт.'),
      startBtn));
    startBtn.focus();
    await new Promise((r) => startBtn.addEventListener('click', r, { once: true }));
    raf = requestAnimationFrame(frame);
    resume();
    while (alive && remaining > 0) {
      const q = blitz.next(store.current.facts);
      owl.say('Быстрее ветра!', '');
      const ans = await Promise.race([askQuestion(stage, q), timeUpPromise.then(() => null)]);
      if (!alive) return;
      if (!ans) break;
      const res = blitz.answer(ans.value);
      await store.recordAnswer(session, q.k, { correct: res.correct, ms: ans.ms, fmt: FORMATS.blitz, given: res.given });
      if (res.correct) {
        sound.play('correct');
        owl.say(pickPhrase(PRAISE, rng), 'happy');
        bounce(owl.owl);
        await delay(250);
      } else {
        running = false;
        correcting = true;
        sound.play('gentle');
        owl.say('Таймер ждёт. Посмотрим вместе!', 'think');
        await runCorrection(stage, q, store.current.facts, { owlSay: (t, m) => owl.say(t, m) });
        correcting = false;
        if (!alive) return;
        resume();
      }
    }
    if (!alive) return;
    running = false;
    cancelAnimationFrame(raf);
    remaining = 0;
    draw();
    const best = await store.saveBlitzBest(session.correct);
    const result = await store.finishSession(session);
    ctx.go('summary', { type: 'blitz', session, ...result, best }, { replace: true });
  }

  return {
    el,
    start() { run().catch((e) => ctx.fail(e)); },
    destroy() { alive = false; running = false; cancelAnimationFrame(raf); clearInterval(watch); },
    onBack: exit,
  };
}
