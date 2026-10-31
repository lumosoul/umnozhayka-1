// Кодеки переноса и награды.

import { test, assert } from './harness.js';
import { day, emptyFacts, knowFact } from './helpers.js';
import {
  crc32, crc32Hex, base45Encode, base45Decode, bytesToBase64, base64ToBytes, pack, unpack, utf8Encode, utf8Decode,
} from '../js/lib/codec.js';
import { sessionStars, streakInfo, newAwards, totalStars } from '../js/core/rewards.js';
import { columnFacts } from '../js/core/curriculum.js';
import { dayKey } from '../js/core/dates.js';

test('CRC-32: эталонное значение', () => {
  assert.equal(crc32(utf8Encode('123456789')), 0xcbf43926);
  assert.equal(crc32Hex(utf8Encode('')), '00000000');
});

test('Base45: примеры из RFC 9285', () => {
  assert.equal(base45Encode(utf8Encode('AB')), 'BB8');
  assert.equal(base45Encode(utf8Encode('Hello!!')), '%69 VD92EX0');
  assert.equal(base45Encode(utf8Encode('base-45')), 'UJCLQE7W581');
  assert.equal(utf8Decode(base45Decode('QED8WEX0')), 'ietf!');
  assert.throws(() => base45Decode('GGW'), /переполнение/);
  assert.throws(() => base45Decode('a'), /символ/);
});

test('Base64 и сжатие: туда и обратно без потерь', async () => {
  const bytes = new Uint8Array(5000).map((_, i) => (i * 31 + (i >> 3)) & 0xff);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  const text = JSON.stringify({ a: 'совёнок'.repeat(300), n: [1, 2, 3] });
  const packed = await pack(utf8Encode(text));
  assert.equal(packed[0], 1, 'сжато deflate');
  assert.ok(packed.length < text.length / 5);
  assert.equal(utf8Decode(await unpack(packed)), text);
  assert.equal(utf8Decode(await unpack(new Uint8Array([0, ...utf8Encode('ok')]))), 'ok');
  await assert.rejects(() => unpack(new Uint8Array([7, 1, 2])), /Неизвестный/);
});

test('Звёзды: за занятие всегда, за старание и за точность', () => {
  assert.equal(sessionStars({ answered: 20, correct: 5 }), 1);
  assert.equal(sessionStars({ answered: 20, correct: 5, retries: 3, retriesSolved: 3 }), 2, 'исправил все ошибки');
  assert.equal(sessionStars({ answered: 20, correct: 13 }), 2);
  assert.equal(sessionStars({ answered: 20, correct: 17 }), 3);
  assert.equal(sessionStars({ answered: 0, correct: 0 }), 0);
});

test('Серия дней: подряд, с продлением сегодня, лучшая серия', () => {
  const s = (d, done = true, type = 'lesson') => ({ day: dayKey(day(d)), done, type, stars: 2 });
  const sessions = [s(0), s(1), s(2), s(4), s(5), s(5), s(6, false), s(7, true, 'diag')];
  assert.deepEqual(streakInfo(sessions, dayKey(day(5))), { current: 2, best: 3, todayDone: true });
  assert.deepEqual(streakInfo(sessions, dayKey(day(6))), { current: 2, best: 3, todayDone: false }, 'вчера занимались — серия жива');
  assert.equal(streakInfo(sessions, dayKey(day(8))).current, 0, 'диагностика и незаконченные не считаются');
  assert.equal(totalStars(sessions), 12);
});

test('Награды: за освоенный столбец и серии — один раз', () => {
  const f = emptyFacts();
  for (const k of columnFacts(2)) knowFact(f, k, day(0));
  const sessions = [0, 1, 2].map((d) => ({ day: dayKey(day(d)), done: true, type: 'lesson', stars: 3 }));
  const got = newAwards(f, sessions, {}, dayKey(day(2)));
  assert.ok(got.includes('col-2'));
  assert.ok(got.includes('first-lesson'));
  assert.ok(got.includes('streak-3'));
  assert.ok(!got.includes('col-3'));
  const again = newAwards(f, sessions, Object.fromEntries(got.map((id) => [id, 1])), dayKey(day(2)));
  assert.deepEqual(again, []);
});

test('Награды: за факты, отмеченные только диагностикой, награды нет, пока их не решат в занятии', () => {
  const f = emptyFacts();
  for (const k of columnFacts(3)) { knowFact(f, k, day(0)); f[k] = { ...f[k], src: 'diag' }; }
  const sessions = [{ day: dayKey(day(0)), done: true, type: 'lesson', stars: 2 }];
  assert.ok(!newAwards(f, sessions, {}, dayKey(day(0))).includes('col-3'));
  for (const k of columnFacts(3)) f[k] = { ...f[k], src: '' };
  assert.ok(newAwards(f, sessions, {}, dayKey(day(0))).includes('col-3'));
});
