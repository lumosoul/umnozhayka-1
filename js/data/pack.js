// Компактная двоичная упаковка снимка для текстового кода и QR — без потерь.
// Числа — переменной длины (LEB128), время — разностями от базы, дни — номерами,
// идентификаторы занятий — ссылками на общую таблицу строк. Перед отправкой
// упаковка проверяется распаковкой: если что-то не совпало, используется JSON.

import { ALL_KEYS } from '../core/facts.js';
import { dayNumber, dayFromNumber } from '../core/dates.js';

const MAGIC = [0x55, 0x42]; // «UB»
const TYPES = ['lesson', 'diag', 'blitz'];
const KEY_INDEX = new Map(ALL_KEYS.map((k, i) => [k, i]));

class Writer {
  constructor() { this.b = []; }
  u8(v) {
    if (!Number.isInteger(v) || v < 0 || v > 255) throw new Error('pack: байт вне диапазона');
    this.b.push(v);
  }
  uint(v) {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error('pack: число вне диапазона');
    while (v >= 128) { this.b.push((v % 128) + 128); v = Math.floor(v / 128); }
    this.b.push(v);
  }
  int(v) {
    if (!Number.isSafeInteger(v)) throw new Error('pack: число вне диапазона');
    this.uint(v >= 0 ? v * 2 : -v * 2 - 1);
  }
  str(s) {
    if (typeof s !== 'string') throw new Error('pack: ожидалась строка');
    const bytes = new TextEncoder().encode(s);
    this.uint(bytes.length);
    for (const x of bytes) this.b.push(x);
  }
  /** Время: 0 остаётся 0, остальное — разность с базой. */
  time(t, base) {
    if (t === 0) { this.uint(0); return; }
    this.uint((t - base >= 0 ? (t - base) * 2 : (base - t) * 2 - 1) + 1);
  }
  day(d, baseDay) {
    if (d === '') { this.uint(0); return; }
    const n = dayNumber(d) - baseDay;
    this.uint((n >= 0 ? n * 2 : -n * 2 - 1) + 1);
  }
  bytes() { return new Uint8Array(this.b); }
}

class Reader {
  constructor(bytes) { this.b = bytes; this.i = 0; }
  u8() {
    if (this.i >= this.b.length) throw new Error('pack: данные оборваны');
    return this.b[this.i++];
  }
  uint() {
    let result = 0;
    let mul = 1;
    for (;;) {
      const byte = this.u8();
      result += (byte & 127) * mul;
      if (byte < 128) break;
      mul *= 128;
      if (mul > 2 ** 56) throw new Error('pack: слишком длинное число');
    }
    return result;
  }
  int() {
    const n = this.uint();
    return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
  }
  str() {
    const len = this.uint();
    if (this.i + len > this.b.length) throw new Error('pack: данные оборваны');
    const s = new TextDecoder().decode(this.b.subarray(this.i, this.i + len));
    this.i += len;
    return s;
  }
  time(base) {
    const n = this.uint();
    if (n === 0) return 0;
    const z = n - 1;
    return base + (z % 2 === 0 ? z / 2 : -(z + 1) / 2);
  }
  day(baseDay) {
    const n = this.uint();
    if (n === 0) return '';
    const z = n - 1;
    return dayFromNumber(baseDay + (z % 2 === 0 ? z / 2 : -(z + 1) / 2));
  }
}

/** Упаковывает нормализованный снимок (как после validateSnapshot) в байты. */
export function packSnapshot(snap) {
  const w = new Writer();
  MAGIC.forEach((x) => w.u8(x));
  w.u8(snap.v);
  w.uint(snap.exported);
  const base = snap.exported;
  const baseSec = Math.floor(base / 1000);
  const baseDay = dayNumber(new Date(base).toISOString().slice(0, 10));
  w.uint(baseDay);

  const strings = [];
  const strIndex = new Map();
  const ref = (s) => {
    if (!strIndex.has(s)) { strIndex.set(s, strings.length); strings.push(s); }
    return strIndex.get(s);
  };
  for (const p of snap.profiles) {
    for (const s of p.sessions) ref(s.id);
    for (const f of Object.values(p.facts)) for (const e of f.s) ref(e[1]);
  }
  w.uint(strings.length);
  strings.forEach((s) => w.str(s));

  w.uint(snap.profiles.length);
  for (const p of snap.profiles) {
    w.str(p.id); w.str(p.name); w.str(p.avatar); w.str(p.color);
    w.time(p.created, base); w.time(p.upd, base);
    w.u8(p.diag.done ? 1 : 0); w.time(p.diag.at, base); w.uint(p.diag.known);
    w.uint(p.intros.length); p.intros.forEach((k) => w.u8(k));
    w.u8(p.zero ? 1 : 0);
    const awards = Object.entries(p.awards);
    w.uint(awards.length);
    for (const [id, t] of awards) { w.str(id); w.time(t, base); }
    w.uint(p.blitzBest);

    const facts = Object.entries(p.facts);
    w.uint(facts.length);
    for (const [k, f] of facts) {
      if (f.k !== k || !KEY_INDEX.has(k)) throw new Error('pack: неверный ключ факта');
      w.u8(KEY_INDEX.get(k));
      w.u8(f.box);
      w.day(f.due, baseDay);
      w.uint(f.streak); w.uint(f.n); w.uint(f.ok); w.uint(f.tSum); w.uint(f.slow);
      w.time(f.intro, base); w.time(f.last, base); w.time(f.upd, base);
      w.u8(f.src === 'diag' ? 1 : 0);
      w.uint(f.h.length);
      let prev = baseSec;
      for (const [t, ok, ms, fmt] of f.h) {
        w.int(t - prev);
        prev = t;
        w.u8((ok ? 1 : 0) + fmt * 2);
        w.uint(ms);
      }
      w.uint(f.s.length);
      for (const [d, sid, fast] of f.s) { w.day(d, baseDay); w.uint(ref(sid)); w.u8(fast ? 1 : 0); }
      w.uint(f.wa.length);
      f.wa.forEach((x) => w.uint(x));
    }

    w.uint(p.sessions.length);
    for (const s of p.sessions) {
      w.uint(ref(s.id));
      w.u8(TYPES.indexOf(s.type));
      w.time(s.start, base);
      w.int(s.end - s.start);
      w.day(s.day, baseDay);
      w.uint(s.planned); w.uint(s.answered); w.uint(s.correct); w.uint(s.tSum);
      w.u8(s.stars);
      w.uint(s.newFacts.length);
      s.newFacts.forEach((k) => w.u8(KEY_INDEX.get(k)));
      w.u8(s.done ? 1 : 0);
      w.int(s.upd - s.end);
    }
  }
  return w.bytes();
}

export function unpackSnapshot(bytes) {
  const r = new Reader(bytes);
  if (r.u8() !== MAGIC[0] || r.u8() !== MAGIC[1]) throw new Error('pack: неизвестный формат');
  const v = r.u8();
  const exported = r.uint();
  const base = exported;
  const baseSec = Math.floor(base / 1000);
  const baseDay = r.uint();
  const strings = [];
  for (let n = r.uint(), i = 0; i < n; i++) strings.push(r.str());
  const sref = (i) => {
    if (i >= strings.length) throw new Error('pack: неверная ссылка');
    return strings[i];
  };
  const profiles = [];
  for (let pc = r.uint(), pi = 0; pi < pc; pi++) {
    const p = { id: r.str(), name: r.str(), avatar: r.str(), color: r.str() };
    p.created = r.time(base);
    p.upd = r.time(base);
    p.diag = { done: r.u8() === 1, at: r.time(base), known: r.uint() };
    p.intros = [];
    for (let n = r.uint(), i = 0; i < n; i++) p.intros.push(r.u8());
    p.zero = r.u8() === 1;
    p.awards = {};
    for (let n = r.uint(), i = 0; i < n; i++) { const id = r.str(); p.awards[id] = r.time(base); }
    p.blitzBest = r.uint();
    p.facts = {};
    for (let n = r.uint(), i = 0; i < n; i++) {
      const k = ALL_KEYS[r.u8()];
      if (!k) throw new Error('pack: неверный факт');
      const f = { k, box: r.u8(), due: r.day(baseDay) };
      f.streak = r.uint(); f.n = r.uint(); f.ok = r.uint(); f.tSum = r.uint(); f.slow = r.uint();
      f.intro = r.time(base); f.last = r.time(base); f.upd = r.time(base);
      f.src = r.u8() === 1 ? 'diag' : '';
      f.h = [];
      let prev = baseSec;
      for (let hn = r.uint(), j = 0; j < hn; j++) {
        const t = prev + r.int();
        prev = t;
        const flags = r.u8();
        f.h.push([t, flags & 1, r.uint(), flags >> 1]);
      }
      f.s = [];
      for (let sn = r.uint(), j = 0; j < sn; j++) {
        const d = r.day(baseDay);
        const sid = sref(r.uint());
        f.s.push([d, sid, r.u8() === 1 ? 1 : 0]);
      }
      f.wa = [];
      for (let wn = r.uint(), j = 0; j < wn; j++) f.wa.push(r.uint());
      p.facts[k] = f;
    }
    p.sessions = [];
    for (let n = r.uint(), i = 0; i < n; i++) {
      const s = { id: sref(r.uint()), type: TYPES[r.u8()] || 'lesson' };
      s.start = r.time(base);
      s.end = s.start + r.int();
      s.day = r.day(baseDay);
      s.planned = r.uint(); s.answered = r.uint(); s.correct = r.uint(); s.tSum = r.uint();
      s.stars = r.u8();
      s.newFacts = [];
      for (let m = r.uint(), j = 0; j < m; j++) s.newFacts.push(ALL_KEYS[r.u8()]);
      s.done = r.u8() === 1;
      s.upd = s.end + r.int();
      p.sessions.push(s);
    }
    profiles.push(p);
  }
  if (r.i !== bytes.length) throw new Error('pack: лишние данные');
  return { app: 'umnozhayka', v, exported, profiles };
}

/** Глубокое сравнение (для самопроверки упаковки). */
export function sameData(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameData(a[k], b[k]));
}
