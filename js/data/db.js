// Тонкая обёртка над IndexedDB. Хранилища:
//   profiles — профили детей (ключ id);
//   facts    — записи фактов, ключ «idПрофиля|3x7», индекс pid;
//   sessions — журнал занятий, ключ «idПрофиля|idЗанятия», индекс pid;
//   meta     — настройки приложения (звук, последний профиль).

const DB_NAME = 'umnozhayka';
const DB_VERSION = 1;
let dbPromise = null;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Браузер не поддерживает IndexedDB'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('facts')) db.createObjectStore('facts', { keyPath: 'id' }).createIndex('pid', 'pid');
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'key' }).createIndex('pid', 'pid');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => { dbPromise = null; reject(req.error); };
      req.onblocked = () => { dbPromise = null; reject(new Error('Закрой другие вкладки с приложением')); };
    });
  }
  return dbPromise;
}

/** Транзакция: fn(t) синхронно ставит запросы; результат — то, что fn положит в out.value. */
async function tx(stores, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const out = {};
    t.oncomplete = () => resolve(out.value);
    t.onerror = (e) => reject((e && e.target && e.target.error) || t.error || new Error('Не удалось сохранить данные'));
    t.onabort = () => reject(t.error || new Error('Не удалось сохранить данные'));
    fn(t, out);
  });
}

const factId = (pid, k) => `${pid}|${k}`;
const sessionRow = (pid, s) => ({ ...s, pid, key: `${pid}|${s.id}` });

export function getProfiles() {
  return tx(['profiles'], 'readonly', (t, out) => {
    const r = t.objectStore('profiles').getAll();
    r.onsuccess = () => { out.value = r.result.sort((a, b) => a.created - b.created); };
  });
}

export function putProfile(profile) {
  return tx(['profiles'], 'readwrite', (t) => { t.objectStore('profiles').put(profile); });
}

/** Факты профиля: { '3x7': запись }. */
export function getFacts(pid) {
  return tx(['facts'], 'readonly', (t, out) => {
    const r = t.objectStore('facts').index('pid').getAll(pid);
    r.onsuccess = () => {
      const facts = {};
      for (const row of r.result) {
        const { id, pid: _p, ...rec } = row;
        facts[rec.k] = rec;
      }
      out.value = facts;
    };
  });
}

export function putFacts(pid, recs) {
  return tx(['facts'], 'readwrite', (t) => {
    const s = t.objectStore('facts');
    for (const rec of recs) s.put({ ...rec, id: factId(pid, rec.k), pid });
  });
}

export function getSessions(pid) {
  return tx(['sessions'], 'readonly', (t, out) => {
    const r = t.objectStore('sessions').index('pid').getAll(pid);
    r.onsuccess = () => {
      out.value = r.result.map(({ pid: _p, key: _k, ...s }) => s).sort((a, b) => a.start - b.start);
    };
  });
}

export function putSession(pid, session) {
  return tx(['sessions'], 'readwrite', (t) => { t.objectStore('sessions').put(sessionRow(pid, session)); });
}

function deleteByIndex(store, pid) {
  const req = store.index('pid').openKeyCursor(IDBKeyRange.only(pid));
  req.onsuccess = () => {
    const cur = req.result;
    if (cur) {
      store.delete(cur.primaryKey);
      cur.continue();
    }
  };
}

export function deleteProfile(pid) {
  return tx(['profiles', 'facts', 'sessions'], 'readwrite', (t) => {
    t.objectStore('profiles').delete(pid);
    deleteByIndex(t.objectStore('facts'), pid);
    deleteByIndex(t.objectStore('sessions'), pid);
  });
}

/**
 * Полная запись данных профиля одной транзакцией (импорт, сброс). Старые ключи
 * сначала читаются, затем в одном обработчике удаляются и записываются новые —
 * так удаление гарантированно идёт раньше записи.
 */
export function replaceProfileData(profile, facts, sessions) {
  const pid = profile.id;
  return tx(['profiles', 'facts', 'sessions'], 'readwrite', (t) => {
    const fs = t.objectStore('facts');
    const ss = t.objectStore('sessions');
    t.objectStore('profiles').put(profile);
    const rf = fs.index('pid').getAllKeys(pid);
    rf.onsuccess = () => {
      for (const key of rf.result) fs.delete(key);
      for (const rec of Object.values(facts)) fs.put({ ...rec, id: factId(pid, rec.k), pid });
    };
    const rs = ss.index('pid').getAllKeys(pid);
    rs.onsuccess = () => {
      for (const key of rs.result) ss.delete(key);
      for (const s of sessions) ss.put(sessionRow(pid, s));
    };
  });
}

/** Профиль, факты и занятия одной транзакцией: либо всё записано, либо ничего. */
export function putBatch(profile, facts, sessions) {
  const pid = profile.id;
  return tx(['profiles', 'facts', 'sessions'], 'readwrite', (t) => {
    t.objectStore('profiles').put(profile);
    const fs = t.objectStore('facts');
    for (const rec of facts) fs.put({ ...rec, id: factId(pid, rec.k), pid });
    const ss = t.objectStore('sessions');
    for (const s of sessions) ss.put(sessionRow(pid, s));
  });
}

export function getMeta(key) {
  return tx(['meta'], 'readonly', (t, out) => {
    const r = t.objectStore('meta').get(key);
    r.onsuccess = () => { out.value = r.result ? r.result.value : undefined; };
  });
}

export function setMeta(key, value) {
  return tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put({ key, value }); });
}
