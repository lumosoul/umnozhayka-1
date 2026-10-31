// Таблица 10×10: цвет клетки — статус факта (серый — новый, жёлтый — изучается,
// светло-зелёный — знает, тёмно-зелёный — автоматизм). Касание клетки открывает
// точность, среднее время и ошибки. Столбцы — первый множитель, строки — второй.

import { h, formatFact, formatPercent, formatSeconds, TIMES } from './dom.js';
import { openModal } from './modal.js';
import { factKey, factStatus, twinKey } from '../core/facts.js';
import { factDetails } from '../core/stats.js';
import { STATUS_LABELS, FORMAT_NAMES } from '../core/constants.js';
import { fullDayLabel, dayKey } from '../core/dates.js';
import { withWord } from '../core/ru.js';

const MARKS = { new: '', learning: '•', know: '✓', auto: '★' };

export function statusLegend() {
  const item = (st, label) => h('span', {},
    h('i', { class: `cell ${st}`, style: { aspectRatio: 'auto', cursor: 'default' }, 'aria-hidden': 'true' }, MARKS[st]),
    label);
  return h('div', { class: 'legend' },
    item('new', 'новый'), item('learning', 'изучается'), item('know', 'знает'), item('auto', 'автоматизм'));
}

const FORMAT_RU = { input: 'ввод', choice: 'выбор', missing: 'пропуск', tf: 'верно/неверно', diag: 'диагностика', blitz: 'блиц' };

function detailContent(facts, k) {
  const d = factDetails(facts, k);
  const p = d.a * d.b;
  const twin = twinKey(k);
  const items = [
    ['Статус', STATUS_LABELS[d.status] + (d.fromDiagnostic ? ' (по диагностике)' : '')],
    ['Точность', d.answers ? formatPercent(d.accuracy) : 'ещё не решали'],
    ['Среднее время', d.answers ? formatSeconds(d.avgMs) : '—'],
    ['Ответов', String(d.answers)],
    ['Ошибок', d.wrong ? `${d.wrong}${d.wrongAnswers.length ? ` (отвечали: ${d.wrongAnswers.join(', ')})` : ''}` : 'нет'],
    ['Верно подряд', String(d.streak)],
    ['Коробка', `${d.box} из 5`],
    ['Следующий показ', d.due ? (d.due <= dayKey() ? 'сегодня' : fullDayLabel(d.due)) : 'ещё не назначен'],
  ];
  if (twin !== k) {
    const ts = STATUS_LABELS[factStatus(facts[twin])];
    items.push(['Пара', `${formatFact(d.b, d.a)} — ${ts}`]);
  }
  const dl = h('dl');
  for (const [t, v] of items) dl.append(h('dt', {}, t), h('dd', {}, v));
  const strip = h('div', { class: 'history-strip', 'aria-label': 'Последние ответы' });
  for (const e of d.history.slice(-10)) {
    const fmt = FORMAT_RU[FORMAT_NAMES[e[3]]] || '';
    strip.append(h('span', { class: e[1] ? 'ok' : 'no', title: `${e[1] ? 'верно' : 'ошибка'}, ${formatSeconds(e[2])}${fmt ? `, ${fmt}` : ''}` },
      `${(e[2] / 1000).toFixed(1).replace('.', ',')}`));
  }
  return h('div', { class: 'fact-detail stack' },
    h('div', { class: 'fact-card' }, h('div', { class: 'big-fact' }, `${d.a} ${TIMES} ${d.b} = ${p}`)),
    dl,
    d.history.length ? h('div', { class: 'stack', style: { gap: '6px' } },
      h('div', { class: 'muted small' }, `Последние ${withWord(Math.min(10, d.history.length), 'ответ', 'ответа', 'ответов')} (секунды; зелёный — верно):`),
      strip) : null);
}

export function openFactDetail(facts, k) {
  const { a, b } = { a: Number(k.split('x')[0]), b: Number(k.split('x')[1]) };
  return openModal({ title: `Пример ${formatFact(a, b)}`, content: detailContent(facts, k) });
}

/**
 * Сетка. opts: { mini — компактная, interactive — по касанию открывать подробности,
 *               highlight — ключ подсвеченной клетки, onPick(k) }.
 */
export function tableGrid(facts, { mini = false, interactive = true, highlight = null, onPick = null } = {}) {
  const grid = h('div', {
    class: `table-grid${mini ? ' mini' : ''}`,
    role: interactive ? 'group' : 'img',
    'aria-label': 'Таблица умножения: цвет клетки показывает, как ты знаешь пример',
  });
  grid.append(h('div', { class: 'hdr corner', 'aria-hidden': 'true' }, TIMES));
  for (let a = 1; a <= 10; a++) grid.append(h('div', { class: 'hdr', 'aria-hidden': 'true' }, String(a)));
  const cells = [];
  for (let b = 1; b <= 10; b++) {
    grid.append(h('div', { class: 'hdr', 'aria-hidden': 'true' }, String(b)));
    for (let a = 1; a <= 10; a++) {
      const k = factKey(a, b);
      const st = factStatus(facts[k]);
      const attrs = {
        class: `cell ${st}${highlight === k ? ' selected' : ''}`,
        dataset: { k },
        'aria-label': `${a} × ${b} = ${a * b}, ${STATUS_LABELS[st]}`,
      };
      const content = [String(a * b), MARKS[st] ? h('span', { class: 'mark', 'aria-hidden': 'true' }, MARKS[st]) : null];
      let cell;
      if (interactive) {
        cell = h('button', {
          type: 'button', ...attrs, tabindex: cells.length === 0 ? 0 : -1,
          on: { click: () => (onPick ? onPick(k) : openFactDetail(facts, k)) },
        }, ...content);
      } else {
        cell = h('div', attrs, ...content);
      }
      cells.push(cell);
      grid.append(cell);
    }
  }
  if (interactive) {
    // Стрелки перемещают фокус по сетке (как в таблице).
    grid.addEventListener('keydown', (e) => {
      const i = cells.indexOf(document.activeElement);
      if (i < 0) return;
      const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 10, ArrowUp: -10, Home: -(i % 10), End: 9 - (i % 10) };
      if (!(e.key in moves)) return;
      const j = i + moves[e.key];
      if (j < 0 || j >= cells.length) return;
      e.preventDefault();
      e.stopPropagation();
      cells[i].tabIndex = -1;
      cells[j].tabIndex = 0;
      cells[j].focus();
    });
  }
  return grid;
}
