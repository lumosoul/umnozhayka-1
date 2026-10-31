// Диагностика при первом запуске: до 20 примеров, не дольше 5 минут, от лёгких
// к трудным. Правильность не показываем — только поддержку; в конце — что уже известно.

import { h, delay, clear } from '../dom.js';
import { topbar, screen, closeButton } from '../shell.js';
import { owlLine, bounce } from '../owl.js';
import { askQuestion } from '../task.js';
import { tableGrid, statusLegend } from '../grid.js';
import { confirmModal } from '../modal.js';
import { progressTrack } from './lesson.js';
import { sound } from '../sound.js';
import { store } from '../../data/store.js';
import { Diagnostic } from '../../core/diagnostic.js';
import { makeRng } from '../../core/random.js';
import { makeQuestion } from '../../core/choices.js';
import { DIAG_ITEMS } from '../../core/constants.js';
import { DIAG_CHEERS, pickPhrase, withWord } from '../../core/ru.js';

export function diagIntroScreen(ctx) {
  const name = store.current.profile.name;
  const owl = owlLine(`Привет, ${name}! Я совёнок Угу. Давай посмотрим, что ты уже знаешь.`, { size: 'large' });
  const go = h('button', { type: 'button', class: 'btn primary big block', dataset: { action: 'start' }, on: { click: () => ctx.go('diagnostic', {}, { replace: true }) } }, 'Начать');
  const el = h('div', {}, topbar({}), screen([
    owl.el,
    h('section', { class: 'sheet stack' },
      h('p', { style: { fontSize: '20px', fontWeight: 650 } }, `Будет ${DIAG_ITEMS} примеров — это займёт пару минут.`),
      h('p', { style: { fontSize: '20px', fontWeight: 650 } }, 'Если не знаешь ответ, нажми «Не знаю». Это нормально — мы всё выучим вместе!')),
    go,
  ], { label: 'Знакомство' }));
  return { el, start() { go.focus(); } };
}

export function diagnosticScreen(ctx) {
  const rng = makeRng(Date.now());
  const diag = new Diagnostic({ rng, start: Date.now() });
  let alive = true;
  const middle = h('div', { class: 'grow', style: { display: 'flex' } });
  const owl = owlLine('Поехали! Решай, как получается.', { size: 'small' });
  const stage = h('div', { class: 'stack' });
  const exit = async () => {
    const ok = await confirmModal('Отложить знакомство?', 'Можно пройти его позже — начнём с того же места заново.', { yes: 'Отложить', no: 'Продолжить' });
    if (ok) { alive = false; ctx.go('profiles'); }
  };
  const el = h('div', {}, topbar({ left: [closeButton(exit, 'Отложить')], middle }), screen([owl.el, stage], { label: 'Знакомство' }));

  async function run() {
    const session = await store.startSession('diag', DIAG_ITEMS);
    let hintTimer = null;
    for (;;) {
      clear(middle);
      middle.append(progressTrack(DIAG_ITEMS, diag.count));
      const k = diag.next(Date.now());
      if (!k) break;
      const q = makeQuestion(k, 'input', rng);
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => owl.say('Не спеши. А если не знаешь — нажми «Не знаю».', 'think'), 15000);
      const ans = await askQuestion(stage, q, { skip: 'Не знаю' });
      clearTimeout(hintTimer);
      if (!alive) return;
      const correct = !ans.skipped && ans.value === q.answer;
      diag.answer({ k, correct, ms: ans.ms, skipped: ans.skipped, given: ans.skipped ? null : ans.value, now: Date.now() });
      sound.play('tap');
      owl.say(ans.skipped ? 'Хорошо, это мы выучим!' : pickPhrase(DIAG_CHEERS, rng), '');
      bounce(owl.owl);
      await delay(350);
    }
    if (!alive) return;
    const { counts } = await store.applyDiagnostic(diag, session);
    ctx.go('diagResult', { known: counts.know + counts.auto }, { replace: true });
  }

  return { el, start() { run().catch((e) => ctx.fail(e)); }, destroy() { alive = false; }, onBack: exit };
}

export function diagResultScreen(ctx, { known }) {
  const cur = store.current;
  const text = known > 0
    ? `Ты уже знаешь ${withWord(known, 'пример', 'примера', 'примеров')}! Остальные выучим вместе.`
    : 'Отлично! Начнём с самого начала — я всё покажу.';
  const owl = owlLine(text, { mood: 'cheer' });
  const go = h('button', { type: 'button', class: 'btn primary big block', dataset: { action: 'lesson' }, on: { click: () => ctx.go('lesson', {}, { replace: true }) } }, 'Начать первое занятие');
  const el = h('div', {}, topbar({}), screen([
    owl.el,
    h('section', { class: 'sheet stack' }, h('h2', {}, 'Твоя таблица'), tableGrid(cur.facts, { mini: true }), statusLegend()),
    go,
    h('button', { type: 'button', class: 'btn block', dataset: { action: 'home' }, on: { click: () => ctx.go('home', {}, { replace: true }) } }, 'На главную'),
  ], { label: 'Итоги знакомства' }));
  return { el, start() { sound.play('fanfare'); go.focus(); } };
}
