// Блиц: 60 секунд по освоенным фактам. Чаще выпадают те, что пока решаются медленнее.

import { ALL_KEYS, isMastered, avgTime } from './facts.js';
import { BLITZ_MIN_FACTS, FAST_MS } from './constants.js';
import { weightedPick } from './random.js';

export function blitzPool(facts) {
  return ALL_KEYS.filter((k) => isMastered(facts[k]));
}

export function blitzUnlocked(facts) {
  return blitzPool(facts).length >= BLITZ_MIN_FACTS;
}

/** Следующий пример блица: не повторяет последние 3, медленные — с большим весом. */
export function nextBlitzFact(facts, pool, recent, rng) {
  const avoid = new Set(recent.slice(-Math.min(3, pool.length - 1)));
  const items = pool.filter((k) => !avoid.has(k)).map((k) => {
    const t = avgTime(facts[k]) || FAST_MS;
    return { value: k, weight: 1 + Math.min(3, t / FAST_MS) };
  });
  return weightedPick(rng, items.length ? items : pool.map((k) => ({ value: k, weight: 1 })));
}
