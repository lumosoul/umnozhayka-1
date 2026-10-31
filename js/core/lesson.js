// Движок занятия и блица без интерфейса: что показать дальше (правило нуля,
// объяснение столбца, карточка нового факта, задание), проверка ответа и повтор
// после ошибки. Интерфейс только рисует шаги, а тесты гоняют тот же код с моделью ребёнка.

import { BLITZ_MS, RETRY_GAP_MIN, RETRY_GAP_MAX, STATUS } from './constants.js';
import { ALL_KEYS, factStatus, columnOf, isMastered } from './facts.js';
import { buildSession, LessonQueue } from './session.js';
import { chooseFormat, makeQuestion, isCorrect, wrongProduct } from './choices.js';
import { blitzPool, nextBlitzFact } from './blitz.js';
import { shuffle, randInt } from './random.js';

export class Lesson {
  constructor({ facts, profile, today, rng }) {
    this.rng = rng;
    this.plan = buildSession(facts, { today, rng, introsSeen: profile.intros, zeroSeen: profile.zero });
    const inPlan = new Set(this.plan.tasks.map((t) => t.k));
    const fillers = shuffle(rng, ALL_KEYS.filter((k) => isMastered(facts[k]) && !inPlan.has(k)));
    this.queue = new LessonQueue(this.plan.tasks, { rng, fillers });
    this.zeroPending = this.plan.zeroRule;
    this.introsPending = new Set(this.plan.introColumns);
    this.prevFmt = null;
    this.retries = 0;
    this.retriesSolved = 0;
    this.current = null;
  }

  get done() { return this.queue.done; }
  get index() { return this.queue.index; }
  get total() { return this.queue.total; }

  /** Следующий шаг: { type: 'zero' | 'column' | 'fact' | 'task' | 'end', ... }. */
  next(facts) {
    if (this.zeroPending) return { type: 'zero' };
    const t = this.queue.current;
    if (!t) return { type: 'end' };
    if (t.kind === 'new' && t.first && factStatus(facts[t.k]) === STATUS.NEW) {
      const column = columnOf(t.k);
      if (this.introsPending.has(column)) return { type: 'column', column, k: t.k };
      return { type: 'fact', k: t.k };
    }
    const fmt = chooseFormat(factStatus(facts[t.k]), { prev: this.prevFmt, first: t.first, rng: this.rng });
    const q = makeQuestion(t.k, fmt, this.rng);
    q.kind = t.kind;
    this.current = q;
    return { type: 'task', question: q };
  }

  ackZero() { this.zeroPending = false; }
  ackColumn(column) { this.introsPending.delete(column); }

  /** Проверяет ответ на текущее задание; при ошибке планирует повтор через 2–3 задания. */
  answer(value) {
    const q = this.current;
    const correct = isCorrect(q, value);
    this.prevFmt = q.fmt;
    if (q.kind === 'retry' && correct) this.retriesSolved += 1;
    let retryAt = -1;
    if (!correct) {
      retryAt = this.queue.scheduleRetry(q.k);
      if (retryAt >= 0) this.retries += 1;
    }
    return { correct, given: wrongProduct(q, value), retryAt };
  }

  advance() {
    this.current = null;
    this.queue.advance();
  }
}

/** Блиц на 60 секунд по освоенным фактам; после ошибки пример возвращается через 2–3 задания. */
export class Blitz {
  constructor({ facts, rng, durationMs = BLITZ_MS }) {
    this.rng = rng;
    this.pool = blitzPool(facts);
    this.recent = [];
    this.retryQueue = [];
    this.asked = 0;
    this.correct = 0;
    this.durationMs = durationMs;
    this.current = null;
  }

  next(facts) {
    let k = null;
    const due = this.retryQueue.findIndex((r) => r.at <= this.asked);
    if (due >= 0) k = this.retryQueue.splice(due, 1)[0].k;
    else k = nextBlitzFact(facts, this.pool, this.recent, this.rng);
    this.recent.push(k);
    if (this.recent.length > 6) this.recent.shift();
    this.current = makeQuestion(k, 'input', this.rng);
    return this.current;
  }

  answer(value) {
    const q = this.current;
    const correct = isCorrect(q, value);
    this.asked += 1;
    if (correct) this.correct += 1;
    else this.retryQueue.push({ k: q.k, at: this.asked + randInt(this.rng, RETRY_GAP_MIN, RETRY_GAP_MAX) });
    return { correct, given: wrongProduct(q, value) };
  }
}
