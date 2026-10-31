// Детерминируемый генератор случайных чисел: в приложении сеется временем,
// в тестах — фиксированным числом, чтобы результаты повторялись.

/** mulberry32: быстрый 32-битный генератор, возвращает функцию () => [0, 1). */
export function makeRng(seed = Date.now()) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Выбор элемента пропорционально весу. items: [{ value, weight }]. */
export function weightedPick(rng, items) {
  const total = items.reduce((s, it) => s + Math.max(0, it.weight), 0);
  if (total <= 0) return items.length ? items[0].value : undefined;
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0, it.weight);
    if (r < 0) return it.value;
  }
  return items[items.length - 1].value;
}

/** Короткий случайный идентификатор (буквы и цифры). */
export function makeId(prefix = '', rng = Math.random) {
  let s = '';
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < 10; i++) s += alphabet[Math.floor(rng() * alphabet.length)];
  return prefix + s;
}
