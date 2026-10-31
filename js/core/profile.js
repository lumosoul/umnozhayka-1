// Профиль ребёнка. Факты и журнал занятий хранятся отдельно (см. data/store.js).

import { makeId } from './random.js';

export const AVATARS = ['🦊', '🐻', '🐰', '🐼', '🐯', '🐸', '🐧', '🦁', '🐨', '🐶', '🐱', '🦄'];

export const PROFILE_COLORS = ['#2f6fdb', '#0f7b6c', '#8a4fd8', '#c2410c'];

export function newProfile({ name, avatar, now = Date.now(), rng = Math.random, index = 0 }) {
  return {
    id: makeId('p_', rng),
    name: String(name || '').trim().slice(0, 24) || 'Ученик',
    avatar: avatar || AVATARS[0],
    color: PROFILE_COLORS[index % PROFILE_COLORS.length],
    created: now,
    upd: now,
    diag: { done: false, at: 0, known: 0 },
    intros: [],     // столбцы, чьё объяснение уже показано
    zero: false,    // объяснено правило умножения на 0
    awards: {},     // id награды → время получения
    blitzBest: 0,
  };
}
