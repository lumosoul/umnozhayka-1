// Адаптивная диагностика при первом запуске: 20 примеров, не дольше 5 минут.
// Идём по уровням от лёгких к трудным (×1, ×10, ×2, ×5, ×9, ×3, ×4, ×6, ×7, ×8).
// Каждый уровень проверяется 1–3 примерами: правила ×1 и ×10 подтверждаются одним
// верным ответом, спорный уровень (есть и верный, и неверный ответ) получает третий
// пример, а когда ребёнку трудно (три ошибки или «Не знаю» подряд), следующие уровни
// проверяются самым лёгким примером и закрываются после первой ошибки. Промахом
// считается только неверный ответ: медленный верный ответ — это знание, которое
// нужно ускорить. Если на уровне все ответы верные, все его факты отмечаются
// известными; верно решённый факт тянет за собой свою пару. Оставшиеся примеры
// подтверждают пройденные уровни, а если подтверждать нечего — берутся самые
// лёгкие ещё не заданные примеры. Диагностика всегда из 20 примеров; раньше она
// заканчивается только по ограничению в 5 минут.

import { DIAG_ITEMS, DIAG_MAX_MS, FAST_MS, SLOW_MS, KNOW_STREAK, FORMATS } from './constants.js';
import { LEVELS } from './curriculum.js';
import { parseKey, twinKey, applyAnswer, cloneFact, levelOf } from './facts.js';
import { intervalFor } from './leitner.js';
import { addDays, dayKey } from './dates.js';
import { shuffle } from './random.js';

const RULE_LEVELS = new Set([0, 1]); // ×1 и ×10 — правила, хватает одного верного ответа

/** Верный ответ не дольше 6 секунд — факт известен уверенно. */
const isFluent = (a) => a.correct && a.ms <= SLOW_MS;

export class Diagnostic {
  constructor({ rng, items = DIAG_ITEMS, maxMs = DIAG_MAX_MS, start = Date.now() } = {}) {
    this.rng = rng || Math.random;
    this.items = items;
    this.maxMs = maxMs;
    this.start = start;
    this.answers = [];
    this.asked = new Set();
    this.levels = LEVELS.map(() => ({ answers: [] }));
    this.pending = null;
  }

  get count() { return this.answers.length; }

  isOver(now = Date.now()) {
    return this.answers.length >= this.items || now - this.start >= this.maxMs;
  }

  /** Сколько ошибок (и «Не знаю») подряд в конце. Медленный верный ответ — не ошибка. */
  get missStreak() {
    let n = 0;
    for (let i = this.answers.length - 1; i >= 0 && !this.answers[i].correct; i--) n++;
    return n;
  }

  /** Трудно ли ребёнку сейчас: три последних ответа — ошибки. */
  get struggling() {
    return this.missStreak >= 3;
  }

  available(i) {
    return LEVELS[i].filter((k) => !this.asked.has(k));
  }

  /** Достаточно ли сведений об уровне. */
  isSettled(i) {
    const ans = this.levels[i].answers;
    const n = ans.length;
    if (n === 0) return this.available(i).length === 0;
    if (this.available(i).length === 0) return true;
    const correct = ans.filter((a) => a.correct).length;
    if (n >= 3) return true;
    if (n === 1 && RULE_LEVELS.has(i) && correct === 1) return true;
    if (n === 1 && correct === 0 && ans[0].hard) return true;
    if (n >= 2 && (correct === n || correct === 0)) return true;
    return false;
  }

  /** Вердикт по уровню: known (всё верно и быстро) | slow (всё верно) | partial | unknown | unseen. */
  verdict(i) {
    const ans = this.levels[i].answers;
    if (!ans.length) return 'unseen';
    const correct = ans.filter((a) => a.correct).length;
    if (correct === ans.length) return ans.every(isFluent) ? 'known' : 'slow';
    if (correct > 0) return 'partial';
    return 'unknown';
  }

  chooseLevel() {
    const remaining = this.items - this.answers.length;
    const unseen = [];
    const open = [];
    for (let i = 0; i < LEVELS.length; i++) {
      if (this.isSettled(i)) continue;
      if (this.levels[i].answers.length === 0) unseen.push(i);
      else open.push(i);
    }
    // Бюджет тесный: каждому непроверенному уровню нужен хотя бы один пример.
    if (unseen.length && remaining <= unseen.length) return unseen[0];
    const candidates = [...open, ...unseen].sort((x, y) => x - y);
    if (candidates.length) return candidates[0];
    // Всё выяснено, а примеры остались: подтверждаем пройденные уровни — так вывод
    // о непроверенных фактах надёжнее, а ребёнок решает то, что ему по силам.
    const passed = [];
    for (let i = 0; i < LEVELS.length; i++) {
      const v = this.verdict(i);
      if ((v === 'known' || v === 'slow') && this.available(i).length) passed.push(i);
    }
    passed.sort((x, y) => this.levels[x].answers.length - this.levels[y].answers.length ||
      this.available(y).length - this.available(x).length || x - y);
    if (passed.length) return passed[0];
    // Подтверждать нечего. Если ребёнку трудно — самые лёгкие уровни (×1, ×10), где
    // chooseFact возьмёт самый простой пример; иначе уточняем уровни с одним ответом.
    if (!this.struggling) {
      for (let i = 0; i < LEVELS.length; i++) {
        if (this.levels[i].answers.length === 1 && this.available(i).length) return i;
      }
    }
    for (let i = 0; i < LEVELS.length; i++) if (this.available(i).length) return i;
    return -1;
  }

  chooseFact(i, hard) {
    const avail = this.available(i);
    if (!avail.length) return null;
    const notTwins = avail.filter((k) => !this.asked.has(twinKey(k)));
    const pool = notTwins.length ? notTwins : avail;
    const byProduct = pool.slice().sort((x, y) => {
      const px = parseKey(x); const py = parseKey(y);
      return px.a * px.b - py.a * py.b;
    });
    if (hard) return byProduct[0];
    // Обычно — пример из середины уровня, без самых простых и самых трудных.
    const lo = Math.floor(byProduct.length / 4);
    const hi = Math.max(lo + 1, Math.ceil((byProduct.length * 3) / 4));
    return shuffle(this.rng, byProduct.slice(lo, hi))[0];
  }

  /** Следующий пример или null, если диагностика закончилась. */
  next(now = Date.now()) {
    if (this.isOver(now)) return null;
    const i = this.chooseLevel();
    if (i < 0) return null;
    const hard = this.struggling;
    const k = this.chooseFact(i, hard);
    if (!k) return null;
    this.pending = { k, level: i, hard };
    return k;
  }

  /** Ответ ребёнка. skipped — нажал «Не знаю». */
  answer({ k, correct, ms, skipped = false, given = null, now = Date.now() }) {
    const level = this.pending && this.pending.k === k ? this.pending.level : levelOf(k);
    const a = { k, correct: !!correct && !skipped, ms, skipped, given, at: now, hard: !!(this.pending && this.pending.hard) };
    this.answers.push(a);
    this.asked.add(k);
    this.levels[level].answers.push(a);
    this.pending = null;
  }

  /**
   * Итог: { outcomes: { k: 'known'|'slow'|'wrong' } по заданным примерам,
   *         inferred: { k: 'known'|'slow' } — отмеченные без вопроса, verdicts: [...] }
   */
  result() {
    const outcomes = {};
    for (const a of this.answers) {
      outcomes[a.k] = isFluent(a) ? 'known' : a.correct ? 'slow' : 'wrong';
    }
    const inferred = {};
    const verdicts = LEVELS.map((_, i) => this.verdict(i));
    verdicts.forEach((v, i) => {
      if (v !== 'known' && v !== 'slow') return;
      for (const k of LEVELS[i]) if (!outcomes[k]) inferred[k] = v;
    });
    // Пара верно решённого факта тоже известна (с той же уверенностью).
    for (const [k, o] of Object.entries(outcomes)) {
      const t = twinKey(k);
      if (o !== 'wrong' && !outcomes[t] && inferred[t] !== 'known') inferred[t] = o;
    }
    return { outcomes, inferred, verdicts, answers: this.answers.slice() };
  }
}

/**
 * Применяет итог диагностики к фактам профиля. Верно решённые и выведенные факты
 * отмечаются «знает» (метка src = 'diag': их ещё нужно подтвердить в занятиях,
 * награды за них не выдаются). Коробка зависит от скорости: быстрее 3 с — третья,
 * до 6 с — вторая, медленнее — первая (скорость будем тренировать сразу).
 * Ошибка или «Не знаю» — факт остаётся «новым», чтобы его объяснили.
 */
export function applyPlacement(facts, diag, { now = Date.now(), sid = 'diag' } = {}) {
  const res = diag.result();
  const today = dayKey(now);
  const out = { ...facts };
  for (const a of res.answers) {
    const r = applyAnswer(out[a.k], {
      correct: a.correct, ms: a.ms, fmt: FORMATS.diag, sid, now: a.at || now, given: a.given,
    });
    const o = res.outcomes[a.k];
    if (o === 'wrong') {
      r.intro = 0;
      r.box = 1;
      r.due = '';
      r.streak = 0;
    } else {
      r.streak = Math.max(r.streak, KNOW_STREAK);
      r.box = o === 'slow' ? 1 : a.ms < FAST_MS ? 3 : 2;
      r.due = addDays(today, intervalFor(r.box));
      r.src = 'diag';
    }
    out[a.k] = r;
  }
  for (const [k, how] of Object.entries(res.inferred)) {
    const r = cloneFact(out[k]);
    r.streak = Math.max(r.streak, KNOW_STREAK);
    r.box = how === 'slow' ? 1 : 2;
    r.due = addDays(today, intervalFor(r.box));
    r.intro = r.intro || now;
    r.src = 'diag';
    r.upd = now;
    out[k] = r;
  }
  return { facts: out, result: res };
}
