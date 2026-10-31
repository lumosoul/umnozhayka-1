// Генератор QR-кодов (ISO/IEC 18004): режимы цифровой, буквенно-цифровой и байтовый,
// версии 1–40, уровни коррекции L/M/Q/H, выбор маски по штрафам стандарта.
// Возвращает матрицу модулей: 1 — тёмный, 0 — светлый.

import { rsDivisor, rsRemainder } from './gf256.js';

export const ECL = { L: 0, M: 1, Q: 2, H: 3 };
const ECL_FORMAT_BITS = [1, 0, 3, 2];

// Число проверочных байтов в блоке и число блоков для [уровень][версия].
export const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
export const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

export const ALNUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
export const MODE = { numeric: 0x1, alnum: 0x2, byte: 0x4, kanji: 0x8, eci: 0x7 };

export const sizeOf = (ver) => ver * 4 + 17;

/** Число модулей под данные (с коррекцией) в версии. */
export function numRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

/** Число байтов данных (без проверочных) для версии и уровня коррекции. */
export function numDataCodewords(ver, ecl) {
  return Math.floor(numRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
}

/** Центры выравнивающих узоров (по одной оси). */
export function alignmentPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = sizeOf(ver) - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

export function charCountBits(mode, ver) {
  const i = ver <= 9 ? 0 : ver <= 26 ? 1 : 2;
  if (mode === MODE.numeric) return [10, 12, 14][i];
  if (mode === MODE.alnum) return [9, 11, 13][i];
  if (mode === MODE.byte) return [8, 16, 16][i];
  return [8, 10, 12][i];
}

function appendBits(bits, val, len) {
  for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
}

/** Сегмент данных: строка → самый плотный подходящий режим; Uint8Array → байтовый. */
export function makeSegment(data) {
  const bits = [];
  if (data instanceof Uint8Array) {
    for (const b of data) appendBits(bits, b, 8);
    return { mode: MODE.byte, count: data.length, bits };
  }
  const s = String(data);
  if (/^[0-9]*$/.test(s)) {
    for (let i = 0; i < s.length; i += 3) {
      const chunk = s.substr(i, 3);
      appendBits(bits, parseInt(chunk, 10), chunk.length * 3 + 1);
    }
    return { mode: MODE.numeric, count: s.length, bits };
  }
  if ([...s].every((c) => ALNUM_CHARS.includes(c))) {
    for (let i = 0; i + 1 < s.length; i += 2) {
      appendBits(bits, ALNUM_CHARS.indexOf(s[i]) * 45 + ALNUM_CHARS.indexOf(s[i + 1]), 11);
    }
    if (s.length % 2) appendBits(bits, ALNUM_CHARS.indexOf(s[s.length - 1]), 6);
    return { mode: MODE.alnum, count: s.length, bits };
  }
  const bytes = new TextEncoder().encode(s);
  for (const b of bytes) appendBits(bits, b, 8);
  return { mode: MODE.byte, count: bytes.length, bits };
}

/** Модули служебных узоров версии (1 — служебный модуль). Нужна и считывателю. */
export function buildFunctionMask(ver) {
  const size = sizeOf(ver);
  const mask = new Uint8Array(size * size);
  const set = (x, y) => { if (x >= 0 && y >= 0 && x < size && y < size) mask[y * size + x] = 1; };
  for (let i = 0; i < size; i++) { set(6, i); set(i, 6); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) set(cx + dx, cy + dy);
  }
  const al = alignmentPositions(ver);
  const na = al.length;
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy);
    }
  }
  // Формат: вокруг левого верхнего искателя и у двух других.
  for (let i = 0; i <= 8; i++) { set(8, i); set(i, 8); }
  for (let i = 0; i < 8; i++) { set(size - 1 - i, 8); set(8, size - 1 - i); }
  if (ver >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b);
      set(b, a);
    }
  }
  return mask;
}

export function maskBit(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: throw new Error('Неверная маска');
  }
}

/** 15 бит формата (уровень + маска + BCH + XOR 0x5412). */
export function formatBits(ecl, mask) {
  const data = (ECL_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18 бит версии (для версий 7–40). */
export function versionBits(ver) {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

/** Разбивка на блоки, добавление проверочных байтов и перемежение. */
export function addEccAndInterleave(data, ver, ecl) {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const blocks = [];
  const div = rsDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = Array.from(data.slice(k, k + len));
    k += len;
    const ecc = rsRemainder(dat, div);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(Array.from(ecc)));
  }
  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

/** Порядок обхода модулей данных «змейкой» (общий для генератора и считывателя). */
export function dataModuleOrder(ver, fmask = buildFunctionMask(ver)) {
  const size = sizeOf(ver);
  const order = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fmask[y * size + x]) order.push(y * size + x);
      }
    }
  }
  return order;
}

function penaltyScore(m, size) {
  let result = 0;
  const addHistory = (run, hist) => {
    if (hist[0] === 0) run += size;
    hist.pop();
    hist.unshift(run);
  };
  const countPatterns = (h) => {
    const n = h[1];
    const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
    return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
  };
  const terminate = (color, run, hist) => {
    if (color) { addHistory(run, hist); run = 0; }
    run += size;
    addHistory(run, hist);
    return countPatterns(hist);
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      let runColor = 0;
      let run = 0;
      const hist = [0, 0, 0, 0, 0, 0, 0];
      for (let b = 0; b < size; b++) {
        const c = pass === 0 ? m[a * size + b] : m[b * size + a];
        if (c === runColor) {
          run++;
          if (run === 5) result += 3;
          else if (run > 5) result++;
        } else {
          addHistory(run, hist);
          if (!runColor) result += countPatterns(hist) * 40;
          runColor = c;
          run = 1;
        }
      }
      result += terminate(runColor, run, hist) * 40;
    }
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m[y * size + x];
      if (c === m[y * size + x + 1] && c === m[(y + 1) * size + x] && c === m[(y + 1) * size + x + 1]) result += 3;
    }
  }
  let dark = 0;
  for (let i = 0; i < m.length; i++) dark += m[i];
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * 10;
  return result;
}

/**
 * Кодирует данные в QR.
 * opts: { ecl: 'L'|'M'|'Q'|'H', minVersion, maxVersion, mask (−1 — автоматически) }
 * Возвращает { version, size, ecl, mask, modules: Uint8Array(size*size) }.
 */
export function encodeQR(data, opts = {}) {
  const ecl = ECL[opts.ecl || 'M'];
  const minVersion = opts.minVersion || 1;
  const maxVersion = opts.maxVersion || 40;
  const seg = makeSegment(data);
  let ver = 0;
  for (let v = minVersion; v <= maxVersion; v++) {
    const cap = numDataCodewords(v, ecl) * 8;
    const ccBits = charCountBits(seg.mode, v);
    if (seg.count < (1 << ccBits) && 4 + ccBits + seg.bits.length <= cap) {
      ver = v;
      break;
    }
  }
  if (!ver) throw new Error('QR: данных слишком много для выбранной версии');

  const capBits = numDataCodewords(ver, ecl) * 8;
  const bits = [];
  appendBits(bits, seg.mode, 4);
  appendBits(bits, seg.count, charCountBits(seg.mode, ver));
  for (const b of seg.bits) bits.push(b);
  appendBits(bits, 0, Math.min(4, capBits - bits.length));
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) appendBits(bits, pad, 8);
  const dataBytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bits.length; i++) dataBytes[i >>> 3] |= bits[i] << (7 - (i & 7));

  const codewords = addEccAndInterleave(dataBytes, ver, ecl);
  const size = sizeOf(ver);
  const fmask = buildFunctionMask(ver);
  const base = new Uint8Array(size * size);
  const setF = (x, y, dark) => { if (x >= 0 && y >= 0 && x < size && y < size) base[y * size + x] = dark ? 1 : 0; };

  for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setF(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
  }
  const al = alignmentPositions(ver);
  const na = al.length;
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) setF(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  if (ver >= 7) {
    const vb = versionBits(ver);
    for (let i = 0; i < 18; i++) {
      const bit = (vb >>> i) & 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setF(a, b, bit);
      setF(b, a, bit);
    }
  }

  const order = dataModuleOrder(ver, fmask);
  for (let i = 0; i < order.length; i++) {
    const byte = codewords[i >>> 3];
    base[order[i]] = byte === undefined ? 0 : (byte >>> (7 - (i & 7))) & 1;
  }

  const drawFormat = (m, mask) => {
    const fb = formatBits(ecl, mask);
    const bit = (i) => (fb >>> i) & 1;
    const put = (x, y, v) => { m[y * size + x] = v; };
    for (let i = 0; i <= 5; i++) put(8, i, bit(i));
    put(8, 7, bit(6));
    put(8, 8, bit(7));
    put(7, 8, bit(8));
    for (let i = 9; i < 15; i++) put(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) put(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) put(8, size - 15 + i, bit(i));
    put(8, size - 8, 1);
  };

  const withMask = (mask) => {
    const m = base.slice();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!fmask[y * size + x] && maskBit(mask, x, y)) m[y * size + x] ^= 1;
      }
    }
    drawFormat(m, mask);
    return m;
  };

  let bestMask = opts.mask !== undefined && opts.mask >= 0 ? opts.mask : -1;
  let modules;
  if (bestMask >= 0) {
    modules = withMask(bestMask);
  } else {
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const m = withMask(mask);
      const score = penaltyScore(m, size);
      if (score < bestScore) { bestScore = score; bestMask = mask; modules = m; }
    }
  }
  return { version: ver, size, ecl: opts.ecl || 'M', mask: bestMask, modules, dataCodewords: dataBytes };
}
