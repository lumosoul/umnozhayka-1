// Байтовые преобразования для переноса прогресса: UTF-8, Base64, Base45 (RFC 9285),
// CRC-32 и сжатие deflate через встроенный CompressionStream.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const crc32Hex = (bytes) => crc32(bytes).toString(16).toUpperCase().padStart(8, '0');

export const utf8Encode = (s) => new TextEncoder().encode(s);
export const utf8Decode = (b) => new TextDecoder().decode(b);

export function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Base45: два байта → три символа из набора буквенно-цифрового режима QR,
// поэтому QR получается почти таким же плотным, как с «сырыми» байтами.
export const BASE45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export function base45Encode(bytes) {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    let n = bytes[i] * 256 + bytes[i + 1];
    const c = n % 45; n = (n - c) / 45;
    const d = n % 45; const e = (n - d) / 45;
    out += BASE45[c] + BASE45[d] + BASE45[e];
  }
  if (bytes.length % 2) {
    const n = bytes[bytes.length - 1];
    out += BASE45[n % 45] + BASE45[Math.floor(n / 45)];
  }
  return out;
}

export function base45Decode(str) {
  const vals = [...str].map((ch) => {
    const v = BASE45.indexOf(ch);
    if (v < 0) throw new Error('Base45: недопустимый символ');
    return v;
  });
  if (vals.length % 3 === 1) throw new Error('Base45: неверная длина');
  const out = [];
  for (let i = 0; i < vals.length; i += 3) {
    if (i + 2 < vals.length) {
      const n = vals[i] + vals[i + 1] * 45 + vals[i + 2] * 2025;
      if (n > 0xffff) throw new Error('Base45: переполнение');
      out.push(n >> 8, n & 0xff);
    } else {
      const n = vals[i] + vals[i + 1] * 45;
      if (n > 0xff) throw new Error('Base45: переполнение');
      out.push(n);
    }
  }
  return new Uint8Array(out);
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

export const deflate = (bytes) => pipe(bytes, new CompressionStream('deflate'));
export const inflate = (bytes) => pipe(bytes, new DecompressionStream('deflate'));

/** Упаковка: первый байт — способ (1 — deflate, 0 — без сжатия), дальше данные. */
export async function pack(bytes) {
  if (canCompress()) {
    const z = await pipe(bytes, new CompressionStream('deflate'));
    const out = new Uint8Array(z.length + 1);
    out[0] = 1;
    out.set(z, 1);
    return out;
  }
  const out = new Uint8Array(bytes.length + 1);
  out.set(bytes, 1);
  return out;
}

export async function unpack(payload) {
  if (!payload.length) throw new Error('Пустые данные');
  const method = payload[0];
  const body = payload.subarray(1);
  if (method === 0) return body.slice();
  if (method === 1) {
    if (!canCompress()) throw new Error('Этот браузер не умеет распаковывать данные. Обнови браузер.');
    return pipe(body, new DecompressionStream('deflate'));
  }
  throw new Error('Неизвестный способ упаковки');
}
