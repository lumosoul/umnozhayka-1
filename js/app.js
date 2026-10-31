// Точка входа: база данных, звук, клавиатура, маршруты экранов, service worker.

import { store } from './data/store.js';
import { h, clear, focusFirst } from './ui/dom.js';
import { sound } from './ui/sound.js';
import { installKeys, setKeyHandler } from './ui/keys.js';
import { startBlinking } from './ui/owl.js';
import { openModal } from './ui/modal.js';
import { profilesScreen, newProfileScreen } from './ui/screens/profiles.js';
import { homeScreen } from './ui/screens/home.js';
import { diagIntroScreen, diagnosticScreen, diagResultScreen } from './ui/screens/diagnostic.js';
import { lessonScreen } from './ui/screens/lesson.js';
import { summaryScreen } from './ui/screens/summary.js';
import { blitzScreen } from './ui/screens/blitz.js';
import { progressScreen, libraryScreen } from './ui/screens/progress.js';
import { awardsScreen } from './ui/screens/awards.js';
import { parentGateScreen, parentScreen } from './ui/screens/parent.js';
import { blitzUnlocked } from './core/blitz.js';

const SCREENS = {
  profiles: profilesScreen,
  newProfile: newProfileScreen,
  home: homeScreen,
  diagIntro: diagIntroScreen,
  diagnostic: diagnosticScreen,
  diagResult: diagResultScreen,
  lesson: lessonScreen,
  summary: summaryScreen,
  blitz: blitzScreen,
  progress: progressScreen,
  library: libraryScreen,
  awards: awardsScreen,
  parentGate: parentGateScreen,
  parent: parentScreen,
};

// Экраны ребёнка требуют выбранного профиля.
const NEEDS_PROFILE = new Set(['home', 'diagIntro', 'diagnostic', 'diagResult', 'lesson', 'summary', 'blitz', 'progress', 'library', 'awards']);

const root = document.getElementById('app');
let current = null;
let navigating = false;

const ctx = {
  async go(name, params = {}, { replace = false } = {}) {
    if (navigating) {
      setTimeout(() => ctx.go(name, params, { replace }), 0);
      return;
    }
    navigating = true;
    try {
      if (NEEDS_PROFILE.has(name) && !store.current) name = store.profiles.length ? 'profiles' : 'newProfile';
      if (name === 'blitz' && !blitzUnlocked(store.current.facts)) name = 'home';
      if (name === 'home' && store.current && !store.current.profile.diag.done) name = 'diagIntro';
      if (current && current.destroy) current.destroy();
      setKeyHandler(null);
      let view = SCREENS[name](ctx, params);
      if (view && view.redirect) {
        navigating = false;
        ctx.go(view.redirect, view.params || {}, { replace: true });
        return;
      }
      current = { ...view, name };
      clear(root);
      root.append(view.el);
      window.scrollTo(0, 0);
      if (replace) history.replaceState({ screen: name }, '');
      else history.pushState({ screen: name }, '');
      document.title = `Умножайка${name === 'parent' || name === 'parentGate' ? ' — для взрослых' : ''}`;
      if (view.start) view.start();
      else focusFirst(view.el);
      view = null;
    } finally {
      navigating = false;
    }
  },

  async openProfile(id) {
    await store.selectProfile(id);
    ctx.go(store.current.profile.diag.done ? 'home' : 'diagIntro');
  },

  fail(e) {
    console.error(e);
    const quota = e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)));
    openModal({
      title: 'Что-то пошло не так',
      content: h('p', {}, quota
        ? 'На устройстве не хватает места, поэтому последний ответ не сохранился. Освободите место и откройте Умножайку снова.'
        : 'Не получилось сохранить или показать задание. Вернёмся на главный экран — всё, что было сохранено раньше, на месте.'),
    }).then(async () => {
      // Сверяемся с базой: в памяти не должно остаться несохранённых изменений.
      if (store.current) {
        try { await store.selectProfile(store.current.profile.id); } catch (err) { store.leaveProfile(); }
      }
      ctx.go(store.current ? 'home' : 'profiles');
    });
  },
};

// Кнопка «назад» браузера и Android: внутри приложения ведёт на шаг назад по смыслу.
window.addEventListener('popstate', () => {
  if (document.querySelector('.modal-backdrop')) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    history.pushState({ screen: current && current.name }, '');
    return;
  }
  if (current && current.onBack) {
    history.pushState({ screen: current.name }, '');
    current.onBack();
  } else if (current && current.name !== 'home' && current.name !== 'profiles') {
    ctx.go(store.current ? 'home' : 'profiles', {}, { replace: true });
  }
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker не зарегистрирован', e));
}

async function boot() {
  installKeys();
  startBlinking();
  const unlock = () => sound.unlock();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  try {
    await store.init();
  } catch (e) {
    clear(root);
    root.append(h('main', { class: 'screen' }, h('div', { class: 'sheet stack' },
      h('h1', {}, 'Не удалось открыть хранилище'),
      h('p', {}, 'Браузер не даёт сохранять данные (например, в приватном режиме). Открой Умножайку в обычном окне.'))));
    return;
  }
  sound.setEnabled(store.sound);
  if (store.lastProfile && store.profiles.some((p) => p.id === store.lastProfile) && store.profiles.length === 1) {
    await ctx.openProfile(store.lastProfile);
  } else {
    ctx.go(store.profiles.length ? 'profiles' : 'newProfile', {}, { replace: true });
  }
  registerServiceWorker();
}

boot();

// Для отладки и автоматических проверок.
window.umnozhayka = { store, ctx };
