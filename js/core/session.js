// Сборка занятия: 20 заданий примерно на 10 минут, из них 70 % — новые и слабые
// факты (ошибки, медленные ответы), 30 % — повторение по Лейтнеру. Новых фактов
// не больше трёх; каждый показывается несколько раз с промежутками.
// LessonQueue ведёт занятие: после ошибки возвращает пример через 2–3 задания.

import {
  SESSION_TASKS, SESSION_FOCUS_SHARE, STATUS, RETRY_GAP_MIN, RETRY_GAP_MAX, COLUMN_ORDER,
} from './constants.js';
import { ALL_KEYS, factStatus, weakness, columnOf } from './facts.js';
import { isDue } from './leitner.js';
import { pickNewFacts, newFactsAllowance, frontierLevel, isLevelIntroduced, isWeak } from './curriculum.js';
import { randInt, shuffle } from './random.js';

const NEW_OCCURRENCES = 3;

/**
 * Пулы фактов для занятия.
 * weak — изучаемые и любые факты со слабостью ≥ 2 или в первой коробке (по убыванию слабости);
 * dueReview — освоенные, у которых наступил день показа по Лейтнеру (самые просроченные первыми);
 * freeReview — остальные освоенные (давно не встречавшиеся первыми) — только чтобы добрать занятие.
 */
export function sessionPools(facts, today) {
  const introduced = ALL_KEYS.filter((k) => factStatus(facts[k]) !== STATUS.NEW);
  const weak = [];
  const rest = [];
  for (const k of introduced) {
    const f = facts[k];
    const w = weakness(f);
    if (isWeak(f) || f.box === 1) weak.push({ k, w });
    else rest.push(k);
  }
  weak.sort((x, y) => y.w - x.w || x.k.localeCompare(y.k));
  const due = rest.filter((k) => isDue(facts[k], today))
    .sort((x, y) => (facts[x].due || '').localeCompare(facts[y].due || '') || facts[x].box - facts[y].box);
  const notDue = rest.filter((k) => !isDue(facts[k], today))
    .sort((x, y) => (facts[x].last || 0) - (facts[y].last || 0));
  return { weak: weak.map((x) => x.k), dueReview: due, freeReview: notDue };
}

/**
 * Собирает план занятия.
 * opts: { today, rng, total = 20, maxNew, introsSeen = [], zeroSeen = false }
 * Возвращает { tasks: [{ k, kind, first }], newFacts, introColumns, zeroRule }.
 */
export function buildSession(facts, opts) {
  const { today, rng } = opts;
  const total = opts.total || SESSION_TASKS;
  const focusSlots = Math.round(total * SESSION_FOCUS_SHARE);
  const reviewSlots = total - focusSlots;
  const maxNew = opts.maxNew !== undefined ? opts.maxNew : newFactsAllowance(facts);
  const newFacts = pickNewFacts(facts, maxNew);
  const { weak, dueReview, freeReview } = sessionPools(facts, today);

  const count = new Map();
  const tokens = [];
  const add = (k, kind) => {
    count.set(k, (count.get(k) || 0) + 1);
    tokens.push({ k, kind });
  };
  const used = (k) => count.get(k) || 0;

  const room = () => tokens.length < total;

  // 1. Новые факты: по три показа.
  for (const k of newFacts) for (let i = 0; i < NEW_OCCURRENCES; i++) add(k, 'new');
  // 2. Слабые факты — по одному разу, по убыванию слабости, пока не заполнены 70 %.
  for (const k of weak) {
    if (tokens.length >= focusSlots) break;
    add(k, 'weak');
  }
  // 3. Повторение (30 %): освоенные факты, у которых наступил день показа.
  let review = 0;
  for (const k of dueReview) {
    if (review >= reviewSlots || !room()) break;
    add(k, 'review');
    review++;
  }
  // 4. Свободные места: сначала ещё показы слабых (до трёх), потом четвёртый показ новых,
  //    потом остальные факты с наступившим днём показа, и только затем — остальные освоенные.
  for (let round = 2; round <= 3 && room(); round++) {
    for (const k of weak) if (room() && used(k) < round) add(k, 'weak');
  }
  for (const k of newFacts) if (room() && used(k) < NEW_OCCURRENCES + 1) add(k, 'new');
  for (const k of dueReview) if (room() && !used(k)) add(k, 'review');
  for (const k of freeReview) if (room() && !used(k)) add(k, 'review');
  // 5. Фактов совсем мало (первые занятия): добираем повторами, не больше 7 показов на факт.
  for (let round = 2; round <= 7 && room(); round++) {
    for (const k of [...weak, ...newFacts]) if (room() && used(k) < round) add(k, newFacts.includes(k) ? 'new' : 'weak');
    for (const k of [...dueReview, ...freeReview]) if (room() && used(k) < Math.min(round, 2)) add(k, 'review');
  }

  const tasks = arrange(tokens, newFacts, rng);

  const introsSeen = new Set(opts.introsSeen || []);
  const introColumns = [];
  for (const k of newFacts) {
    const c = columnOf(k);
    if (!introsSeen.has(c) && !introColumns.includes(c)) introColumns.push(c);
  }
  const level1Ready = isLevelIntroduced(facts, 0) || introsSeen.has(1);
  const zeroRule = !opts.zeroSeen && introColumns.length === 0 && level1Ready;

  return { tasks, newFacts, introColumns, zeroRule, frontier: COLUMN_ORDER[frontierLevel(facts)] || null };
}

/**
 * Раскладывает задания по позициям: новые факты стартуют на 2-м, 6-м, 10-м местах
 * и повторяются через 5; повторение начинается с разминки; один и тот же факт
 * не идёт два раза подряд (стараемся оставить между показами два задания).
 */
export function arrange(tokens, newFacts, rng) {
  const n = tokens.length;
  if (!n) return [];
  const placed = [];
  const newIdx = new Map(newFacts.map((k, i) => [k, i]));
  const occ = new Map();
  const others = shuffle(rng, tokens.filter((t) => t.kind !== 'new'));
  const reviewFirst = others.findIndex((t) => t.kind === 'review');
  if (reviewFirst > 0) others.unshift(others.splice(reviewFirst, 1)[0]);

  for (const t of tokens.filter((x) => x.kind === 'new')) {
    const j = occ.get(t.k) || 0;
    occ.set(t.k, j + 1);
    placed.push({ ...t, target: 1 + newIdx.get(t.k) * 4 + j * 5 + rng() * 0.1, first: j === 0 });
  }
  others.forEach((t, i) => {
    const target = others.length === 1 ? 0 : (i * (n - 1)) / (others.length - 1);
    placed.push({ ...t, target: i === 0 ? -1 : target + (rng() - 0.5) * 1.5, first: false });
  });
  placed.sort((x, y) => x.target - y.target);
  const seq = placed.map(({ k, kind, first }) => ({ k, kind, first }));
  return spreadRepeats(seq);
}

/** Переставляет задания так, чтобы между показами одного факта было хотя бы два других. */
export function spreadRepeats(seq, minGap = 2) {
  const out = seq.slice();
  for (let i = 1; i < out.length; i++) {
    const clash = (idx, t) => {
      for (let d = 1; d <= minGap; d++) if (idx - d >= 0 && out[idx - d].k === t.k) return true;
      return false;
    };
    if (!clash(i, out[i])) continue;
    for (let j = i + 1; j < out.length; j++) {
      const cand = out[j];
      if (clash(i, cand)) continue;
      // Первый показ нового факта не должен уходить позже следующих его показов.
      if (cand.kind === 'new' && !cand.first && !out.slice(0, i).some((x) => x.k === cand.k)) continue;
      if (out[i].first && out.slice(i + 1, j + 1).some((x) => x.k === out[i].k)) continue;
      [out[i], out[j]] = [out[j], out[i]];
      break;
    }
  }
  // Флаг «первый показ» должен стоять у самого раннего показа каждого нового факта.
  const seen = new Set();
  for (const t of out) {
    if (t.kind === 'new') {
      t.first = !seen.has(t.k);
      seen.add(t.k);
    }
  }
  return out;
}

/**
 * Очередь заданий занятия. План — список заданий; после ошибки пример ставится
 * в ожидание и возвращается ровно через 2–3 показанных задания (счётчиком, а не
 * позицией в списке, поэтому другие вставки его не сдвигают). Ближайшие плановые
 * показы этого же примера заменяет повтор, один и тот же пример не идёт два раза
 * подряд, а чтобы занятие не росло, лишнее убирается из хвоста плана.
 */
export class LessonQueue {
  constructor(tasks, { rng, fillers = [], maxRetries = 2 } = {}) {
    this.plan = tasks.map((t) => ({ ...t }));
    this.served = [];
    this.pending = [];
    this.rng = rng || Math.random;
    this.planned = this.plan.length;
    this.fillers = fillers.slice();
    this.retries = new Map();
    this.maxRetries = maxRetries;
    this.maxTotal = this.planned + 6;
    this.cur = null;
    this.pickNext();
  }

  get current() { return this.cur; }
  get done() { return !this.cur; }
  /** Сколько заданий уже решено (номер текущего, считая с нуля). */
  get index() { return this.served.length; }
  /** Сколько всего заданий в занятии с учётом повторов. */
  get total() { return this.served.length + (this.cur ? 1 : 0) + this.plan.length + this.pending.length; }

  advance() {
    if (this.cur) this.served.push(this.cur);
    this.pickNext();
    return this.cur;
  }

  /** Выбирает следующее задание: сначала повтор, чей срок наступил, затем план. */
  pickNext() {
    const s = this.served.length;
    const prev = s ? this.served[s - 1].k : null;
    // Текущее задание уже перенесено в показанные, поэтому считаем без него.
    const used = () => this.served.length + this.plan.length + this.pending.length;
    const due = this.pending.filter((p) => p.due <= s).sort((x, y) => x.due - y.due);
    const ready = due.find((p) => p.k !== prev);
    if (ready) {
      this.pending.splice(this.pending.indexOf(ready), 1);
      this.cur = { k: ready.k, kind: 'retry', first: false };
      return;
    }
    // План кончился, а повтор ещё не подошёл — вставляем «прокладку», чтобы он пришёл в срок.
    if (!this.plan.length && this.pending.length) {
      const next = this.pending.reduce((x, y) => (y.due < x.due ? y : x));
      const f = used() < this.maxTotal ? this.nextFiller(next.k, prev) : null;
      if (f) this.plan.push({ k: f, kind: 'review', first: false });
      else { this.pending.splice(this.pending.indexOf(next), 1); this.cur = { k: next.k, kind: 'retry', first: false }; return; }
    }
    // Пока повтор примера ждёт своей очереди, плановые показы этого примера откладываются.
    const waiting = new Set(this.pending.map((p) => p.k));
    const seen = (k) => this.served.some((t) => t.k === k);
    const order = (t) => t.kind !== 'new' || t.first || seen(t.k);
    let j = this.plan.findIndex((t) => t.k !== prev && !waiting.has(t.k) && order(t));
    if (j < 0) {
      // Свободных примеров нет: ожидающий повтор можно дать чуть раньше срока,
      // если после ошибки уже прошло хотя бы два задания.
      const early = this.pending.filter((p) => p.k !== prev && s - p.from - 1 >= RETRY_GAP_MIN).sort((x, y) => x.due - y.due)[0];
      if (early) {
        this.pending.splice(this.pending.indexOf(early), 1);
        this.cur = { k: early.k, kind: 'retry', first: false };
        return;
      }
      j = this.plan.findIndex((t) => t.k !== prev && order(t));
    }
    if (j < 0 && this.plan.length && prev) {
      // В плане остался только тот же пример, что был сейчас: ставим другой между ними
      // или убираем лишний показ, чтобы не показывать пример два раза подряд.
      const f = used() < this.maxTotal ? this.nextFiller(prev, prev) : null;
      if (f) {
        this.cur = { k: f, kind: 'review', first: false };
        return;
      }
      this.plan = this.plan.filter((t) => t.k !== prev || t.first);
      j = this.plan.findIndex(order);
    }
    if (j < 0) j = 0;
    this.cur = this.plan.length ? this.plan.splice(j, 1)[0] : null;
  }

  /**
   * Пример для «прокладки»: сначала освоенные факты не из плана, а если их нет
   * (первые занятия) — другие примеры этого занятия, давно не встречавшиеся.
   */
  nextFiller(k, avoid = null) {
    for (let i = 0; i < this.fillers.length; i++) {
      if (this.fillers[i] !== k && this.fillers[i] !== avoid) return this.fillers.splice(i, 1)[0];
    }
    const lastSeen = new Map();
    this.served.forEach((t, i) => lastSeen.set(t.k, i));
    for (const t of this.plan) if (!lastSeen.has(t.k)) lastSeen.set(t.k, Infinity);
    const options = [...lastSeen.entries()].filter(([f]) => f !== k && f !== avoid).sort((x, y) => x[1] - y[1]);
    return options.length ? options[0][0] : null;
  }

  /** Повтор примера k через 2–3 задания после текущего. Возвращает номер задания-повтора или -1. */
  scheduleRetry(k) {
    const old = this.pending.find((p) => p.k === k);
    const n = this.retries.get(k) || 0;
    if (n >= this.maxRetries && !old) return -1;
    const s = this.served.length; // номер текущего задания
    // Повтор этого примера уже ждёт — не заводим второй, а переносим его срок от новой ошибки.
    this.pending = this.pending.filter((p) => p !== old);
    const busy = new Set(this.pending.map((p) => p.due));
    let gap = randInt(this.rng, RETRY_GAP_MIN, RETRY_GAP_MAX);
    // В самом конце занятия хватит и двух заданий-«прокладок»: так занятие короче.
    if (this.plan.length + this.pending.length < RETRY_GAP_MAX) gap = RETRY_GAP_MIN;
    if (busy.has(s + 1 + gap)) gap = gap === RETRY_GAP_MIN ? RETRY_GAP_MAX : RETRY_GAP_MIN;
    while (busy.has(s + 1 + gap)) gap++;
    // Ближайшие плановые показы этого же примера заменяет повтор.
    this.plan = this.plan.filter((t, i) => !(t.k === k && !t.first && i <= gap));
    // Место под повтор и «прокладку» в конце занятия — в пределах потолка длины.
    if (this.total + 1 > this.maxTotal) this.dropFromTail();
    let room = this.maxTotal - this.total - 1;
    while (this.plan.length + this.pending.length < gap && room > 0) {
      const last = this.plan.length ? this.plan[this.plan.length - 1].k : this.cur && this.cur.k;
      const f = this.nextFiller(k, last);
      if (!f) break;
      this.plan.push({ k: f, kind: 'review', first: false });
      room--;
    }
    const ahead = this.plan.length + this.pending.length;
    if (ahead < RETRY_GAP_MIN || this.total + 1 > this.maxTotal) {
      // Места для повтора через два задания нет (очень много ошибок в конце занятия):
      // разбор ошибки уже был, пример вернётся в следующем занятии.
      if (old) this.pending.push(old);
      return -1;
    }
    if (!old) this.retries.set(k, n + 1);
    const due = s + 1 + Math.min(gap, ahead);
    this.pending.push({ k, due, from: s });
    // Длина занятия: лишнее — из хвоста плана, недостачу добираем.
    while (this.total > this.planned && this.plan.length + this.pending.length - 1 > gap && this.dropFromTail()) { /* по одному */ }
    while (this.total < this.planned) {
      const last = this.plan.length ? this.plan[this.plan.length - 1].k : null;
      const f = this.nextFiller(k, last);
      if (!f) break;
      this.plan.push({ k: f, kind: 'review', first: false });
    }
    return due;
  }

  /** Убирает одно задание из хвоста плана: повторение, затем слабое, затем лишний показ нового. */
  dropFromTail() {
    const count = (k) => this.served.filter((t) => t.k === k).length + this.plan.filter((t) => t.k === k).length +
      (this.cur && this.cur.k === k ? 1 : 0);
    for (const kind of ['review', 'weak', 'new']) {
      for (let j = this.plan.length - 1; j >= 1; j--) {
        const t = this.plan[j];
        if (t.kind !== kind || t.first) continue;
        if (kind === 'new' && count(t.k) <= 3) continue;
        this.plan.splice(j, 1);
        return true;
      }
    }
    return false;
  }
}
