// Профили детей (до четырёх): выбор и создание.

import { h, icon } from '../dom.js';
import { topbar, backButton, screen } from '../shell.js';
import { owlLine } from '../owl.js';
import { toast } from '../modal.js';
import { store } from '../../data/store.js';
import { AVATARS } from '../../core/profile.js';
import { MAX_PROFILES } from '../../core/constants.js';

export function profilesScreen(ctx) {
  const grid = h('div', { class: 'profiles-grid' });
  for (const p of store.profiles) {
    grid.append(h('button', {
      type: 'button', class: 'profile-card', dataset: { profile: p.id },
      on: { click: () => ctx.openProfile(p.id) },
    }, h('span', { class: 'avatar big', 'aria-hidden': 'true' }, p.avatar), h('span', {}, p.name)));
  }
  if (store.canAddProfile) {
    grid.append(h('button', { type: 'button', class: 'profile-card add', dataset: { action: 'add' }, on: { click: () => ctx.go('newProfile') } },
      h('span', { class: 'avatar big', 'aria-hidden': 'true', style: { background: 'var(--primary-soft)' } }, '+'),
      h('span', {}, 'Новый профиль')));
  }
  const owl = owlLine(store.profiles.length ? 'Кто сегодня занимается?' : 'Привет! Я совёнок Угу. Давай познакомимся!');
  const el = h('div', {}, topbar({ title: 'Умножайка' }), screen([
    owl.el,
    grid,
    store.profiles.length >= MAX_PROFILES ? h('p', { class: 'small muted center-text' }, `Можно завести до ${MAX_PROFILES} профилей.`) : null,
    h('div', { class: 'row center' },
      h('button', { type: 'button', class: 'btn ghost', dataset: { action: 'parent' }, on: { click: () => ctx.go('parentGate') } },
        icon('lock', { style: { width: '22px', height: '22px' } }), 'Для взрослых')),
  ], { label: 'Профили' }));
  return { el, start() { const first = grid.querySelector('button'); if (first) first.focus({ preventScroll: true }); } };
}

export function newProfileScreen(ctx) {
  let avatar = AVATARS[store.profiles.length % AVATARS.length];
  const input = h('input', {
    type: 'text', id: 'pname', maxLength: 24, autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'done',
    placeholder: 'Например, Маша', 'aria-describedby': 'pname-hint',
  });
  const picker = h('div', { class: 'avatar-picker', role: 'group', 'aria-label': 'Выбери зверька' });
  const renderPicker = () => {
    for (const b of picker.children) b.setAttribute('aria-pressed', String(b.dataset.avatar === avatar));
  };
  for (const a of AVATARS) {
    picker.append(h('button', { type: 'button', dataset: { avatar: a }, 'aria-label': `Зверёк ${a}`, on: { click: () => { avatar = a; renderPicker(); } } }, a));
  }
  renderPicker();
  const save = async () => {
    const name = input.value.trim();
    if (!name) {
      toast('Напиши имя — так совёнок будет к тебе обращаться.');
      input.focus();
      return;
    }
    try {
      const p = await store.createProfile({ name, avatar });
      await ctx.openProfile(p.id);
    } catch (e) {
      toast(e.message);
    }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  const el = h('div', {},
    topbar({ left: store.profiles.length ? [backButton(() => ctx.go('profiles'))] : [], title: 'Новый профиль' }),
    screen([
      owlLine('Как тебя зовут?').el,
      h('section', { class: 'sheet stack' },
        h('label', { class: 'field', for: 'pname' }, 'Имя', input),
        h('p', { id: 'pname-hint', class: 'small muted', style: { margin: 0 } }, 'Можно попросить взрослого помочь написать имя.'),
        h('h3', { style: { margin: '6px 0 0' } }, 'Выбери зверька'),
        picker),
      h('button', { type: 'button', class: 'btn primary big block', dataset: { action: 'save' }, on: { click: save } }, 'Готово'),
      store.profiles.length ? null : h('div', { class: 'row center' },
        h('button', {
          type: 'button', class: 'btn ghost', dataset: { action: 'import-first' },
          on: { click: () => ctx.go('parentGate', { then: 'parent', thenParams: { tab: 'transfer' } }) },
        }, icon('lock', { style: { width: '22px', height: '22px' } }), 'У меня уже есть прогресс на другом устройстве')),
    ], { label: 'Новый профиль' }));
  return { el, start() { input.focus(); }, onBack: () => ctx.go(store.profiles.length ? 'profiles' : 'newProfile') };
}
