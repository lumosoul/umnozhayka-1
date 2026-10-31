// Состояние приложения поверх IndexedDB: профили, факты и журнал занятий текущего
// профиля. Каждый ответ сохраняется сразу, поэтому прогресс переживает перезагрузку
// и закрытие вкладки посреди занятия.

import * as db from './db.js';
import {
  completeFacts, applyAnswer, markIntroduced, ALL_KEYS, statusCounts,
} from '../core/facts.js';
import { newProfile } from '../core/profile.js';
import { applyPlacement } from '../core/diagnostic.js';
import { sessionStars, newAwards } from '../core/rewards.js';
import { dayKey } from '../core/dates.js';
import { makeId } from '../core/random.js';
import { MAX_PROFILES, TIME_CAP_MS } from '../core/constants.js';
import { buildSnapshot, planImport, applyImport, validateSnapshot } from './transfer.js';

class Store {
  constructor() {
    this.profiles = [];
    this.sound = true;
    this.lastProfile = null;
    this.current = null;
    this.now = () => Date.now();
    this.channel = null;
  }

  async init() {
    this.profiles = await db.getProfiles();
    const sound = await db.getMeta('sound');
    this.sound = sound === undefined ? true : !!sound;
    this.lastProfile = (await db.getMeta('lastProfile')) || null;
    // Если приложение открыто в двух вкладках, вторая подхватывает изменения первой,
    // чтобы не записать поверх них устаревшие данные.
    if (typeof BroadcastChannel === 'function') {
      this.channel = new BroadcastChannel('umnozhayka');
      this.channel.onmessage = () => { this.reloadFromDb().catch(() => {}); };
    }
  }

  notify() {
    if (this.channel) this.channel.postMessage({ t: Date.now() });
  }

  /** Перечитывает данные из базы (изменения из другой вкладки), сохраняя живые объекты занятий. */
  async reloadFromDb() {
    const profiles = await db.getProfiles();
    for (const p of profiles) {
      const mine = this.profiles.find((x) => x.id === p.id);
      if (mine) Object.assign(mine, p);
    }
    this.profiles = profiles.map((p) => this.profiles.find((x) => x.id === p.id) || p);
    if (!this.current || !this.profiles.some((p) => p.id === this.current.profile.id)) return;
    const id = this.current.profile.id;
    const [facts, sessions] = await Promise.all([db.getFacts(id), db.getSessions(id)]);
    const live = new Map(this.current.sessions.map((x) => [x.id, x]));
    this.current.facts = completeFacts(facts);
    this.current.sessions = sessions.map((x) => (live.has(x.id) && live.get(x.id).upd >= x.upd ? live.get(x.id) : x));
    for (const x of live.values()) if (!this.current.sessions.includes(x)) this.current.sessions.push(x);
  }

  /**
   * Просим браузер не удалять данные при нехватке места. Не ждём ответа: Firefox
   * показывает вопрос и не отвечает, пока пользователь не нажмёт кнопку.
   */
  requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      // браузер может отказать — данные всё равно сохраняются
    }
  }

  get canAddProfile() { return this.profiles.length < MAX_PROFILES; }

  async setSound(on) {
    this.sound = !!on;
    await db.setMeta('sound', this.sound);
  }

  async createProfile({ name, avatar }) {
    if (!this.canAddProfile) throw new Error(`Можно создать не больше ${MAX_PROFILES} профилей`);
    this.requestPersistence();
    const p = newProfile({ name, avatar, now: this.now(), index: this.profiles.length });
    await db.putProfile(p);
    this.profiles.push(p);
    this.notify();
    return p;
  }

  async selectProfile(id) {
    const profile = this.profiles.find((p) => p.id === id);
    if (!profile) throw new Error('Профиль не найден');
    const [facts, sessions] = await Promise.all([db.getFacts(id), db.getSessions(id)]);
    this.current = { profile, facts: completeFacts(facts), sessions };
    this.lastProfile = id;
    await db.setMeta('lastProfile', id);
    return this.current;
  }

  leaveProfile() { this.current = null; }

  async updateProfile(patch) {
    const p = this.current.profile;
    Object.assign(p, patch, { upd: this.now() });
    await db.putProfile(p);
    this.notify();
    return p;
  }

  async renameProfile(id, name, avatar) {
    const p = this.profiles.find((x) => x.id === id);
    p.name = String(name).trim().slice(0, 24) || p.name;
    if (avatar) p.avatar = avatar;
    p.upd = this.now();
    await db.putProfile(p);
    this.notify();
  }

  async deleteProfile(id) {
    await db.deleteProfile(id);
    this.profiles = this.profiles.filter((p) => p.id !== id);
    if (this.current && this.current.profile.id === id) this.current = null;
    if (this.lastProfile === id) { this.lastProfile = null; await db.setMeta('lastProfile', null); }
    this.notify();
  }

  /** Сброс прогресса профиля: имя и аватар остаются, остальное — с нуля (снова диагностика). */
  async resetProfile(id) {
    const p = this.profiles.find((x) => x.id === id);
    Object.assign(p, {
      diag: { done: false, at: 0, known: 0 }, intros: [], zero: false, awards: {}, blitzBest: 0, upd: this.now(),
    });
    await db.replaceProfileData(p, {}, []);
    if (this.current && this.current.profile.id === id) await this.selectProfile(id);
    this.notify();
  }

  async loadProfileData(id) {
    if (this.current && this.current.profile.id === id) return this.current;
    const profile = this.profiles.find((p) => p.id === id);
    const [facts, sessions] = await Promise.all([db.getFacts(id), db.getSessions(id)]);
    return { profile, facts: completeFacts(facts), sessions };
  }

  // ---------------------------------------------------------- занятия

  async startSession(type, planned = 0) {
    const now = this.now();
    const s = {
      id: makeId('s_'), type, start: now, end: now, day: dayKey(now), planned,
      answered: 0, correct: 0, tSum: 0, stars: 0, newFacts: [], done: false, upd: now,
    };
    this.current.sessions.push(s);
    await db.putSession(this.current.profile.id, s);
    return s;
  }

  /** Записывает ответ: обновляет факт (история, точность, время, серия, Лейтнер) и журнал. */
  async recordAnswer(session, k, { correct, ms, fmt, given = null }) {
    const now = this.now();
    const rec = applyAnswer(this.current.facts[k], { correct, ms, fmt, sid: session.id, now, given });
    this.current.facts[k] = rec;
    session.answered += 1;
    if (correct) session.correct += 1;
    session.tSum += Math.min(Math.round(ms), TIME_CAP_MS);
    session.end = now;
    session.upd = now;
    const pid = this.current.profile.id;
    await Promise.all([db.putFacts(pid, [rec]), db.putSession(pid, session)]);
    this.notify();
    return rec;
  }

  /** Факт показан на карточке «Новый пример». */
  async introduce(session, k) {
    const now = this.now();
    const rec = markIntroduced(this.current.facts[k], now);
    this.current.facts[k] = rec;
    if (!session.newFacts.includes(k)) session.newFacts.push(k);
    session.upd = now;
    const pid = this.current.profile.id;
    await Promise.all([db.putFacts(pid, [rec]), db.putSession(pid, session)]);
    this.notify();
  }

  async markIntroSeen(column) {
    const p = this.current.profile;
    if (!p.intros.includes(column)) await this.updateProfile({ intros: [...p.intros, column] });
  }

  async markZeroSeen() {
    await this.updateProfile({ zero: true });
  }

  /** Завершение занятия: звёзды и новые награды. */
  async finishSession(session, { retries = 0, retriesSolved = 0 } = {}) {
    const now = this.now();
    session.done = true;
    session.end = now;
    session.upd = now;
    session.stars = session.type === 'diag' ? 0 : sessionStars({ answered: session.answered, correct: session.correct, retries, retriesSolved });
    await db.putSession(this.current.profile.id, session);
    this.notify();
    const awards = await this.collectAwards();
    return { stars: session.stars, awards };
  }

  async collectAwards() {
    const p = this.current.profile;
    const ids = newAwards(this.current.facts, this.current.sessions, p.awards, dayKey(this.now()));
    if (ids.length) {
      const awards = { ...p.awards };
      for (const id of ids) awards[id] = this.now();
      await this.updateProfile({ awards });
    }
    return ids;
  }

  async saveBlitzBest(score) {
    if (score > (this.current.profile.blitzBest || 0)) {
      await this.updateProfile({ blitzBest: score });
      return true;
    }
    return false;
  }

  /** Итог диагностики: отмечает известные факты и закрывает диагностику. */
  async applyDiagnostic(diag, session) {
    const now = this.now();
    const before = this.current.facts;
    const { facts, result } = applyPlacement(before, diag, { now, sid: session.id });
    const changed = ALL_KEYS.filter((k) => facts[k] !== before[k]).map((k) => facts[k]);
    this.current.facts = facts;
    for (const a of result.answers) {
      session.answered += 1;
      if (a.correct) session.correct += 1;
      session.tSum += Math.min(Math.round(a.ms), TIME_CAP_MS);
    }
    session.done = true;
    session.end = now;
    session.upd = now;
    const c = statusCounts(facts);
    const profile = this.current.profile;
    Object.assign(profile, { diag: { done: true, at: now, known: c.know + c.auto }, upd: now });
    // Факты, занятие и отметка «знакомство пройдено» — одной транзакцией.
    await db.putBatch(profile, changed, [session]);
    this.notify();
    return { result, counts: c };
  }

  // ---------------------------------------------------------- перенос

  async allProfileData(ids = null) {
    const list = [];
    for (const p of this.profiles) {
      if (ids && !ids.includes(p.id)) continue;
      list.push(await this.loadProfileData(p.id));
    }
    return list;
  }

  /** Снимок для переноса в нормализованном виде (таком же, какой получится после импорта). */
  async exportSnapshot(ids = null) {
    return validateSnapshot(buildSnapshot(await this.allProfileData(ids), this.now()));
  }

  async prepareImport(snapshot) {
    const local = await this.allProfileData();
    return { plan: planImport(local, snapshot), local };
  }

  async commitImport({ plan, local }) {
    const merged = applyImport(local, plan);
    for (const { profile, facts, sessions } of merged) {
      await db.replaceProfileData(profile, completeFacts(facts), sessions);
    }
    this.profiles = await db.getProfiles();
    if (this.current) {
      const id = this.current.profile.id;
      if (this.profiles.some((p) => p.id === id)) await this.selectProfile(id);
      else this.current = null;
    }
    this.notify();
    return merged.length;
  }
}

export const store = new Store();
