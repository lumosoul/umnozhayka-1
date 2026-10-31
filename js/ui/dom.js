// Маленькие помощники для построения интерфейса без библиотек.

const SVG_NS = 'http://www.w3.org/2000/svg';

function applyAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string' && el.namespaceURI !== SVG_NS) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** h('button', { class: 'btn', on: { click } }, 'Текст') */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Объявление для экранных читалок. */
export function announce(text) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = text; }, 30);
}

/** Ждём, пока кадр действительно нарисован (для честного замера времени ответа). */
export function afterPaint() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

export function focusFirst(root) {
  const el = root.querySelector('[autofocus], .btn.primary, button, input, [tabindex="0"]');
  if (el) el.focus({ preventScroll: true });
}

export const TIMES = '×';

export function formatFact(a, b) {
  return `${a} ${TIMES} ${b}`;
}

export function formatSeconds(ms) {
  if (ms === null || ms === undefined) return '—';
  return `${(ms / 1000).toFixed(1).replace('.', ',')} с`;
}

export function formatPercent(x) {
  if (x === null || x === undefined) return '—';
  return `${Math.round(x * 100)}\u00a0%`;
}

/** Простые значки (SVG), чтобы не зависеть от шрифтов с эмодзи. */
export const ICONS = {
  sound: 'M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
  mute: 'M4 9v6h4l5 4V5L8 9H4zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z',
  close: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z',
  back: 'M15.4 5 8.4 12l7 7 1.4-1.4L11.2 12l5.6-5.6z',
  lock: 'M12 2a5 5 0 0 0-5 5v3H5v12h14V10h-2V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9zm3 4a2 2 0 0 1 1 3.7V20h-2v-2.3A2 2 0 0 1 12 14z',
  star: 'M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8z',
  fire: 'M13.5 2s.9 3-1.6 5.6C9.7 9.9 8 11.7 8 14.6 8 18.2 10.6 21 14 21s6-2.7 6-6.3c0-2.6-1.4-4.6-2.6-5.9-.2 1.5-1 2.9-2.2 3.5.4-3.6-.7-7.6-1.7-10.3zM6.7 9.6C5 11.2 4 13 4 15.1 4 18.4 6.4 21 9.6 21.4 7.4 19.9 6 17.4 6 14.6c0-1.9.2-3.4.7-5z',
  check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
  cross: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z',
  backspace: 'M21 5H8.6L2 12l6.6 7H21V5zm-3.6 10.6-1.4 1.4-2.6-2.6-2.6 2.6-1.4-1.4 2.6-2.6-2.6-2.6L10.8 9l2.6 2.6L16 9l1.4 1.4-2.6 2.6z',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6z',
  grid: 'M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z',
  book: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5a.5.5 0 0 0 0 1H20v3H6.5A2.5 2.5 0 0 1 4 19.5z',
  trophy: 'M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z',
  owl: 'M12 3c-3 0-5 1-6 2.5L4 3v6a8 8 0 0 0 16 0V3l-2 2.5C17 4 15 3 12 3zm-3 6.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM12 14l1.2 1.8h-2.4z',
  crown: 'M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z',
  column: 'M5 3h6v18H5zm8 0h6v18h-6z',
  camera: 'M9 4 7.2 6H4v14h16V6h-3.2L15 4H9zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  next: 'M8.6 5 7.2 6.4 12.8 12l-5.6 5.6L8.6 19l7-7z',
};

export function icon(name, attrs = {}) {
  return s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', ...attrs },
    s('path', { d: ICONS[name], fill: 'currentColor' }));
}
