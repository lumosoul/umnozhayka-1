// Итог занятия или блица: звёзды за старание, новые примеры, серия дней и награды.

import { h, s, icon, formatFact } from '../dom.js';
import { topbar, screen } from '../shell.js';
import { owlLine } from '../owl.js';
import { sound } from '../sound.js';
import { store } from '../../data/store.js';
import { AWARDS, streakInfo } from '../../core/rewards.js';
import { awardIcon } from './awards.js';
import { dayKey } from '../../core/dates.js';
import { withWord, plural } from '../../core/ru.js';
import { parseKey } from '../../core/facts.js';

export function starIcon(filled) {
  return s('svg', { viewBox: '0 0 24 24', class: 'star', 'aria-hidden': 'true' },
    s('path', {
      d: 'M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8z',
      fill: filled ? '#f5b638' : '#ffffff', stroke: filled ? '#c98a12' : '#8d9ab5', 'stroke-width': 1.4, 'stroke-linejoin': 'round',
    }));
}

const HEADLINES = ['Отличная работа!', 'Вот это старание!', 'Ты молодец!', 'Здорово получилось!'];

export function summaryScreen(ctx, { type, session, stars, awards = [], best = false }) {
  const cur = store.current;
  const streak = streakInfo(cur.sessions, dayKey());
  const owl = owlLine(HEADLINES[Math.min(HEADLINES.length - 1, stars)], { size: 'large', mood: 'cheer' });
  const starRow = h('div', { class: 'stars', role: 'img', 'aria-label': `${withWord(stars, 'звезда', 'звезды', 'звёзд')} из 3` },
    ...[1, 2, 3].map((i) => starIcon(i <= stars)));
  const lines = h('ul', { class: 'list' });
  const accuracy = session.answered ? Math.round((session.correct / session.answered) * 100) : 0;
  lines.append(h('li', {}, h('span', { class: 'fact' }, String(session.answered)),
    type === 'blitz' ? `${plural(session.answered, 'пример', 'примера', 'примеров')} за минуту` : `${plural(session.answered, 'пример решён', 'примера решено', 'примеров решено')}`));
  lines.append(h('li', {}, h('span', { class: 'fact' }, String(session.correct)), `верно с первого раза (${accuracy}\u00a0%)`));
  if (session.newFacts && session.newFacts.length) {
    lines.append(h('li', {}, h('span', { class: 'fact' }, `+${session.newFacts.length}`),
      `новые: ${session.newFacts.map((k) => { const { a, b } = parseKey(k); return formatFact(a, b); }).join(', ')}`));
  }
  lines.append(h('li', {}, h('span', { class: 'fact' }, icon('fire', { style: { width: '26px', height: '26px', color: '#c2410c' } }), ` ${streak.current}`),
    streak.current > 1 ? `${withWord(streak.current, 'день', 'дня', 'дней')} подряд — так держать!` : 'Начало новой серии дней!'));
  if (best) lines.append(h('li', {}, h('span', { class: 'fact' }, '🏅'), 'Это твой новый рекорд в блице!'));

  const awardList = awards.length
    ? h('section', { class: 'sheet stack' },
      h('h2', {}, awards.length > 1 ? 'Новые награды!' : 'Новая награда!'),
      h('div', { class: 'awards-grid' }, ...awards.map((id) => h('div', { class: 'award' }, awardIcon(AWARDS[id]), h('span', { class: 't' }, AWARDS[id].title), h('span', { class: 'small muted' }, AWARDS[id].text)))))
    : null;

  const again = h('button', { type: 'button', class: 'btn primary big block', dataset: { action: 'again' }, on: { click: () => ctx.go(type === 'blitz' ? 'blitz' : 'lesson', {}, { replace: true }) } },
    type === 'blitz' ? 'Ещё блиц' : 'Ещё занятие');
  const home = h('button', { type: 'button', class: 'btn big block', dataset: { action: 'home' }, on: { click: () => ctx.go('home') } }, 'На главную');
  const el = h('div', {}, topbar({}), screen([
    owl.el,
    starRow,
    h('p', { class: 'center-text', style: { fontWeight: 700, fontSize: '19px' } },
      stars >= 3 ? 'Три звезды! Ты очень стараешься.' : 'Каждое занятие делает тебя сильнее. Ошибки — это часть учёбы!'),
    lines,
    awardList,
    h('div', { class: 'stack' }, again, home),
  ], { label: 'Итоги' }));
  return {
    el,
    start() {
      sound.play(awards.length ? 'fanfare' : 'star');
      home.focus({ preventScroll: true });
    },
  };
}
