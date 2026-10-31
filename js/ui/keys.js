// Единый обработчик клавиатуры: текущий экран или задание регистрирует свою функцию.
// Пока открыто окно (модальное), клавиши уходят только ему.

let handler = null;
const modalHandlers = [];

export function setKeyHandler(fn) {
  handler = fn;
}

export function pushModalKeys(fn) {
  modalHandlers.push(fn);
  return () => {
    const i = modalHandlers.lastIndexOf(fn);
    if (i >= 0) modalHandlers.splice(i, 1);
  };
}

export function installKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (modalHandlers.length) {
      if (modalHandlers[modalHandlers.length - 1](e)) e.preventDefault();
      return;
    }
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    // Enter и пробел на сфокусированной кнопке работают как обычно.
    if ((e.key === 'Enter' || e.key === ' ') && t && t.tagName === 'BUTTON' && !t.closest('.keypad')) return;
    if (handler && handler(e)) e.preventDefault();
  });
}
