// Перенос прогресса между устройствами: файл JSON, текстовый код (Base64 + CRC-32)
// и серия QR-кодов (сжатые данные), которую считывает камера второго устройства.
// Перед импортом показывается, что добавится и что будет перезаписано.

import { h, clear, icon, delay } from '../dom.js';
import { openModal, toast } from '../modal.js';
import { setKeyHandler } from '../keys.js';
import { store } from '../../data/store.js';
import {
  snapshotToFileText, fileTextToSnapshot, snapshotToCode, codeToSnapshot, snapshotToQRTexts, QRCollector,
} from '../../data/transfer.js';
import { encodeQR } from '../../lib/qr-encode.js';
import { decodeQR } from '../../lib/qr-decode.js';
import { dayKey } from '../../core/dates.js';
import { withWord } from '../../core/ru.js';

const QR_INTERVAL_MS = 1400;

function downloadText(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

async function saveCurrentToFile() {
  const snap = await store.exportSnapshot();
  downloadText(snapshotToFileText(snap), `umnozhayka-${dayKey()}-до-импорта.json`);
}

/** «обновится 1 пример», «обновятся 3 примера», «новых занятий нет». */
function countPhrase(n, verbOne, verbMany, one, few, many, none) {
  if (!n) return none;
  const single = n % 10 === 1 && n % 100 !== 11;
  return `${single ? verbOne : verbMany} ${withWord(n, one, few, many)}`;
}

/** Подтверждение импорта с планом объединения, затем запись. */
export async function importSnapshot(snapshot, onDone) {
  const prepared = await store.prepareImport(snapshot);
  const { plan } = prepared;
  const items = plan.actions.map((a) => {
    if (a.type === 'add') {
      return h('li', {}, h('span', {}, `«${a.name}» — новый профиль: ${withWord(a.facts, 'пример', 'примера', 'примеров')} с прогрессом, ${withWord(a.sessionsAdded, 'занятие', 'занятия', 'занятий')}.`));
    }
    if (a.type === 'merge') {
      const upd = countPhrase(a.factsFromFile, 'обновится', 'обновятся', 'пример', 'примера', 'примеров', 'примеры не изменятся');
      const kept = a.factsKept ? `, более свежими останутся записи с этого устройства: ${a.factsKept}` : '';
      const sess = countPhrase(a.sessionsAdded, 'добавится', 'добавятся', 'занятие', 'занятия', 'занятий', 'новых занятий нет');
      return h('li', {}, h('span', {}, `«${a.name}» — объединение: ${upd}${kept}, ${sess}.`));
    }
    return h('li', {}, h('span', {}, `«${a.name}» — не добавлен: ${a.reason}.`));
  });
  const willWrite = plan.actions.some((a) => a.type !== 'skip');
  const content = h('div', { class: 'stack' },
    h('ul', { class: 'list' }, ...items),
    plan.overwrites
      ? h('div', { class: 'notice' }, 'Часть записей на этом устройстве будет перезаписана более свежими из переносимых данных. По каждому примеру остаётся та запись, что новее.')
      : h('p', { class: 'muted' }, 'Ничего не потеряется: по каждому примеру сохранится более свежая запись.'),
    plan.overwrites ? h('button', { type: 'button', class: 'btn', on: { click: () => saveCurrentToFile() } }, 'Сначала сохранить текущие данные в файл') : null);
  const ok = await openModal({
    title: 'Загрузить данные?',
    content,
    actions: willWrite ? [{ label: 'Отмена', value: false }, { label: 'Объединить', value: true, primary: true }] : [{ label: 'Закрыть', value: false, primary: true }],
  });
  if (!ok) return false;
  const n = await store.commitImport(prepared);
  toast(`Готово! Обновлено профилей: ${n}.`);
  if (onDone) onDone();
  return true;
}

function showError(e) {
  openModal({ title: 'Не получилось', content: h('p', {}, e && e.message ? e.message : String(e)) });
}

function drawQR(canvas, text) {
  const qr = encodeQR(text, { ecl: 'M' });
  const quiet = 4;
  const n = qr.size + quiet * 2;
  const scale = Math.max(3, Math.floor(900 / n));
  canvas.width = n * scale;
  canvas.height = n * scale;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#000000';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y * qr.size + x]) g.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    }
  }
  return qr;
}

/** Показ серии QR-кодов с автоматическим перелистыванием. */
function qrView(container, texts, onClose) {
  let i = 0;
  let playing = texts.length > 1;
  let timer = null;
  const canvas = h('canvas', { role: 'img', 'aria-label': 'QR-код с данными', dataset: { qr: '1' } });
  const counter = h('div', { style: { fontWeight: 800, fontSize: '20px' }, 'aria-live': 'polite' });
  const playBtn = h('button', { type: 'button', class: 'btn icon', 'aria-label': 'Пауза' });
  const prev = h('button', { type: 'button', class: 'btn icon', 'aria-label': 'Предыдущий код', on: { click: () => { show(i - 1); } } }, h('span', { style: { transform: 'scaleX(-1)', display: 'inline-flex' } }, icon('next')));
  const next = h('button', { type: 'button', class: 'btn icon', 'aria-label': 'Следующий код', on: { click: () => { show(i + 1); } } }, icon('next'));
  const show = (j) => {
    i = (j + texts.length) % texts.length;
    drawQR(canvas, texts[i]);
    canvas.dataset.text = texts[i];
    counter.textContent = texts.length > 1 ? `Код ${i + 1} из ${texts.length}` : 'Один код';
  };
  const renderPlay = () => {
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play'));
    playBtn.setAttribute('aria-label', playing ? 'Пауза' : 'Листать автоматически');
    clearInterval(timer);
    if (playing) timer = setInterval(() => show(i + 1), QR_INTERVAL_MS);
  };
  playBtn.addEventListener('click', () => { playing = !playing; renderPlay(); });
  const close = () => { clearInterval(timer); setKeyHandler(null); onClose(); };
  clear(container);
  container.append(h('section', { class: 'sheet stack qr-box' },
    h('h2', {}, 'Покажи QR второму устройству'),
    canvas,
    counter,
    texts.length > 1 ? h('div', { class: 'row center' }, prev, playBtn, next) : null,
    h('p', { class: 'center-text' }, 'На втором устройстве открой Умножайку → «Для взрослых» → «Перенос» → «Сканировать QR» и наведи камеру на этот экран. Коды сменяются сами, порядок не важен.'),
    h('button', { type: 'button', class: 'btn primary', on: { click: close } }, 'Готово')));
  container.querySelector('.qr-box').scrollIntoView({ block: 'start' });
  show(0);
  renderPlay();
  setKeyHandler((e) => {
    if (e.key === 'ArrowRight') { show(i + 1); return true; }
    if (e.key === 'ArrowLeft') { show(i - 1); return true; }
    if (e.key === 'Escape') { close(); return true; }
    return false;
  });
  return () => clearInterval(timer);
}

/** Распознавание кадров: в отдельном потоке, если можно, иначе в основном. */
function makeDecoder() {
  let worker = null;
  let seq = 0;
  const waiting = new Map();
  try {
    worker = new Worker(new URL('../../lib/qr-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const r = waiting.get(e.data.id);
      if (r) { waiting.delete(e.data.id); r(e.data.text); }
    };
    worker.onerror = () => {
      worker = null;
      for (const r of waiting.values()) r(undefined);
      waiting.clear();
    };
  } catch (e) {
    worker = null;
  }
  return {
    decode(imageData) {
      if (!worker) {
        const res = decodeQR(imageData);
        return Promise.resolve(res ? res.text : null);
      }
      const id = ++seq;
      return new Promise((resolve) => {
        waiting.set(id, (text) => {
          if (text === undefined) {
            const res = decodeQR(imageData);
            resolve(res ? res.text : null);
          } else resolve(text);
        });
        const copy = new Uint8ClampedArray(imageData.data);
        worker.postMessage({ id, width: imageData.width, height: imageData.height, buffer: copy.buffer }, [copy.buffer]);
      });
    },
    close() { if (worker) worker.terminate(); },
  };
}

function frameData(source, sw, sh, maxW = 1280) {
  const scale = Math.min(1, maxW / sw);
  const w = Math.max(1, Math.round(sw * scale));
  const hgt = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, 0, 0, w, hgt);
  return g.getImageData(0, 0, w, hgt);
}

/**
 * Открывает выбранное фото. createImageBitmap есть не везде (старые iOS Safari),
 * поэтому запасной путь — обычная картинка из blob-ссылки.
 */
async function loadPicture(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close && bmp.close() };
    } catch (e) {
      // попробуем через картинку
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

/** Сканер QR: камера (или фото), сбор частей серии, затем импорт. */
function scannerView(container, onClose, onImported) {
  const collector = new QRCollector();
  const decoder = makeDecoder();
  let stream = null;
  let alive = true;
  const video = h('video', { playsinline: true, muted: true, autoplay: true, 'aria-label': 'Изображение с камеры' });
  video.setAttribute('playsinline', '');
  video.muted = true;
  const status = h('p', { class: 'center-text', style: { fontWeight: 700 }, 'aria-live': 'polite' }, 'Включаю камеру…');
  const chunks = h('div', { class: 'chunks', 'aria-hidden': 'true' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  const stop = () => {
    alive = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    decoder.close();
  };
  const close = () => { stop(); setKeyHandler(null); onClose(); };
  const renderChunks = () => {
    clear(chunks);
    for (let i = 1; i <= collector.total; i++) chunks.append(h('span', { class: collector.parts.has(i) ? 'got' : '' }, String(i)));
  };
  const accept = async (text) => {
    if (!text) return false;
    const r = collector.add(text);
    if (r.status === 'foreign') { status.textContent = 'Это не QR Умножайки. Наведи камеру на коды с другого устройства.'; return false; }
    if (r.status === 'error') { status.textContent = r.error; return false; }
    renderChunks();
    if (!collector.complete) {
      status.textContent = `Считано ${r.got} из ${r.total}. Держи камеру ровно — коды сменяются сами.`;
      return false;
    }
    status.textContent = 'Все коды считаны! Проверяю данные…';
    stop();
    try {
      const snap = await collector.snapshot();
      onClose();
      await importSnapshot(snap, onImported);
    } catch (e) {
      showError(e);
      onClose();
    }
    return true;
  };
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const pic = await loadPicture(file);
      let text = null;
      for (const maxW of [1600, 960, 640]) {
        // eslint-disable-next-line no-await-in-loop
        text = await decoder.decode(frameData(pic.source, pic.width, pic.height, maxW));
        if (text) break;
      }
      pic.release();
      if (!text) status.textContent = 'На фото не нашёлся QR-код. Сфотографируй экран поближе и ровнее.';
      else await accept(text);
    } catch (e) {
      status.textContent = 'Не удалось открыть фото.';
    }
  });
  clear(container);
  container.append(h('section', { class: 'sheet stack' },
    h('h2', {}, 'Сканировать QR'),
    h('div', { class: 'scanner' }, video, h('div', { class: 'frame', 'aria-hidden': 'true' })),
    status,
    chunks,
    h('div', { class: 'row center' },
      h('button', { type: 'button', class: 'btn', on: { click: () => fileInput.click() } }, icon('camera', { style: { width: '24px', height: '24px' } }), 'Выбрать фото'),
      h('button', { type: 'button', class: 'btn', on: { click: close } }, 'Отмена')),
    fileInput));
  setKeyHandler((e) => { if (e.key === 'Escape') { close(); return true; } return false; });

  (async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent = 'Камера недоступна в этом браузере. Нажми «Выбрать фото» и сфотографируй QR-код.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
    } catch (e) {
      status.textContent = 'Нет доступа к камере. Разреши камеру в настройках браузера или нажми «Выбрать фото».';
      return;
    }
    if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* автозапуск может ждать касания */ }
    status.textContent = 'Наведи камеру на QR-код на другом устройстве.';
    while (alive) {
      if (video.readyState >= 2 && video.videoWidth) {
        // eslint-disable-next-line no-await-in-loop
        const text = await decoder.decode(frameData(video, video.videoWidth, video.videoHeight));
        // eslint-disable-next-line no-await-in-loop
        if (alive && text && (await accept(text))) return;
      }
      // eslint-disable-next-line no-await-in-loop
      await delay(90);
    }
  })();
  return stop;
}

/** Раздел «Перенос» родительского экрана. */
export function transferPanel(container, ctx, refresh) {
  let cleanup = null;
  const scope = h('select', { id: 'scope' },
    h('option', { value: '' }, 'Все профили'),
    ...store.profiles.map((p) => h('option', { value: p.id }, p.name)));
  const ids = () => (scope.value ? [scope.value] : null);
  const back = () => { if (cleanup) cleanup(); cleanup = null; renderMain(); };
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const snap = fileTextToSnapshot(await file.text());
      await importSnapshot(snap, refresh);
    } catch (e) { showError(e); }
  });

  const actions = {
    async saveFile() {
      if (!store.profiles.length) { toast('Пока нечего сохранять.'); return; }
      const snap = await store.exportSnapshot(ids());
      const text = snapshotToFileText(snap);
      const name = `umnozhayka-${dayKey()}.json`;
      downloadText(text, name);
      toast('Файл сохранён в «Загрузки».');
    },
    async shareFile() {
      const snap = await store.exportSnapshot(ids());
      const file = new File([snapshotToFileText(snap)], `umnozhayka-${dayKey()}.json`, { type: 'application/json' });
      try { await navigator.share({ files: [file], title: 'Умножайка: прогресс' }); } catch (e) { /* отменено */ }
    },
    loadFile() { fileInput.click(); },
    async showCode() {
      if (!store.profiles.length) { toast('Пока нечего переносить.'); return; }
      const code = await snapshotToCode(await store.exportSnapshot(ids()));
      const area = h('textarea', { readOnly: true, rows: 8, 'aria-label': 'Код переноса', dataset: { code: '1' } });
      area.value = code;
      const copy = h('button', {
        type: 'button', class: 'btn primary', on: {
          click: async () => {
            try { await navigator.clipboard.writeText(code); } catch (e) {
              area.focus(); area.select();
              try { document.execCommand('copy'); } catch (e2) { /* выделенный текст можно скопировать вручную */ }
            }
            toast('Код скопирован');
          },
        },
      }, 'Скопировать');
      await openModal({
        title: 'Код переноса',
        content: h('div', { class: 'stack' },
          h('p', {}, `Скопируй код и вставь его на другом устройстве: «Для взрослых» → «Перенос» → «Ввести код». В коде ${withWord(code.length, 'символ', 'символа', 'символов')} и контрольная сумма — повреждённый код не загрузится.`),
          h('label', { class: 'field' }, 'Код', area),
          h('div', {}, copy)),
      });
    },
    async enterCode() {
      const area = h('textarea', { rows: 8, placeholder: 'UMN1.…', 'aria-label': 'Вставь код', dataset: { codeInput: '1' } });
      const ok = await openModal({
        title: 'Ввести код',
        content: h('div', { class: 'stack' }, h('p', {}, 'Вставь код, скопированный на другом устройстве.'), h('label', { class: 'field' }, 'Код', area)),
        actions: [{ label: 'Отмена', value: false }, { label: 'Проверить и загрузить', value: true, primary: true }],
      });
      if (!ok) return;
      try {
        const snap = await codeToSnapshot(area.value);
        await importSnapshot(snap, refresh);
      } catch (e) { showError(e); }
    },
    async showQR() {
      if (!store.profiles.length) { toast('Пока нечего переносить.'); return; }
      const texts = await snapshotToQRTexts(await store.exportSnapshot(ids()));
      cleanup = qrView(container, texts, back);
    },
    scanQR() {
      cleanup = scannerView(container, back, refresh);
    },
  };

  function renderMain() {
    setKeyHandler(null);
    clear(container);
    const btn = (label, fn, attrs = {}) => h('button', {
      type: 'button', class: 'btn', on: { click: () => { Promise.resolve().then(fn).catch(showError); } }, ...attrs,
    }, label);
    container.append(
      h('section', { class: 'sheet stack' },
        h('h2', {}, 'Перенос на другое устройство'),
        h('p', {}, 'Три способа, результат одинаковый: весь прогресс переносится без потерь. При загрузке данные объединяются — по каждому примеру остаётся более свежая запись.'),
        h('label', { class: 'field', for: 'scope' }, 'Что переносим', scope)),
      h('section', { class: 'sheet stack' },
        h('h3', {}, 'Файл'),
        h('p', { class: 'muted' }, 'Удобно для резервной копии и для передачи через почту или мессенджер.'),
        h('div', { class: 'btn-row' },
          btn('Сохранить файл', actions.saveFile, { dataset: { action: 'save-file' } }),
          navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] })
            ? btn('Поделиться файлом', actions.shareFile) : null,
          btn('Загрузить файл', actions.loadFile, { dataset: { action: 'load-file' } })),
        fileInput),
      h('section', { class: 'sheet stack' },
        h('h3', {}, 'Код'),
        h('p', { class: 'muted' }, 'Текст, который можно скопировать и вставить. Контрольная сумма защищает от ошибок при копировании.'),
        h('div', { class: 'btn-row' },
          btn('Показать код', actions.showCode, { dataset: { action: 'show-code' } }),
          btn('Ввести код', actions.enterCode, { dataset: { action: 'enter-code' } }))),
      h('section', { class: 'sheet stack' },
        h('h3', {}, 'QR-код'),
        h('p', { class: 'muted' }, 'Без интернета и проводов: одно устройство показывает коды, второе считывает их камерой. Данные сжаты; если их много, кодов будет несколько.'),
        h('div', { class: 'btn-row' },
          btn('Показать QR', actions.showQR, { dataset: { action: 'show-qr' } }),
          btn('Сканировать QR', actions.scanQR, { dataset: { action: 'scan-qr' } }))));
  }
  renderMain();
  // Остановить камеру и автолистание QR, когда раздел закрывают.
  return () => { if (cleanup) cleanup(); cleanup = null; };
}
