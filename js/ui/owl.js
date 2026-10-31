// Совёнок Угу — помощник. Рисуется SVG, настроение меняется классами:
// happy (глаза-дуги), cheer (крылья вверх), think (смотрит вверх), bounce (подпрыгнуть).

import { s, h } from './dom.js';

export function owlSVG({ size = '', label = 'Совёнок Угу' } = {}) {
  const eye = (cx) => [
    s('circle', { cx, cy: 52, r: 17, fill: '#f7e9cf' }),
    s('g', { class: 'open-eyes' },
      s('circle', { cx, cy: 52, r: 12.5, fill: '#fff', stroke: '#5f3e22', 'stroke-width': 1.5 }),
      s('g', { class: 'pupil' },
        s('circle', { cx, cy: 53, r: 6.5, fill: '#1d2847' }),
        s('circle', { cx: cx + 2.2, cy: 50.5, r: 2, fill: '#fff' })),
      s('ellipse', { class: 'lid', cx, cy: 52, rx: 13.5, ry: 13.5, fill: '#8b5e34' })),
    s('path', { class: 'happy-eyes', d: `M${cx - 9} 55 Q${cx} 43 ${cx + 9} 55`, fill: 'none', stroke: '#1d2847', 'stroke-width': 4, 'stroke-linecap': 'round' }),
  ];
  const svg = s('svg', { viewBox: '0 0 120 120', class: `owl ${size}`.trim(), role: 'img', 'aria-label': label },
    s('path', { d: 'M24 34 L30 10 L44 28 Z', fill: '#5f3e22' }),
    s('path', { d: 'M96 34 L90 10 L76 28 Z', fill: '#5f3e22' }),
    s('ellipse', { class: 'wing wing-l', cx: 22, cy: 76, rx: 11, ry: 24, fill: '#5f3e22' }),
    s('ellipse', { class: 'wing wing-r', cx: 98, cy: 76, rx: 11, ry: 24, fill: '#5f3e22' }),
    s('ellipse', { cx: 60, cy: 66, rx: 40, ry: 46, fill: '#8b5e34' }),
    s('ellipse', { cx: 60, cy: 84, rx: 25, ry: 24, fill: '#f3ddb8' }),
    s('path', { d: 'M48 80 q4 4 8 0 M64 80 q4 4 8 0 M56 90 q4 4 8 0', fill: 'none', stroke: '#c9a77a', 'stroke-width': 2, 'stroke-linecap': 'round' }),
    ...eye(43),
    ...eye(77),
    s('path', { d: 'M54 63 L66 63 L60 73 Z', fill: '#f5b638', stroke: '#c98a12', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }),
    s('ellipse', { cx: 50, cy: 111, rx: 7, ry: 4, fill: '#f5b638' }),
    s('ellipse', { cx: 70, cy: 111, rx: 7, ry: 4, fill: '#f5b638' }),
  );
  return svg;
}

export function setMood(owl, mood) {
  if (!owl) return;
  owl.classList.remove('happy', 'cheer', 'think');
  if (mood === 'happy') owl.classList.add('happy');
  if (mood === 'cheer') owl.classList.add('happy', 'cheer');
  if (mood === 'think') owl.classList.add('think');
}

export function bounce(owl) {
  if (!owl) return;
  owl.classList.remove('bounce');
  void owl.getBoundingClientRect();
  owl.classList.add('bounce');
}

/** Совёнок с репликой. Возвращает { el, owl, say(text, mood) }. */
export function owlLine(text = '', { size = '', mood = '' } = {}) {
  const owl = owlSVG({ size });
  const bubble = h('div', { class: 'bubble', 'aria-live': 'polite' }, text);
  const el = h('div', { class: 'owl-line' }, owl, bubble);
  setMood(owl, mood);
  return {
    el,
    owl,
    bubble,
    say(t, m) {
      bubble.textContent = t;
      if (m !== undefined) setMood(owl, m);
    },
  };
}

let blinkTimer = null;

/** Изредка моргает (если пользователь не просил меньше движения). */
export function startBlinking() {
  if (blinkTimer || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  blinkTimer = setInterval(() => {
    for (const owl of document.querySelectorAll('svg.owl:not(.happy)')) {
      owl.classList.add('blink');
      setTimeout(() => owl.classList.remove('blink'), 150);
    }
  }, 4200);
}
