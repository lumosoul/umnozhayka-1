// Перенос прогресса: файл, код Base64 с CRC и серия QR — без потерь; версии и объединение.

import { test, assert } from './harness.js';
import { day, emptyFacts, knowFact, weakFact, answer, makeRng } from './helpers.js';
import {
  buildSnapshot, validateSnapshot, snapshotToFileText, fileTextToSnapshot, snapshotToCode, codeToSnapshot,
  snapshotToQRTexts, QRCollector, planImport, applyImport, snapshotPayload, payloadToSnapshot,
} from '../js/data/transfer.js';
import { packSnapshot, unpackSnapshot } from '../js/data/pack.js';
import { newProfile } from '../js/core/profile.js';
import { encodeQR } from '../js/lib/qr-encode.js';
import { decodeMatrix } from '../js/lib/qr-decode.js';
import { completeFacts, ALL_KEYS } from '../js/core/facts.js';
import { LEVELS } from '../js/core/curriculum.js';
import { dayKey } from '../js/core/dates.js';

function sampleProfileData(name, seed, days = 20) {
  const rng = makeRng(seed);
  const profile = newProfile({ name, avatar: '🦊', now: day(0), rng });
  profile.intros = [1, 10, 2];
  profile.awards = { 'first-lesson': day(1), 'col-1': day(3) };
  profile.diag = { done: true, at: day(0), known: 30 };
  const facts = emptyFacts();
  for (const lvl of LEVELS.slice(0, 3)) for (const k of lvl) knowFact(facts, k, day(1));
  for (const k of LEVELS[3]) weakFact(facts, k, day(2));
  const sessions = [];
  for (let d = 3; d < 3 + days; d++) {
    const sid = `s_${seed}_${d}`;
    for (const k of ALL_KEYS.filter((_, i) => (i + d) % 4 === 0).slice(0, 20)) {
      facts[k] = answer(facts[k], rng() > 0.25, Math.round(1000 + rng() * 7000), sid, day(d) + Math.round(rng() * 6e5));
    }
    sessions.push({
      id: sid, type: 'lesson', start: day(d), end: day(d) + 600000, day: dayKey(day(d)), planned: 20,
      answered: 20, correct: 15, tSum: 60000, stars: 2, newFacts: ['5x3'], done: true, upd: day(d) + 600000,
    });
  }
  return { profile, facts, sessions };
}

/** Читает QR-строку так же, как считыватель: кодирует в матрицу и декодирует обратно. */
function throughQR(text) {
  const qr = encodeQR(text, { ecl: 'M' });
  const res = decodeMatrix((x, y) => qr.modules[y * qr.size + x], qr.size);
  return { text: res.text, version: qr.version };
}

test('Перенос файлом: JSON туда и обратно без потерь', () => {
  const data = [sampleProfileData('Маша', 1), sampleProfileData('Петя', 2)];
  const snap = buildSnapshot(data, day(30));
  const back = fileTextToSnapshot(snapshotToFileText(snap));
  assert.deepEqual(back, snap);
  assert.equal(Object.keys(back.profiles[0].facts).length, ALL_KEYS.filter((k) => data[0].facts[k].upd).length,
    'нетронутые факты не раздувают файл');
  assert.deepEqual(completeFacts(back.profiles[0].facts), data[0].facts);
});

test('Перенос кодом: Base64 + CRC-32 без потерь, повреждение замечается', async () => {
  const snap = buildSnapshot([sampleProfileData('Маша', 3)], day(30));
  const code = await snapshotToCode(snap);
  assert.ok(/^UMN1\.[A-Za-z0-9+/]+=*\.[0-9A-F]{8}$/.test(code));
  assert.deepEqual(await codeToSnapshot(code), snap);
  assert.deepEqual(await codeToSnapshot(`  ${code.slice(0, 40)}\n${code.slice(40)}  `), snap, 'пробелы и переносы не мешают');
  const i = 30;
  const broken = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
  await assert.rejects(() => codeToSnapshot(broken), /Контрольная сумма/);
  await assert.rejects(() => codeToSnapshot(code.slice(0, code.length - 20)), /не похоже|Контрольная|повреждён/);
  await assert.rejects(() => codeToSnapshot('привет'), /не похоже/);
  await assert.rejects(() => codeToSnapshot(code.replace('UMN1.', 'UMN9.')), /новой версии/);
});

test('Перенос QR: серия кодов собирается в любом порядке без потерь', async () => {
  const snap = buildSnapshot([sampleProfileData('Маша', 4, 40), sampleProfileData('Петя', 5, 40)], day(50));
  const texts = await snapshotToQRTexts(snap, undefined, makeRng(1));
  assert.ok(texts.length >= 2, `кодов: ${texts.length}`);
  const decoded = texts.map(throughQR);
  for (const d of decoded) assert.ok(d.version <= 20, `версия QR ${d.version}`);
  const col = new QRCollector();
  const order = [...decoded.keys()].reverse();
  let last;
  for (const i of [...order, order[0]]) last = col.add(decoded[i].text);
  assert.equal(last.status, 'duplicate');
  assert.ok(col.complete);
  assert.deepEqual(await col.snapshot(), snap);
});

test('Перенос QR: чужие коды игнорируются, новая серия сбрасывает старую', async () => {
  const snapA = buildSnapshot([sampleProfileData('Маша', 6, 30)], day(40));
  const a = await snapshotToQRTexts(snapA, 200, makeRng(2));
  const b = await snapshotToQRTexts(snapA, 200, makeRng(3));
  const col = new QRCollector();
  assert.equal(col.add('https://example.com').status, 'foreign');
  col.add(a[0]);
  assert.equal(col.got, 1);
  col.add(b[1]);
  assert.equal(col.got, 1, 'другая серия начинается заново');
  assert.deepEqual(col.missing(), [1, ...Array.from({ length: b.length - 2 }, (_, i) => i + 3)]);
  assert.equal(col.add(a[0].replace('UQ1:', 'UQ7:')).status, 'error');
});

test('Импорт: проверка версии формата и содержимого', () => {
  const snap = buildSnapshot([sampleProfileData('Маша', 7)], day(30));
  assert.throws(() => validateSnapshot({ ...snap, v: 2 }), /новой версии/);
  assert.throws(() => validateSnapshot({ ...snap, app: 'other' }), /не сохранение/);
  assert.throws(() => validateSnapshot({ ...snap, v: undefined }), /версия формата/);
  assert.throws(() => validateSnapshot({ ...snap, profiles: [] }), /ни одного профиля/);
  assert.throws(() => fileTextToSnapshot('{oops'), /повреждён/);
  const dirty = JSON.parse(JSON.stringify(snap));
  dirty.profiles[0].facts['11x2'] = { box: 3 };
  dirty.profiles[0].facts['2x2'].box = 99;
  const clean = validateSnapshot(dirty);
  assert.equal(clean.profiles[0].facts['11x2'], undefined);
  assert.equal(clean.profiles[0].facts['2x2'].box, 5);
});

test('Импорт: объединение сохраняет по каждому факту более свежую запись', () => {
  const base = sampleProfileData('Маша', 8);
  const local = { profile: { ...base.profile }, facts: { ...base.facts }, sessions: base.sessions.slice() };
  const incoming = JSON.parse(JSON.stringify(base));
  local.facts['2x3'] = answer(local.facts['2x3'], false, 3000, 'loc', day(40));
  incoming.facts['2x4'] = answer(incoming.facts['2x4'], true, 1000, 'inc', day(41));
  incoming.facts['2x3'] = answer(incoming.facts['2x3'], true, 1000, 'inc', day(39));
  incoming.sessions.push({ ...incoming.sessions[0], id: 's_new', day: dayKey(day(41)), start: day(41), upd: day(41) });
  incoming.profile.awards = { ...incoming.profile.awards, 'col-10': day(41) };
  const snap = validateSnapshot(buildSnapshot([incoming], day(42)));
  const { actions, overwrites } = planImport([local], snap);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'merge');
  assert.equal(overwrites, 1, 'нужно предупредить о перезаписи');
  assert.equal(actions[0].factsKept, 1, '2×3 свежее на устройстве');
  assert.equal(actions[0].factsFromFile, 1, '2×4 свежее в файле');
  assert.equal(actions[0].sessionsAdded, 1);
  const [merged] = applyImport([local], { actions });
  assert.deepEqual(merged.facts['2x3'], local.facts['2x3']);
  assert.deepEqual(merged.facts['2x4'], incoming.facts['2x4']);
  assert.equal(merged.sessions.length, local.sessions.length + 1);
  assert.ok(merged.profile.awards['col-10'] && merged.profile.awards['col-1']);
  assert.equal(merged.profile.id, local.profile.id);
});

test('Импорт: новые профили добавляются (до 4), совпадение по имени объединяет', () => {
  const locals = ['Аня', 'Боря', 'Вика'].map((n, i) => sampleProfileData(n, 20 + i, 3));
  const inc = [sampleProfileData('аня', 30, 3), sampleProfileData('Гоша', 31, 3), sampleProfileData('Даша', 32, 3)];
  const snap = validateSnapshot(buildSnapshot(inc, day(10)));
  const { actions } = planImport(locals, snap);
  assert.deepEqual(actions.map((a) => a.type), ['merge', 'add', 'skip']);
  assert.equal(actions[0].localId, locals[0].profile.id);
  const out = applyImport(locals, { actions });
  assert.equal(out.length, 2);
});

test('Упаковка: двоичный формат без потерь и заметно меньше JSON', async () => {
  const data = [sampleProfileData('Маша 🦊', 40, 45), sampleProfileData('Петя', 41, 10)];
  data[0].profile.awards['gold-2'] = day(44);
  data[1].facts['3x3'] = { ...data[1].facts['3x3'], due: '', intro: 0, upd: day(1) };
  const snap = validateSnapshot(buildSnapshot(data, day(46)));
  const bin = packSnapshot(snap);
  assert.deepEqual(unpackSnapshot(bin), snap);
  assert.ok(bin.length * 3 < JSON.stringify(snap).length, `двоичный ${bin.length} против JSON ${JSON.stringify(snap).length}`);
  const payload = await snapshotPayload(snap);
  assert.equal(payload[0], 3, 'двоичная упаковка + сжатие');
  assert.deepEqual(await payloadToSnapshot(payload), snap);
});

test('Упаковка: если данные не укладываются в двоичный формат — переносится JSON', async () => {
  const snap = validateSnapshot(buildSnapshot([sampleProfileData('Аня', 42, 3)], day(10)));
  const odd = JSON.parse(JSON.stringify(snap));
  odd.profiles[0].sessions[0].type = 'неизвестно';
  const payload = await snapshotPayload(odd);
  assert.equal(payload[0], 1, 'JSON + сжатие');
  const back = await payloadToSnapshot(payload);
  assert.equal(back.profiles[0].sessions[0].type, 'lesson', 'при импорте значение нормализуется');
  await assert.rejects(() => payloadToSnapshot(new Uint8Array([9, 1, 2, 3])), /Неизвестный способ/);
  await assert.rejects(() => payloadToSnapshot(new Uint8Array([3, 1, 2, 3])), /распаковать|повреждены/);
});

test('Импорт: совпадение идентификатора важнее имени, чужие данные не затираются', () => {
  const anyaLocal = sampleProfileData('Аня', 50, 3);
  const anyaFile = sampleProfileData('Аня', 51, 3);
  const goshaFile = sampleProfileData('Гоша', 52, 3);
  goshaFile.profile.id = anyaLocal.profile.id; // тот же профиль, переименованный на другом устройстве
  const snap = validateSnapshot(buildSnapshot([anyaFile, goshaFile], day(10)));
  const { actions } = planImport([anyaLocal], snap);
  const merge = actions.find((a) => a.type === 'merge');
  const add = actions.find((a) => a.type === 'add');
  assert.equal(merge.localId, anyaLocal.profile.id);
  assert.equal(merge.incoming.name, 'Гоша');
  assert.equal(add.incoming.name, 'Аня');
  const out = applyImport([anyaLocal], { actions });
  assert.equal(new Set(out.map((x) => x.profile.id)).size, out.length, 'идентификаторы профилей не совпадают');
  const dup = planImport([anyaLocal], validateSnapshot(buildSnapshot([{ ...anyaFile, profile: { ...anyaFile.profile, id: anyaLocal.profile.id } }, anyaFile], day(10))));
  const ids = dup.actions.filter((a) => a.type !== 'skip').map((a) => (a.type === 'merge' ? a.localId : a.incoming.id));
  assert.equal(new Set(ids).size, ids.length, 'добавляемый профиль получает свободный идентификатор');
});
