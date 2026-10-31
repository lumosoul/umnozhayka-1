// Общие константы методики. Все числа здесь — единственный источник правды
// для ядра, интерфейса и тестов.

/** Порядок введения столбцов: от самых простых правил к самым трудным фактам. */
export const COLUMN_ORDER = [1, 10, 2, 5, 9, 3, 4, 6, 7, 8];

/** Интервалы коробок Лейтнера в днях: коробка 1 → 0 дней, …, коробка 5 → 14 дней. */
export const LEITNER_INTERVALS = [0, 1, 3, 7, 14];
export const BOX_MIN = 1;
export const BOX_MAX = 5;

/** Быстрый ответ (для «автоматизма»), мс. */
export const FAST_MS = 3000;
/** Верный ответ дольше этого порога не двигает факт в следующую коробку, мс. */
export const SLOW_MS = 6000;
/** Время ответа в статистике обрезается сверху, чтобы отвлечения не портили среднее, мс. */
export const TIME_CAP_MS = 20000;

/** «Знает» — столько верных ответов подряд. */
export const KNOW_STREAK = 3;
/** «Автоматизм» — столько сессий подряд с быстрыми верными ответами… */
export const AUTO_SESSIONS = 3;
/** …и минимум столько разных дней среди них. */
export const AUTO_MIN_DAYS = 2;

export const SESSION_TASKS = 20;
/** Доля новых и слабых фактов в занятии (остальное — повторение). */
export const SESSION_FOCUS_SHARE = 0.7;
export const MAX_NEW_PER_SESSION = 3;
/** Через сколько заданий вернуть пример после ошибки. */
export const RETRY_GAP_MIN = 2;
export const RETRY_GAP_MAX = 3;

export const DIAG_ITEMS = 20;
export const DIAG_MAX_MS = 5 * 60 * 1000;

export const BLITZ_MS = 60 * 1000;
/** Сколько освоенных фактов нужно, чтобы открылся блиц. */
export const BLITZ_MIN_FACTS = 5;

/** Сколько последних ответов хранить в истории каждого факта. */
export const HISTORY_LIMIT = 12;
/** Сколько последних сессий по факту хранить для правила «автоматизма» (нужны 3). */
export const SESS_LIMIT = 4;
/** Сколько последних неверных ответов (самих чисел) хранить по факту. */
export const WRONG_LIMIT = 5;

export const MAX_PROFILES = 4;

/** Версия формата экспорта/импорта. */
export const FORMAT_VERSION = 1;
export const APP_ID = 'umnozhayka';

/** Форматы заданий. Числовые коды — для компактной истории. */
export const FORMATS = {
  input: 1,    // ввод ответа на экранной клавиатуре
  choice: 2,   // выбор из 4 вариантов
  missing: 3,  // пропущенный множитель: ? × 7 = 56
  tf: 4,       // «верно или неверно»
  diag: 5,     // ответ в диагностике
  blitz: 6,    // ответ в блице
};
export const FORMAT_NAMES = Object.fromEntries(Object.entries(FORMATS).map(([k, v]) => [v, k]));

export const STATUS = {
  NEW: 'new',
  LEARNING: 'learning',
  KNOW: 'know',
  AUTO: 'auto',
};

export const STATUS_LABELS = {
  new: 'новый',
  learning: 'изучается',
  know: 'знает',
  auto: 'автоматизм',
};
