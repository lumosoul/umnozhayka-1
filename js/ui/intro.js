// Объяснения: слайды столбца (группы, сетка точек, числовой луч, приём, перестановка),
// правило умножения на 0 с мини-проверкой и карточка «Новый пример».

import { h, clear, TIMES, delay } from './dom.js';
import { dotArray, groupsView, sumText, numberLine, fingers, swapView, zeroGroups, zeroEmpty } from './visuals.js';
import { columnIntroSlides, zeroRuleSlides, ZERO_QUIZ, newFactCard } from '../core/tricks.js';
import { setKeyHandler } from './keys.js';
import { sound } from './sound.js';
import { pickPhrase, PRAISE } from '../core/ru.js';
import { makeRng, shuffle } from '../core/random.js';

/** Цепочка шагов приёма: «6 → 12 → 24». */
function chain(steps) {
  const row = h('div', { class: 'row center', style: { gap: '8px', fontSize: 'clamp(26px, 7vw, 36px)', fontWeight: 850 } });
  steps.forEach((st, i) => {
    if (i) row.append(h('span', { 'aria-hidden': 'true', style: { color: 'var(--ink-soft)' } }, '→'));
    row.append(h('span', { class: 'stack', style: { alignItems: 'center', gap: '0' } },
      h('span', {}, st.text),
      st.note ? h('span', { class: 'muted small', style: { fontSize: '14px', fontWeight: 700 } }, st.note) : null));
  });
  return row;
}

function trickChain(k, o) {
  switch (k) {
    case 10: return chain([{ text: String(o) }, { text: `${o}0`, note: 'приписали 0' }]);
    case 2: return chain([{ text: String(o) }, { text: `${o} + ${o}` }, { text: String(o * 2), note: 'удвоили' }]);
    case 4: return chain([{ text: String(o) }, { text: String(o * 2), note: 'удвоили' }, { text: String(o * 4), note: 'ещё раз' }]);
    case 8: return chain([{ text: String(o) }, { text: String(o * 2) }, { text: String(o * 4) }, { text: String(o * 8), note: 'три удвоения' }]);
    case 5: return chain([{ text: `${o} ${TIMES} 10`, note: String(o * 10) }, { text: String(o * 5), note: 'половина' }]);
    case 3: return chain([{ text: `${o} ${TIMES} 2`, note: String(o * 2) }, { text: `+ ${o}` }, { text: String(o * 3) }]);
    case 6: return chain([{ text: `${o} ${TIMES} 5`, note: String(o * 5) }, { text: `+ ${o}` }, { text: String(o * 6) }]);
    case 7: return chain([{ text: `${o * 5} + ${o * 2}`, note: `×5 и ×2` }, { text: String(o * 7) }]);
    default: return chain([{ text: `${o} ${TIMES} ${k}` }, { text: String(o * k) }]);
  }
}

/** Картинка слайда. Возвращает { el, extra } — extra: кнопка шага для интерактивных слайдов. */
function slideVisual(slide, onChange) {
  if (slide.type === 'groups') {
    let shown = 1;
    const box = h('div', { class: 'stack', style: { gap: '10px' } });
    const btn = h('button', { type: 'button', class: 'btn', dataset: { action: 'step' } }, 'Ещё группа');
    const render = () => {
      clear(box);
      box.append(groupsView(slide.a, slide.b, shown), h('div', { class: 'sum-line' }, sumText(slide.a, shown)));
      btn.hidden = shown >= slide.b;
      onChange(shown >= slide.b);
    };
    btn.addEventListener('click', () => { shown = Math.min(slide.b, shown + 1); sound.play('page'); render(); });
    render();
    return { el: box, extra: btn, step: () => (shown < slide.b ? (btn.click(), true) : false) };
  }
  if (slide.type === 'line') {
    let revealed = 0;
    const box = h('div', { class: 'visual' });
    const btn = h('button', { type: 'button', class: 'btn', dataset: { action: 'step' } }, 'Прыжок!');
    const render = () => {
      clear(box);
      box.append(numberLine(slide.a, slide.b, revealed));
      btn.hidden = revealed >= slide.b;
      onChange(revealed >= slide.b);
    };
    btn.addEventListener('click', () => { revealed = Math.min(slide.b, revealed + 1); sound.play('page'); render(); });
    render();
    return { el: box, extra: btn, step: () => (revealed < slide.b ? (btn.click(), true) : false) };
  }
  onChange(true);
  let el;
  switch (slide.type) {
    case 'array': el = dotArray(slide.a, slide.b); break;
    case 'swap': el = swapView(slide.a, slide.b); break;
    case 'fingers': el = fingers(slide.fingers); break;
    case 'trick': el = trickChain(slide.a, slide.b); break;
    case 'zero-groups': el = zeroGroups(slide.b); break;
    case 'zero-empty': el = zeroEmpty(); break;
    case 'zero-rule': el = h('div', { class: 'fact-card' }, h('div', { class: 'big-fact' }, `${TIMES} 0 = 0`)); break;
    default: el = h('div');
  }
  return { el: h('div', { class: 'visual' }, el), extra: null, step: () => false };
}

/** Показывает слайды по одному. Завершается, когда ребёнок пролистал все. */
export function runSlides(container, slides, { finishLabel = 'Начнём!' } = {}) {
  return new Promise((resolve) => {
    let i = 0;
    const render = () => {
      clear(container);
      const slide = slides[i];
      const nextBtn = h('button', { type: 'button', class: 'btn primary big', dataset: { action: 'next' } },
        i === slides.length - 1 ? finishLabel : 'Дальше');
      const vis = slideVisual(slide, (ready) => {
        nextBtn.disabled = false;
        nextBtn.classList.toggle('primary', ready);
      });
      const dots = h('div', { class: 'slide-dots', 'aria-hidden': 'true' },
        ...slides.map((_, j) => h('span', { class: j === i ? 'on' : '' })));
      const back = h('button', { type: 'button', class: 'btn', dataset: { action: 'back' }, disabled: i === 0 }, 'Назад');
      back.addEventListener('click', () => { if (i > 0) { i -= 1; sound.play('page'); render(); } });
      nextBtn.addEventListener('click', () => {
        sound.play('page');
        if (i < slides.length - 1) { i += 1; render(); } else { setKeyHandler(null); resolve(); }
      });
      container.append(h('section', { class: 'slide sheet', 'aria-roledescription': 'слайд', 'aria-label': `${i + 1} из ${slides.length}` },
        h('h2', {}, slide.title),
        vis.el,
        vis.extra ? h('div', { class: 'row center' }, vis.extra) : null,
        h('p', { class: 'text' }, slide.text),
        dots,
        h('div', { class: 'row spread' }, back, nextBtn)));
      setKeyHandler((e) => {
        if (e.key === 'ArrowRight' || e.key === 'Enter') { if (!vis.step()) nextBtn.click(); return true; }
        if (e.key === 'ArrowLeft') { back.click(); return true; }
        if (e.key === ' ') { vis.step(); return true; }
        return false;
      });
      (vis.extra || nextBtn).focus({ preventScroll: true });
    };
    render();
  });
}

export function runColumnIntro(container, k, facts) {
  return runSlides(container, columnIntroSlides(k, facts), { finishLabel: 'Понятно, начнём!' });
}

/** Правило нуля: три слайда и мини-проверка из трёх вопросов (без учёта в статистике). */
export async function runZeroRule(container, owlSay = () => {}) {
  await runSlides(container, zeroRuleSlides(), { finishLabel: 'Проверим!' });
  const rng = makeRng(Date.now());
  for (const item of ZERO_QUIZ) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      clear(container);
      const options = shuffle(rng, item.options);
      const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
      const grid = h('div', { class: 'choices' });
      for (const v of options) {
        const b = h('button', { type: 'button', class: 'btn', dataset: { value: String(v) } }, String(v));
        b.addEventListener('click', async () => {
          if (v === 0) {
            sound.play('correct');
            b.classList.add('chosen-right');
            feedback.textContent = pickPhrase(PRAISE);
            owlSay('Да! С нулём всегда 0.', 'happy');
            setKeyHandler(null);
            await delay(700);
            resolve();
          } else {
            sound.play('gentle');
            b.disabled = true;
            feedback.textContent = 'Помни: если есть 0, ответ тоже 0.';
            owlSay('Подсказка: ищи ноль!', 'think');
          }
        });
        grid.append(b);
      }
      container.append(h('div', { class: 'task' },
        h('div', { class: 'problem' }, `${item.a} ${TIMES} ${item.b} = `, h('span', { class: 'q' }, '?')),
        grid, feedback));
      setKeyHandler((e) => {
        const n = Number(e.key);
        if (n >= 1 && n <= 4) { grid.children[n - 1].click(); return true; }
        return false;
      });
      grid.children[0].focus({ preventScroll: true });
    });
  }
}

/** Карточка нового факта: пример, сетка точек, сложение, приём и перестановка. */
export function runFactCard(container, k, facts) {
  return new Promise((resolve) => {
    clear(container);
    const card = newFactCard(k, facts);
    const ok = h('button', { type: 'button', class: 'btn primary big block', dataset: { action: 'next' } }, 'Понятно!');
    ok.addEventListener('click', () => { sound.play('page'); setKeyHandler(null); resolve(); });
    container.append(h('section', { class: 'sheet fact-card stack' },
      h('h2', {}, card.title),
      h('div', { class: 'big-fact' }, `${card.a} ${TIMES} ${card.b} = ${card.p}`),
      h('div', { class: 'visual' }, card.fingers ? fingers(card.fingers) : dotArray(card.a, card.b)),
      card.sum ? h('div', { class: 'sum-line' }, card.sum) : null,
      h('p', { class: 'text', style: { fontWeight: 650 } }, card.trick),
      card.swap ? h('p', { class: 'text', style: { fontWeight: 650 } }, card.swap) : null,
      ok));
    setKeyHandler((e) => { if (e.key === 'Enter' || e.key === 'ArrowRight') { ok.click(); return true; } return false; });
    ok.focus({ preventScroll: true });
  });
}
