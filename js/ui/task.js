// Показ одного задания в любом из четырёх форматов и незаметный замер времени.
// Время считается от момента, когда пример нарисован, до выбора варианта
// (или до последней набранной цифры — нажатие «Готово» не учитывается).

import { h, clear, icon, afterPaint, TIMES } from './dom.js';
import { createKeypad } from './keypad.js';
import { setKeyHandler } from './keys.js';
import { sound } from './sound.js';

function slot(text) {
  return h('span', { class: `slot${text ? '' : ' empty'}`, 'aria-hidden': 'true' }, text || '?');
}

/**
 * Показывает задание q в контейнере. Возвращает Promise<{ value, ms, skipped, button }>.
 * opts.skip — подпись кнопки «Не знаю» (для диагностики).
 */
export function askQuestion(container, q, opts = {}) {
  return new Promise((resolve) => {
    clear(container);
    let t0 = performance.now();
    let lastEdit = 0;
    let finished = false;
    const finish = (res) => {
      if (finished) return;
      finished = true;
      setKeyHandler(null);
      resolve(res);
    };
    const elapsed = () => Math.max(0, Math.round((lastEdit || performance.now()) - t0));

    const problem = h('div', { class: 'problem', role: 'heading', 'aria-level': '2' });
    const wrap = h('div', { class: 'task' }, problem);
    container.append(wrap);
    let keyHandler = null;

    if (q.fmt === 'input' || q.fmt === 'missing') {
      const maxDigits = q.fmt === 'missing' ? 2 : 3;
      const view = h('span');
      const render = (val) => {
        clear(view);
        if (q.fmt === 'input') {
          view.append(`${q.a} ${TIMES} ${q.b} = `, slot(val));
          problem.setAttribute('aria-label', `${q.a} умножить на ${q.b}. Введи ответ${val ? `: ${val}` : ''}`);
        } else if (q.hide === 'a') {
          view.append(slot(val), ` ${TIMES} ${q.b} = ${q.p}`);
          problem.setAttribute('aria-label', `Какое число умножить на ${q.b}, чтобы получить ${q.p}?${val ? ` ${val}` : ''}`);
        } else {
          view.append(`${q.a} ${TIMES} `, slot(val), ` = ${q.p}`);
          problem.setAttribute('aria-label', `${q.a} умножить на какое число будет ${q.p}?${val ? ` ${val}` : ''}`);
        }
      };
      problem.append(view);
      render('');
      if (q.fmt === 'missing') wrap.append(h('div', { class: 'problem-note' }, 'Какое число пропущено?'));
      const pad = createKeypad({
        maxDigits,
        onChange: (val) => { if (val) lastEdit = performance.now(); render(val); },
        onSubmit: (val) => finish({ value: Number(val), ms: elapsed(), skipped: false }),
      });
      wrap.append(pad.el);
      keyHandler = (e) => pad.handleKey(e);
    } else if (q.fmt === 'choice') {
      problem.append(`${q.a} ${TIMES} ${q.b} = `, h('span', { class: 'q' }, '?'));
      problem.setAttribute('aria-label', `${q.a} умножить на ${q.b}. Выбери ответ`);
      const grid = h('div', { class: 'choices', role: 'group', 'aria-label': 'Варианты ответа' });
      q.options.forEach((v, i) => {
        const b = h('button', {
          type: 'button', class: 'btn', dataset: { value: String(v), idx: String(i + 1) },
          on: { click: () => { sound.play('tap'); finish({ value: v, ms: elapsed(), skipped: false, button: b }); } },
        }, String(v));
        grid.append(b);
      });
      wrap.append(grid);
      keyHandler = (e) => {
        const n = Number(e.key);
        if (n >= 1 && n <= 4) { grid.children[n - 1].click(); return true; }
        return false;
      };
    } else if (q.fmt === 'tf') {
      problem.append(`${q.a} ${TIMES} ${q.b} = ${q.shown}`);
      problem.setAttribute('aria-label', `${q.a} умножить на ${q.b} равно ${q.shown}. Это верно?`);
      wrap.append(h('div', { class: 'problem-note' }, 'Это верно?'));
      const yes = h('button', {
        type: 'button', class: 'btn', dataset: { value: 'true' },
        on: { click: () => { sound.play('tap'); finish({ value: true, ms: elapsed(), skipped: false, button: yes }); } },
      }, icon('check'), 'Верно');
      const no = h('button', {
        type: 'button', class: 'btn', dataset: { value: 'false' },
        on: { click: () => { sound.play('tap'); finish({ value: false, ms: elapsed(), skipped: false, button: no }); } },
      }, icon('cross'), 'Неверно');
      wrap.append(h('div', { class: 'tf', role: 'group', 'aria-label': 'Верно или неверно' }, yes, no));
      keyHandler = (e) => {
        const k = e.key.toLowerCase();
        if (k === '1' || k === 'arrowleft' || k === 'y' || k === 'в') { yes.click(); return true; }
        if (k === '2' || k === 'arrowright' || k === 'n' || k === 'н') { no.click(); return true; }
        return false;
      };
    }

    if (opts.skip) {
      wrap.append(h('div', { class: 'row center' },
        h('button', {
          type: 'button', class: 'btn ghost', dataset: { action: 'skip' },
          on: { click: () => finish({ value: null, ms: elapsed(), skipped: true }) },
        }, opts.skip)));
    }

    setKeyHandler(keyHandler);
    afterPaint().then(() => { t0 = performance.now(); });
  });
}
