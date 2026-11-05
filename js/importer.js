// Import CSV export dari Money Lover (biasanya UTF-16, dipisah tab).
import { state, alive, uid, guessIcon, SYS_CATS } from './store.js';

export async function readFile(file) {
  const u8 = new Uint8Array(await file.arrayBuffer());
  let enc = 'utf-8', start = 0;
  if (u8[0] === 0xFF && u8[1] === 0xFE) { enc = 'utf-16le'; start = 2; }
  else if (u8[0] === 0xFE && u8[1] === 0xFF) { enc = 'utf-16be'; start = 2; }
  else if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) start = 3;
  else {
    let zOdd = 0;
    for (let i = 1; i < Math.min(u8.length, 400); i += 2) if (u8[i] === 0) zOdd++;
    if (zOdd > 50) enc = 'utf-16le';
  }
  return new TextDecoder(enc).decode(u8.subarray(start));
}

export function parseDelimited(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const counts = { '\t': first.split('\t').length, ';': first.split(';').length, ',': first.split(',').length };
  const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"' && field === '') q = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

const HEADER_MAP = [
  ['id', /^(id|no\.?|#)$/],
  ['date', /^(date|tanggal|tgl)$/],
  ['category', /^(category|kategori)$/],
  ['amount', /^(amount|jumlah|nominal)$/],
  ['currency', /^(currency|mata ?uang)$/],
  ['note', /^(note|notes|catatan|keterangan)$/],
  ['wallet', /^(wallet|dompet|account|akun)$/],
  ['person', /^(with|dengan|person|contact|kontak)$/],
  ['event', /^(event|acara)$/],
  ['exclude', /^(exclude ?report|exclude|tidak dilaporkan)$/],
];

export function mapHeaders(headers) {
  const idx = {};
  headers.forEach((h, i) => {
    const k = h.replace(/^﻿/, '').trim().toLowerCase();
    for (const [name, re] of HEADER_MAP) if (re.test(k) && idx[name] === undefined) { idx[name] = i; break; }
  });
  return idx;
}

export function parseAmount(s) {
  if (typeof s === 'number') return s;
  let t = String(s || '').trim().replace(/\s|rp|idr/gi, '');
  const neg = /^-|^\(.*\)$|-$/.test(t);
  t = t.replace(/[^0-9.,]/g, '');
  if (!t) return NaN;
  const lastDot = t.lastIndexOf('.'), lastComma = t.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    t = t.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (lastDot >= 0) {
    t = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
  }
  const n = Number(t);
  return neg ? -n : n;
}

export function parseDate(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let y = m[3]; if (y.length === 2) y = '20' + y;
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; // Money Lover: dd/mm/yyyy
  }
  return '';
}

const SYS_NAME = [
  ['sys_tout', /^(outgoing transfer|transfer keluar|transfer out)$/i],
  ['sys_tin', /^(incoming transfer|transfer masuk|transfer in)$/i],
  ['sys_collect', /^(debt collection|penagihan( hutang)?|terima pelunasan|pelunasan piutang)$/i],
  ['sys_repay', /^(repayment|bayar hutang|pembayaran( hutang)?|pelunasan hutang)$/i],
  ['sys_debt', /^(debt|hutang|utang)$/i],
  ['sys_loan', /^(loan|piutang|pinjaman|meminjamkan)$/i],
  ['sys_adjust', /^(adjust(ment)?( balance)?|penyesuaian( saldo)?)$/i],
];

function hash(s) { // FNV-1a 32-bit → base36
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

const truthy = v => /^(yes|ya|true|1|x|✓)$/i.test(String(v || '').trim());
const slug = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

// Hasil: rencana import (belum disimpan) + ringkasan untuk preview.
export function buildImport(rows) {
  if (rows.length < 2) throw new Error('File kosong atau formatnya tidak dikenali.');
  const idx = mapHeaders(rows[0]);
  for (const need of ['date', 'category', 'amount', 'wallet'])
    if (idx[need] === undefined) throw new Error(`Kolom "${need}" tidak ketemu. Header: ${rows[0].join(', ')}`);

  const walletsByName = new Map(alive('wallets').map(w => [w.name.toLowerCase(), w]));
  const catsByName = new Map();
  alive('categories').forEach(c => { if (!c.id.startsWith('sys_')) catsByName.set(c.name.toLowerCase() + '|' + c.kind, c); });
  const eventsByName = new Map(alive('events').map(e => [e.name.toLowerCase(), e]));

  // Tebak jenis kategori dari tanda nominal mayoritas.
  const signs = new Map();
  const recs = [];
  const skipped = [];
  rows.slice(1).forEach((r, i) => {
    const date = parseDate(r[idx.date]);
    const amount = parseAmount(r[idx.amount]);
    const category = String(r[idx.category] || '').trim() || 'Tanpa kategori';
    const walletName = String(r[idx.wallet] || '').trim() || 'Dompet';
    if (!date || !isFinite(amount)) { skipped.push(i + 2); return; }
    recs.push({ line: i + 2, date, amount, category, walletName,
      currency: idx.currency !== undefined ? String(r[idx.currency] || '').trim().toUpperCase() : 'IDR',
      note: idx.note !== undefined ? String(r[idx.note] || '').trim() : '',
      person: idx.person !== undefined ? String(r[idx.person] || '').trim() : '',
      event: idx.event !== undefined ? String(r[idx.event] || '').trim() : '',
      exclude: idx.exclude !== undefined ? truthy(r[idx.exclude]) : false,
      mlid: idx.id !== undefined ? String(r[idx.id] || '').trim() : '' });
    const s = signs.get(category) || { pos: 0, neg: 0 };
    if (amount >= 0) s.pos++; else s.neg++;
    signs.set(category, s);
  });

  const newWallets = [], newCats = [], newEvents = [];
  const walletId = (name, currency) => {
    const k = name.toLowerCase();
    if (!walletsByName.has(k)) {
      const w = { id: 'w_' + (slug(name) || hash(name)), name, type: /cash|tunai|dompet/i.test(name) ? 'cash' : 'bank',
        currency: currency || 'IDR', initial_balance: 0, exclude_total: !!currency && currency !== 'IDR', archived: false };
      walletsByName.set(k, w); newWallets.push(w);
    }
    return walletsByName.get(k).id;
  };
  const catId = name => {
    for (const [id, re] of SYS_NAME) if (re.test(name)) return id;
    const s = signs.get(name) || { pos: 0, neg: 1 };
    const kind = s.pos > s.neg ? 'income' : 'expense';
    const k = name.toLowerCase() + '|' + kind;
    if (!catsByName.has(k)) {
      const c = { id: 'c_' + (slug(name) || hash(name)) + '_' + kind[0], name, kind, icon: guessIcon(name, kind), sort: 0 };
      catsByName.set(k, c); newCats.push(c);
    }
    return catsByName.get(k).id;
  };
  const eventId = name => {
    if (!name) return '';
    const k = name.toLowerCase();
    if (!eventsByName.has(k)) {
      const e = { id: 'e_' + (slug(name) || hash(name)), name, icon: '🎟️', active: false };
      eventsByName.set(k, e); newEvents.push(e);
    }
    return eventsByName.get(k).id;
  };

  const seen = new Map();
  const txns = recs.map(r => {
    let id;
    if (r.mlid) id = 'ml_' + r.mlid;
    else {
      const base = [r.date, r.amount, r.category, r.walletName, r.note].join('|');
      const n = (seen.get(base) || 0) + 1; seen.set(base, n);
      id = 'ml_' + hash(base + '#' + n);
    }
    return { id, date: r.date, amount: r.amount, category_id: catId(r.category), wallet_id: walletId(r.walletName, r.currency),
      note: r.note, person: r.person, event_id: eventId(r.event), exclude: r.exclude, created_at: r.date + 'T12:00:00.000Z' };
  });

  const dates = txns.map(t => t.date).sort();
  const existing = txns.filter(t => state.transactions.get(t.id)).length;
  return {
    txns, newWallets, newCats, newEvents, skipped,
    summary: { rows: txns.length, from: dates[0], to: dates[dates.length - 1], existing,
      wallets: [...new Set(txns.map(t => t.wallet_id))].length, categories: [...new Set(txns.map(t => t.category_id))].length },
  };
}
