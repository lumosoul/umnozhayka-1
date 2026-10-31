// Крупная экранная цифровая клавиатура. Работает касанием, мышью и с физической
// клавиатуры (цифры, Backspace, Enter).

import { h, icon } from './dom.js';
import { sound } from './sound.js';

export function createKeypad({ maxDigits = 3, onChange = () => {}, onSubmit = () => {}, okLabel = 'Готово' } = {}) {
  let value = '';
  let enabled = true;
  const buttons = {};
  const el = h('div', { class: 'keypad', role: 'group', 'aria-label': 'Цифровая клавиатура' });

  const update = () => {
    buttons.ok.disabled = !value || !enabled;
    buttons.back.disabled = !value || !enabled;
    onChange(value);
  };

  function press(key) {
    if (!enabled) return;
    if (key === 'back') {
      if (!value) return;
      value = value.slice(0, -1);
      sound.play('tap');
      update();
    } else if (key === 'ok') {
      if (!value) return;
      sound.play('tap');
      onSubmit(value);
    } else if (/^[0-9]$/.test(key)) {
      if (value.length >= maxDigits) return;
      value = value === '0' ? key : value + key;
      sound.play('tap');
      update();
    }
  }

  for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok']) {
    let content = key;
    let label = key;
    let cls = 'btn';
    if (key === 'back') { content = icon('backspace'); label = 'Стереть'; }
    if (key === 'ok') { content = okLabel; label = okLabel; cls = 'btn primary ok'; }
    const b = h('button', {
      type: 'button', class: cls, 'aria-label': label, dataset: { key },
      on: { click: () => press(key) },
    }, content);
    buttons[key] = b;
    el.append(b);
  }
  update();

  return {
    el,
    press,
    get value() { return value; },
    clear() { value = ''; update(); },
    setEnabled(on) {
      enabled = !!on;
      for (const b of Object.values(buttons)) b.disabled = !enabled;
      if (enabled) update();
    },
    /** Обработчик клавиатуры: возвращает true, если клавиша использована. */
    handleKey(e) {
      if (e.key >= '0' && e.key <= '9' && e.key.length === 1) { press(e.key); return true; }
      if (e.key === 'Backspace' || e.key === 'Delete') { press('back'); return true; }
      if (e.key === 'Enter') { press('ok'); return true; }
      return false;
    },
  };
}
