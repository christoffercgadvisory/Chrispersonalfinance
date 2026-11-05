// Saran keterangan dari histori: nominal mirip (+ dompet sama) → kategori & catatan yang paling sering dipakai.
import { state, cat } from './store.js';

const MONTHS_ID = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON_ID = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
const MONTH_RE = new RegExp('\\b(' + [...MONTHS_ID, ...MONTHS_EN].join('|') + ')\\b(\\s+(20\\d\\d))?', 'i');

const casing = (src, word) => src === src.toUpperCase() ? word.toUpperCase() : src[0] === src[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word;

// "Kos bulan oktober 2026" → kunci "kos bulan {m} {y}" supaya tiap bulan dihitung sebagai catatan yang sama.
function noteKey(note) {
  return String(note || '').trim().toLowerCase().replace(MONTH_RE, (m, w, y) => '{m}' + (y ? ' {y}' : '')).replace(/\s+/g, ' ');
}
// Ganti nama bulan di catatan ke bulan transaksi yang sedang diisi.
export function adaptNote(note, ymd) {
  const mo = +ymd.slice(5, 7) - 1, yr = ymd.slice(0, 4);
  return String(note || '').replace(MONTH_RE, (all, w, ySp, y) => {
    const en = MONTHS_EN.includes(w.toLowerCase());
    return casing(w, (en ? MONTHS_EN : MONTHS_ID)[mo]) + (y ? ' ' + yr : '');
  });
}

const kindOf = t => { const c = cat(t.category_id); return c ? c.kind : (t.amount < 0 ? 'expense' : 'income'); };

/**
 * amount: nominal positif yang lagi diketik. kinds: jenis kategori sesuai tab (expense/income/debt…).
 * Skor: nominal sama persis > mirip (±10%), dompet sama ×2, makin baru makin berat.
 */
export function suggestByAmount(amount, { walletId, kinds, date, limit = 3 }) {
  if (!amount || amount < 1000) return [];
  const now = Date.now(), groups = new Map();
  for (const t of state.transactions.values()) {
    if (t.deleted || t.transfer_id || !t.category_id || t.category_id.startsWith('sys_t') || t.category_id === 'sys_adjust') continue;
    const k = kindOf(t);
    if (!kinds.includes(k)) continue;
    const a = Math.abs(t.amount);
    const diff = Math.abs(a - amount) / amount;
    if (diff > 0.1) continue;
    const age = (now - new Date(t.date).getTime()) / 864e5;
    let s = (diff === 0 ? 3 : diff < 0.03 ? 1.6 : 1) * (t.wallet_id === walletId ? 2 : 1) * (age < 90 ? 2 : age < 365 ? 1.2 : 0.5);
    const key = t.category_id + '|' + noteKey(t.note);
    const g = groups.get(key) || { category_id: t.category_id, note: t.note || '', last: '', score: 0, n: 0, amounts: [] };
    g.score += s; g.n++;
    if (t.date > g.last) { g.last = t.date; g.note = t.note || ''; }
    g.amounts.push(a);
    groups.set(key, g);
  }
  return [...groups.values()].filter(g => g.n >= 1).sort((a, b) => b.score - a.score).slice(0, limit)
    .map(g => ({ category_id: g.category_id, note: adaptNote(g.note, date), n: g.n }));
}

// Catatan yang sering dipakai untuk kategori tertentu (muncul setelah kategori dipilih).
export function suggestNotes(categoryId, { walletId, date, typed = '', limit = 4 }) {
  if (!categoryId) return [];
  const q = typed.trim().toLowerCase(), now = Date.now(), groups = new Map();
  for (const t of state.transactions.values()) {
    if (t.deleted || t.category_id !== categoryId || !t.note) continue;
    if (q && !t.note.toLowerCase().includes(q)) continue;
    const age = (now - new Date(t.date).getTime()) / 864e5;
    const s = (t.wallet_id === walletId ? 1.5 : 1) * (age < 90 ? 3 : age < 365 ? 1.5 : 0.4);
    const key = noteKey(t.note);
    const g = groups.get(key) || { note: t.note, last: '', score: 0, amount: 0 };
    g.score += s;
    if (t.date > g.last) { g.last = t.date; g.note = t.note; g.amount = Math.abs(t.amount); }
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.score - a.score).slice(0, limit)
    .map(g => ({ note: adaptNote(g.note, date), amount: g.amount }))
    .filter(g => g.note.toLowerCase() !== q);
}
