// Считыватель QR-кодов с изображения (кадр камеры или фото), без сторонних библиотек.
// Этапы: яркость → адаптивная бинаризация → поиск трёх «глазков» (1:1:3:1:1) →
// оценка версии → поиск выравнивающего узора → перспективное преобразование →
// выборка модулей → формат и версия (BCH) → снятие маски → блоки Рида — Соломона
// с исправлением ошибок → разбор сегментов (цифры, буквы-цифры, байты).

import {
  buildFunctionMask, dataModuleOrder, formatBits, versionBits, maskBit, numRawDataModules,
  ECC_CODEWORDS_PER_BLOCK, NUM_ERROR_CORRECTION_BLOCKS, ALNUM_CHARS, MODE, charCountBits,
} from './qr-encode.js';
import { rsCorrect } from './gf256.js';

const ECL_NAMES = ['L', 'M', 'Q', 'H'];

// ---------------------------------------------------------------- матрица → данные

const FORMAT_TABLE = (() => {
  const t = [];
  for (let ecl = 0; ecl < 4; ecl++) for (let mask = 0; mask < 8; mask++) t.push({ bits: formatBits(ecl, mask), ecl, mask });
  return t;
})();
const VERSION_TABLE = (() => {
  const t = [];
  for (let v = 7; v <= 40; v++) t.push({ bits: versionBits(v), v });
  return t;
})();

function popcount(x) {
  let c = 0;
  while (x) { c += x & 1; x >>>= 1; }
  return c;
}

function readFormat(get, size) {
  let a = 0;
  let b = 0;
  for (let i = 0; i <= 5; i++) a |= get(8, i) << i;
  a |= get(8, 7) << 6;
  a |= get(8, 8) << 7;
  a |= get(7, 8) << 8;
  for (let i = 9; i < 15; i++) a |= get(14 - i, 8) << i;
  for (let i = 0; i < 8; i++) b |= get(size - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) b |= get(8, size - 15 + i) << i;
  let best = null;
  let bestD = 99;
  for (const f of FORMAT_TABLE) {
    for (const v of [a, b]) {
      const d = popcount(f.bits ^ v);
      if (d < bestD) { bestD = d; best = f; }
    }
  }
  return bestD <= 3 ? best : null;
}

function readVersion(get, size) {
  let a = 0;
  let b = 0;
  for (let i = 0; i < 18; i++) {
    const x = size - 11 + (i % 3);
    const y = Math.floor(i / 3);
    a |= get(x, y) << i;
    b |= get(y, x) << i;
  }
  let best = null;
  let bestD = 99;
  for (const e of VERSION_TABLE) {
    for (const v of [a, b]) {
      const d = popcount(e.bits ^ v);
      if (d < bestD) { bestD = d; best = e.v; }
    }
  }
  return bestD <= 3 ? best : null;
}

const cache = new Map();
function versionInfo(ver) {
  if (!cache.has(ver)) {
    const fmask = buildFunctionMask(ver);
    cache.set(ver, { order: dataModuleOrder(ver, fmask) });
  }
  return cache.get(ver);
}

class BitReader {
  constructor(bytes) { this.bytes = bytes; this.pos = 0; }
  get left() { return this.bytes.length * 8 - this.pos; }
  read(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.bytes[this.pos >>> 3];
      v = (v << 1) | ((byte >>> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v >>> 0;
  }
}

function parseSegments(bytes, ver) {
  const r = new BitReader(bytes);
  let text = '';
  const raw = [];
  while (r.left >= 4) {
    const mode = r.read(4);
    if (mode === 0) break;
    if (mode === MODE.eci) {
      const first = r.read(8);
      if ((first & 0x80) === 0x80) r.read((first & 0x40) ? 16 : 8);
      continue;
    }
    if (mode === MODE.numeric) {
      let count = r.read(charCountBits(mode, ver));
      while (count >= 3) { text += String(r.read(10)).padStart(3, '0'); count -= 3; }
      if (count === 2) text += String(r.read(7)).padStart(2, '0');
      else if (count === 1) text += String(r.read(4));
    } else if (mode === MODE.alnum) {
      let count = r.read(charCountBits(mode, ver));
      while (count >= 2) {
        const v = r.read(11);
        text += ALNUM_CHARS[Math.floor(v / 45)] + ALNUM_CHARS[v % 45];
        count -= 2;
      }
      if (count === 1) text += ALNUM_CHARS[r.read(6)];
    } else if (mode === MODE.byte) {
      const count = r.read(charCountBits(mode, ver));
      if (count * 8 > r.left) throw new Error('QR: обрыв данных');
      const seg = new Uint8Array(count);
      for (let i = 0; i < count; i++) seg[i] = r.read(8);
      raw.push(...seg);
      text += new TextDecoder('utf-8', { fatal: false }).decode(seg);
    } else if (mode === MODE.kanji) {
      const count = r.read(charCountBits(mode, ver));
      for (let i = 0; i < count; i++) { r.read(13); text += '?'; }
    } else {
      break;
    }
  }
  return { text, bytes: new Uint8Array(raw) };
}

/**
 * Декодирует матрицу модулей. get(x, y) → 1 (тёмный) / 0. size — число модулей по стороне.
 * Возвращает { text, bytes, version, ecl } или { retryVersion } (если версия в коде другая).
 */
export function decodeMatrix(get, size) {
  const ver = (size - 17) / 4;
  if (!Number.isInteger(ver) || ver < 1 || ver > 40) throw new Error('QR: неверный размер');
  const fmt = readFormat(get, size);
  if (!fmt) throw new Error('QR: не прочитан формат');
  if (ver >= 7) {
    const v = readVersion(get, size);
    if (v && v !== ver) return { retryVersion: v };
  }
  const { order } = versionInfo(ver);
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const codewords = new Uint8Array(rawCodewords);
  for (let i = 0; i < rawCodewords * 8; i++) {
    const idx = order[i];
    const x = idx % size;
    const y = (idx - x) / size;
    const bit = get(x, y) ^ (maskBit(fmt.mask, x, y) ? 1 : 0);
    codewords[i >>> 3] |= bit << (7 - (i & 7));
  }
  const ecl = fmt.ecl;
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
  const eccLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const shortDataLen = shortBlockLen - eccLen;
  const padded = Array.from({ length: numBlocks }, () => new Uint8Array(shortBlockLen + 1));
  let k = 0;
  for (let i = 0; i <= shortBlockLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i !== shortDataLen || j >= numShortBlocks) padded[j][i] = codewords[k++];
    }
  }
  const data = [];
  for (let j = 0; j < numBlocks; j++) {
    const dataLen = shortDataLen + (j < numShortBlocks ? 0 : 1);
    const block = new Uint8Array(dataLen + eccLen);
    block.set(padded[j].subarray(0, dataLen), 0);
    block.set(padded[j].subarray(shortDataLen + 1, shortBlockLen + 1), dataLen);
    rsCorrect(block, eccLen);
    for (let i = 0; i < dataLen; i++) data.push(block[i]);
  }
  const seg = parseSegments(new Uint8Array(data), ver);
  return { ...seg, version: ver, ecl: ECL_NAMES[ecl], mask: fmt.mask };
}

// ---------------------------------------------------------------- изображение → матрица

/** RGBA → яркость 0…255. */
export function toLuminance(rgba, width, height) {
  const lum = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    lum[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  }
  return lum;
}

/** Уменьшение изображения в целое число раз усреднением. */
export function downscale(lum, width, height, factor) {
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = new Uint8Array(w * h);
  const area = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = 0; dy < factor; dy++) {
        const row = (y * factor + dy) * width + x * factor;
        for (let dx = 0; dx < factor; dx++) s += lum[row + dx];
      }
      out[y * w + x] = s / area;
    }
  }
  return { lum: out, width: w, height: h };
}

/** Адаптивная бинаризация по блокам 8×8 с порогом по окрестности 5×5 блоков. 1 — тёмный. */
export function binarize(lum, width, height) {
  const R = 8;
  const nx = Math.ceil(width / R);
  const ny = Math.ceil(height / R);
  const black = new Float32Array(nx * ny);
  for (let by = 0; by < ny; by++) {
    for (let bx = 0; bx < nx; bx++) {
      let min = 255;
      let max = 0;
      let sum = 0;
      let cnt = 0;
      for (let y = by * R; y < Math.min(height, by * R + R); y++) {
        for (let x = bx * R; x < Math.min(width, bx * R + R); x++) {
          const v = lum[y * width + x];
          sum += v; cnt++;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      let avg = sum / cnt;
      if (max - min <= 24) {
        avg = min / 2;
        if (by > 0 && bx > 0) {
          const nb = (black[(by - 1) * nx + bx] + 2 * black[by * nx + bx - 1] + black[(by - 1) * nx + bx - 1]) / 4;
          if (min < nb) avg = nb;
        }
      }
      black[by * nx + bx] = avg;
    }
  }
  const bits = new Uint8Array(width * height);
  for (let by = 0; by < ny; by++) {
    for (let bx = 0; bx < nx; bx++) {
      const cx = Math.min(Math.max(bx, 2), Math.max(2, nx - 3));
      const cy = Math.min(Math.max(by, 2), Math.max(2, ny - 3));
      let s = 0;
      let c = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = cx + dx;
          const yy = cy + dy;
          if (xx >= 0 && yy >= 0 && xx < nx && yy < ny) { s += black[yy * nx + xx]; c++; }
        }
      }
      const t = s / c;
      for (let y = by * R; y < Math.min(height, by * R + R); y++) {
        for (let x = bx * R; x < Math.min(width, bx * R + R); x++) {
          bits[y * width + x] = lum[y * width + x] <= t ? 1 : 0;
        }
      }
    }
  }
  return bits;
}

/** Глобальный порог Оцу — запасной способ для ровно освещённых снимков. */
export function binarizeGlobal(lum) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) hist[lum[i]]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0; let wB = 0; let best = 0; let thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = lum.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = t; }
  }
  const bits = new Uint8Array(lum.length);
  for (let i = 0; i < lum.length; i++) bits[i] = lum[i] <= thr ? 1 : 0;
  return bits;
}

function patternOk(sc, varianceDiv = 2) {
  const total = sc[0] + sc[1] + sc[2] + sc[3] + sc[4];
  if (total < 7) return false;
  const ms = total / 7;
  const mv = ms / varianceDiv;
  return Math.abs(ms - sc[0]) < mv && Math.abs(ms - sc[1]) < mv && Math.abs(3 * ms - sc[2]) < 3 * mv &&
    Math.abs(ms - sc[3]) < mv && Math.abs(ms - sc[4]) < mv;
}

const centerFromEnd = (sc, end) => end - sc[4] - sc[3] - sc[2] / 2;

/** Поиск «глазков» — квадратов 1:1:3:1:1. Возвращает центры с оценкой размера модуля. */
export function findFinderPatterns(bits, width, height) {
  const at = (x, y) => bits[y * width + x];
  const centers = [];

  const crossVertical = (startY, cx, maxCount, origTotal) => {
    const sc = [0, 0, 0, 0, 0];
    let y = startY;
    while (y >= 0 && at(cx, y)) { sc[2]++; y--; }
    if (y < 0) return NaN;
    while (y >= 0 && !at(cx, y) && sc[1] <= maxCount) { sc[1]++; y--; }
    if (y < 0 || sc[1] > maxCount) return NaN;
    while (y >= 0 && at(cx, y) && sc[0] <= maxCount) { sc[0]++; y--; }
    if (sc[0] > maxCount) return NaN;
    y = startY + 1;
    while (y < height && at(cx, y)) { sc[2]++; y++; }
    if (y === height) return NaN;
    while (y < height && !at(cx, y) && sc[3] < maxCount) { sc[3]++; y++; }
    if (y === height || sc[3] >= maxCount) return NaN;
    while (y < height && at(cx, y) && sc[4] < maxCount) { sc[4]++; y++; }
    if (sc[4] >= maxCount) return NaN;
    const total = sc[0] + sc[1] + sc[2] + sc[3] + sc[4];
    if (5 * Math.abs(total - origTotal) >= 2 * origTotal) return NaN;
    return patternOk(sc) ? centerFromEnd(sc, y) : NaN;
  };

  const crossHorizontal = (startX, cy, maxCount, origTotal) => {
    const sc = [0, 0, 0, 0, 0];
    let x = startX;
    while (x >= 0 && at(x, cy)) { sc[2]++; x--; }
    if (x < 0) return NaN;
    while (x >= 0 && !at(x, cy) && sc[1] <= maxCount) { sc[1]++; x--; }
    if (x < 0 || sc[1] > maxCount) return NaN;
    while (x >= 0 && at(x, cy) && sc[0] <= maxCount) { sc[0]++; x--; }
    if (sc[0] > maxCount) return NaN;
    x = startX + 1;
    while (x < width && at(x, cy)) { sc[2]++; x++; }
    if (x === width) return NaN;
    while (x < width && !at(x, cy) && sc[3] < maxCount) { sc[3]++; x++; }
    if (x === width || sc[3] >= maxCount) return NaN;
    while (x < width && at(x, cy) && sc[4] < maxCount) { sc[4]++; x++; }
    if (sc[4] >= maxCount) return NaN;
    const total = sc[0] + sc[1] + sc[2] + sc[3] + sc[4];
    if (5 * Math.abs(total - origTotal) >= origTotal) return NaN;
    return patternOk(sc) ? centerFromEnd(sc, x) : NaN;
  };

  const crossDiagonal = (cy, cx) => {
    const sc = [0, 0, 0, 0, 0];
    let i = 0;
    while (cy >= i && cx >= i && at(cx - i, cy - i)) { sc[2]++; i++; }
    if (!sc[2]) return false;
    while (cy >= i && cx >= i && !at(cx - i, cy - i)) { sc[1]++; i++; }
    if (!sc[1]) return false;
    while (cy >= i && cx >= i && at(cx - i, cy - i)) { sc[0]++; i++; }
    if (!sc[0]) return false;
    i = 1;
    while (cy + i < height && cx + i < width && at(cx + i, cy + i)) { sc[2]++; i++; }
    while (cy + i < height && cx + i < width && !at(cx + i, cy + i)) { sc[3]++; i++; }
    if (!sc[3]) return false;
    while (cy + i < height && cx + i < width && at(cx + i, cy + i)) { sc[4]++; i++; }
    if (!sc[4]) return false;
    return patternOk(sc, 1.333);
  };

  const handle = (sc, y, xEnd) => {
    const total = sc[0] + sc[1] + sc[2] + sc[3] + sc[4];
    let cx = centerFromEnd(sc, xEnd);
    const cy = crossVertical(y, Math.floor(cx), sc[2], total);
    if (Number.isNaN(cy)) return false;
    cx = crossHorizontal(Math.floor(cx), Math.floor(cy), sc[2], total);
    if (Number.isNaN(cx)) return false;
    if (!crossDiagonal(Math.floor(cy), Math.floor(cx))) return false;
    const ms = total / 7;
    for (const c of centers) {
      if (Math.abs(cy - c.y) <= ms && Math.abs(cx - c.x) <= ms) {
        const diff = Math.abs(ms - c.ms);
        if (diff <= 1 || diff <= c.ms) {
          const n = c.count;
          c.x = (c.x * n + cx) / (n + 1);
          c.y = (c.y * n + cy) / (n + 1);
          c.ms = (c.ms * n + ms) / (n + 1);
          c.count = n + 1;
          return true;
        }
      }
    }
    centers.push({ x: cx, y: cy, ms, count: 1 });
    return true;
  };

  const step = height > 600 ? 2 : 1;
  for (let y = 0; y < height; y += step) {
    const sc = [0, 0, 0, 0, 0];
    let state = 0;
    for (let x = 0; x < width; x++) {
      if (at(x, y)) {
        if (state & 1) state++;
        sc[state]++;
      } else if (!(state & 1)) {
        if (state === 4) {
          if (patternOk(sc) && handle(sc, y, x)) {
            state = 0;
            sc.fill(0);
          } else {
            sc[0] = sc[2]; sc[1] = sc[3]; sc[2] = sc[4]; sc[3] = 1; sc[4] = 0;
            state = 3;
          }
        } else {
          sc[++state]++;
        }
      } else {
        sc[state]++;
      }
    }
    if (state === 4 && patternOk(sc)) handle(sc, y, width);
  }
  return centers;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Упорядочивает три центра: [нижний левый, верхний левый, верхний правый]. */
export function orderPatterns(p) {
  const d01 = dist(p[0], p[1]);
  const d12 = dist(p[1], p[2]);
  const d02 = dist(p[0], p[2]);
  let A; let B; let C;
  if (d12 >= d01 && d12 >= d02) { B = p[0]; A = p[1]; C = p[2]; }
  else if (d02 >= d12 && d02 >= d01) { B = p[1]; A = p[0]; C = p[2]; }
  else { B = p[2]; A = p[0]; C = p[1]; }
  const cross = (C.x - B.x) * (A.y - B.y) - (C.y - B.y) * (A.x - B.x);
  if (cross < 0) [A, C] = [C, A];
  return { bl: A, tl: B, tr: C };
}

/** Лучшие тройки «глазков» (по похожести размеров и прямому углу). */
function rankTriples(centers) {
  const cands = centers.slice().sort((a, b) => b.count - a.count).slice(0, 14);
  const out = [];
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      for (let k = j + 1; k < cands.length; k++) {
        const t = [cands[i], cands[j], cands[k]];
        const sizes = t.map((c) => c.ms);
        const ratio = Math.max(...sizes) / Math.min(...sizes);
        if (ratio > 1.6) continue;
        const o = orderPatterns(t);
        const a = dist(o.tl, o.tr);
        const b = dist(o.tl, o.bl);
        const c = dist(o.bl, o.tr);
        const ms = (sizes[0] + sizes[1] + sizes[2]) / 3;
        if (a < 10 * ms || b < 10 * ms) continue;
        const side = Math.abs(a - b) / Math.max(a, b);
        const hyp = Math.abs(c - Math.hypot(a, b)) / c;
        if (side > 0.5 || hyp > 0.25) continue;
        const score = side + hyp * 2 + (ratio - 1) - Math.min(t[0].count, t[1].count, t[2].count) * 0.001;
        out.push({ ...o, ms, score });
      }
    }
  }
  return out.sort((x, y) => x.score - y.score).slice(0, 4);
}

/** Длина пути от центра «глазка» до его внешнего края вдоль направления (u — единичный вектор). */
function runToEdge(bits, width, height, x0, y0, ux, uy, limit) {
  let state = 0;
  for (let t = 0; t < limit; t += 0.5) {
    const x = Math.round(x0 + ux * t);
    const y = Math.round(y0 + uy * t);
    if (x < 0 || y < 0 || x >= width || y >= height) return NaN;
    const dark = bits[y * width + x];
    if (state === 0 && !dark) state = 1;
    else if (state === 1 && dark) state = 2;
    else if (state === 2 && !dark) return t;
  }
  return NaN;
}

function moduleSizeAlong(bits, width, height, a, b, fallback) {
  const d = dist(a, b);
  const ux = (b.x - a.x) / d;
  const uy = (b.y - a.y) / d;
  const lim = fallback * 8;
  const s1 = runToEdge(bits, width, height, a.x, a.y, ux, uy, lim);
  const s2 = runToEdge(bits, width, height, a.x, a.y, -ux, -uy, lim);
  if (Number.isNaN(s1) || Number.isNaN(s2)) return NaN;
  return (s1 + s2) / 7;
}

/** Решение 8×8 для перспективного преобразования по 4 парам точек (u, v) → (x, y). */
export function homography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i];
    const [x, y] = dst[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return (u, v) => {
    const den = h[6] * u + h[7] * v + 1;
    return [(h[0] * u + h[1] * v + h[2]) / den, (h[3] * u + h[4] * v + h[5]) / den];
  };
}

/**
 * Кандидаты в выравнивающий узор 5×5: сопоставление с шаблоном в окрестности
 * ожидаемой точки. При сильной перспективе узор бывает в 10–15 модулях от оценки,
 * а рядом могут оказаться соседние узоры, поэтому возвращаем несколько кандидатов —
 * правильный выберет проверка Рида — Соломона.
 */
function findAlignmentCandidates(bits, width, height, est, vx, vy, maxModules = 18) {
  const ms = (Math.hypot(vx.x, vx.y) + Math.hypot(vy.x, vy.y)) / 2;
  const rad = Math.ceil(maxModules * ms);
  const offs = [];
  for (let j = -2; j <= 2; j++) {
    for (let i = -2; i <= 2; i++) {
      offs.push([i * vx.x + j * vy.x, i * vx.y + j * vy.y, Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0]);
    }
  }
  const clusters = [];
  const y0 = Math.max(0, Math.round(est.y - rad));
  const y1 = Math.min(height - 1, Math.round(est.y + rad));
  const x0 = Math.max(0, Math.round(est.x - rad));
  const x1 = Math.min(width - 1, Math.round(est.x + rad));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      if (!bits[py * width + px]) continue;
      let score = 0;
      let miss = 0;
      for (const [dx, dy, expect] of offs) {
        const xi = Math.round(px + dx);
        const yi = Math.round(py + dy);
        const v = xi >= 0 && yi >= 0 && xi < width && yi < height ? bits[yi * width + xi] : 0;
        if (v === expect) score++;
        else if (++miss > 3) break;
      }
      if (score < 22) continue;
      const w = (score - 21) * (score - 21);
      let c = null;
      for (const cl of clusters) {
        if (Math.abs(cl.x - px) <= 1.5 * ms && Math.abs(cl.y - py) <= 1.5 * ms) { c = cl; break; }
      }
      if (!c) {
        clusters.push({ sx: px * w, sy: py * w, w, x: px, y: py, best: score });
      } else {
        c.sx += px * w; c.sy += py * w; c.w += w;
        c.x = c.sx / c.w; c.y = c.sy / c.w;
        c.best = Math.max(c.best, score);
      }
    }
  }
  return clusters
    .sort((a, b) => b.best - a.best || Math.hypot(a.x - est.x, a.y - est.y) - Math.hypot(b.x - est.x, b.y - est.y))
    .slice(0, 5)
    .sort((a, b) => Math.hypot(a.x - est.x, a.y - est.y) - Math.hypot(b.x - est.x, b.y - est.y));
}

function sampleAndDecode(bits, width, height, map, dim) {
  const grid = new Uint8Array(dim * dim);
  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const [px, py] = map(x + 0.5, y + 0.5);
      const xi = Math.round(px);
      const yi = Math.round(py);
      grid[y * dim + x] = xi >= 0 && yi >= 0 && xi < width && yi < height ? bits[yi * width + xi] : 0;
    }
  }
  for (const transpose of [false, true]) {
    const get = transpose ? (x, y) => grid[x * dim + y] : (x, y) => grid[y * dim + x];
    try {
      return decodeMatrix(get, dim);
    } catch (e) {
      // пробуем следующий вариант
    }
  }
  return null;
}

function tryDecodeAt(bits, width, height, o, dim) {
  const ver = (dim - 17) / 4;
  const span = dim - 7;
  const vx = { x: (o.tr.x - o.tl.x) / span, y: (o.tr.y - o.tl.y) / span };
  const vy = { x: (o.bl.x - o.tl.x) / span, y: (o.bl.y - o.tl.y) / span };
  const src = [[3.5, 3.5], [dim - 3.5, 3.5], [3.5, dim - 3.5]];
  const dst = [[o.tl.x, o.tl.y], [o.tr.x, o.tr.y], [o.bl.x, o.bl.y]];
  const br = { x: o.tr.x - o.tl.x + o.bl.x, y: o.tr.y - o.tl.y + o.bl.y };
  const variants = [];
  if (ver >= 2) {
    const corr = 1 - 3 / span;
    const est = { x: o.tl.x + corr * (br.x - o.tl.x), y: o.tl.y + corr * (br.y - o.tl.y) };
    for (const ap of findAlignmentCandidates(bits, width, height, est, vx, vy)) {
      variants.push([[dim - 6.5, dim - 6.5], [ap.x, ap.y]]);
    }
  }
  variants.push([[dim - 3.5, dim - 3.5], [br.x, br.y]]);
  for (const [s4, d4] of variants) {
    const map = homography([...src, s4], [...dst, d4]);
    if (!map) continue;
    const res = sampleAndDecode(bits, width, height, map, dim);
    if (res) return res;
  }
  return null;
}

function decodeBits(bits, width, height) {
  const centers = findFinderPatterns(bits, width, height);
  if (centers.length < 3) return null;
  for (const o of rankTriples(centers)) {
    let ms = o.ms;
    const sizes = [
      moduleSizeAlong(bits, width, height, o.tl, o.tr, ms),
      moduleSizeAlong(bits, width, height, o.tr, o.tl, ms),
      moduleSizeAlong(bits, width, height, o.tl, o.bl, ms),
      moduleSizeAlong(bits, width, height, o.bl, o.tl, ms),
    ].filter((s) => Number.isFinite(s) && s > 0);
    if (sizes.length) ms = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const a = Math.round(dist(o.tl, o.tr) / ms);
    const b = Math.round(dist(o.tl, o.bl) / ms);
    let dim = Math.floor((a + b) / 2) + 7;
    const r = dim & 3;
    if (r === 0) dim += 1;
    else if (r === 2) dim -= 1;
    else if (r === 3) dim += 2;
    const tried = new Set();
    const queue = [dim, dim + 4, dim - 4, dim + 8, dim - 8];
    while (queue.length) {
      const d = queue.shift();
      if (d < 21 || d > 177 || tried.has(d)) continue;
      tried.add(d);
      const res = tryDecodeAt(bits, width, height, o, d);
      if (!res) continue;
      if (res.retryVersion) { queue.unshift(17 + 4 * res.retryVersion); continue; }
      return res;
    }
  }
  return null;
}

/**
 * Распознаёт QR на изображении.
 * img: { data: RGBA, width, height } (ImageData) или { lum, width, height }.
 * Возвращает { text, bytes, version, ecl } или null.
 */
export function decodeQR(img) {
  let lum = img.lum || toLuminance(img.data, img.width, img.height);
  let width = img.width;
  let height = img.height;
  const scales = [];
  let base = { lum, width, height };
  if (width * height > 1600 * 1200) base = downscale(lum, width, height, 2);
  scales.push(base);
  if (base.width * base.height > 400 * 300) scales.push(downscale(base.lum, base.width, base.height, 2));
  for (const s of scales) {
    ({ lum, width, height } = s);
    for (const method of [binarize, binarizeGlobal]) {
      const bits = method === binarize ? binarize(lum, width, height) : binarizeGlobal(lum);
      const res = decodeBits(bits, width, height);
      if (res) return res;
    }
  }
  return null;
}
