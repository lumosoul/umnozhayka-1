// «Моя таблица»: сетка 10×10 со статусами, легенда, процент освоения.
// «Приёмы»: библиотека объяснений по столбцам и правило нуля.

import { h, clear } from '../dom.js';
import { topbar, backButton, screen } from '../shell.js';
import { owlLine } from '../owl.js';
import { tableGrid, statusLegend } from '../grid.js';
import { runColumnIntro, runSlides } from '../intro.js';
import { store } from '../../data/store.js';
import { masteryPercent, statusCounts } from '../../core/facts.js';
import { COLUMN_ORDER } from '../../core/constants.js';
import { COLUMN_RULES, zeroRuleSlides } from '../../core/tricks.js';

export function progressScreen(ctx) {
  const cur = store.current;
  const c = statusCounts(cur.facts);
  const m = masteryPercent(cur.facts);
  const el = h('div', {}, topbar({ left: [backButton(() => ctx.go('home'))], title: 'Моя таблица' }), screen([
    owlLine('Нажми на любую клетку — я расскажу, как ты её знаешь.').el,
    h('section', { class: 'sheet stack' },
      h('div', { class: 'mastery-bar', role: 'img', 'aria-label': `Освоено ${m} %` }, h('span', { style: { width: `${m}%` } })),
      h('p', { style: { margin: 0, fontWeight: 700 } }, `Освоено ${m}\u00a0%: знаешь ${c.know}, на автомате ${c.auto}, учишь ${c.learning}, впереди ${c.new}.`),
      tableGrid(cur.facts),
      statusLegend()),
  ], { label: 'Моя таблица' }));
  return { el, start() { el.querySelector('.cell').focus({ preventScroll: true }); }, onBack: () => ctx.go('home') };
}

export function libraryScreen(ctx) {
  const stage = h('div', { class: 'stack' });
  const list = h('div', { class: 'btn-row' });
  const back = () => ctx.go('home');
  const showList = () => {
    clear(stage);
    stage.append(list);
    list.querySelector('button').focus({ preventScroll: true });
  };
  const open = async (fn) => {
    clear(stage);
    await fn();
    showList();
  };
  for (const k of COLUMN_ORDER) {
    list.append(h('button', {
      type: 'button', class: 'btn', style: { flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', minHeight: '76px' },
      dataset: { column: String(k) },
      on: { click: () => open(() => runColumnIntro(stage, k, store.current.facts)) },
    }, h('span', { style: { fontSize: '22px' } }, `Умножение на ${k}`), h('span', { class: 'small muted', style: { fontWeight: 600 } }, COLUMN_RULES[k])));
  }
  list.append(h('button', {
    type: 'button', class: 'btn', style: { flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', minHeight: '76px' },
    dataset: { column: '0' },
    on: { click: () => open(() => runSlides(stage, zeroRuleSlides(), { finishLabel: 'Понятно!' })) },
  }, h('span', { style: { fontSize: '22px' } }, 'Умножение на 0'), h('span', { class: 'small muted', style: { fontWeight: 600 } }, 'С нулём ответ всегда 0.')));
  const el = h('div', {}, topbar({ left: [backButton(back)], title: 'Приёмы' }), screen([
    owlLine('Здесь все мои подсказки. Выбирай!').el,
    stage,
  ], { label: 'Приёмы' }));
  showList();
  return { el, start() { showList(); }, onBack: back };
}

