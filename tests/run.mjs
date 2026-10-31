// Запуск тестов в Node: node tests/run.mjs
import { run } from './harness.js';
import './all.js';
import './sw-assets.node.js';

const started = Date.now();
const summary = await run((r) => {
  const mark = r.ok ? '\u2713' : '\u2717';
  console.log(`${mark} ${r.name} (${r.ms} мс)`);
  if (!r.ok) console.log(`    ${String(r.error && (r.error.stack || r.error.message)).split('\n').join('\n    ')}`);
});
console.log(`\nПройдено: ${summary.passed}, с ошибками: ${summary.failed}, время: ${Date.now() - started} мс`);
process.exit(summary.failed ? 1 : 0);
