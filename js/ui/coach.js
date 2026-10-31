// Спокойный разбор ошибки: верный ответ, подсвеченная сетка точек, подсказка-приём,
// и ребёнок сам вводит верный ответ. Никакого красного и никаких «неправильно».

import { h, clear, autoFit, typo, TIMES } from './dom.js';
import { dotArray, fingers } from './visuals.js';
import { createKeypad } from './keypad.js';
import { setKeyHandler } from './keys.js';
import { hintFor } from '../core/tricks.js';
import { sound } from './sound.js';

export function runCorrection(container, q, facts, { owlSay = () => {} } = {}) {
  return new Promise((resolve) => {
    clear(container);
    const expected = q.fmt === 'missing' ? q.answer : q.p;
    const hint = hintFor(q.k, facts);
    const line = autoFit(h('div', { class: 'answer-line', 'aria-live': 'polite' }));
    if (q.fmt === 'missing') {
      line.append(
        q.hide === 'a' ? h('span', { class: 'hl' }, String(q.a)) : String(q.a),
        ` ${TIMES} `,
        q.hide === 'b' ? h('span', { class: 'hl' }, String(q.b)) : String(q.b),
        ` = ${q.p}`);
    } else {
      line.append(`${q.a} ${TIMES} ${q.b} = `, h('span', { class: 'hl' }, String(q.p)));
    }
    let lead = 'Давай посмотрим вместе.';
    if (q.fmt === 'tf') {
      lead = q.answer ? `Это было верно: ${q.a} ${TIMES} ${q.b} = ${q.p}.` : `На самом деле ${q.a} ${TIMES} ${q.b} = ${q.p}, а не ${q.shown}.`;
    }
    const slotView = h('span', { class: 'slot empty' }, '?');
    const ask = autoFit(h('div', { class: 'problem', style: { fontSize: 'clamp(36px, 10vw, 56px)', padding: '12px' } }));
    const renderAsk = (val) => {
      clear(ask);
      slotView.textContent = val || '?';
      slotView.className = `slot${val ? '' : ' empty'}`;
      if (q.fmt === 'missing') {
        if (q.hide === 'a') ask.append(slotView, ` ${TIMES} ${q.b} = ${q.p}`);
        else ask.append(`${q.a} ${TIMES} `, slotView, ` = ${q.p}`);
      } else {
        ask.append(`${q.a} ${TIMES} ${q.b} = `, slotView);
      }
    };
    renderAsk('');
    const note = h('div', { class: 'feedback', 'aria-live': 'polite', style: { color: 'var(--ink)' } });
    const pad = createKeypad({
      maxDigits: q.fmt === 'missing' ? 2 : 3,
      okLabel: 'Готово',
      onChange: renderAsk,
      onSubmit: (val) => {
        if (Number(val) === expected) {
          sound.play('correct');
          setKeyHandler(null);
          resolve();
        } else {
          sound.play('gentle');
          note.textContent = typo(`Посмотри ещё раз: ответ ${expected}.`);
          owlSay(`Ответ — ${expected}. Попробуй ещё!`, 'think');
          pad.clear();
        }
      },
    });
    container.append(h('section', { class: 'coach', 'aria-label': 'Разбор примера' },
      h('h2', { style: { margin: 0 } }, lead),
      line,
      h('div', { class: 'visual' }, hint.fingers ? fingers(hint.fingers) : dotArray(q.a, q.b, { full: true })),
      h('p', { class: 'hint' }, hint.trick),
      hint.swap ? h('p', { class: 'hint' }, hint.swap) : null,
      h('h3', { style: { margin: '4px 0 0' } }, q.fmt === 'missing' ? 'Теперь введи пропущенное число сам:' : 'Теперь введи ответ сам:'),
      ask,
      note,
      pad.el));
    setKeyHandler((e) => pad.handleKey(e));
    container.querySelector('.coach h2').scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}
