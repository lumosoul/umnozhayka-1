// Только для Node: service worker кэширует все файлы приложения, иначе в режиме полёта что-то пропадёт.
import { test, assert } from './harness.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(relative(root, p).split('\\').join('/'));
  }
  return out;
}

test('Service worker: в кэш попадают все файлы приложения', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]));
  const appFiles = [
    'index.html', 'manifest.webmanifest',
    ...walk(join(root, 'js')), ...walk(join(root, 'css')), ...walk(join(root, 'icons')),
  ];
  for (const f of appFiles) assert.ok(listed.has(f), `нет в кэше: ${f}`);
  for (const f of listed) if (f) assert.ok(appFiles.includes(f) || f === '', `лишний путь: ${f}`);
});

test('Manifest: иконки 192 и 512 px, standalone, русский язык', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.lang, 'ru');
  assert.ok(m.start_url && m.scope);
  for (const size of ['192x192', '512x512']) {
    const icon = m.icons.find((i) => i.sizes === size && i.type === 'image/png');
    assert.ok(icon, `иконка ${size}`);
    const png = readFileSync(join(root, icon.src));
    assert.equal(png.readUInt32BE(16), Number(size.split('x')[0]), `ширина ${icon.src}`);
    assert.equal(png.readUInt32BE(20), Number(size.split('x')[1]), `высота ${icon.src}`);
  }
});
