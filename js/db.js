// IndexedDB tipis: semua data disimpan lokal di HP, jadi app kebuka instan walau offline.
export const TABLES = ['transactions', 'wallets', 'categories', 'budgets', 'recurring', 'events', 'settings'];
const NAME = 'duit';
const VERSION = 2;
let db;

export function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      TABLES.forEach(t => { if (!d.objectStoreNames.contains(t)) d.createObjectStore(t, { keyPath: 'id' }); });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox');
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const wrap = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export function getAll(store) {
  return wrap(db.transaction(store, 'readonly').objectStore(store).getAll());
}

export function metaGet(key) {
  return wrap(db.transaction('meta', 'readonly').objectStore('meta').get(key));
}

export function metaSet(key, value) {
  const t = db.transaction('meta', 'readwrite');
  t.objectStore('meta').put(value, key);
  return done(t);
}

// Simpan baris + catat di outbox untuk dikirim ke Sheets.
export function putWithOutbox(table, rows) {
  const t = db.transaction([table, 'outbox'], 'readwrite');
  const s = t.objectStore(table), o = t.objectStore('outbox');
  rows.forEach(r => { s.put(r); o.put({ table, row: r }, table + ':' + r.id); });
  return done(t);
}

// Simpan baris dari server (tidak masuk outbox).
export function putMany(table, rows) {
  const t = db.transaction(table, 'readwrite');
  const s = t.objectStore(table);
  rows.forEach(r => s.put(r));
  return done(t);
}

export async function outboxAll() {
  const t = db.transaction('outbox', 'readonly');
  const s = t.objectStore('outbox');
  const [keys, vals] = await Promise.all([wrap(s.getAllKeys()), wrap(s.getAll())]);
  return keys.map((k, i) => ({ key: k, ...vals[i] }));
}

export function outboxCount() {
  return wrap(db.transaction('outbox', 'readonly').objectStore('outbox').count());
}

// Hapus dari outbox hanya kalau isinya masih versi yang sudah terkirim
// (kalau user edit lagi saat sync jalan, versi baru tetap antre).
export function outboxAck(items) {
  const t = db.transaction('outbox', 'readwrite');
  const s = t.objectStore('outbox');
  items.forEach(it => {
    const r = s.get(it.key);
    r.onsuccess = () => {
      const cur = r.result;
      if (cur && cur.row && cur.row.updated_at === it.row.updated_at) s.delete(it.key);
    };
  });
  return done(t);
}

export function clearAll() {
  const stores = [...TABLES, 'meta', 'outbox'];
  const t = db.transaction(stores, 'readwrite');
  stores.forEach(s => t.objectStore(s).clear());
  return done(t);
}
