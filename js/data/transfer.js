// Перенос прогресса тремя способами: JSON-файл, текстовый код Base64 с CRC-32 и
// серия QR-кодов со сжатыми данными. Все три несут один и тот же снимок данных,
// поэтому перенос без потерь. При импорте проверяется версия формата, готовится
// план (что добавится и что перезапишется) и данные объединяются: по каждому факту
// остаётся более свежая запись.

import { APP_ID, FORMAT_VERSION, MAX_PROFILES, COLUMN_ORDER, HISTORY_LIMIT, SESS_LIMIT, WRONG_LIMIT, BOX_MAX } from '../core/constants.js';
import { ALL_KEYS, isValidKey, newFact } from '../core/facts.js';
import { AWARDS } from '../core/rewards.js';
import { makeId } from '../core/random.js';
import {
  utf8Encode, utf8Decode, bytesToBase64, base64ToBytes, crc32Hex, base45Encode, base45Decode, canCompress, deflate, inflate,
} from '../lib/codec.js';
import { packSnapshot, unpackSnapshot, sameData } from './pack.js';

export class ImportError extends Error {}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
};
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Снимок для экспорта: профили со всеми фактами (изменёнными) и журналом занятий. */
export function buildSnapshot(profiles, now = Date.now()) {
  return {
    app: APP_ID,
    v: FORMAT_VERSION,
    exported: now,
    profiles: profiles.map(({ profile, facts, sessions }) => ({
      ...profile,
      facts: Object.fromEntries(ALL_KEYS.filter((k) => facts[k] && facts[k].upd).map((k) => [k, facts[k]])),
      sessions: sessions.slice(),
    })),
  };
}

function sanitizeFact(f, k) {
  const base = newFact(k);
  if (!f || typeof f !== 'object') return base;
  const arr = (a, limit, width) => (Array.isArray(a) ? a.filter((e) => Array.isArray(e) && e.length >= width).slice(-limit) : []);
  return {
    ...base,
    box: num(f.box, 1, BOX_MAX),
    due: DAY_RE.test(f.due) ? f.due : '',
    streak: num(f.streak, 0, 100000),
    n: num(f.n),
    ok: Math.min(num(f.ok), num(f.n)),
    tSum: num(f.tSum),
    slow: num(f.slow),
    h: arr(f.h, HISTORY_LIMIT, 4).map((e) => [num(e[0]), e[1] ? 1 : 0, num(e[2]), num(e[3], 0, 9)]),
    s: arr(f.s, SESS_LIMIT, 3).filter((e) => DAY_RE.test(e[0])).map((e) => [e[0], str(String(e[1]), 40), e[2] ? 1 : 0]),
    wa: (Array.isArray(f.wa) ? f.wa : []).map((x) => num(x, 0, 1000)).slice(-WRONG_LIMIT),
    intro: num(f.intro),
    src: f.src === 'diag' ? 'diag' : '',
    last: num(f.last),
    upd: num(f.upd),
  };
}

function sanitizeSession(s) {
  if (!s || typeof s !== 'object' || !str(s.id, 40) || !DAY_RE.test(s.day)) return null;
  return {
    id: str(s.id, 40),
    type: ['lesson', 'diag', 'blitz'].includes(s.type) ? s.type : 'lesson',
    start: num(s.start),
    end: num(s.end),
    day: s.day,
    planned: num(s.planned, 0, 100),
    answered: num(s.answered, 0, 1000),
    correct: Math.min(num(s.correct, 0, 1000), num(s.answered, 0, 1000)),
    tSum: num(s.tSum),
    stars: num(s.stars, 0, 3),
    newFacts: (Array.isArray(s.newFacts) ? s.newFacts : []).filter(isValidKey).slice(0, 10),
    done: !!s.done,
    upd: num(s.upd),
  };
}

function sanitizeProfile(p) {
  if (!p || typeof p !== 'object') throw new ImportError('В данных повреждён профиль.');
  const facts = {};
  if (p.facts && typeof p.facts === 'object') {
    for (const [k, f] of Object.entries(p.facts)) if (isValidKey(k)) facts[k] = sanitizeFact(f, k);
  }
  const awards = {};
  if (p.awards && typeof p.awards === 'object') {
    for (const [id, t] of Object.entries(p.awards)) if (AWARDS[id]) awards[id] = num(t);
  }
  return {
    id: str(p.id, 40) || makeId('p_'),
    name: str(p.name, 24).trim() || 'Ученик',
    avatar: str(p.avatar, 8) || '🦉',
    color: /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : '#2f6fdb',
    created: num(p.created),
    upd: num(p.upd),
    diag: {
      done: !!(p.diag && p.diag.done),
      at: num(p.diag && p.diag.at),
      known: num(p.diag && p.diag.known, 0, 100),
    },
    intros: (Array.isArray(p.intros) ? p.intros : []).map(Number).filter((k) => COLUMN_ORDER.includes(k)),
    zero: !!p.zero,
    awards,
    blitzBest: num(p.blitzBest, 0, 1000),
    facts,
    sessions: (Array.isArray(p.sessions) ? p.sessions : []).map(sanitizeSession).filter(Boolean).slice(-5000),
  };
}

/** Миграции старых форматов (пока формат один). */
function migrate(obj) {
  return obj;
}

/** Проверяет и нормализует снимок. Бросает ImportError с понятным сообщением. */
export function validateSnapshot(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new ImportError('Это не сохранение Умножайки.');
  }
  if (obj.app !== APP_ID) throw new ImportError('Это не сохранение Умножайки.');
  if (!Number.isInteger(obj.v) || obj.v < 1) throw new ImportError('В сохранении не указана версия формата.');
  if (obj.v > FORMAT_VERSION) {
    throw new ImportError(`Сохранение сделано в более новой версии приложения (формат ${obj.v}, здесь ${FORMAT_VERSION}). Обнови приложение на этом устройстве.`);
  }
  const data = obj.v < FORMAT_VERSION ? migrate(obj) : obj;
  if (!Array.isArray(data.profiles)) throw new ImportError('В сохранении нет профилей.');
  if (!data.profiles.length) throw new ImportError('В сохранении нет ни одного профиля.');
  return {
    app: APP_ID,
    v: FORMAT_VERSION,
    exported: num(data.exported),
    profiles: data.profiles.slice(0, 16).map(sanitizeProfile),
  };
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function mergeFactMaps(localFacts, incomingFacts) {
  const facts = {};
  let fromIncoming = 0;
  let keptLocal = 0;
  for (const k of ALL_KEYS) {
    const a = localFacts[k];
    const b = incomingFacts[k];
    if (!b || !b.upd) { if (a) facts[k] = a; continue; }
    if (!a || !a.upd) { facts[k] = b; fromIncoming++; continue; }
    if (b.upd > a.upd || (b.upd === a.upd && b.n > a.n)) { facts[k] = b; fromIncoming++; }
    else { facts[k] = a; if (b.upd < a.upd) keptLocal++; }
  }
  return { facts, fromIncoming, keptLocal };
}

function mergeSessions(local, incoming) {
  const map = new Map(local.map((s) => [s.id, s]));
  let added = 0;
  for (const s of incoming) {
    const cur = map.get(s.id);
    if (!cur) { map.set(s.id, s); added++; }
    else if (s.upd > cur.upd) map.set(s.id, s);
  }
  return { sessions: [...map.values()].sort((a, b) => a.start - b.start), added };
}

/**
 * План импорта. local — [{ profile, facts, sessions }] на этом устройстве.
 * Профили сопоставляются сначала по идентификатору (тот же профиль, возможно
 * переименованный), затем оставшиеся — по имени. Добавляемый профиль с занятым
 * идентификатором получает новый, чтобы не затереть чужие данные.
 * Возвращает { actions: [{ type: 'add'|'merge'|'skip', name, ... }], overwrites }.
 */
export function planImport(local, snapshot) {
  const incoming = snapshot.profiles;
  const matchOf = new Map();
  const taken = new Set();
  incoming.forEach((inc, i) => {
    const byId = local.find((l) => !taken.has(l.profile.id) && l.profile.id === inc.id);
    if (byId) { matchOf.set(i, byId); taken.add(byId.profile.id); }
  });
  incoming.forEach((inc, i) => {
    if (matchOf.has(i)) return;
    const byName = local.find((l) => !taken.has(l.profile.id) && sameName(l.profile.name, inc.name));
    if (byName) { matchOf.set(i, byName); taken.add(byName.profile.id); }
  });
  const usedIds = new Set(local.map((l) => l.profile.id));
  let slots = MAX_PROFILES - local.length;
  const actions = [];
  incoming.forEach((inc, i) => {
    const match = matchOf.get(i);
    if (match) {
      const m = mergeFactMaps(match.facts, inc.facts);
      const s = mergeSessions(match.sessions, inc.sessions);
      actions.push({
        type: 'merge', name: match.profile.name, localId: match.profile.id, incoming: inc,
        factsFromFile: m.fromIncoming, factsKept: m.keptLocal, sessionsAdded: s.added,
      });
    } else if (slots > 0) {
      slots--;
      const profile = usedIds.has(inc.id) ? { ...inc, id: makeId('p_') } : inc;
      usedIds.add(profile.id);
      actions.push({ type: 'add', name: inc.name, incoming: profile, facts: Object.keys(inc.facts).length, sessionsAdded: inc.sessions.length });
    } else {
      actions.push({ type: 'skip', name: inc.name, incoming: inc, reason: `на устройстве уже ${MAX_PROFILES} профиля` });
    }
  });
  const overwrites = actions.filter((a) => a.type === 'merge' && a.factsFromFile > 0).length;
  return { actions, overwrites };
}

/** Объединённые данные профиля по плану. Возвращает [{ profile, facts, sessions }] для сохранения. */
export function applyImport(local, plan) {
  const out = [];
  for (const a of plan.actions) {
    const inc = a.incoming;
    const { facts: incFacts, sessions: incSessions, ...incProfile } = inc;
    if (a.type === 'add') {
      out.push({ profile: incProfile, facts: incFacts, sessions: incSessions });
    } else if (a.type === 'merge') {
      const cur = local.find((l) => l.profile.id === a.localId);
      const p = cur.profile;
      const newer = incProfile.upd > p.upd ? incProfile : p;
      const awards = { ...incProfile.awards };
      for (const [id, t] of Object.entries(p.awards || {})) awards[id] = awards[id] ? Math.min(awards[id], t) : t;
      const profile = {
        ...p,
        name: newer.name,
        avatar: newer.avatar,
        color: newer.color || p.color,
        upd: Math.max(p.upd, incProfile.upd),
        diag: {
          done: p.diag.done || incProfile.diag.done,
          at: Math.max(p.diag.at, incProfile.diag.at),
          known: newer.diag.known,
        },
        intros: [...new Set([...p.intros, ...incProfile.intros])],
        zero: p.zero || incProfile.zero,
        awards,
        blitzBest: Math.max(p.blitzBest || 0, incProfile.blitzBest || 0),
      };
      const { facts } = mergeFactMaps(cur.facts, incFacts);
      const { sessions } = mergeSessions(cur.sessions, incSessions);
      out.push({ profile, facts, sessions });
    }
  }
  return out;
}

// ---------------------------------------------------------------- кодирование

// Первый байт полезной нагрузки — способ упаковки:
// 0 — JSON, 1 — JSON + deflate, 2 — двоичная упаковка, 3 — двоичная + deflate.
const METHOD = { json: 0, jsonZ: 1, bin: 2, binZ: 3 };

/** Байты для кода и QR: двоичная упаковка (если она точно обратима) и сжатие. */
export async function snapshotPayload(snapshot) {
  let body;
  let bin = false;
  try {
    body = packSnapshot(snapshot);
    if (!sameData(unpackSnapshot(body), snapshot)) throw new Error('упаковка неточна');
    bin = true;
  } catch (e) {
    body = utf8Encode(JSON.stringify(snapshot));
  }
  const z = canCompress();
  const data = z ? await deflate(body) : body;
  const out = new Uint8Array(data.length + 1);
  out[0] = bin ? (z ? METHOD.binZ : METHOD.bin) : (z ? METHOD.jsonZ : METHOD.json);
  out.set(data, 1);
  return out;
}

export async function payloadToSnapshot(payload) {
  if (!payload.length) throw new ImportError('Пустые данные.');
  const method = payload[0];
  let body = payload.subarray(1);
  if (method === METHOD.jsonZ || method === METHOD.binZ) {
    if (!canCompress()) throw new ImportError('Этот браузер не умеет распаковывать данные. Обнови браузер.');
    try { body = await inflate(body); } catch (e) { throw new ImportError('Не удалось распаковать данные: они повреждены.'); }
  } else if (method !== METHOD.json && method !== METHOD.bin) {
    throw new ImportError('Неизвестный способ упаковки. Возможно, данные из более новой версии приложения.');
  }
  let obj;
  try {
    obj = method === METHOD.bin || method === METHOD.binZ ? unpackSnapshot(body) : JSON.parse(utf8Decode(body));
  } catch (e) {
    throw new ImportError('Данные повреждены.');
  }
  return validateSnapshot(obj);
}

export function snapshotToFileText(snapshot) {
  return JSON.stringify(snapshot, null, 1);
}

export function fileTextToSnapshot(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new ImportError('Файл повреждён или это не файл Умножайки.'); }
  return validateSnapshot(obj);
}

/** Текстовый код: UMN<версия>.<Base64 сжатых данных>.<CRC-32>. */
export async function snapshotToCode(snapshot) {
  const payload = await snapshotPayload(snapshot);
  return `UMN${FORMAT_VERSION}.${bytesToBase64(payload)}.${crc32Hex(payload)}`;
}

export async function codeToSnapshot(code) {
  const clean = String(code || '').replace(/\s+/g, '');
  const m = /^UMN(\d+)\.([A-Za-z0-9+/]+=*)\.([0-9A-Fa-f]{8})$/.exec(clean);
  if (!m) throw new ImportError('Это не похоже на код Умножайки. Проверь, что код скопирован целиком.');
  if (Number(m[1]) > FORMAT_VERSION) {
    throw new ImportError('Код создан в более новой версии приложения. Обнови приложение на этом устройстве.');
  }
  let payload;
  try { payload = base64ToBytes(m[2]); } catch (e) { throw new ImportError('Код повреждён.'); }
  if (crc32Hex(payload) !== m[3].toUpperCase()) {
    throw new ImportError('Контрольная сумма не совпала: код повреждён или скопирован не полностью.');
  }
  return payloadToSnapshot(payload);
}

/** Сколько байтов сжатых данных кладём в один QR (версия 19, уровень M — уверенно читается камерой 720p). */
export const QR_CHUNK_BYTES = 560;
const QR_RE = /^UQ(\d+):([0-9A-Z]{4}):(\d+):(\d+):([0-9A-F]{8}):([\s\S]*)$/;

/** Серия QR-строк: UQ<версия>:<id передачи>:<номер>:<всего>:<CRC всех данных>:<Base45 части>. */
export async function snapshotToQRTexts(snapshot, chunkBytes = QR_CHUNK_BYTES, rng = Math.random) {
  const payload = await snapshotPayload(snapshot);
  const crc = crc32Hex(payload);
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let tid = '';
  for (let i = 0; i < 4; i++) tid += alphabet[Math.floor(rng() * alphabet.length)];
  const total = Math.max(1, Math.ceil(payload.length / chunkBytes));
  const out = [];
  for (let i = 0; i < total; i++) {
    const part = payload.subarray(i * chunkBytes, (i + 1) * chunkBytes);
    out.push(`UQ${FORMAT_VERSION}:${tid}:${i + 1}:${total}:${crc}:${base45Encode(part)}`);
  }
  return out;
}

/** Собирает части серии QR в любом порядке. */
export class QRCollector {
  constructor() { this.reset(); }

  reset() {
    this.tid = null;
    this.total = 0;
    this.crc = '';
    this.parts = new Map();
  }

  get got() { return this.parts.size; }
  get complete() { return this.total > 0 && this.parts.size === this.total; }

  /** Добавляет распознанный текст. Возвращает { status, got, total, error }. */
  add(text) {
    const m = QR_RE.exec(String(text || ''));
    if (!m) return { status: 'foreign', got: this.got, total: this.total };
    if (Number(m[1]) > FORMAT_VERSION) {
      return { status: 'error', error: 'QR-код из более новой версии приложения. Обнови приложение.', got: this.got, total: this.total };
    }
    const [, , tid, idxS, totalS, crc, data] = m;
    const idx = Number(idxS);
    const total = Number(totalS);
    if (!total || idx < 1 || idx > total) return { status: 'foreign', got: this.got, total: this.total };
    if (this.tid !== tid || this.crc !== crc || this.total !== total) {
      this.reset();
      this.tid = tid;
      this.crc = crc;
      this.total = total;
    }
    if (this.parts.has(idx)) return { status: 'duplicate', got: this.got, total };
    let bytes;
    try { bytes = base45Decode(data); } catch (e) { return { status: 'foreign', got: this.got, total }; }
    this.parts.set(idx, bytes);
    return { status: this.complete ? 'complete' : 'added', got: this.got, total };
  }

  /** Номера частей, которых ещё нет. */
  missing() {
    const out = [];
    for (let i = 1; i <= this.total; i++) if (!this.parts.has(i)) out.push(i);
    return out;
  }

  async snapshot() {
    if (!this.complete) throw new ImportError('Считаны не все QR-коды.');
    const size = [...this.parts.values()].reduce((s, b) => s + b.length, 0);
    const payload = new Uint8Array(size);
    let off = 0;
    for (let i = 1; i <= this.total; i++) { payload.set(this.parts.get(i), off); off += this.parts.get(i).length; }
    if (crc32Hex(payload) !== this.crc) throw new ImportError('Контрольная сумма не совпала. Отсканируй коды ещё раз.');
    return payloadToSnapshot(payload);
  }
}
