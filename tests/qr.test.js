// Встроенный QR: Рид — Соломон, эталонные значения стандарта, генератор и считыватель
// (в том числе со «снимков» с поворотом, перспективой, шумом и размытием).

import { test, assert } from './harness.js';
import { makeRng, renderQR, rotatedSquare } from './helpers.js';
import { rsDivisor, rsRemainder, rsCorrect } from '../js/lib/gf256.js';
import {
  encodeQR, formatBits, versionBits, alignmentPositions, numDataCodewords, charCountBits, MODE, ECL, ALNUM_CHARS,
} from '../js/lib/qr-encode.js';
import { decodeMatrix, decodeQR } from '../js/lib/qr-decode.js';

const matrixGet = (qr) => (x, y) => qr.modules[y * qr.size + x];

test('QR: эталонный пример HELLO WORLD (1-M) — данные и проверочные байты', () => {
  const qr = encodeQR('HELLO WORLD', { ecl: 'M' });
  assert.equal(qr.version, 1);
  assert.deepEqual(Array.from(qr.dataCodewords), [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
  assert.deepEqual(Array.from(rsRemainder(qr.dataCodewords, rsDivisor(10))), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('QR: биты формата и версии совпадают с таблицами стандарта', () => {
  const b = (s) => parseInt(s, 2);
  assert.equal(formatBits(ECL.L, 0), b('111011111000100'));
  assert.equal(formatBits(ECL.L, 7), b('110100101110110'));
  assert.equal(formatBits(ECL.M, 0), b('101010000010010'));
  assert.equal(formatBits(ECL.M, 5), b('100000011001110'));
  assert.equal(formatBits(ECL.Q, 3), b('011101000000110'));
  assert.equal(formatBits(ECL.H, 7), b('000100000111011'));
  assert.equal(versionBits(7), b('000111110010010100'));
  assert.equal(versionBits(8), b('001000010110111100'));
  assert.equal(versionBits(40), b('101000110001101001'));
});

test('QR: выравнивающие узоры и ёмкость версий', () => {
  assert.deepEqual(alignmentPositions(1), []);
  assert.deepEqual(alignmentPositions(2), [6, 18]);
  assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
  assert.deepEqual(alignmentPositions(14), [6, 26, 46, 66]);
  assert.deepEqual(alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(alignmentPositions(36), [6, 24, 50, 76, 102, 128, 154]);
  assert.deepEqual(alignmentPositions(40), [6, 30, 58, 86, 114, 142, 170]);
  const bytes = (v, e) => Math.floor((numDataCodewords(v, e) * 8 - 4 - charCountBits(MODE.byte, v)) / 8);
  assert.deepEqual([0, 1, 2, 3].map((e) => bytes(1, e)), [17, 14, 11, 7]);
  assert.deepEqual([0, 1, 2, 3].map((e) => bytes(10, e)), [271, 213, 151, 119]);
  assert.deepEqual([0, 1, 2, 3].map((e) => bytes(40, e)), [2953, 2331, 1663, 1273]);
});

test('Рид — Соломон: исправляет до половины проверочных байтов', () => {
  const rng = makeRng(5);
  for (let trial = 0; trial < 200; trial++) {
    const nsym = 10 + Math.floor(rng() * 20);
    const data = Array.from({ length: 5 + Math.floor(rng() * 60) }, () => Math.floor(rng() * 256));
    const block = new Uint8Array([...data, ...rsRemainder(data, rsDivisor(nsym))]);
    const clean = block.slice();
    const errors = Math.floor(rng() * (Math.floor(nsym / 2) + 1));
    const pos = new Set();
    while (pos.size < errors) pos.add(Math.floor(rng() * block.length));
    for (const p of pos) block[p] ^= 1 + Math.floor(rng() * 255);
    assert.equal(rsCorrect(block, nsym), errors);
    assert.deepEqual(block, clean);
  }
});

test('Рид — Соломон: слишком много ошибок — сообщает, а не выдаёт мусор', () => {
  const rng = makeRng(6);
  let detected = 0;
  for (let trial = 0; trial < 100; trial++) {
    const nsym = 16;
    const data = Array.from({ length: 30 }, () => Math.floor(rng() * 256));
    const block = new Uint8Array([...data, ...rsRemainder(data, rsDivisor(nsym))]);
    for (let i = 0; i < 12; i++) block[i * 3] ^= 0x5a;
    try { rsCorrect(block, nsym); } catch (e) { detected++; }
  }
  assert.ok(detected >= 95, `обнаружено ${detected} из 100`);
});

test('QR: кодирование и чтение матрицы — все версии и уровни', () => {
  const rng = makeRng(7);
  for (let v = 1; v <= 40; v += 3) {
    for (const ecl of ['L', 'M', 'Q', 'H']) {
      const capBits = numDataCodewords(v, ECL[ecl]) * 8 - 4 - charCountBits(MODE.alnum, v);
      const len = Math.max(1, Math.floor((capBits / 11) * 2) - 3);
      let s = '';
      for (let i = 0; i < len; i++) s += ALNUM_CHARS[Math.floor(rng() * 45)];
      const qr = encodeQR(s, { ecl, minVersion: v });
      assert.equal(qr.version, v);
      const res = decodeMatrix(matrixGet(qr), qr.size);
      assert.equal(res.text, s, `v${v}-${ecl}`);
      assert.equal(res.ecl, ecl);
    }
  }
  const utf = encodeQR('Привет, совёнок! 7×8=56');
  assert.equal(decodeMatrix(matrixGet(utf), utf.size).text, 'Привет, совёнок! 7×8=56');
  const digits = encodeQR('0123456789012345');
  assert.equal(decodeMatrix(matrixGet(digits), digits.size).text, '0123456789012345');
});

test('QR: испорченные модули исправляются кодом коррекции', () => {
  const text = 'UQ1:ABCD:1:3:0123ABCD:' + 'K'.repeat(300);
  const qr = encodeQR(text, { ecl: 'M' });
  const rng = makeRng(8);
  const m = qr.modules.slice();
  for (let i = 0; i < 25; i++) {
    const x = 9 + Math.floor(rng() * (qr.size - 18));
    const y = 9 + Math.floor(rng() * (qr.size - 18));
    m[y * qr.size + x] ^= 1;
  }
  assert.equal(decodeMatrix((x, y) => m[y * qr.size + x], qr.size).text, text);
});

const LONG = 'UQ1:K7Q2:2:5:89ABCDEF:' + Array.from({ length: 540 }, (_, i) => ALNUM_CHARS[(i * 7 + 3) % 45]).join('');

test('QR со снимка: прямой код, поворот на 90° и 180°', () => {
  const qr = encodeQR(LONG, { ecl: 'M' });
  for (const angle of [0, 90, 180, 270]) {
    const side = (qr.size + 8) * 4;
    const img = renderQR(qr, { width: side + 40, height: side + 40, corners: rotatedSquare((side + 40) / 2, (side + 40) / 2, side, angle) });
    const res = decodeQR(img);
    assert.ok(res, `поворот ${angle}° не прочитан`);
    assert.equal(res.text, LONG);
  }
});

test('QR со снимка: наклон, перспектива, шум, размытие и неровный свет', () => {
  const qr = encodeQR(LONG, { ecl: 'M' });
  const W = 640;
  const H = 520;
  const cases = [
    { name: 'наклон 17°', corners: rotatedSquare(320, 260, 400, 17), noise: 12 },
    { name: 'перспектива', corners: [[150, 60], [520, 90], [560, 470], [110, 440]], noise: 10 },
    { name: 'размытие', corners: rotatedSquare(320, 260, 440, -8), blur: 1, noise: 6 },
    { name: 'тень', corners: rotatedSquare(320, 260, 430, 5), gradient: 0.55, noise: 8 },
    { name: 'мелкий', corners: rotatedSquare(320, 260, 300, 33), noise: 5 },
  ];
  for (const c of cases) {
    const img = renderQR(qr, { width: W, height: H, ...c });
    const res = decodeQR(img);
    assert.ok(res, `${c.name}: не прочитан`);
    assert.equal(res.text, LONG, c.name);
  }
});

test('QR со снимка: на картинке без кода ничего не находится', () => {
  const rng = makeRng(10);
  const lum = new Uint8Array(320 * 240).map(() => 100 + Math.floor(rng() * 60));
  assert.equal(decodeQR({ lum, width: 320, height: 240 }), null);
});
