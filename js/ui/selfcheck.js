// «Проверка устройства» для взрослых: за несколько секунд показывает на конкретном
// телефоне или компьютере, что всё нужное работает — офлайн-кэш, хранилище, сжатие,
// QR, камера, звук и установка на главный экран.

import { h, clear, icon } from './dom.js';
import * as db from '../data/db.js';
import { canCompress, pack, unpack, utf8Encode, utf8Decode } from '../lib/codec.js';
import { encodeQR } from '../lib/qr-encode.js';
import { decodeQR } from '../lib/qr-decode.js';

const ok = (name, text) => ({ name, status: 'ok', text });
const warn = (name, text) => ({ name, status: 'warn', text });
const fail = (name, text) => ({ name, status: 'fail', text });

async function offlineCheck() {
  const name = 'Работа без интернета';
  if (!('serviceWorker' in navigator)) return fail(name, 'Браузер не умеет работать без интернета (нет service worker).');
  if (!navigator.serviceWorker.controller) {
    return warn(name, 'Офлайн-режим ещё готовится: подождите минуту при включённом интернете и откройте приложение снова.');
  }
  const reply = await new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), 5000);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data); };
    navigator.serviceWorker.controller.postMessage({ type: 'check' }, [ch.port2]);
  });
  if (!reply) return warn(name, 'Service worker не ответил — перезапустите приложение.');
  if (reply.missing.length) {
    return warn(name, `Сохранено ${reply.expected - reply.missing.length} из ${reply.expected} файлов. Откройте приложение при включённом интернете.`);
  }
  return ok(name, `Все ${reply.expected} файлов сохранены — можно включать режим полёта.`);
}

async function storageCheck() {
  const name = 'Сохранение прогресса';
  try {
    const v = `t${Date.now()}`;
    await db.setMeta('selfcheck', v);
    if ((await db.getMeta('selfcheck')) !== v) return fail(name, 'Записанные данные не читаются.');
  } catch (e) {
    return fail(name, 'Браузер не даёт сохранять данные (возможно, приватный режим).');
  }
  let persisted = null;
  try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch (e) { persisted = null; }
  return persisted === false
    ? warn(name, 'Данные сохраняются, но браузер может очистить их при нехватке места. Иногда сохраняйте файл в разделе «Перенос».')
    : ok(name, 'Данные сохраняются на устройстве и переживают перезапуск.');
}

async function packCheck() {
  const name = 'Сжатие для кода и QR';
  try {
    const text = `Умножайка ${'7 × 8 = 56; '.repeat(40)}`;
    const back = utf8Decode(await unpack(await pack(utf8Encode(text))));
    if (back !== text) return fail(name, 'Данные искажаются при упаковке.');
    return canCompress() ? ok(name, 'Данные сжимаются и распаковываются без потерь.') : warn(name, 'Браузер не умеет сжимать — коды будут длиннее, но перенос работает.');
  } catch (e) {
    return fail(name, 'Упаковка данных не работает. Обновите браузер.');
  }
}

function qrCheck() {
  const name = 'QR-коды';
  try {
    const text = `UQ1:TEST:1:1:00000000:${'UMNOZHAYKA '.repeat(40)}`;
    const qr = encodeQR(text, { ecl: 'M' });
    const scale = 4;
    const c = document.createElement('canvas');
    c.width = (qr.size + 8) * scale;
    c.height = c.width;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) if (qr.modules[y * qr.size + x]) g.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale);
    }
    const res = decodeQR(g.getImageData(0, 0, c.width, c.height));
    return res && res.text === text ? ok(name, 'Генератор и считыватель QR работают.') : fail(name, 'QR-код не распознался.');
  } catch (e) {
    return fail(name, 'Генератор или считыватель QR не работает.');
  }
}

function cameraCheck() {
  const name = 'Камера';
  return navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'
    ? ok(name, 'Камера доступна для сканирования QR (разрешение спросят при сканировании).')
    : warn(name, 'Камера недоступна в этом браузере — для QR есть кнопка «Выбрать фото».');
}

function soundCheck() {
  const name = 'Звуки';
  return window.AudioContext || window.webkitAudioContext
    ? ok(name, 'Мягкие звуки поддерживаются (кнопка звука есть на каждом экране).')
    : warn(name, 'Браузер не умеет воспроизводить звуки — приложение работает без них.');
}

function installCheck() {
  const name = 'Установка';
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  return standalone
    ? ok(name, 'Приложение установлено на главный экран.')
    : warn(name, 'Открыто во вкладке браузера. Установите: в Safari «Поделиться» → «На экран „Домой“», в Chrome и Edge — «Установить приложение».');
}

/** Все проверки по очереди. */
export async function runSelfCheck() {
  return [
    await offlineCheck(),
    await storageCheck(),
    await packCheck(),
    qrCheck(),
    cameraCheck(),
    soundCheck(),
    installCheck(),
  ];
}

/** Раздел «Проверка устройства» для настроек родителя. */
export function selfCheckSection() {
  const list = h('ul', { class: 'list', 'aria-live': 'polite', dataset: { selfcheck: '' } });
  const btn = h('button', { type: 'button', class: 'btn', dataset: { action: 'self-check' } }, 'Проверить устройство');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    clear(list);
    list.append(h('li', {}, 'Проверяю…'));
    const results = await runSelfCheck();
    clear(list);
    for (const r of results) {
      list.append(h('li', { dataset: { status: r.status } },
        h('span', {
          class: 'avatar', 'aria-hidden': 'true',
          style: { width: '32px', height: '32px', background: r.status === 'ok' ? 'var(--st-know)' : 'var(--accent-soft)' },
        }, icon(r.status === 'ok' ? 'check' : 'bolt', { style: { width: '20px', height: '20px' } })),
        h('span', {}, h('strong', {}, `${r.name}. `), r.text)));
    }
    list.dataset.selfcheck = results.every((r) => r.status === 'ok') ? 'ok' : 'warn';
    btn.disabled = false;
  });
  return h('section', { class: 'sheet stack' },
    h('h2', {}, 'Проверка устройства'),
    h('p', { class: 'muted' }, 'Покажет, что на этом телефоне или компьютере работает всё нужное: режим полёта, сохранение, перенос и QR.'),
    h('div', {}, btn),
    list);
}
