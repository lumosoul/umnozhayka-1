// Награды: за освоенные столбцы (k × 1 … k × 10), «молнии» за автоматизм, серии и звёзды.

import { h, s, icon } from '../dom.js';
import { topbar, backButton, screen } from '../shell.js';
import { store } from '../../data/store.js';
import { AWARDS, verifiedInColumn } from '../../core/rewards.js';
import { COLUMN_ORDER } from '../../core/constants.js';

export function awardIcon(a) {
  if (a.icon === 'column' || a.icon === 'bolt') {
    const gold = a.icon === 'bolt';
    return s('svg', { viewBox: '0 0 56 56', 'aria-hidden': 'true' },
      s('circle', { cx: 28, cy: 28, r: 25, fill: gold ? '#1d7a49' : '#2b59c3' }),
      s('circle', { cx: 28, cy: 28, r: 20, fill: 'none', stroke: '#fff', 'stroke-width': 2, opacity: 0.6 }),
      s('text', { x: 28, y: 34, 'text-anchor': 'middle', 'font-size': a.k === 10 ? 15 : 18, 'font-weight': 900, fill: '#fff' }, `×${a.k}`),
      gold ? s('path', { d: 'M40 6 33 18h5l-2 9 8-13h-5z', fill: '#f5b638' }) : null);
  }
  const names = { star: 'star', fire: 'fire', owl: 'owl', crown: 'crown' };
  const colors = { star: '#f5b638', fire: '#c2410c', owl: '#8b5e34', crown: '#c98a12' };
  const svg = icon(names[a.icon] || 'star');
  svg.style.color = colors[a.icon] || '#f5b638';
  return svg;
}

export function awardsScreen(ctx) {
  const cur = store.current;
  const got = cur.profile.awards || {};
  const cols = h('div', { class: 'awards-grid' });
  for (const k of COLUMN_ORDER) {
    const id = `col-${k}`;
    const done = verifiedInColumn(cur.facts, k);
    cols.append(h('div', { class: `award${got[id] ? '' : ' locked'}` },
      awardIcon(AWARDS[id]),
      h('span', { class: 't' }, AWARDS[id].title),
      h('span', { class: 'small muted' }, got[id] ? 'Получено!' : `Решено в занятиях: ${done} из 10`)));
  }
  const gold = h('div', { class: 'awards-grid' });
  for (const k of COLUMN_ORDER) {
    const id = `gold-${k}`;
    gold.append(h('div', { class: `award${got[id] ? '' : ' locked'}` },
      awardIcon(AWARDS[id]), h('span', { class: 't' }, AWARDS[id].title),
      h('span', { class: 'small muted' }, got[id] ? 'Получено!' : 'Весь столбец быстрее 3 секунд')));
  }
  const other = h('div', { class: 'awards-grid' });
  for (const id of ['first-lesson', 'streak-3', 'streak-7', 'streak-14', 'stars-50', 'half', 'all']) {
    other.append(h('div', { class: `award${got[id] ? '' : ' locked'}` },
      awardIcon(AWARDS[id]), h('span', { class: 't' }, AWARDS[id].title), h('span', { class: 'small muted' }, AWARDS[id].text)));
  }
  const el = h('div', {}, topbar({ left: [backButton(() => ctx.go('home'))], title: 'Награды' }), screen([
    h('section', { class: 'stack' }, h('h2', {}, 'Освоенные столбцы'), cols),
    h('section', { class: 'stack' }, h('h2', {}, 'На автомате'), gold),
    h('section', { class: 'stack' }, h('h2', {}, 'За старание'), other),
  ], { label: 'Награды' }));
  return { el, onBack: () => ctx.go('home') };
}
