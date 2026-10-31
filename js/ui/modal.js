// Модальные окна (подтверждения, подробности по клетке) и короткие уведомления.

import { h, focusFirst } from './dom.js';
import { pushModalKeys } from './keys.js';

/**
 * Открывает окно. content — узел или функция (close) => узел.
 * actions — [{ label, value, primary }]. Возвращает Promise со значением нажатой кнопки
 * (Escape и клик по фону — null).
 */
export function openModal({ title, content, actions = [{ label: 'Закрыть', value: null, primary: true }], labelledBy } = {}) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const titleId = labelledBy || `m${Math.random().toString(36).slice(2, 8)}`;
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      popKeys();
      backdrop.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      resolve(value);
    };
    const body = typeof content === 'function' ? content(close) : content;
    const actionsEl = h('div', { class: 'actions' });
    for (const a of actions) {
      actionsEl.append(h('button', {
        type: 'button', class: `btn${a.primary ? ' primary' : ''}`, dataset: { value: String(a.value) },
        on: { click: () => close(a.value) },
      }, a.label));
    }
    const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      title ? h('h2', { id: titleId }, title) : null,
      body,
      actions.length ? actionsEl : null);
    const backdrop = h('div', { class: 'modal-backdrop', on: { click: (e) => { if (e.target === backdrop) close(null); } } }, modal);
    const popKeys = pushModalKeys((e) => {
      if (e.key === 'Escape') { close(null); return true; }
      if (e.key === 'Tab') {
        const items = [...modal.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter((x) => !x.disabled);
        if (!items.length) return true;
        const i = items.indexOf(document.activeElement);
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
        items[next].focus();
        return true;
      }
      return false;
    });
    document.body.append(backdrop);
    focusFirst(modal);
  });
}

export function confirmModal(title, text, { yes = 'Да', no = 'Отмена' } = {}) {
  return openModal({
    title,
    content: typeof text === 'string' ? h('p', {}, text) : text,
    actions: [{ label: no, value: false }, { label: yes, value: true, primary: true }],
  }).then((v) => v === true);
}

let toastTimer = null;

export function toast(text, ms = 2800) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}
