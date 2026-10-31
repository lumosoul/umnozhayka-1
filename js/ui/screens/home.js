// Главный экран ребёнка: совёнок, большая кнопка занятия, серия дней, звёзды,
// процент освоения и раскрашенная таблица 10×10.

import { h, icon } from '../dom.js';
import { topbar, screen } from '../shell.js';
import { owlLine } from '../owl.js';
import { tableGrid } from '../grid.js';
import { store } from '../../data/store.js';
import { streakInfo, totalStars } from '../../core/rewards.js';
import { masteryPercent, statusCounts } from '../../core/facts.js';
import { blitzUnlocked, blitzPool } from '../../core/blitz.js';
import { dayKey } from '../../core/dates.js';
import { BLITZ_MIN_FACTS } from '../../core/constants.js';
import { withWord, plural } from '../../core/ru.js';

function greeting(name, streak, todayLessons) {
  if (todayLessons > 0) return `${name}, сегодня занятие уже есть! Хочешь ещё одно или блиц?`;
  if (streak.current >= 2) return `Привет, ${name}! Серия — ${withWord(streak.current, 'день', 'дня', 'дней')} подряд. Продолжим?`;
  if (streak.current === 1) return `Привет, ${name}! Занятие сегодня — и серия растёт.`;
  return `Привет, ${name}! Десять минут — и ты чуть сильнее. Начнём?`;
}

export function homeScreen(ctx) {
  const cur = store.current;
  const today = dayKey();
  const streak = streakInfo(cur.sessions, today);
  const todayLessons = cur.sessions.filter((x) => x.day === today && x.done && x.type === 'lesson').length;
  const mastery = masteryPercent(cur.facts);
  const counts = statusCounts(cur.facts);
  const stars = totalStars(cur.sessions);

  const chip = h('button', { type: 'button', class: 'profile-chip', dataset: { action: 'profiles' }, 'aria-label': `Профиль ${cur.profile.name}. Сменить профиль`, on: { click: () => ctx.go('profiles') } },
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, cur.profile.avatar),
    h('span', { class: 'name' }, cur.profile.name));
  const owl = owlLine(greeting(cur.profile.name, streak, todayLessons), { mood: todayLessons ? 'happy' : '' });

  const start = h('button', { type: 'button', class: 'btn primary big block', dataset: { action: 'lesson' }, on: { click: () => ctx.go('lesson') } },
    todayLessons ? 'Ещё занятие' : 'Начать занятие');

  const stat = (iconName, value, label, color) => h('div', { class: 'stat' },
    h('span', { class: 'value' }, icon(iconName, { style: { color } }), ' ', String(value)),
    h('span', { class: 'label' }, label));

  const stats = h('div', { class: 'stats-row' },
    stat('fire', streak.current, `${plural(streak.current, 'день', 'дня', 'дней')} подряд`, '#c2410c'),
    stat('star', stars, 'звёзд', '#c98a12'),
    stat('check', `${mastery}\u00a0%`, 'освоено', '#1d7a49'));

  const grid = tableGrid(cur.facts, { mini: true });
  const unlocked = blitzUnlocked(cur.facts);
  const pool = blitzPool(cur.facts).length;
  const blitz = h('button', {
    type: 'button', class: 'btn', dataset: { action: 'blitz' }, 'aria-disabled': String(!unlocked),
    on: { click: () => (unlocked ? ctx.go('blitz') : owl.say(`Блиц откроется, когда ты освоишь ${BLITZ_MIN_FACTS} примеров. Уже есть ${pool}!`, 'think')) },
  }, icon('bolt', { style: { width: '24px', height: '24px' } }), 'Блиц 60 с');

  owl.el.classList.add('area-owl');
  start.classList.add('area-start');
  stats.classList.add('area-stats');
  const el = h('div', {},
    topbar({ middle: h('div', { class: 'grow' }, chip) }),
    screen([h('div', { class: 'home-layout' },
      owl.el,
      start,
      stats,
      h('section', { class: 'sheet stack area-table', 'aria-label': 'Моя таблица' },
        h('div', { class: 'row spread' },
          h('h2', { style: { margin: 0 } }, 'Моя таблица'),
          h('button', { type: 'button', class: 'btn ghost', dataset: { action: 'progress' }, on: { click: () => ctx.go('progress') } }, 'Подробнее')),
        h('div', { class: 'mastery-bar', role: 'img', 'aria-label': `Освоено ${mastery} %` }, h('span', { style: { width: `${mastery}%` } })),
        h('p', { class: 'small muted', style: { margin: 0 } },
          `Знаешь ${counts.know + counts.auto} из 100, на автомате — ${counts.auto}. Сейчас учишь: ${counts.learning}.`),
        grid),
      h('div', { class: 'btn-row area-buttons' },
        blitz,
        h('button', { type: 'button', class: 'btn', dataset: { action: 'awards' }, on: { click: () => ctx.go('awards') } }, icon('trophy', { style: { width: '24px', height: '24px' } }), 'Награды'),
        h('button', { type: 'button', class: 'btn', dataset: { action: 'library' }, on: { click: () => ctx.go('library') } }, icon('book', { style: { width: '24px', height: '24px' } }), 'Приёмы')),
      h('div', { class: 'row center area-parent' },
        h('button', { type: 'button', class: 'btn ghost', dataset: { action: 'parent' }, on: { click: () => ctx.go('parentGate') } }, icon('lock', { style: { width: '22px', height: '22px' } }), 'Для взрослых')),
    )], { label: 'Главная', wide: true }));
  return { el, start() { start.focus({ preventScroll: true }); } };
}
