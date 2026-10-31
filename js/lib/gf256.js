// Арифметика поля GF(256) (полином 0x11D) и коды Рида — Соломона для QR:
// вычисление проверочных байтов и исправление ошибок (Берлекэмп — Мэсси, Ченя, Форни).

export const EXP = new Uint8Array(512);
export const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

export function gfMul(a, b) {
  return a && b ? EXP[LOG[a] + LOG[b]] : 0;
}

export function gfDiv(a, b) {
  if (!b) throw new Error('GF: деление на ноль');
  return a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0;
}

export function gfPow2(n) {
  return EXP[((n % 255) + 255) % 255];
}

/** Делитель (порождающий многочлен) степени degree, корни α^0 … α^(degree−1); старший коэффициент 1 опущен. */
export function rsDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** Остаток от деления data·x^n на делитель — проверочные байты. */
export function rsRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const b of data) {
    const factor = b ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

/** Значение многочлена (старший коэффициент первым) в точке x. */
function evalPoly(poly, x) {
  let y = 0;
  for (let i = 0; i < poly.length; i++) y = gfMul(y, x) ^ poly[i];
  return y;
}

/**
 * Исправляет ошибки в блоке (данные + nsym проверочных байтов) на месте.
 * Возвращает число исправленных байтов; бросает исключение, если исправить нельзя.
 */
export function rsCorrect(block, nsym) {
  const n = block.length;
  const synd = new Uint8Array(nsym);
  let hasError = false;
  for (let j = 0; j < nsym; j++) {
    synd[j] = evalPoly(block, gfPow2(j));
    if (synd[j]) hasError = true;
  }
  if (!hasError) return 0;

  // Берлекэмп — Мэсси: многочлен локаторов ошибок Λ (коэффициенты по возрастанию степени).
  let C = [1];
  let B = [1];
  let L = 0;
  let m = 1;
  let b = 1;
  for (let i = 0; i < nsym; i++) {
    let d = synd[i];
    for (let j = 1; j <= L; j++) d ^= gfMul(C[j] || 0, synd[i - j]);
    if (d === 0) {
      m += 1;
      continue;
    }
    const coef = gfDiv(d, b);
    const next = C.slice();
    while (next.length < B.length + m) next.push(0);
    for (let j = 0; j < B.length; j++) next[j + m] ^= gfMul(coef, B[j]);
    if (2 * L <= i) {
      B = C;
      L = i + 1 - L;
      b = d;
      m = 1;
    } else {
      m += 1;
    }
    C = next;
  }
  while (C.length > L + 1 && C[C.length - 1] === 0) C.pop();
  if (L === 0 || 2 * L > nsym) throw new Error('RS: слишком много ошибок');

  // Поиск Ченя: позиции ошибок.
  const positions = [];
  for (let deg = 0; deg < n; deg++) {
    const xinv = gfPow2(-deg);
    let v = 0;
    for (let j = C.length - 1; j >= 0; j--) v = gfMul(v, xinv) ^ C[j];
    if (v === 0) positions.push(deg);
  }
  if (positions.length !== L) throw new Error('RS: не удалось найти ошибки');

  // Форни: величины ошибок. Ω(x) = S(x)·Λ(x) mod x^nsym.
  const omega = new Uint8Array(nsym);
  for (let i = 0; i < nsym; i++) {
    let v = 0;
    for (let j = 0; j <= i && j < C.length; j++) v ^= gfMul(C[j], synd[i - j]);
    omega[i] = v;
  }
  for (const deg of positions) {
    const X = gfPow2(deg);
    const xinv = gfPow2(-deg);
    let om = 0;
    for (let i = nsym - 1; i >= 0; i--) om = gfMul(om, xinv) ^ omega[i];
    let dl = 0;
    for (let j = 1; j < C.length; j += 2) dl ^= gfMul(C[j], gfPow2(-deg * (j - 1)));
    if (dl === 0) throw new Error('RS: вырожденный случай');
    const mag = gfMul(X, gfDiv(om, dl));
    block[n - 1 - deg] ^= mag;
  }
  for (let j = 0; j < nsym; j++) {
    if (evalPoly(block, gfPow2(j)) !== 0) throw new Error('RS: исправление не сошлось');
  }
  return positions.length;
}
