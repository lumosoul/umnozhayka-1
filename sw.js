// Service worker: при первом открытии кэширует все файлы приложения, дальше
// отдаёт их из кэша — Умножайка работает в режиме полёта. Чтобы выпустить
// обновление, поменяйте VERSION: новый кэш скачается целиком, старый удалится.

const VERSION = 'umnozhayka-v2';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg',
  './js/app.js',
  './js/core/blitz.js',
  './js/core/choices.js',
  './js/core/constants.js',
  './js/core/curriculum.js',
  './js/core/dates.js',
  './js/core/diagnostic.js',
  './js/core/facts.js',
  './js/core/leitner.js',
  './js/core/lesson.js',
  './js/core/profile.js',
  './js/core/random.js',
  './js/core/rewards.js',
  './js/core/ru.js',
  './js/core/session.js',
  './js/core/stats.js',
  './js/core/tricks.js',
  './js/data/db.js',
  './js/data/pack.js',
  './js/data/store.js',
  './js/data/transfer.js',
  './js/lib/codec.js',
  './js/lib/gf256.js',
  './js/lib/qr-decode.js',
  './js/lib/qr-encode.js',
  './js/lib/qr-worker.js',
  './js/ui/charts.js',
  './js/ui/coach.js',
  './js/ui/dom.js',
  './js/ui/grid.js',
  './js/ui/intro.js',
  './js/ui/keypad.js',
  './js/ui/keys.js',
  './js/ui/modal.js',
  './js/ui/owl.js',
  './js/ui/screens/awards.js',
  './js/ui/screens/blitz.js',
  './js/ui/screens/diagnostic.js',
  './js/ui/screens/home.js',
  './js/ui/screens/lesson.js',
  './js/ui/screens/parent.js',
  './js/ui/screens/profiles.js',
  './js/ui/screens/progress.js',
  './js/ui/screens/summary.js',
  './js/ui/screens/transfer.js',
  './js/ui/selfcheck.js',
  './js/ui/shell.js',
  './js/ui/sound.js',
  './js/ui/task.js',
  './js/ui/visuals.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: 'reload' — берём свежие файлы с сервера, минуя HTTP-кэш браузера.
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('umnozhayka-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Проверка устройства (раздел «Для взрослых»): сколько файлов должно быть в кэше и сколько есть.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'check' || !event.ports[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const keys = await cache.keys();
    const have = new Set(keys.map((r) => new URL(r.url).pathname));
    const missing = ASSETS.filter((a) => !have.has(new URL(a, self.registration.scope).pathname));
    event.ports[0].postMessage({ version: VERSION, expected: ASSETS.length, missing });
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (req.mode === 'navigate') {
      const page = await cache.match('./index.html');
      if (page) return page;
    }
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') {
        const page = await cache.match('./index.html');
        if (page) return page;
      }
      return new Response('Нет сети', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
