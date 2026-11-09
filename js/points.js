// Poin produktivitas: aktivitas jadi poin (1 poin = Rp 1), berlaku N hari, dipakai otomatis
// tiap ada pengeluaran di grup Shopping. Kalau belanja duluan, saldo poin bisa minus dan
// poin berikutnya dipakai buat nutup minusnya dulu.
import { state, alive, save, remove, today, toYmd, cat, wallet, rate, uid, D, monthTxns, afterSync } from './store.js';
import { esc, fmtNum, act, pushPage, openSheet, closeSheet, toast, dateShort, dayLabel, refreshPages } from './ui.js';
import { icon, badge, parseIcon, joinIcon } from './icons.js';
import { groupOf, compute, budgetFor } from './plan.js';
import { pickIcon } from './catedit.js';

export const POINT_GROUP = 'Shopping';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const DEFAULT_ACTIVITIES = [
  { id: 'act_olahraga', name: 'Olahraga', icon: 'flame|c0', mode: 'unit', unit: 'kal', per: 100, rate: 5000, daily_cap: 40000, quick: '200,300,500,800', sort: 1 },
  { id: 'act_alkitab', name: 'Baca Alkitab', icon: 'book-heart|c2', mode: 'unit', unit: 'menit', per: 1, rate: 1000, daily_cap: 30000, quick: '10,15,20,30', sort: 2 },
  { id: 'act_buku', name: 'Baca buku', icon: 'book-open-text|c3', mode: 'unit', unit: 'menit', per: 1, rate: 500, daily_cap: 30000, quick: '15,30,45,60', sort: 3 },
  { id: 'act_tidur', name: 'Tidur sebelum 00.00', icon: 'moon|c8', mode: 'once', unit: '', per: 1, rate: 15000, daily_cap: 0, quick: '', sort: 4 },
  { id: 'act_minum', name: 'Minum 4 liter', icon: 'glass-water|c4', mode: 'once', unit: '', per: 1, rate: 10000, daily_cap: 0, quick: '', sort: 5 },
];

// ---------- Aturan ----------
export function pcfg() {
  let v = {};
  const r = state.settings.get('points');
  if (r && !r.deleted) { try { v = JSON.parse(r.value || '{}'); } catch { } }
  return { since: '', expiryDays: 60, monthCap: 'budget', ...v };
}
export const savePcfg = patch => save('settings', [{ id: 'points', value: JSON.stringify({ ...pcfg(), ...patch }) }]);

// Isi aktivitas bawaan + tanggal mulai, sekali saja. Dipanggil setelah sync pertama (atau kalau
// belum terhubung ke Sheets) supaya nggak menimpa data yang sudah ada di spreadsheet.
export function ensurePointsSetup() {
  if (!state.activities.size) save('activities', DEFAULT_ACTIVITIES.map(a => ({ ...a, active: true })), { silent: true });
  if (!state.settings.get('points')) save('settings', [{ id: 'points', value: JSON.stringify({ since: today(), expiryDays: 60, monthCap: 'budget' }) }], { silent: true });
}

afterSync.push(ensurePointsSetup);
act('pt-seed', () => ensurePointsSetup());

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return toYmd(new Date(y, m - 1, d + n));
}
const dShort = d => { const [, m, dd] = d.split('-').map(Number); return dd + ' ' + MON[m - 1]; };
const pts = n => (n < 0 ? '−' : '') + 'Rp ' + fmtNum(Math.abs(n));
const hidden = () => state.config.hide;
const money = n => hidden() ? 'Rp •••' : pts(n);

export const activities = () => alive('activities').filter(a => a.active !== false).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
export const activity = id => state.activities.get(id) || null;
const actIcon = a => { const p = parseIcon(a && a.icon); return { name: p.name || 'activity', color: p.color || 'c0' }; };
const actBadge = (a, size = 20) => { const i = actIcon(a); return badge(i.name, i.color, size); };
export const rateLabel = a => a.mode === 'once' ? `${pts(a.rate)} / hari` : `${pts(a.rate)} / ${a.per > 1 ? fmtNum(a.per) + ' ' : ''}${a.unit || 'satuan'}`;

export function monthCapFor(ym) {
  const c = pcfg();
  if (c.monthCap === 'budget') { const b = budgetFor(compute(), ym); return b && b.plan && b.plan[POINT_GROUP] ? +b.plan[POINT_GROUP] : 0; }
  return Number(c.monthCap) || 0; // 0 = tanpa batas
}
export const earnedIn = (ym, exceptId) => alive('points').filter(p => p.date.slice(0, 7) === ym && p.id !== exceptId).reduce((s, p) => s + (+p.amount || 0), 0);
export const earnedDay = (actId, date, exceptId) => alive('points').filter(p => p.activity_id === actId && p.date === date && p.id !== exceptId).reduce((s, p) => s + (+p.amount || 0), 0);
export const onceDone = (actId, date) => alive('points').find(p => p.activity_id === actId && p.date === date);

// Hitung poin untuk qty tertentu, sudah kena batas harian & batas bulanan.
export function quote(a, qty, date = today(), exceptId) {
  const raw = a.mode === 'once' ? +a.rate : Math.floor((Number(qty) || 0) / (a.per || 1) * (a.rate || 0));
  let amount = raw, cappedBy = '';
  if (a.daily_cap > 0) { const left = Math.max(0, a.daily_cap - earnedDay(a.id, date, exceptId)); if (amount > left) { amount = left; cappedBy = 'harian'; } }
  const mc = monthCapFor(date.slice(0, 7));
  if (mc > 0) { const left = Math.max(0, mc - earnedIn(date.slice(0, 7), exceptId)); if (amount > left) { amount = left; cappedBy = 'bulanan'; } }
  return { raw, amount: Math.max(0, amount), cappedBy, expires: addDays(date, pcfg().expiryDays) };
}

// ---------- Mesin saldo (FIFO, kedaluwarsa, minus) ----------
export function ledger(asOf = today()) {
  const c = pcfg(), since = c.since || today();
  const ev = [];
  alive('points').forEach(p => {
    if (p.date < since || p.date > asOf || !(+p.amount > 0)) return;
    ev.push({ date: p.date, kind: 'earn', amt: +p.amount, exp: p.expires || addDays(p.date, c.expiryDays), ref: p, ord: p.created_at || '' });
  });
  D.months.filter(m => m >= since.slice(0, 7) && m <= asOf.slice(0, 7)).forEach(m => monthTxns(m).forEach(t => {
    if (t.deleted || t.exclude || t.date < since || t.date > asOf) return;
    const ct = cat(t.category_id);
    if (!ct || (ct.kind !== 'expense' && ct.kind !== 'income') || groupOf(t.category_id) !== POINT_GROUP) return;
    const a = (Number(t.amount) || 0) * rate((wallet(t.wallet_id) || {}).currency);
    if (a < 0) ev.push({ date: t.date, kind: 'spend', amt: -a, ref: t, ord: t.created_at || '' });
    else if (a > 0) ev.push({ date: t.date, kind: 'refund', amt: a, exp: addDays(t.date, c.expiryDays), ref: t, ord: t.created_at || '' });
  }));
  const rank = { earn: 0, refund: 0, spend: 1 };
  ev.sort((x, y) => x.date.localeCompare(y.date) || rank[x.kind] - rank[y.kind] || x.ord.localeCompare(y.ord));
  const lots = [], out = [];
  let debt = 0;
  const expireBefore = d => {
    lots.forEach(l => { if (l.left > 0 && l.exp < d) { out.push({ date: addDays(l.exp, 1), kind: 'expire', amt: l.left, src: l.ev }); l.left = 0; } });
  };
  for (const e of ev) {
    expireBefore(e.date);
    if (e.kind === 'spend') {
      let need = e.amt;
      lots.sort((a, b) => a.exp.localeCompare(b.exp));
      for (const l of lots) { if (!need) break; const u = Math.min(l.left, need); l.left -= u; need -= u; }
      e.short = need; debt += need;
    } else {
      const pay = Math.min(debt, e.amt);
      debt -= pay; e.paidDebt = pay;
      const l = { left: e.amt - pay, exp: e.exp, ev: e };
      e.lot = l;
      lots.push(l);
    }
    out.push(e);
  }
  expireBefore(asOf);
  const available = lots.reduce((s, l) => s + l.left, 0);
  const soon = {};
  lots.filter(l => l.left > 0).forEach(l => { soon[l.exp] = (soon[l.exp] || 0) + l.left; });
  const expiring = Object.entries(soon).sort((a, b) => a[0].localeCompare(b[0])).map(([exp, amt]) => ({ exp, amt, days: Math.round((new Date(exp) - new Date(asOf)) / 864e5) }));
  const ym = asOf.slice(0, 7);
  const inMonth = e => e.date.slice(0, 7) === ym;
  return {
    since, balance: available - debt, available, debt, expiring, events: out.sort((a, b) => b.date.localeCompare(a.date) || (b.ord || '').localeCompare(a.ord || '')),
    earnedMonth: earnedIn(ym), spentMonth: out.filter(e => inMonth(e) && e.kind === 'spend').reduce((s, e) => s + e.amt, 0)
      - out.filter(e => inMonth(e) && e.kind === 'refund').reduce((s, e) => s + e.amt, 0),
    cap: monthCapFor(ym),
  };
}

// ---------- Aksi catat ----------
async function tapActivity(id) {
  const a = activity(id);
  if (!a) return;
  if (a.mode !== 'once') return openLog(a);
  const d = today(), done = onceDone(a.id, d);
  if (done) { await remove('points', done.id); toast(`${a.name} dibatalkan`); return; }
  const q = quote(a, 1, d);
  if (!q.amount) { toast(q.cappedBy === 'bulanan' ? 'Batas poin bulan ini sudah penuh' : 'Nggak ada poin yang bisa ditambah'); return; }
  await save('points', [{ id: `p_${a.id}_${d}`, date: d, activity_id: a.id, qty: 1, amount: q.amount, expires: q.expires, note: '', deleted: false }]);
  toast(`+${pts(q.amount)} · ${a.name}`);
}
act('pt-tap', d => tapActivity(d.id));

let L = null; // state form catat
function openLog(a, existing = null) {
  L = { a, id: existing ? existing.id : null, qty: existing ? +existing.qty : 0, date: existing ? existing.date : today(), note: existing ? existing.note || '' : '' };
  openSheet({
    title: a.name, cls: 'full log-sheet', right: { act: 'pt-save', label: 'Simpan' },
    html: `<div class="log-body"></div>`,
    onMount: (el, sh) => { L.sheet = sh; renderLog(); setTimeout(() => { const i = el.querySelector('[data-input="pt-qty"]'); if (i && !existing) i.focus(); }, 350); },
    onClose: () => { L = null; },
  });
}
function renderLog(full = true) {
  if (!L) return;
  const { a } = L, q = quote(a, L.qty, L.date, L.id);
  const b = L.sheet.el.querySelector('.log-body');
  const result = `<div class="pt-result"><div class="k">Jadi poin</div><div class="v">${pts(q.amount)}</div>
    <div class="muted small">${q.cappedBy ? `Kena batas ${q.cappedBy}${q.raw > q.amount ? ` (harusnya ${pts(q.raw)})` : ''} · ` : ''}berlaku sampai ${dateShort(q.expires)}</div></div>`;
  if (!full) { b.querySelector('.pt-result').outerHTML = result; return; }
  const quick = String(a.quick || '').split(',').map(s => +s.trim()).filter(Boolean);
  const left = a.daily_cap > 0 ? Math.max(0, a.daily_cap - earnedDay(a.id, L.date, L.id)) : null;
  b.innerHTML = `<div class="icon-preview">${actBadge(a, 30)}</div>
    <div class="pt-qty"><input type="text" inputmode="decimal" data-input="pt-qty" value="${L.qty || ''}" placeholder="0" autocomplete="off"><span>${esc(a.unit || 'satuan')}</span></div>
    ${quick.length ? `<div class="chips" style="justify-content:center">${quick.map(n => `<button class="chip" data-act="pt-quick" data-n="${n}">${fmtNum(n)} ${esc(a.unit)}</button>`).join('')}</div>` : ''}
    ${result}
    <div class="list" style="margin-top:14px">
      <div class="field"><label>Tanggal</label><input type="date" data-change="pt-date" value="${L.date}" max="${today()}"></div>
      <div class="field"><label>Catatan</label><input data-input="pt-note" value="${esc(L.note)}" placeholder="Opsional" autocomplete="off"></div>
    </div>
    <div class="foot" style="padding:8px 20px">${esc(rateLabel(a))}${left !== null ? ` · batas harian ${pts(a.daily_cap)}, sisa ${pts(left)}` : ''}</div>
    <div class="add-foot"><button class="btn" data-act="pt-save">Simpan</button>${L.id ? '<button class="btn link-danger" data-act="pt-del">Hapus catatan</button>' : ''}</div>`;
}
act('pt-qty', (d, el) => { if (!L) return; L.qty = parseFloat(String(el.value).replace(',', '.')) || 0; renderLog(false); });
act('pt-note', (d, el) => { if (L) L.note = el.value; });
act('pt-date', (d, el) => { if (!L) return; L.date = el.value || today(); renderLog(); });
act('pt-quick', d => { if (!L) return; L.qty = +d.n; renderLog(); });
act('pt-save', async () => {
  if (!L) return;
  const { a } = L, q = quote(a, L.qty, L.date, L.id);
  if (!(L.qty > 0)) { toast(`Isi jumlah ${a.unit || ''} dulu`); return; }
  if (!q.amount) { toast(q.cappedBy ? `Batas ${q.cappedBy} sudah penuh` : 'Poinnya masih 0'); return; }
  await save('points', [{ id: L.id || uid('p'), date: L.date, activity_id: a.id, qty: L.qty, amount: q.amount, expires: q.expires, note: L.note }]);
  toast(`+${pts(q.amount)} · ${a.name}`);
  closeSheet(L.sheet);
});
act('pt-del', async () => { if (!L) return; await remove('points', L.id); toast('Catatan dihapus'); closeSheet(L.sheet); });
act('pt-edit', d => {
  const p = state.points.get(d.id), a = p && activity(p.activity_id);
  if (!p || !a) return;
  if (a.mode === 'once') {
    openSheet({ title: a.name, html: `<div class="foot" style="padding:4px 20px 12px">${dayLabel(p.date)} · ${pts(+p.amount)} · berlaku sampai ${dateShort(p.expires)}</div>
      <div class="add-foot"><button class="btn link-danger" data-act="pt-del-once" data-id="${p.id}">Hapus catatan</button></div>` });
  } else openLog(a, p);
});
act('pt-del-once', async d => { await remove('points', d.id); closeSheet(); toast('Catatan dihapus'); });

// ---------- Kartu poin (Beranda) ----------
export function pointsCard() {
  if (!state.activities.size) return `<button class="card pt-card" data-act="tab" data-tab="poin" style="display:block;width:calc(100% - 32px);text-align:left"><div class="pt-head"><div><div class="k">Poin belanja</div><div class="muted small" style="margin-top:4px">Aktivitas produktif jadi poin buat belanja ${POINT_GROUP}. Tap buat mulai.</div></div><span class="chev muted">${icon('chevron-right', 18)}</span></div></button>`;
  const P = ledger(), acts = activities().slice(0, 5), neg = P.balance < 0;
  const soon = P.expiring.find(e => e.days <= 14);
  return `<div class="card pt-card"><button class="pt-head" data-act="tab" data-tab="poin">
      <div><div class="k">Poin belanja</div><div class="v ${neg ? 'neg' : ''}">${money(P.balance)}</div></div>
      <span class="chev muted">${icon('chevron-right', 18)}</span></button>
    <div class="pt-sub">${neg ? `Minus ${money(-P.balance)}. Kejar lewat aktivitas biar nggak ngutang.` : soon ? `${money(soon.amt)} hangus ${soon.days <= 0 ? 'hari ini' : soon.days === 1 ? 'besok' : `${soon.days} hari lagi`}` : `Belanja ${POINT_GROUP} bulan ini ${money(P.spentMonth)}`}</div>
    <div class="pt-quickrow">${acts.map(a => quickBtn(a)).join('')}</div></div>`;
}
function quickBtn(a) {
  const done = a.mode === 'once' && onceDone(a.id, today());
  const i = actIcon(a);
  return `<button class="pt-q ${done ? 'done' : ''}" data-act="pt-tap" data-id="${a.id}" style="--ic:var(--${i.color})"><span class="b">${icon(done ? 'check' : i.name, 20)}</span><span class="l">${esc(a.name.split(' ')[0])}</span></button>`;
}

// ---------- Tab Poin ----------
export function renderPoin() {
  const P = ledger(), neg = P.balance < 0, d = today();
  const pct = P.cap ? Math.min(100, P.earnedMonth / P.cap * 100) : 0;
  const unsynced = state.config.url && (state.sync.serverVersion || 2) < 2;
  const acts = activities();
  if (!state.activities.size) return `<div class="title-row"><h1 class="large-title">Poin</h1></div>
    <div class="card hero"><b>Poin produktivitas</b><div class="muted small" style="margin:4px 0 12px">Olahraga, baca, tidur cukup, minum air jadi poin buat belanja ${POINT_GROUP}. ${state.config.url ? 'Lagi ambil data dari Sheets…' : 'Hubungkan Sheets dulu kalau lu udah pernah setup poin di HP lain.'}</div>
    <button class="btn" data-act="pt-seed">Pakai aktivitas bawaan</button></div>`;
  return `<div class="title-row"><h1 class="large-title">Poin</h1><button class="icon-btn" data-act="pt-settings" aria-label="Atur">${icon('sliders-horizontal', 20)}</button></div>
  ${unsynced ? `<div class="card" style="padding:12px 16px;margin-bottom:12px;border-left:0"><b>Poin belum masuk ke Sheets</b><div class="muted small" style="margin-top:3px">Backend di Apps Script masih versi lama. Paste Code.gs terbaru lalu Deploy → Manage deployments → New version. Poin tetap aman di HP.</div></div>` : ''}
  <div class="card hero pt-hero">
    <div class="label">Poin tersedia</div>
    <div class="big ${neg ? 'neg' : ''}">${money(P.balance)}</div>
    <div class="muted small" style="margin-top:4px">${neg ? `Lu lagi minus ${money(-P.balance)}. Poin berikutnya dipakai nutup minus dulu.` : P.expiring.length ? `${money(P.expiring[0].amt)} hangus ${dShort(P.expiring[0].exp)}` : 'Tap aktivitas di bawah buat nambah poin.'}</div>
    ${P.cap ? `<div class="bar" style="margin-top:14px"><i style="width:${pct.toFixed(1)}%"></i></div><div class="muted small" style="margin-top:6px;display:flex;justify-content:space-between"><span>Masuk bulan ini ${money(P.earnedMonth)}</span><span>batas ${money(P.cap)}</span></div>` : ''}
  </div>
  <div class="card"><div class="stats" style="border:0;grid-template-columns:1fr 1fr">
    <div><div class="k">Masuk bulan ini</div><div class="v pos">${money(P.earnedMonth)}</div></div>
    <div><div class="k">Belanja ${POINT_GROUP}</div><div class="v neg">${money(P.spentMonth)}</div></div></div></div>

  <div class="section-h">Catat aktivitas<button data-act="pt-settings">Atur</button></div>
  <div class="pt-grid">${acts.map(a => {
    const today_ = earnedDay(a.id, d), done = a.mode === 'once' && onceDone(a.id, d), i = actIcon(a);
    const capFull = a.daily_cap > 0 && today_ >= a.daily_cap;
    return `<button class="pt-tile ${done ? 'done' : ''}" data-act="pt-tap" data-id="${a.id}" style="--ic:var(--${i.color})">
      <span class="b">${icon(done ? 'check' : i.name, 22)}</span>
      <span class="n">${esc(a.name)}</span>
      <span class="r">${esc(rateLabel(a))}</span>
      <span class="s">${a.mode === 'once' ? (done ? 'Sudah hari ini · tap buat batal' : 'Tap sekali') : today_ ? `Hari ini ${pts(today_)}${capFull ? ' · penuh' : ''}` : 'Tap buat catat'}</span></button>`;
  }).join('')}
    <button class="pt-tile add" data-act="pt-new"><span class="b">${icon('plus', 22)}</span><span class="n">Tambah aktivitas</span><span class="r">Atur tarif sendiri</span></button></div>

  ${P.expiring.length ? `<div class="section-h">Segera hangus</div><div class="list">${P.expiring.slice(0, 3).map(e => `<div class="row"><span class="ic">${icon('hourglass', 20)}</span>
    <div class="main"><div class="t1">${dateShort(e.exp)}</div><div class="t2">${e.days <= 0 ? 'Hari ini' : e.days + ' hari lagi'}</div></div><div class="end">${hidden() ? '•••' : fmtNum(e.amt)}</div></div>`).join('')}</div>` : ''}

  <div class="section-h">Riwayat<button data-act="pt-history">Lihat semua</button></div>
  ${historyList(P.events.slice(0, 8))}
  <div class="foot" style="padding:12px 20px 0">1 poin = Rp 1, berlaku ${pcfg().expiryDays} hari. Tiap pengeluaran di grup ${POINT_GROUP} otomatis motong poin, mulai ${dateShort(P.since)}.</div>`;
}

function historyList(evs) {
  if (!evs.length) return '<div class="empty">Belum ada riwayat poin.</div>';
  return `<div class="list">${evs.map(e => {
    if (e.kind === 'earn') {
      const p = e.ref, a = activity(p.activity_id);
      const sub = [a && a.mode !== 'once' ? `${fmtNum(p.qty)} ${a.unit}` : '', dShort(p.date), e.paidDebt ? `nutup minus ${pts(e.paidDebt)}` : `hangus ${dShort(e.exp)}`, p.note].filter(Boolean).join(' · ');
      return `<button class="row" data-act="pt-edit" data-id="${p.id}">${a ? actBadge(a) : badge('activity', 'c9', 20)}
        <div class="main"><div class="t1">${esc(a ? a.name : 'Aktivitas')}</div><div class="t2">${esc(sub)}</div></div><div class="end pos">${hidden() ? '•••' : '+' + fmtNum(e.amt)}</div></button>`;
    }
    if (e.kind === 'expire') return `<div class="row"><span class="ic">${icon('hourglass', 20)}</span><div class="main"><div class="t1">Hangus</div><div class="t2">${dShort(e.date)} · dari ${dShort(e.src.date)}</div></div><div class="end muted">${hidden() ? '•••' : '−' + fmtNum(e.amt)}</div></div>`;
    const t = e.ref, c = cat(t.category_id);
    const sub = [t.note, dShort(t.date), e.kind === 'spend' && e.short ? `minus ${pts(e.short)}` : e.kind === 'refund' ? 'refund' : ''].filter(Boolean).join(' · ');
    return `<button class="row" data-act="edit-txn" data-id="${t.id}">${badge('shopping-bag', 'c1', 20)}<div class="main"><div class="t1">${esc(c ? c.name : POINT_GROUP)}</div><div class="t2">${esc(sub)}</div></div>
      <div class="end ${e.kind === 'spend' ? 'neg' : 'pos'}">${hidden() ? '•••' : (e.kind === 'spend' ? '−' : '+') + fmtNum(e.amt)}</div></button>`;
  }).join('')}</div>`;
}

act('pt-history', () => pushPage({ title: 'Riwayat poin', live: true, render: () => {
  const P = ledger(), byDay = new Map();
  P.events.forEach(e => { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); });
  return byDay.size ? [...byDay].map(([d, evs]) => `<div class="section-h">${esc(dayLabel(d))}</div>${historyList(evs)}`).join('') : '<div class="empty">Belum ada riwayat poin.</div>';
} }));

// ---------- Atur ----------
act('pt-settings', () => pushPage({ title: 'Atur poin', live: true, render: renderSettings }));
function renderSettings() {
  const c = pcfg(), m = today().slice(0, 7), bud = (() => { const b = budgetFor(compute(), m); return b && b.plan ? +b.plan[POINT_GROUP] || 0 : 0; })();
  const capMode = c.monthCap === 'budget' ? 'budget' : Number(c.monthCap) > 0 ? 'fixed' : 'none';
  const all = alive('activities').sort((a, b) => (a.sort || 0) - (b.sort || 0));
  return `<div class="section-h">Aktivitas</div>
  <div class="list">${all.map(a => `<button class="row" data-act="pt-act-edit" data-id="${a.id}">${actBadge(a)}<div class="main"><div class="t1">${esc(a.name)}${a.active === false ? ' <span class="muted small">(nonaktif)</span>' : ''}</div>
    <div class="t2">${esc(rateLabel(a))}${a.daily_cap > 0 ? ` · maks ${pts(a.daily_cap)}/hari` : ''}</div></div><span class="chev">${icon('chevron-right', 18)}</span></button>`).join('')}
    <button class="row" data-act="pt-new"><span class="ic acc">${icon('plus', 20)}</span><div class="main"><div class="t1" style="color:var(--accent-text)">Tambah aktivitas</div></div></button></div>

  <div class="section-h">Aturan</div>
  <div class="list">
    <div class="field"><label>Masa berlaku</label><input type="text" inputmode="numeric" data-change="pt-exp" value="${c.expiryDays}" style="max-width:70px"><span class="muted">hari</span></div>
    <div class="field"><label>Mulai hitung</label><input type="date" data-change="pt-since" value="${esc(c.since || today())}"></div>
  </div>
  <div class="foot" style="padding:8px 20px">Pengeluaran ${POINT_GROUP} sejak tanggal mulai otomatis motong poin. Boleh minus, nanti ketutup sama poin berikutnya.</div>
  <div class="section-h">Batas poin per bulan</div>
  <div style="padding:0 16px"><div class="seg">${[['budget', 'Ikut budget'], ['fixed', 'Angka sendiri'], ['none', 'Tanpa batas']].map(([k, l]) => `<button class="${capMode === k ? 'on' : ''}" data-act="pt-capmode" data-k="${k}">${l}</button>`).join('')}</div></div>
  ${capMode === 'fixed' ? `<div class="list" style="margin-top:10px"><div class="field"><label>Batas</label><input type="text" inputmode="numeric" data-change="pt-cap" value="${fmtNum(c.monthCap)}"></div></div>` : ''}
  <div class="foot" style="padding:8px 20px">${capMode === 'budget' ? (bud ? `Budget ${POINT_GROUP} bulan ini ${pts(bud)}. Poin yang masuk per bulan nggak bisa lewat angka ini.` : `Belum ada budget ${POINT_GROUP}, jadi untuk sekarang tanpa batas.`) : capMode === 'fixed' ? 'Poin yang masuk per bulan nggak bisa lewat angka ini.' : 'Poin bisa numpuk tanpa batas bulanan (batas harian per aktivitas tetap jalan).'}</div>`;
}
act('pt-exp', (d, el) => { const n = Math.max(1, parseInt(el.value, 10) || 60); savePcfg({ expiryDays: n }); toast('Masa berlaku ' + n + ' hari (untuk poin baru)'); });
act('pt-since', (d, el) => { if (el.value) savePcfg({ since: el.value }); });
act('pt-cap', (d, el) => savePcfg({ monthCap: parseInt(String(el.value).replace(/\D/g, ''), 10) || 0 }));
act('pt-capmode', d => {
  const c = pcfg();
  savePcfg({ monthCap: d.k === 'budget' ? 'budget' : d.k === 'none' ? 0 : (Number(c.monthCap) > 0 ? c.monthCap : 2000000) });
});

// Form aktivitas
let F = null;
function openActForm(a) {
  const i = actIcon(a);
  F = { id: a ? a.id : null, name: a ? a.name : '', mode: a ? a.mode : 'unit', unit: a ? a.unit : 'menit', per: a ? a.per : 1, rate: a ? a.rate : 1000,
    daily_cap: a ? a.daily_cap : 0, quick: a ? a.quick : '', active: a ? a.active !== false : true, icon: i.name, color: a ? i.color : 'c0' };
  openSheet({ title: a ? 'Ubah aktivitas' : 'Aktivitas baru', cls: 'full', right: { act: 'pt-act-save', label: 'Simpan' }, html: '<div class="actf"></div>',
    onMount: (el, sh) => { F.sheet = sh; renderActForm(); }, onClose: () => { F = null; } });
}
function renderActForm() {
  if (!F) return;
  const b = F.sheet.el.querySelector('.actf');
  const unit = F.mode === 'unit';
  b.innerHTML = `<button class="icon-preview" data-act="pt-act-icon" style="display:block;margin:0 auto">${badge(F.icon, F.color, 30)}<div class="muted small" style="margin-top:6px">Ganti ikon</div></button>
  <div class="list">
    <div class="field"><label>Nama</label><input data-input="pt-af" data-k="name" value="${esc(F.name)}" placeholder="mis. Jalan kaki" autocomplete="off"></div>
  </div>
  <div style="padding:14px 16px 4px"><div class="seg">${[['unit', 'Per satuan'], ['once', 'Sekali sehari']].map(([k, l]) => `<button class="${F.mode === k ? 'on' : ''}" data-act="pt-af-mode" data-k="${k}">${l}</button>`).join('')}</div></div>
  <div class="list" style="margin-top:10px">
    ${unit ? `<div class="field"><label>Satuan</label><input data-input="pt-af" data-k="unit" value="${esc(F.unit)}" placeholder="menit, kal, km" autocomplete="off"></div>
    <div class="field"><label>Tiap</label><input data-input="pt-af" data-k="per" inputmode="decimal" value="${F.per}"><span class="muted">${esc(F.unit || 'satuan')}</span></div>` : ''}
    <div class="field"><label>Dapat poin</label><input data-input="pt-af" data-k="rate" inputmode="numeric" value="${fmtNum(F.rate)}"></div>
    ${unit ? `<div class="field"><label>Maks per hari</label><input data-input="pt-af" data-k="daily_cap" inputmode="numeric" value="${F.daily_cap ? fmtNum(F.daily_cap) : ''}" placeholder="Tanpa batas"></div>
    <div class="field"><label>Tombol cepat</label><input data-input="pt-af" data-k="quick" value="${esc(F.quick)}" placeholder="15,30,60" autocomplete="off"></div>` : ''}
    ${F.id ? `<div class="field"><label>Aktif</label><span style="flex:1"></span><input type="checkbox" class="toggle" data-change="pt-af-active" ${F.active ? 'checked' : ''}></div>` : ''}
  </div>
  <div class="foot af-prev" style="padding:8px 20px">${esc(previewText())}</div>
  <div class="add-foot"><button class="btn" data-act="pt-act-save">Simpan</button>${F.id ? '<button class="btn link-danger" data-act="pt-act-del">Hapus aktivitas</button>' : ''}</div>`;
}
const numIn = v => parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0;
function previewText() {
  if (F.mode === 'once') return `Tap sekali sehari dapat ${pts(F.rate)}.`;
  return `Tiap ${fmtNum(F.per)} ${F.unit || 'satuan'} dapat ${pts(F.rate)}${F.daily_cap ? `, maksimal ${pts(F.daily_cap)} sehari` : ''}.`;
}
act('pt-af', (d, el) => {
  if (!F) return;
  const k = d.k;
  F[k] = ['rate', 'daily_cap'].includes(k) ? numIn(el.value) : k === 'per' ? (parseFloat(String(el.value).replace(',', '.')) || 0) : el.value;
  const p = F.sheet.el.querySelector('.af-prev'); if (p) p.textContent = previewText();
});
act('pt-af-active', (d, el) => { if (F) F.active = el.checked; });
act('pt-af-mode', d => { F.mode = d.k; renderActForm(); });
act('pt-act-icon', async () => { const r = await pickIcon({ name: F.icon, color: F.color }); if (r && F) { F.icon = r.name; F.color = r.color; renderActForm(); } });
act('pt-new', () => openActForm(null));
act('pt-act-edit', d => openActForm(activity(d.id)));
act('pt-act-save', async () => {
  if (!F) return;
  if (!F.name.trim()) { toast('Kasih nama dulu'); return; }
  if (!(F.rate > 0)) { toast('Isi poinnya dulu'); return; }
  if (F.mode === 'unit' && !(F.per > 0)) { toast('Isi "tiap berapa" satuannya'); return; }
  const maxSort = Math.max(0, ...alive('activities').map(a => a.sort || 0));
  await save('activities', [{ id: F.id || uid('act_'), name: F.name.trim(), icon: joinIcon(F.icon, F.color), mode: F.mode, unit: F.mode === 'unit' ? F.unit.trim() : '',
    per: F.mode === 'unit' ? F.per : 1, rate: Math.round(F.rate), daily_cap: F.mode === 'unit' ? Math.round(F.daily_cap) : 0, quick: F.mode === 'unit' ? F.quick : '',
    active: F.active, sort: F.id ? (activity(F.id).sort || 0) : maxSort + 1 }]);
  toast(F.id ? 'Aktivitas disimpan' : 'Aktivitas ditambah');
  closeSheet(F.sheet);
});
act('pt-act-del', async () => {
  if (!F) return;
  await remove('activities', F.id); toast('Aktivitas dihapus'); closeSheet(F.sheet);
});
