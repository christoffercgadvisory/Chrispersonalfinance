import * as db from './db.js';
export { TABLES } from './db.js';
import { TABLES } from './db.js';

// ---------- Helpers ----------
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const nowIso = () => new Date().toISOString();
export const pad = n => String(n).padStart(2, '0');
export const toYmd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const today = () => toYmd(new Date());
export const ym = s => s.slice(0, 7);

// Jenis kategori. sign = arah uang yang wajar.
export const KINDS = {
  expense: { label: 'Pengeluaran', sign: -1 },
  income: { label: 'Pemasukan', sign: 1 },
  debt: { label: 'Pinjam uang (gw berhutang)', short: 'Hutang', sign: 1 },
  loan: { label: 'Meminjamkan (piutang)', short: 'Piutang', sign: -1 },
  repayment: { label: 'Bayar hutang', sign: -1 },
  collection: { label: 'Terima pelunasan', sign: 1 },
  transfer: { label: 'Transfer', sign: 0 },
  adjust: { label: 'Penyesuaian saldo', sign: 0 },
};
export const DEBT_KINDS = ['debt', 'loan', 'repayment', 'collection'];

export const SYS_CATS = [
  { id: 'sys_debt', name: 'Hutang', kind: 'debt', icon: '' },
  { id: 'sys_loan', name: 'Piutang', kind: 'loan', icon: '' },
  { id: 'sys_repay', name: 'Bayar hutang', kind: 'repayment', icon: '' },
  { id: 'sys_collect', name: 'Terima pelunasan', kind: 'collection', icon: '' },
  { id: 'sys_tout', name: 'Transfer keluar', kind: 'transfer', icon: '' },
  { id: 'sys_tin', name: 'Transfer masuk', kind: 'transfer', icon: '' },
  { id: 'sys_adjust', name: 'Penyesuaian saldo', kind: 'adjust', icon: '' },
];

export const DEFAULT_CATS = [
  ['Makan & Minum', 'expense'], ['Kopi', 'expense'], ['Transportasi', 'expense'], ['Belanja', 'expense'], ['Tagihan', 'expense'],
  ['Rumah', 'expense'], ['Kesehatan', 'expense'], ['Hiburan', 'expense'], ['Olahraga', 'expense'], ['Keluarga', 'expense'],
  ['Hadiah & Donasi', 'expense'], ['Travel', 'expense'], ['Pendidikan', 'expense'], ['Asuransi', 'expense'], ['Lainnya', 'expense'],
  ['Gaji', 'income'], ['Bonus', 'income'], ['Bisnis', 'income'], ['Bunga', 'income'], ['Pemasukan lain', 'income'],
];

// Ikon dihitung saat tampil (lihat icons.js); field icon hanya diisi kalau dipilih manual.
export function guessIcon() { return ''; }

// ---------- State ----------
export const state = {
  transactions: new Map(), wallets: new Map(), categories: new Map(),
  budgets: new Map(), recurring: new Map(), events: new Map(), settings: new Map(),
  config: { url: '', token: '', hide: false, lastWallet: '', since: 0 },
  sync: { status: 'idle', pending: 0, last: 0, error: '' },
};
export const D = { balances: new Map(), byMonth: new Map(), usage: new Map(), persons: new Map(), months: [], version: 0 };

const listeners = new Set();
let emitQueued = false;
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() {
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(() => { emitQueued = false; listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); });
}

export const alive = table => [...state[table].values()].filter(r => !r.deleted);
export const get = (table, id) => { const r = state[table].get(id); return r && !r.deleted ? r : null; };
export const cat = id => state.categories.get(id) || null;
export const wallet = id => state.wallets.get(id) || null;

export async function init() {
  await db.open();
  const all = await Promise.all(TABLES.map(t => db.getAll(t)));
  TABLES.forEach((t, i) => { all[i].forEach(r => state[t].set(r.id, r)); });
  const cfg = await db.metaGet('config');
  if (cfg) Object.assign(state.config, cfg);
  state.sync.pending = await db.outboxCount();
  state.sync.last = (await db.metaGet('lastSync')) || 0;
  ensureSystemCategories();
  derive();
}

export async function saveConfig(patch) {
  Object.assign(state.config, patch);
  await db.metaSet('config', { ...state.config });
  emit();
}

function ensureSystemCategories() {
  const missing = SYS_CATS.filter(c => !state.categories.get(c.id));
  if (missing.length) save('categories', missing.map(c => ({ ...c, sort: 900 })), { silent: true });
}

// ---------- Derived data ----------
export function derive() {
  const bal = new Map(), byMonth = new Map(), usage = new Map(), persons = new Map();
  const cutoff = toYmd(new Date(Date.now() - 120 * 864e5));
  state.wallets.forEach(w => { if (!w.deleted) bal.set(w.id, Number(w.initial_balance) || 0); });
  state.transactions.forEach(t => {
    if (t.deleted) return;
    const a = Number(t.amount) || 0;
    if (bal.has(t.wallet_id)) bal.set(t.wallet_id, bal.get(t.wallet_id) + a);
    const m = ym(t.date || '');
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(t);
    if (t.date >= cutoff) usage.set(t.category_id, (usage.get(t.category_id) || 0) + 1);
    const c = state.categories.get(t.category_id);
    if (c && DEBT_KINDS.includes(c.kind) && t.person) {
      const key = t.person.trim();
      const p = persons.get(key.toLowerCase()) || { name: key, iOwe: 0, theyOwe: 0, txns: [] };
      if (c.kind === 'debt' || c.kind === 'repayment') p.iOwe += a;       // debt +, repayment −
      else p.theyOwe -= a;                                                // loan −, collection +
      p.txns.push(t);
      persons.set(key.toLowerCase(), p);
    }
  });
  const cmp = (x, y) => (y.date || '').localeCompare(x.date || '') || (y.created_at || '').localeCompare(x.created_at || '');
  byMonth.forEach(list => list.sort(cmp));
  persons.forEach(p => p.txns.sort(cmp));
  D.balances = bal; D.byMonth = byMonth; D.usage = usage; D.persons = persons;
  D.months = [...byMonth.keys()].sort();
  D.version++;
}

// Ringkasan income/expense untuk sekumpulan transaksi (transfer, penyesuaian & hutang tidak dihitung).
export function summarize(txns, { wallet: wid } = {}) {
  let income = 0, expense = 0;
  const byCat = new Map();
  for (const t of txns) {
    if (t.exclude) continue;
    if (wid && t.wallet_id !== wid) continue;
    const w = state.wallets.get(t.wallet_id);
    if (!wid && w && w.exclude_total) continue;
    const c = state.categories.get(t.category_id);
    const kind = c ? c.kind : (t.amount < 0 ? 'expense' : 'income');
    if (kind !== 'expense' && kind !== 'income') continue;
    const a = Number(t.amount) || 0;
    if (kind === 'expense') expense -= a; else income += a;
    const key = (t.category_id || '?') + '|' + kind;
    const e = byCat.get(key) || { id: t.category_id, kind, total: 0, count: 0 };
    e.total += kind === 'expense' ? -a : a; e.count++;
    byCat.set(key, e);
  }
  return { income, expense, net: income - expense, byCat: [...byCat.values()] };
}

export const monthTxns = m => D.byMonth.get(m) || [];
export function rangeTxns(from, to) { // inclusive months 'YYYY-MM'
  const out = [];
  D.months.forEach(m => { if (m >= from && m <= to) out.push(...D.byMonth.get(m)); });
  return out;
}

export function totalBalance() {
  let s = 0;
  alive('wallets').forEach(w => { if (!w.archived && !w.exclude_total) s += D.balances.get(w.id) || 0; });
  return s;
}

// ---------- Mutations ----------
const DEFAULTS = {
  transactions: { note: '', person: '', event_id: '', transfer_id: '', recurring_id: '', exclude: false, deleted: false },
  wallets: { type: 'bank', currency: 'IDR', initial_balance: 0, exclude_total: false, archived: false, sort: 0, color: '', deleted: false },
  categories: { group: '', parent_id: '', icon: '', sort: 0, deleted: false },
  budgets: { category_ids: '', wallet_id: '', start_month: '', end_month: '', deleted: false },
  recurring: { note: '', person: '', interval: 1, end_date: '', active: true, deleted: false },
  events: { icon: '', start_date: '', end_date: '', active: true, deleted: false },
  settings: { value: '', deleted: false },
};

export function save(table, rows, { silent = false } = {}) {
  const now = nowIso();
  const out = rows.map(r => {
    const prev = r.id ? state[table].get(r.id) : null;
    const row = { ...DEFAULTS[table], ...(prev || {}), ...r, updated_at: now };
    if (!row.id) row.id = uid(table[0]);
    if (table === 'transactions' && !row.created_at) row.created_at = now;
    state[table].set(row.id, row);
    return row;
  });
  const p = db.putWithOutbox(table, out).then(async () => {
    state.sync.pending = await db.outboxCount();
    emit();
  }).catch(e => console.error('save', e));
  derive();
  if (!silent) emit();
  scheduleSync();
  return p.then(() => out);
}

export function remove(table, ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).map(id => state[table].get(id)).filter(Boolean);
  return save(table, list.map(r => ({ ...r, deleted: true })));
}

// Hapus transaksi termasuk pasangan transfernya.
export function removeTxn(id) {
  const t = state.transactions.get(id);
  if (!t) return;
  const ids = [id];
  if (t.transfer_id) state.transactions.forEach(x => { if (x.transfer_id === t.transfer_id && x.id !== id && !x.deleted) ids.push(x.id); });
  return remove('transactions', ids);
}

export function seedDefaultCategories() {
  const have = new Set(alive('categories').map(c => c.name.toLowerCase()));
  const rows = DEFAULT_CATS.filter(([n]) => !have.has(n.toLowerCase())).map(([name, kind], i) => ({ id: uid('c'), name, kind, icon: '', sort: i }));
  if (rows.length) return save('categories', rows);
}

// ---------- Recurring ----------
export function nextDate(ymd, freq, interval = 1) {
  const [y, m, d] = ymd.split('-').map(Number);
  const n = Math.max(1, Number(interval) || 1);
  let dt;
  if (freq === 'daily') dt = new Date(y, m - 1, d + n);
  else if (freq === 'weekly') dt = new Date(y, m - 1, d + 7 * n);
  else if (freq === 'yearly') dt = new Date(y + n, m - 1, Math.min(d, daysIn(y + n, m - 1)));
  else { const tm = m - 1 + n; const ty = y + Math.floor(tm / 12); const mm = ((tm % 12) + 12) % 12; dt = new Date(ty, mm, Math.min(d, daysIn(ty, mm))); }
  return toYmd(dt);
}
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

// Bikin transaksi yang jatuh tempo. ID deterministik, jadi aman walau jalan di 2 device.
export function runRecurring() {
  const t = today();
  const txns = [], rules = [];
  alive('recurring').forEach(r => {
    if (!r.active || !r.next_date) return;
    let d = r.next_date, guard = 0;
    while (d <= t && (!r.end_date || d <= r.end_date) && guard++ < 400) {
      const id = 'r_' + r.id + '_' + d;
      if (!state.transactions.get(id)) {
        txns.push({ id, date: d, amount: Number(r.amount), category_id: r.category_id, wallet_id: r.wallet_id,
          note: r.note || r.name, person: r.person || '', recurring_id: r.id });
      }
      d = nextDate(d, r.freq, r.interval);
    }
    if (d !== r.next_date) rules.push({ ...r, next_date: d, active: !r.end_date || d <= r.end_date ? r.active : false });
  });
  if (txns.length) save('transactions', txns);
  if (rules.length) save('recurring', rules);
  return txns.length;
}

// ---------- Sync ----------
let syncTimer = null, syncing = false, again = false;
export function scheduleSync(ms = 1200) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => sync(), ms);
}

async function post(payload, timeout = 60000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(state.config.url, {
      method: 'POST', body: JSON.stringify({ ...payload, token: state.config.token }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctl.signal,
    });
    const text = await res.text();
    let j;
    try { j = JSON.parse(text); } catch { throw new Error('Respon bukan JSON. Cek URL Web App & akses "Anyone".'); }
    if (!j.ok) throw new Error(j.error === 'unauthorized' ? 'Token salah' : (j.error || 'Gagal'));
    return j;
  } finally { clearTimeout(timer); }
}

export async function ping(url, token) {
  const prev = { url: state.config.url, token: state.config.token };
  state.config.url = url; state.config.token = token;
  try { await post({ action: 'ping' }, 20000); return true; }
  finally { state.config.url = prev.url; state.config.token = prev.token; }
}

const CHUNK = 1500;
export async function sync({ full = false, onProgress } = {}) {
  if (!state.config.url || !state.config.token) return;
  if (!navigator.onLine) { state.sync.status = 'offline'; emit(); return; }
  if (syncing) { again = true; return; }
  syncing = true; again = false;
  state.sync.status = 'syncing'; state.sync.error = ''; emit();
  try {
    const outbox = await db.outboxAll();
    const total = outbox.length;
    const since = full ? 0 : (state.config.since || 0);
    const skip = [];
    let sent = 0, res;
    do {
      const chunk = outbox.splice(0, CHUNK);
      const changes = {};
      chunk.forEach(o => { (changes[o.table] = changes[o.table] || []).push(o.row); });
      const last = outbox.length === 0;
      res = await post(last ? { action: 'sync', changes, since, skip_stamps: skip } : { action: 'push', changes }, 180000);
      if (!last) skip.push(res.stamp);
      await db.outboxAck(chunk);
      sent += chunk.length;
      if (onProgress && total) onProgress(sent, total);
    } while (outbox.length);
    await mergeRemote(res.data || {});
    await saveConfig({ since: res.server_time });
    state.sync.last = Date.now();
    await db.metaSet('lastSync', state.sync.last);
    state.sync.status = 'ok';
  } catch (e) {
    state.sync.status = 'error';
    state.sync.error = e.name === 'AbortError' ? 'Timeout' : (e.message || String(e));
  } finally {
    state.sync.pending = await db.outboxCount();
    syncing = false;
    emit();
    if (again) scheduleSync(300);
  }
}

async function mergeRemote(data) {
  const pending = new Set((await db.outboxAll()).map(o => o.key));
  let changed = false;
  for (const t of TABLES) {
    const rows = (data[t] || []).filter(r => r && r.id && !pending.has(t + ':' + r.id)).map(r => normalize(t, r));
    const fresh = rows.filter(r => { const cur = state[t].get(r.id); return !cur || (r.updated_at || '') >= (cur.updated_at || ''); });
    if (!fresh.length) continue;
    fresh.forEach(r => state[t].set(r.id, r));
    await db.putMany(t, fresh);
    changed = true;
  }
  if (changed) { derive(); runRecurring(); }
}

function normalize(t, r) {
  const o = { ...r };
  ['amount', 'initial_balance', 'sort', 'interval'].forEach(k => { if (k in o) o[k] = o[k] === null || o[k] === '' ? (k === 'interval' ? 1 : 0) : Number(o[k]); });
  return o;
}

export async function resetLocal() {
  await db.clearAll();
  TABLES.forEach(t => state[t].clear());
  const keep = { url: state.config.url, token: state.config.token };
  state.config = { url: '', token: '', hide: false, lastWallet: '', since: 0, ...keep };
  await db.metaSet('config', state.config);
  ensureSystemCategories();
  derive(); emit();
}
