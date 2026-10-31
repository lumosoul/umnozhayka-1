// Общие части экранов: верхняя панель, кнопка звука, кнопка «назад».

import { h, icon } from './dom.js';
import { sound } from './sound.js';
import { store } from '../data/store.js';

export function soundToggle() {
  const btn = h('button', { type: 'button', class: 'btn icon ghost', dataset: { action: 'sound' } });
  const render = () => {
    btn.replaceChildren(icon(store.sound ? 'sound' : 'mute'));
    btn.setAttribute('aria-label', store.sound ? 'Выключить звук' : 'Включить звук');
    btn.setAttribute('aria-pressed', String(!store.sound));
    btn.title = store.sound ? 'Звук включён' : 'Звук выключен';
  };
  btn.addEventListener('click', async () => {
    await store.setSound(!store.sound);
    sound.setEnabled(store.sound);
    sound.play('tap');
    render();
  });
  render();
  return btn;
}

export function backButton(onClick, label = 'Назад') {
  return h('button', { type: 'button', class: 'btn icon ghost', 'aria-label': label, title: label, dataset: { action: 'back' }, on: { click: onClick } }, icon('back'));
}

export function closeButton(onClick, label = 'Закончить') {
  return h('button', { type: 'button', class: 'btn icon ghost', 'aria-label': label, title: label, dataset: { action: 'close' }, on: { click: onClick } }, icon('close'));
}

/** Верхняя панель: left — узлы слева, title — заголовок, right — узлы справа (звук добавляется всегда). */
export function topbar({ left = [], title = null, middle = null, right = [] } = {}) {
  return h('header', { class: 'topbar' },
    ...left,
    middle || h('div', { class: 'grow' }, title ? h('h1', { style: { fontSize: '22px', margin: 0 } }, title) : null),
    ...right,
    soundToggle());
}

export function screen(children, { wide = false, label = '' } = {}) {
  return h('main', { class: `screen screen-enter${wide ? ' wide' : ''}`, 'aria-label': label || null }, ...children);
}
