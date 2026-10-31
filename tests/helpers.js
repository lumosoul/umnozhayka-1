// Общие помощники тестов: время, состояния фактов, модель ребёнка, рендер QR в «снимок».

import { ALL_KEYS, completeFacts, applyAnswer, markIntroduced, parseKey } from '../js/core/facts.js';
import { FORMATS } from '../js/core/constants.js';
import { homography } from '../js/lib/qr-decode.js';
import { makeRng } from '../js/core/random.js';

/** Полдень местного времени дня n от 1 октября 2026 (чтобы не зависеть от часовых поясов). */
export const day = (n, hour = 12, minute = 0) => new Date(2026, 9, 1 + n, hour, minute, 0).getTime();

export const emptyFacts = () => completeFacts({});

/** Отвечает на факт: correct, ms, sid, now. */
export function answer(rec, correct, ms, sid, now, fmt = FORMATS.input) {
  return applyAnswer(rec, { correct, ms, fmt, sid, now, given: correct ? null : 1 });
}

/** Делает факт «знает»: введён и 3 верных быстрых ответа в одной сессии. */
export function knowFact(facts, k, now = day(0)) {
  let r = markIntroduced(facts[k], now);
  for (let i = 0; i < 3; i++) r = answer(r, true, 2500, 'setup', now + i * 1000);
  facts[k] = r;
  return r;
}

/** Делает факт «изучается» с ошибками. */
export function weakFact(facts, k, now = day(0)) {
  let r = markIntroduced(facts[k], now);
  r = answer(r, false, 7000, 'setup', now);
  r = answer(r, true, 7500, 'setup', now + 1000);
  r = answer(r, false, 6000, 'setup', now + 2000);
  facts[k] = r;
  return r;
}

export { ALL_KEYS, parseKey, makeRng };

/**
 * Простая модель ребёнка для имитаций: у каждого факта «сила» 0…1. Вероятность
 * верного ответа растёт с силой; каждый показ и разбор ошибки добавляют силы.
 */
export class ChildModel {
  constructor({ known = [], seed = 1 } = {}) {
    this.rng = makeRng(seed);
    this.strength = new Map(ALL_KEYS.map((k) => [k, known.includes(k) ? 0.95 : 0.05]));
  }

  respond(k) {
    const s = this.strength.get(k);
    const correct = this.rng() < 0.15 + 0.83 * s;
    const ms = correct ? 1500 + (1 - s) * 7000 + this.rng() * 800 : 4000 + this.rng() * 5000;
    this.strength.set(k, Math.min(1, s + (correct ? 0.12 : 0.18)));
    return { correct, ms: Math.round(ms) };
  }

  learnFromIntro(k) {
    this.strength.set(k, Math.min(1, this.strength.get(k) + 0.35));
  }
}

/**
 * Рендер матрицы QR в «снимок» яркости с перспективой, шумом и размытием.
 * corners — куда попадают углы кода (с тихой зоной 4 модуля): [tl, tr, br, bl] в пикселях.
 */
export function renderQR(qr, { width, height, corners, noise = 0, blur = 0, gradient = 0, seed = 7, dark = 30, light = 225 }) {
  const rng = makeRng(seed);
  const q = qr.size + 8;
  const toModule = homography(corners, [[0, 0], [q, 0], [q, q], [0, q]]);
  const lum = new Float32Array(width * height);
  const sub = [0.25, 0.75];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (const sy of sub) {
        for (const sx of sub) {
          const [mx, my] = toModule(x + sx, y + sy);
          const ix = Math.floor(mx) - 4;
          const iy = Math.floor(my) - 4;
          let v = light + 10;
          if (mx >= 0 && my >= 0 && mx < q && my < q) {
            v = ix >= 0 && iy >= 0 && ix < qr.size && iy < qr.size && qr.modules[iy * qr.size + ix] ? dark : light;
          }
          acc += v;
        }
      }
      lum[y * width + x] = acc / 4;
    }
  }
  let img = lum;
  for (let pass = 0; pass < blur; pass++) {
    const out = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let s = 0; let c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < width && yy < height) { s += img[yy * width + xx]; c++; }
          }
        }
        out[y * width + x] = s / c;
      }
    }
    img = out;
  }
  const res = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = img[y * width + x];
      v *= 1 - gradient * (x / width);
      v += (rng() - 0.5) * 2 * noise;
      res[y * width + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return { lum: res, width, height };
}

/** Углы квадрата со стороной side с центром (cx, cy), повёрнутого на angle градусов. */
export function rotatedSquare(cx, cy, side, angle) {
  const a = (angle * Math.PI) / 180;
  const h = side / 2;
  return [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [
    cx + x * Math.cos(a) - y * Math.sin(a),
    cy + x * Math.sin(a) + y * Math.cos(a),
  ]);
}
