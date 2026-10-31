// Учебный план: столбцы вводятся в порядке ×1, ×10, ×2, ×5, ×9, ×3, ×4, ×6, ×7, ×8.
// Факт относится к первому по порядку столбцу, в котором встречается один из его
// множителей, поэтому 7×2 изучается вместе с ×2 (пара к 2×7), а к ×7 остаются
// только 7×7, 7×8 и 8×7. Новых фактов за занятие — не больше трёх.

import { COLUMN_ORDER, MAX_NEW_PER_SESSION, STATUS } from './constants.js';
import { ALL_KEYS, factKey, factStatus, levelOf, twinKey, isMastered, weakness } from './facts.js';

/**
 * Факты уровня в порядке введения: сначала k×n, затем пара n×k, по возрастанию n.
 * Пример для ×2 (после ×1 и ×10): 2×2, 2×3, 3×2, 2×4, 4×2, …
 */
export function levelFacts(levelIndex) {
  const k = COLUMN_ORDER[levelIndex];
  const out = [];
  const seen = new Set();
  const others = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (const n of others) {
    for (const key of [factKey(k, n), factKey(n, k)]) {
      if (!seen.has(key) && levelOf(key) === levelIndex) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/** Все уровни заранее. */
export const LEVELS = COLUMN_ORDER.map((_, i) => levelFacts(i));

/** Факты «столбца ×k» в смысле таблицы-плаката: k×1 … k×10. */
export function columnFacts(k) {
  const out = [];
  for (let n = 1; n <= 10; n++) out.push(factKey(k, n));
  return out;
}

/** Первый по порядку уровень, где ещё есть новые факты (или -1, если всё введено). */
export function frontierLevel(facts) {
  for (let i = 0; i < LEVELS.length; i++) {
    if (LEVELS[i].some((k) => factStatus(facts[k]) === STATUS.NEW)) return i;
  }
  return -1;
}

/** Слабый факт: изучается или недавно давал ошибки и медленные ответы. */
export function isWeak(rec) {
  const st = factStatus(rec);
  return st === STATUS.LEARNING || (st !== STATUS.NEW && weakness(rec) >= 2);
}

/**
 * Сколько новых фактов можно дать сейчас (не больше трёх). Чем больше слабых
 * фактов, тем меньше новых: сначала закрепляем то, что уже начали учить.
 */
export function newFactsAllowance(facts) {
  let weak = 0;
  for (const k of ALL_KEYS) if (isWeak(facts[k])) weak += 1;
  if (weak >= 15) return 0;
  if (weak >= 10) return 1;
  if (weak >= 6) return 2;
  return MAX_NEW_PER_SESSION;
}

/**
 * Выбирает новые факты для занятия (не больше max). Идёт по уровням в учебном
 * порядке; внутри уровня первыми берёт факты, чья пара уже освоена, — их легче
 * всего выучить через перестановку множителей.
 */
export function pickNewFacts(facts, max = newFactsAllowance(facts)) {
  const out = [];
  for (let i = 0; i < LEVELS.length && out.length < max; i++) {
    const candidates = LEVELS[i].filter((k) => factStatus(facts[k]) === STATUS.NEW);
    const easy = candidates.filter((k) => twinKey(k) !== k && isMastered(facts[twinKey(k)]));
    const rest = candidates.filter((k) => !easy.includes(k));
    for (const k of [...easy, ...rest]) {
      if (out.length >= max) break;
      out.push(k);
    }
    // Не перескакиваем на следующий уровень, пока в текущем остаются новые факты.
    if (candidates.length > 0) break;
  }
  return out;
}

/** Освоен ли столбец k×1…k×10 (все факты «знает» или «автоматизм»). */
export function isColumnMastered(facts, k) {
  return columnFacts(k).every((key) => isMastered(facts[key]));
}

/** Доведён ли столбец до автоматизма. */
export function isColumnAutomatic(facts, k) {
  return columnFacts(k).every((key) => factStatus(facts[key]) === STATUS.AUTO);
}

/** Уровень введён полностью (нет новых фактов). */
export function isLevelIntroduced(facts, levelIndex) {
  return LEVELS[levelIndex].every((k) => factStatus(facts[k]) !== STATUS.NEW);
}
