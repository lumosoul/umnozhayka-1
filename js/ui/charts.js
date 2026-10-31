// Простые доступные графики на SVG для родительского экрана: линия (среднее время
// ответа по дням) и столбики (решённые примеры по дням). Один ряд — без легенды,
// подсказка по наведению, касанию и стрелкам клавиатуры; числа дублируются таблицей.
// График рисуется под фактическую ширину контейнера, поэтому подписи всегда 13 px.

import { h, s, clear } from './dom.js';

const H = 220;
const M = { top: 22, right: 16, bottom: 30, left: 40 };

function niceStep(max, ticks = 4) {
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

function frame({ points, yFormat, title, W }) {
  const max = Math.max(0, ...points.map((p) => p.value || 0));
  const step = niceStep(max || 1);
  const top = Math.max(step, Math.ceil((max || 1) / step) * step);
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const X = (i) => M.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const Y = (v) => M.top + ih - (v / top) * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': title, tabindex: 0 });
  for (let v = 0; v <= top + 1e-9; v += step) {
    svg.append(s('line', { class: 'grid-line', x1: M.left, x2: W - M.right, y1: Y(v), y2: Y(v) }));
    svg.append(s('text', { class: 'axis-label', x: M.left - 8, y: Y(v) + 4, 'text-anchor': 'end' }, yFormat(v)));
  }
  // Подписи дней: столько, сколько помещается (не теснее 64 px).
  const every = Math.max(1, Math.ceil((points.length * 64) / iw));
  points.forEach((p, i) => {
    const last = i === points.length - 1;
    if (last || (i % every === 0 && (points.length - 1 - i) >= every)) {
      svg.append(s('text', { class: 'axis-label', x: X(i), y: H - 8, 'text-anchor': last ? 'end' : i === 0 ? 'start' : 'middle' }, p.label));
    }
  });
  return { svg, X, Y };
}

function attachHover(svg, points, X, W, tip, onSelect) {
  let current = -1;
  const select = (i) => {
    current = Math.max(0, Math.min(points.length - 1, i));
    onSelect(current);
    tip.textContent = points[current].detail;
  };
  const fromEvent = (e) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(X(i) - x) < Math.abs(X(best) - x)) best = i;
    return best;
  };
  svg.addEventListener('pointermove', (e) => select(fromEvent(e)));
  svg.addEventListener('pointerdown', (e) => select(fromEvent(e)));
  svg.addEventListener('focus', () => select(current < 0 ? points.length - 1 : current));
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { select(current - 1); e.preventDefault(); e.stopPropagation(); }
    if (e.key === 'ArrowRight') { select(current + 1); e.preventDefault(); e.stopPropagation(); }
  });
}

/** Перерисовывает график при изменении ширины контейнера. */
function responsive(figure, draw) {
  const holder = h('div', { style: { width: '100%' } });
  figure.append(holder);
  let lastW = 0;
  const render = () => {
    const w = Math.round(holder.clientWidth);
    if (!w || Math.abs(w - lastW) < 4) return;
    lastW = w;
    clear(holder);
    holder.append(draw(Math.max(260, w)));
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => requestAnimationFrame(render)).observe(holder);
  requestAnimationFrame(render);
}

function shell(title) {
  return h('figure', { class: 'chart', style: { margin: 0 } },
    h('figcaption', { style: { fontWeight: 750, marginBottom: '6px' } }, title));
}

/** Линия. points: [{ label, value|null, detail }]. */
export function lineChart({ title, points, yFormat = (v) => String(v), emptyText = 'Пока нет данных' }) {
  const fig = shell(title);
  if (!points.some((p) => p.value !== null)) {
    fig.append(h('p', { class: 'muted' }, emptyText));
    return fig;
  }
  const tip = h('div', { class: 'chart-tip', 'aria-live': 'polite' });
  responsive(fig, (W) => {
    const { svg, X, Y } = frame({ points, yFormat, title, W });
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      if (p.value === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.value).toFixed(1)} `;
      pen = true;
    });
    svg.append(s('path', { class: 'series', d }));
    const cross = s('line', { x1: 0, x2: 0, y1: M.top, y2: H - M.bottom, stroke: '#8d9ab5', 'stroke-width': 1, visibility: 'hidden' });
    svg.append(cross);
    const dots = points.map((p, i) => (p.value === null ? null : s('circle', { class: 'pt', cx: X(i), cy: Y(p.value), r: 4.5 })));
    dots.forEach((c) => c && svg.append(c));
    // Подпись последнего значения — единственная прямая подпись.
    const lastIdx = points.map((p) => p.value !== null).lastIndexOf(true);
    svg.append(s('text', { class: 'value-label', x: Math.min(X(lastIdx), W - M.right), y: Y(points[lastIdx].value) - 10, 'text-anchor': 'end' },
      yFormat(points[lastIdx].value)));
    attachHover(svg, points, X, W, tip, (i) => {
      cross.setAttribute('x1', X(i));
      cross.setAttribute('x2', X(i));
      cross.setAttribute('visibility', 'visible');
      dots.forEach((c, j) => c && c.setAttribute('r', j === i ? 6.5 : 4.5));
    });
    return svg;
  });
  fig.append(tip);
  return fig;
}

/** Столбики. points: [{ label, value, detail }]. */
export function barChart({ title, points, yFormat = (v) => String(v), emptyText = 'Пока нет данных' }) {
  const fig = shell(title);
  if (!points.some((p) => p.value > 0)) {
    fig.append(h('p', { class: 'muted' }, emptyText));
    return fig;
  }
  const tip = h('div', { class: 'chart-tip', 'aria-live': 'polite' });
  responsive(fig, (W) => {
    const { svg, X, Y } = frame({ points, yFormat, title, W });
    const band = (W - M.left - M.right) / Math.max(1, points.length - 1);
    const bw = Math.min(24, band * 0.6);
    const base = Y(0);
    const bars = points.map((p, i) => {
      if (!p.value) return null;
      const x = Math.max(M.left, Math.min(W - M.right - bw, X(i) - bw / 2));
      const y = Y(p.value);
      const r = Math.min(4, (base - y) / 2);
      const path = `M${x} ${base} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + bw - r} Q${x + bw} ${y} ${x + bw} ${y + r} V${base} Z`;
      const el = s('path', { class: 'bar', d: path });
      svg.append(el);
      return el;
    });
    const maxIdx = points.reduce((m, p, i) => (p.value > points[m].value ? i : m), 0);
    svg.append(s('text', { class: 'value-label', x: X(maxIdx), y: Y(points[maxIdx].value) - 6, 'text-anchor': 'middle' }, yFormat(points[maxIdx].value)));
    attachHover(svg, points, X, W, tip, (i) => {
      bars.forEach((b, j) => b && b.setAttribute('class', j === i ? 'bar' : 'bar part'));
    });
    svg.addEventListener('pointerleave', () => bars.forEach((b) => b && b.setAttribute('class', 'bar')));
    return svg;
  });
  fig.append(tip);
  return fig;
}
