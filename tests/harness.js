// Минимальный тестовый каркас без зависимостей: одинаково работает в Node и в браузере.

const registry = [];

export function test(name, fn) {
  registry.push({ name, fn });
}

function fmt(v) {
  try {
    return JSON.stringify(v, (k, x) => (x instanceof Uint8Array ? `Uint8Array(${x.length})` : x));
  } catch (e) {
    return String(v);
  }
}

function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return Number.isNaN(a) && Number.isNaN(b);
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== 'object') return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEq(a[k], b[k]));
}

class AssertionError extends Error {}

export const assert = {
  ok(v, msg = 'ожидалось истинное значение') {
    if (!v) throw new AssertionError(msg);
  },
  equal(a, b, msg = '') {
    if (a !== b) throw new AssertionError(`${msg} ожидалось ${fmt(b)}, получено ${fmt(a)}`.trim());
  },
  notEqual(a, b, msg = '') {
    if (a === b) throw new AssertionError(`${msg} значения не должны совпадать: ${fmt(a)}`.trim());
  },
  deepEqual(a, b, msg = '') {
    if (!deepEq(a, b)) throw new AssertionError(`${msg}\n  ожидалось: ${fmt(b)}\n  получено:  ${fmt(a)}`.trim());
  },
  approx(a, b, eps, msg = '') {
    if (Math.abs(a - b) > eps) throw new AssertionError(`${msg} ожидалось ≈${b}±${eps}, получено ${a}`.trim());
  },
  throws(fn, re, msg = '') {
    try { fn(); } catch (e) {
      if (re && !re.test(e.message)) throw new AssertionError(`${msg} неожиданная ошибка: ${e.message}`);
      return;
    }
    throw new AssertionError(`${msg} ожидалось исключение`.trim());
  },
  async rejects(fn, re, msg = '') {
    try { await fn(); } catch (e) {
      if (re && !re.test(e.message)) throw new AssertionError(`${msg} неожиданная ошибка: ${e.message}`);
      return;
    }
    throw new AssertionError(`${msg} ожидалось исключение`.trim());
  },
};

/** Запускает все зарегистрированные тесты. onResult(r) вызывается после каждого. */
export async function run(onResult = () => {}) {
  const results = [];
  for (const t of registry) {
    const started = Date.now();
    let error = null;
    try {
      await t.fn();
    } catch (e) {
      error = e;
    }
    const r = { name: t.name, ok: !error, error, ms: Date.now() - started };
    results.push(r);
    onResult(r);
  }
  return {
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
}
