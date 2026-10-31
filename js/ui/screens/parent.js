// Родительский экран за вопросом-замком: статистика по ребёнку (точность, график
// среднего времени ответа, самые трудные примеры, занятия по дням), перенос данных
// и настройки (звук, профили).

import { h, clear, icon, formatPercent, formatSeconds, formatFact, autoFit, TIMES } from '../dom.js';
import { topbar, backButton, screen } from '../shell.js';
import { createKeypad } from '../keypad.js';
import { setKeyHandler } from '../keys.js';
import { tableGrid, statusLegend, openFactDetail } from '../grid.js';
import { lineChart, barChart } from '../charts.js';
import { openModal, confirmModal, toast } from '../modal.js';
import { transferPanel } from './transfer.js';
import { selfCheckSection } from '../selfcheck.js';
import { sound } from '../sound.js';
import { store } from '../../data/store.js';
import { overallAccuracy, overallAvgTime, dailySeries, recentAccuracy, hardestFacts, sessionsByDay } from '../../core/stats.js';
import { streakInfo, totalStars } from '../../core/rewards.js';
import { masteryPercent, statusCounts } from '../../core/facts.js';
import { dayKey, shortDayLabel, fullDayLabel } from '../../core/dates.js';
import { AVATARS } from '../../core/profile.js';
import { STATUS_LABELS } from '../../core/constants.js';
import { withWord } from '../../core/ru.js';
import { makeRng, randInt } from '../../core/random.js';

let unlockedUntil = 0;

export function parentGateScreen(ctx, { then = 'parent', thenParams = {} } = {}) {
  if (Date.now() < unlockedUntil) return { redirect: then, params: thenParams };
  const rng = makeRng(Date.now());
  let a = randInt(rng, 12, 39);
  let b = randInt(rng, 12, 29);
  const back = () => ctx.go(store.current ? 'home' : store.profiles.length ? 'profiles' : 'newProfile');
  const question = autoFit(h('div', { class: 'problem gate', style: { fontSize: 'clamp(36px, 10vw, 56px)' } }), 24);
  const note = h('p', { class: 'center-text muted', 'aria-live': 'polite' }, 'Реши пример, чтобы открыть раздел для взрослых.');
  const render = (val = '') => {
    clear(question);
    question.append(`${a} ${TIMES} ${b} = `, h('span', { class: `slot${val ? '' : ' empty'}` }, val || '?'));
  };
  render();
  const pad = createKeypad({
    maxDigits: 4,
    okLabel: 'Открыть',
    onChange: render,
    onSubmit: (val) => {
      if (Number(val) === a * b) {
        unlockedUntil = Date.now() + 5 * 60 * 1000;
        ctx.go(then, thenParams, { replace: true });
      } else {
        note.textContent = 'Не подходит. Вот другой пример.';
        a = randInt(rng, 12, 39);
        b = randInt(rng, 12, 29);
        pad.clear();
        render();
      }
    },
  });
  const el = h('div', {}, topbar({ left: [backButton(back)], title: 'Для взрослых' }), screen([
    h('section', { class: 'sheet stack' },
      h('div', { class: 'row center' }, icon('lock', { style: { width: '40px', height: '40px', color: 'var(--primary)' } })),
      note, question, pad.el),
  ], { label: 'Вход для взрослых' }));
  return { el, start() { setKeyHandler((e) => pad.handleKey(e)); }, onBack: back };
}

function tile(value, label) {
  return h('div', { class: 'tile' }, h('div', { class: 'value' }, value), h('div', { class: 'label' }, label));
}

async function statsPanel(container, pid) {
  const data = await store.loadProfileData(pid);
  const { facts, sessions, profile } = data;
  const today = dayKey();
  const c = statusCounts(facts);
  const streak = streakInfo(sessions, today);
  const series = dailySeries(sessions, today, 14);
  const lessons = sessions.filter((s) => s.done && s.type === 'lesson').length;

  const timeChart = lineChart({
    title: 'Среднее время ответа по дням, секунды',
    points: series.map((d) => ({
      label: shortDayLabel(d.day),
      value: d.avgMs === null ? null : Math.round(d.avgMs / 100) / 10,
      detail: d.avgMs === null ? `${shortDayLabel(d.day)}: занятий не было` : `${shortDayLabel(d.day)}: ${formatSeconds(d.avgMs)} в среднем, ${withWord(d.answered, 'ответ', 'ответа', 'ответов')}`,
    })),
    yFormat: (v) => `${String(v).replace('.', ',')}`,
    emptyText: 'График появится после первого занятия.',
  });
  const tasksChart = barChart({
    title: 'Решено примеров по дням',
    points: series.map((d) => ({
      label: shortDayLabel(d.day),
      value: d.answered,
      detail: d.answered
        ? `${shortDayLabel(d.day)}: ${withWord(d.answered, 'пример', 'примера', 'примеров')}, ${withWord(d.sessions, 'занятие', 'занятия', 'занятий')}, точность ${formatPercent(d.accuracy)}, ${Math.max(1, Math.round(d.minutes))} мин`
        : `${shortDayLabel(d.day)}: занятий не было`,
    })),
    emptyText: 'Здесь будут занятия по дням.',
  });

  const hard = hardestFacts(facts, 8);
  const hardList = hard.length
    ? h('ul', { class: 'list' }, ...hard.map((x) => h('li', { class: 'hard-item' },
      h('button', { type: 'button', class: 'btn ghost fact', style: { minHeight: '48px', padding: '4px 8px', justifyContent: 'flex-start' }, on: { click: () => openFactDetail(facts, x.k) } }, formatFact(x.a, x.b)),
      h('span', { class: 'hard-meta' }, `точность ${formatPercent(x.accuracy)}, ${formatSeconds(x.avgMs)}, ошибок\u00a0${x.wrong}`),
      h('span', { class: 'hard-status small muted' }, STATUS_LABELS[x.status]))))
    : h('p', { class: 'muted' }, 'Трудных примеров пока нет.');

  const table = h('table', { class: 'log' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Время'), h('th', {}, 'Что'), h('th', {}, 'Примеров'), h('th', {}, 'Верно'), h('th', {}, 'Ср. время'), h('th', {}, 'Минут'), h('th', {}, 'Звёзды'))));
  const tbody = h('tbody');
  const groups = sessionsByDay(sessions).slice(0, 21);
  const TYPE = { lesson: 'занятие', blitz: 'блиц', diag: 'знакомство' };
  for (const g of groups) {
    const answered = g.list.reduce((s, x) => s + x.answered, 0);
    const correct = g.list.reduce((s, x) => s + x.correct, 0);
    tbody.append(h('tr', { class: 'day-row' }, h('td', { colspan: 7 }, `${fullDayLabel(g.day)}: ${withWord(g.list.length, 'занятие', 'занятия', 'занятий')}, ${withWord(answered, 'пример', 'примера', 'примеров')}, точность ${formatPercent(answered ? correct / answered : null)}`)));
    for (const x of g.list) {
      const t = new Date(x.start);
      tbody.append(h('tr', {},
        h('td', { 'data-label': 'Время' }, `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`),
        h('td', { 'data-label': 'Что' }, TYPE[x.type] + (x.done ? '' : ' (не закончено)')),
        h('td', { 'data-label': 'Примеров' }, String(x.answered)),
        h('td', { 'data-label': 'Верно' }, formatPercent(x.answered ? x.correct / x.answered : null)),
        h('td', { 'data-label': 'Ср. время' }, formatSeconds(x.answered ? x.tSum / x.answered : null)),
        h('td', { 'data-label': 'Минут' }, String(Math.max(0, Math.round((x.end - x.start) / 60000)))),
        h('td', { 'data-label': 'Звёзды' }, x.type === 'diag' ? '—' : String(x.stars))));
    }
  }
  table.append(tbody);

  clear(container);
  container.append(
    h('div', { class: 'tiles' },
      tile(`${masteryPercent(facts)}\u00a0%`, `освоено (знает ${c.know}, автоматизм ${c.auto})`),
      tile(formatPercent(overallAccuracy(facts)), 'точность за всё время'),
      tile(formatPercent(recentAccuracy(sessions, today, 7)), 'точность за 7 дней'),
      tile(formatSeconds(overallAvgTime(facts)), 'среднее время ответа'),
      tile(String(streak.current), `дней подряд (лучшая серия ${streak.best})`),
      tile(String(totalStars(sessions)), `звёзд, занятий: ${lessons}`)),
    h('div', { class: 'dash' },
      h('section', { class: 'sheet' }, timeChart),
      h('section', { class: 'sheet' }, tasksChart),
      h('section', { class: 'sheet stack' }, h('h2', {}, 'Самые трудные примеры'), hardList),
      h('section', { class: 'sheet stack' }, h('h2', {}, 'Таблица'), tableGrid(facts), statusLegend()),
      h('section', { class: 'sheet stack span2' }, h('h2', {}, 'Занятия по дням'),
        groups.length ? h('div', { class: 'table-wrap' }, table) : h('p', { class: 'muted' }, 'Занятий пока не было.'))),
    h('p', { class: 'small muted' }, `Профиль «${profile.name}» создан ${fullDayLabel(dayKey(profile.created))}. Знакомство (диагностика): ${profile.diag.done ? `пройдено, отмечено ${withWord(profile.diag.known, 'известный пример', 'известных примера', 'известных примеров')}` : 'ещё не пройдено'}.`),
  );
}

async function settingsPanel(container, ctx) {
  clear(container);
  const soundBtn = h('button', { type: 'button', class: 'btn', dataset: { action: 'toggle-sound' } });
  const renderSound = () => { soundBtn.replaceChildren(icon(store.sound ? 'sound' : 'mute', { style: { width: '24px', height: '24px' } }), store.sound ? 'Звук включён' : 'Звук выключен'); };
  soundBtn.addEventListener('click', async () => { await store.setSound(!store.sound); sound.setEnabled(store.sound); renderSound(); });
  renderSound();

  const profilesList = h('ul', { class: 'list' });
  for (const p of store.profiles) {
    const rename = h('button', {
      type: 'button', class: 'btn', on: {
        click: async () => {
          const input = h('input', { type: 'text', value: p.name, maxLength: 24 });
          let chosen = p.avatar;
          const picker = h('div', { class: 'avatar-picker' });
          for (const a of AVATARS) {
            const b = h('button', { type: 'button', 'aria-pressed': String(a === chosen), on: { click: () => { chosen = a; for (const x of picker.children) x.setAttribute('aria-pressed', String(x.textContent === chosen)); } } }, a);
            picker.append(b);
          }
          const ok = await openModal({
            title: 'Изменить профиль',
            content: h('div', { class: 'stack' }, h('label', { class: 'field' }, 'Имя', input), picker),
            actions: [{ label: 'Отмена', value: false }, { label: 'Сохранить', value: true, primary: true }],
          });
          if (ok) { await store.renameProfile(p.id, input.value, chosen); settingsPanel(container, ctx); toast('Сохранено'); }
        },
      },
    }, 'Изменить');
    const reset = h('button', {
      type: 'button', class: 'btn', on: {
        click: async () => {
          if (await confirmModal('Сбросить прогресс?', `Весь прогресс профиля «${p.name}» будет удалён, а знакомство начнётся заново. Сначала можно сохранить файл в разделе «Перенос».`, { yes: 'Сбросить' })) {
            await store.resetProfile(p.id);
            toast('Прогресс сброшен');
          }
        },
      },
    }, 'Сбросить');
    const del = h('button', {
      type: 'button', class: 'btn', on: {
        click: async () => {
          if (await confirmModal('Удалить профиль?', `Профиль «${p.name}» и весь его прогресс будут удалены с этого устройства.`, { yes: 'Удалить' })) {
            await store.deleteProfile(p.id);
            toast('Профиль удалён');
            settingsPanel(container, ctx);
          }
        },
      },
    }, 'Удалить');
    profilesList.append(h('li', { style: { flexWrap: 'wrap' } }, h('span', { class: 'avatar' }, p.avatar), h('strong', {}, p.name), h('span', { class: 'row', style: { marginLeft: 'auto' } }, rename, reset, del)));
  }
  container.append(
    h('section', { class: 'sheet stack' }, h('h2', {}, 'Звук'), h('p', { class: 'muted' }, 'Мягкие звуки при ответах. Кнопка звука есть и на каждом экране.'), h('div', {}, soundBtn)),
    h('section', { class: 'sheet stack' }, h('h2', {}, 'Профили'), store.profiles.length ? profilesList : h('p', { class: 'muted' }, 'Профилей пока нет.'),
      store.canAddProfile ? h('div', {}, h('button', { type: 'button', class: 'btn', on: { click: () => ctx.go('newProfile') } }, 'Добавить профиль')) : h('p', { class: 'small muted' }, 'Создано 4 профиля — это максимум.')),
    h('section', { class: 'sheet stack' }, h('h2', {}, 'Как устроено обучение'),
      h('p', {}, 'При первом запуске короткое знакомство (20 примеров, не дольше 5 минут) отмечает известные примеры. Дальше каждое занятие — 20 заданий примерно на 10 минут: 70 % новых и слабых примеров, 30 % повторения.'),
      h('p', {}, 'Повторение идёт по 5 коробкам Лейтнера с интервалами 0, 1, 3, 7 и 14 дней. Верный ответ переносит пример в следующую коробку, верный, но дольше 6 секунд, оставляет на месте, ошибка возвращает в первую.'),
      h('p', {}, 'Статусы: «знает» — 3 верных ответа подряд, «автоматизм» — верно быстрее 3 секунд в трёх занятиях подряд минимум в два разных дня. Новых примеров — не больше трёх за занятие, столбцы идут в порядке ×1, ×10, ×2, ×5, ×9, ×3, ×4, ×6, ×7, ×8.')),
    selfCheckSection(),
    h('section', { class: 'sheet stack' }, h('h2', {}, 'Где хранятся данные'),
      h('p', {}, 'Только на этом устройстве, в браузере (IndexedDB). Регистрации, рекламы и отправки данных нет. Приложение работает без интернета.'),
      h('p', { class: 'muted' }, 'Совет: иногда сохраняйте файл в разделе «Перенос» — так прогресс не потеряется, если браузер очистит данные сайта.')),
  );
}

export function parentScreen(ctx, { tab = 'stats', pid = null } = {}) {
  const back = () => ctx.go(store.current ? 'home' : store.profiles.length ? 'profiles' : 'newProfile');
  const body = h('div', { class: 'stack' });
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Разделы' });
  let profileId = pid || (store.current && store.current.profile.id) || (store.profiles[0] && store.profiles[0].id);
  const profileRow = h('div', { class: 'row' });

  const renderProfiles = () => {
    clear(profileRow);
    if (tab !== 'stats' || store.profiles.length < 2) return;
    for (const p of store.profiles) {
      profileRow.append(h('button', {
        type: 'button', class: 'btn', 'aria-pressed': String(p.id === profileId), style: p.id === profileId ? { borderColor: 'var(--primary)', boxShadow: 'inset 0 0 0 2px var(--primary)' } : {},
        on: { click: () => { profileId = p.id; render(); } },
      }, h('span', { class: 'avatar', 'aria-hidden': 'true', style: { width: '32px', height: '32px', fontSize: '20px' } }, p.avatar), p.name));
    }
  };

  let panelCleanup = null;
  const render = async () => {
    if (panelCleanup) { panelCleanup(); panelCleanup = null; }
    if (!store.profiles.some((p) => p.id === profileId)) {
      profileId = (store.current && store.current.profile.id) || (store.profiles[0] && store.profiles[0].id) || null;
    }
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    renderProfiles();
    clear(body);
    if (tab === 'stats') {
      if (!profileId) { body.append(h('p', { class: 'muted' }, 'Профилей пока нет. Создайте профиль ребёнка или загрузите данные в разделе «Перенос».')); return; }
      await statsPanel(body, profileId);
    } else if (tab === 'transfer') {
      panelCleanup = transferPanel(body, ctx, () => render());
    } else {
      await settingsPanel(body, ctx);
    }
  };

  for (const [id, label] of [['stats', 'Статистика'], ['transfer', 'Перенос'], ['settings', 'Настройки']]) {
    tabs.append(h('button', {
      type: 'button', class: 'btn', role: 'tab', dataset: { tab: id },
      on: { click: () => { tab = id; render(); } },
    }, label));
  }
  const el = h('div', {}, topbar({ left: [backButton(back)], title: 'Для взрослых' }), screen([tabs, profileRow, body], { wide: true, label: 'Для взрослых' }));
  return {
    el,
    start() { render().catch((e) => ctx.fail(e)); },
    destroy() { if (panelCleanup) panelCleanup(); },
    onBack: back,
  };
}
