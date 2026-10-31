// Картинки к объяснениям: группы, сетка точек, числовой луч, пальцы для ×9,
// перестановка множителей и пустые группы для правила нуля.
// a × b читается как «a взять b раз»: b рядов по a точек.

import { h, s, TIMES } from './dom.js';
import { plural } from '../core/ru.js';

const ROW_COLORS = ['#2b59c3', '#5b4bc4'];

/**
 * Сетка точек. full — фоновая сетка 10×10 с подсвеченным прямоугольником a×b
 * (так показывается разбор ошибки); иначе — ровно b рядов по a точек.
 */
export function dotArray(a, b, { full = false, label = true } = {}) {
  const cols = full ? 10 : a;
  const rows = full ? 10 : b;
  const cell = 24;
  const pad = full ? 22 : 6;
  const w = pad + cols * cell + 6;
  const hgt = pad + rows * cell + 6;
  const svg = s('svg', {
    viewBox: `0 0 ${w} ${hgt}`, class: 'dots-array', role: 'img',
    // Не крупнее естественного размера (×1,3), чтобы маленькая сетка не раздувалась.
    style: { width: `${Math.round(w * 1.3)}px` },
    'aria-label': `${b} ${plural(b, 'ряд', 'ряда', 'рядов')} по ${a} — всего ${a * b}`,
  });
  if (full) {
    svg.append(s('rect', {
      x: pad - 4, y: pad - 4, width: a * cell + 8, height: b * cell + 8, rx: 10,
      fill: '#eef1ff', stroke: '#5b4bc4', 'stroke-width': 2.5,
    }));
    for (let i = 1; i <= 10; i++) {
      svg.append(s('text', { x: pad + (i - 0.5) * cell, y: 14, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: i <= a ? '#1d2847' : '#8d9ab5' }, String(i)));
      svg.append(s('text', { x: 9, y: pad + (i - 0.5) * cell + 4, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: i <= b ? '#1d2847' : '#8d9ab5' }, String(i)));
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const on = c < a && r < b;
      svg.append(s('circle', {
        cx: pad + (c + 0.5) * cell, cy: pad + (r + 0.5) * cell, r: on ? 8 : 5,
        fill: on ? ROW_COLORS[r % 2] : '#dce1ea',
      }));
    }
  }
  const wrap = h('div', { class: 'stack', style: { alignItems: 'center', gap: '6px' } }, svg);
  if (label) wrap.append(h('div', { class: 'muted small center-text' }, `${b} ${plural(b, 'ряд', 'ряда', 'рядов')} по ${a} = ${a * b}`));
  return wrap;
}

/** Группы точек: b групп по a. shown — сколько групп уже показано. */
export function groupsView(a, b, shown = b) {
  const groups = h('div', { class: 'groups', role: 'img', 'aria-label': `${b} ${plural(b, 'группа', 'группы', 'групп')} по ${a}` });
  for (let i = 0; i < shown; i++) {
    const g = h('div', { class: 'group', style: { gridTemplateColumns: `repeat(${Math.min(5, Math.max(1, a))}, 16px)` } });
    for (let j = 0; j < a; j++) g.append(h('span', { class: 'd', style: { background: ROW_COLORS[i % 2] } }));
    groups.append(g);
  }
  return groups;
}

/** Сумма для групп: «2 + 2 + 2 = 6» по мере появления. */
export function sumText(a, shown) {
  if (!shown) return '';
  if (shown === 1) return `Одна группа: ${a}`;
  const parts = Array.from({ length: shown }, () => a).join(' + ');
  return `${parts} = ${a * shown}`;
}

/** Числовой луч: jumps прыжков по step. revealed — сколько прыжков уже сделано. */
export function numberLine(step, jumps, revealed = jumps) {
  const max = step * jumps;
  const W = 340;
  const H = 120;
  const x0 = 18;
  const x1 = W - 18;
  const y = 88;
  const X = (v) => x0 + (v / max) * (x1 - x0);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Числовой луч: ${jumps} прыжков по ${step}` });
  svg.append(s('line', { x1: x0, y1: y, x2: x1 + 8, y2: y, stroke: '#1d2847', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  svg.append(s('path', { d: `M${x1 + 8} ${y} l-8 -5 v10 z`, fill: '#1d2847' }));
  if (max <= 40) {
    for (let v = 0; v <= max; v++) {
      svg.append(s('line', { x1: X(v), y1: y - 4, x2: X(v), y2: y + 4, stroke: '#8d9ab5', 'stroke-width': 1.5 }));
    }
  }
  for (let i = 0; i <= jumps; i++) {
    const v = i * step;
    const reached = i <= revealed;
    svg.append(s('line', { x1: X(v), y1: y - 8, x2: X(v), y2: y + 8, stroke: '#1d2847', 'stroke-width': 2.5 }));
    svg.append(s('text', {
      x: X(v), y: y + 26, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800,
      fill: reached ? '#1d2847' : '#8d9ab5',
    }, String(v)));
  }
  for (let i = 0; i < revealed; i++) {
    const xa = X(i * step);
    const xb = X((i + 1) * step);
    const mid = (xa + xb) / 2;
    const top = y - Math.min(52, 18 + (xb - xa) * 0.45);
    svg.append(s('path', {
      d: `M${xa} ${y - 6} Q${mid} ${top} ${xb} ${y - 6}`, fill: 'none',
      stroke: ROW_COLORS[i % 2], 'stroke-width': 3, 'stroke-linecap': 'round',
    }));
    svg.append(s('path', { d: `M${xb} ${y - 6} l-7 -4 l2 8 z`, fill: ROW_COLORS[i % 2] }));
    svg.append(s('text', { x: mid, y: top + 4, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: ROW_COLORS[i % 2] }, `+${step}`));
  }
  return svg;
}

/** Пальцы для ×9: загнут палец номер n; слева — десятки, справа — единицы. */
export function fingers(n) {
  const W = 340;
  const H = 150;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Загнут ${n}-й палец: слева ${n - 1}, справа ${10 - n}` });
  const heights = [52, 74, 82, 76, 62];
  for (let i = 0; i < 10; i++) {
    const hand = i < 5 ? 0 : 1;
    const inHand = i % 5;
    const fh = hand === 0 ? heights[inHand] : heights[4 - inHand];
    const x = 14 + i * 30 + hand * 18;
    const bent = i === n - 1;
    const fy = 108 - (bent ? 26 : fh);
    svg.append(s('rect', {
      x, y: fy, width: 24, height: bent ? 26 : fh, rx: 12,
      fill: bent ? '#f5b638' : (i < n - 1 ? '#a8bdf0' : '#c9bff3'),
      stroke: '#1d2847', 'stroke-width': 2,
    }));
    svg.append(s('text', { x: x + 12, y: 128, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: '#1d2847' }, String(i + 1)));
  }
  svg.append(s('rect', { x: 8, y: 100, width: 152, height: 12, rx: 6, fill: '#e4ebfa' }));
  svg.append(s('rect', { x: 182, y: 100, width: 152, height: 12, rx: 6, fill: '#e4ebfa' }));
  svg.append(s('text', { x: 4 + (n - 1) * 15, y: 146, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#2b59c3' }, n > 1 ? `${n - 1}` : '0'));
  svg.append(s('text', { x: 340 - (10 - n) * 15, y: 146, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#5b4bc4' }, String(10 - n)));
  return h('div', { class: 'stack', style: { alignItems: 'center', gap: '4px' } },
    svg,
    h('div', { class: 'muted small center-text' }, `Слева ${n - 1}, справа ${10 - n} → ${n} ${TIMES} 9 = ${n * 9}`));
}

/** Перестановка: b рядов по a и a рядов по b — точек столько же. */
export function swapView(a, b) {
  const left = dotArray(a, b, { label: false });
  const right = dotArray(b, a, { label: false });
  left.style.maxWidth = right.style.maxWidth = '42%';
  return h('div', { class: 'row center', style: { alignItems: 'center', flexWrap: 'nowrap' } },
    left, h('div', { style: { fontSize: '30px', fontWeight: 850 } }, '='), right);
}

/** Пустые группы для 0 × b. */
export function zeroGroups(b) {
  const wrap = h('div', { class: 'groups', role: 'img', 'aria-label': `${b} пустых групп` });
  for (let i = 0; i < b; i++) wrap.append(h('div', { class: 'group empty' }, '0'));
  return wrap;
}

export function zeroEmpty() {
  return h('div', { class: 'group empty', style: { minWidth: '200px', minHeight: '90px' } }, 'групп нет');
}
