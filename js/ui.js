import { state, cat, wallet, alive, KINDS, today, toIDR } from './store.js';
import { icon, catIconName, catColor, badge, walletBadge, walletIconName, walletColor, WALLET_ICON } from './icons.js';
import { groupOf, expenseGroups, walletClass } from './plan.js';

// ---------- Formatting ----------
const nf = new Intl.NumberFormat('id-ID');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function rp(n, { sign = false, raw = false } = {}) {
  if (state.config.hide && !raw) return 'Rp •••••';
  const v = Math.round(Number(n) || 0);
  const s = v < 0 ? '−' : (sign && v > 0 ? '+' : '');
  return s + 'Rp ' + nf.format(Math.abs(v));
}
export function short(n) {
  if (state.config.hide) return '•••';
  const v = Math.abs(Number(n) || 0), s = n < 0 ? '−' : '';
  const f = x => x.toLocaleString('id-ID', { maximumFractionDigits: x < 10 ? 1 : 0 });
  if (v >= 1e9) return s + f(v / 1e9) + ' M';
  if (v >= 1e6) return s + f(v / 1e6) + ' jt';
  if (v >= 1e3) return s + f(v / 1e3) + ' rb';
  return s + nf.format(v);
}
export const fmtNum = n => nf.format(Math.round(Number(n) || 0));
export const amtClass = (t) => { const c = cat(t.category_id); return c && (c.kind === 'income' || c.kind === 'collection' || c.kind === 'debt') || (!c && t.amount > 0) ? 'pos' : ''; };

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const monthLabel = m => { const [y, mm] = m.split('-').map(Number); return MONTHS[mm - 1] + ' ' + y; };
export const monShort = m => MON[Number(m.slice(5, 7)) - 1];
export function dayLabel(d) {
  const t = today();
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const y = yest.getFullYear() + '-' + String(yest.getMonth() + 1).padStart(2, '0') + '-' + String(yest.getDate()).padStart(2, '0');
  if (d === t) return 'Hari ini';
  if (d === y) return 'Kemarin';
  const [Y, M, D] = d.split('-').map(Number);
  const dt = new Date(Y, M - 1, D);
  return DAYS[dt.getDay()] + ', ' + D + ' ' + MON[M - 1] + (String(Y) !== t.slice(0, 4) ? ' ' + Y : '');
}
export const dateShort = d => { if (!d) return ''; const [Y, M, D] = d.split('-').map(Number); return D + ' ' + MON[M - 1] + ' ' + Y; };
export function addMonths(m, n) { let [y, mm] = m.split('-').map(Number); mm += n; while (mm > 12) { mm -= 12; y++; } while (mm < 1) { mm += 12; y--; } return y + '-' + String(mm).padStart(2, '0'); }
export const thisMonth = () => today().slice(0, 7);
export function ago(ms) {
  if (!ms) return 'belum pernah';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'barusan';
  if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  return Math.floor(s / 86400) + ' hari lalu';
}

// ---------- Actions (event delegation) ----------
const A = {};
export const act = (name, fn) => { A[name] = fn; };
export function bindActions(root) {
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = A[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
  });
  root.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    if (el && A[el.dataset.change]) A[el.dataset.change](el.dataset, el, e);
  });
  root.addEventListener('input', e => {
    const el = e.target.closest('[data-input]');
    if (el && A[el.dataset.input]) A[el.dataset.input](el.dataset, el, e);
  });
}

// ---------- Urutkan dengan drag ----------
// Pegang ikon grip di kanan baris, geser atas-bawah, lepas. Baris lain bergeser memberi ruang.
export const sortHandlers = {};
export function initSortables(root) {
  root.querySelectorAll('[data-sortable]').forEach(list => { if (!list._sortable) { list._sortable = true; sortable(list, ids => sortHandlers[list.dataset.sortable]?.(ids)); } });
}
function sortable(list, onDrop) {
  let d = null;
  const rows = () => [...list.querySelectorAll(':scope > [data-sort-id]')];
  list.addEventListener('pointerdown', e => {
    const h = e.target.closest('.grip');
    if (!h || !list.contains(h)) return;
    e.preventDefault(); e.stopPropagation();
    const row = h.closest('[data-sort-id]'), rs = rows();
    d = { row, rs, idx: rs.indexOf(row), y0: e.clientY, rects: rs.map(r => r.getBoundingClientRect()), to: rs.indexOf(row), id: e.pointerId };
    d.h = d.rects[d.idx].height;
    h.setPointerCapture(e.pointerId);
    row.classList.add('dragging');
    rs.forEach(r => { if (r !== row) r.classList.add('shifting'); });
  });
  list.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0;
    d.row.style.transform = `translateY(${dy}px) scale(1.02)`;
    const c = d.rects[d.idx].top + d.h / 2 + dy;
    let to = 0;
    d.rects.forEach((r, i) => { if (i !== d.idx && r.top + r.height / 2 < c) to++; });
    d.to = to;
    d.rs.forEach((r, i) => {
      if (r === d.row) return;
      const sh = to >= d.idx ? (i > d.idx && i <= to ? -d.h : 0) : (i >= to && i < d.idx ? d.h : 0);
      r.style.transform = sh ? `translateY(${sh}px)` : '';
    });
  });
  const end = e => {
    if (!d || e.pointerId !== d.id) return;
    const ids = d.rs.map(r => r.dataset.sortId);
    const [m] = ids.splice(d.idx, 1); ids.splice(d.to, 0, m);
    const changed = d.to !== d.idx;
    d.rs.forEach(r => { r.style.transform = ''; r.classList.remove('dragging', 'shifting'); });
    d = null;
    list._noClick = true; setTimeout(() => { list._noClick = false; }, 80);
    if (changed) onDrop(ids);
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
  list.addEventListener('click', e => { if (list._noClick || e.target.closest('.grip')) { e.stopPropagation(); e.preventDefault(); } }, true);
}

// ---------- Toast ----------
let toastEl, toastT;
export function toast(msg) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
  toastEl.textContent = msg;
  requestAnimationFrame(() => toastEl.classList.add('in'));
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('in'), 1800);
}

// ---------- Pages ----------
export const pages = [];
export function pushPage(p) {
  const el = document.createElement('div');
  el.className = 'page';
  p.el = el;
  pages.push(p);
  renderPage(p);
  bindActions(el);
  document.body.appendChild(el);
  const prev = pages[pages.length - 2];
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('in'); if (prev) prev.el.classList.add('under'); }));
  edgeSwipe(el, p);
  return p;
}
export function renderPage(p) {
  const scroll = p.el.scrollTop;
  const right = typeof p.right === 'function' ? p.right() : p.right;
  p.el.innerHTML = `<div class="navbar"><div class="l"><button class="navbtn" data-act="back">‹ ${esc(p.back || 'Kembali')}</button></div>
    <div class="title">${esc(typeof p.title === 'function' ? p.title() : p.title)}</div>
    <div class="r">${right ? `<button class="navbtn bold" data-act="${right.act}" ${right.data || ''}>${esc(right.label)}</button>` : ''}</div></div>
    <div class="page-body">${p.render()}</div>`;
  p.el.scrollTop = scroll;
  initSortables(p.el);
  if (p.mount) p.mount(p.el);
}
export function popPage() {
  const p = pages.pop();
  if (!p) return;
  if (p.onClose) p.onClose();
  p.el.classList.remove('in');
  const prev = pages[pages.length - 1];
  if (prev) { prev.el.classList.remove('under'); if (prev.live) renderPage(prev); }
  setTimeout(() => p.el.remove(), 450);
}
export function refreshPages() { pages.forEach(p => { if (p.live) renderPage(p); }); }
act('back', () => popPage());

// Geser dari tepi kiri untuk kembali (seperti iOS).
function edgeSwipe(el, p) {
  let x0 = null, y0 = 0, dx = 0, t0 = 0, active = false;
  el.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (t.clientX > 24) return;
    x0 = t.clientX; y0 = t.clientY; dx = 0; t0 = performance.now(); active = false;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (x0 === null) return;
    const t = e.touches[0];
    dx = Math.max(0, t.clientX - x0);
    if (!active && Math.abs(t.clientY - y0) > 12 && dx < 12) { x0 = null; return; }
    if (dx > 8) active = true;
    if (active) { el.style.transition = 'none'; el.style.transform = `translateX(${dx}px)`; }
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (x0 === null) return;
    const v = dx / Math.max(1, performance.now() - t0);
    el.style.transition = ''; el.style.transform = '';
    if (active && (dx > innerWidth * 0.35 || v > 0.5)) popPage();
    x0 = null;
  });
}

// ---------- Sheets ----------
const sheets = [];
// Sheet layar penuh menempel ke atas dan tingginya ikut area yang kelihatan (di atas keyboard),
// jadi iOS nggak perlu menggeser halaman waktu keyboard muncul.
const vv = window.visualViewport;
function fitViewport() {
  const h = vv ? vv.height : innerHeight;
  document.documentElement.style.setProperty('--vvh', h + 'px');
  if (window.scrollY) window.scrollTo(0, 0);
}
if (vv) { vv.addEventListener('resize', fitViewport); vv.addEventListener('scroll', fitViewport); }
fitViewport();
const headBtn = (b, bold) => `<button class="navbtn ${bold ? 'bold' : ''}" data-act="${b.act}">${b.html || esc(b.label)}</button>`;
export function openSheet({ title = '', html, left, right, cls = '', onMount, onClose, head = true }) {
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const el = document.createElement('div'); el.className = 'sheet ' + cls;
  el.innerHTML = `<div class="grabber"></div>${head ? `<div class="sheet-head"><div>${headBtn(left || { act: 'sheet-close', html: icon('x', 22) })}</div>
    <div class="title">${esc(title)}</div><div style="display:flex;justify-content:flex-end">${right ? headBtn(right, true) : ''}</div></div>` : ''}
    <div class="sheet-body">${html}</div>`;
  const s = { el, scrim, onClose, closed: false };
  s.close = (val) => closeSheet(s, val);
  sheets.push(s);
  scrim.addEventListener('click', () => s.close());
  bindActions(el);
  document.body.append(scrim, el);
  dragDismiss(el, s);
  requestAnimationFrame(() => requestAnimationFrame(() => { scrim.classList.add('in'); el.classList.add('in'); }));
  if (onMount) onMount(el, s);
  return s;
}
export function closeSheet(s = sheets[sheets.length - 1], val) {
  if (!s || s.closed) return;
  s.closed = true;
  const i = sheets.indexOf(s); if (i >= 0) sheets.splice(i, 1);
  s.el.classList.remove('in'); s.scrim.classList.remove('in');
  setTimeout(() => { s.el.remove(); s.scrim.remove(); }, 450);
  if (s.onClose) s.onClose(val);
}
export const topSheet = () => sheets[sheets.length - 1];
act('sheet-close', () => closeSheet());

function dragDismiss(el, s) {
  let y0 = null, dy = 0, t0 = 0;
  const handle = e => e.target.closest('.grabber, .sheet-head') && !e.target.closest('button');
  el.addEventListener('touchstart', e => { if (!handle(e)) return; y0 = e.touches[0].clientY; dy = 0; t0 = performance.now(); el.classList.add('dragging'); }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (y0 === null) return;
    const d = e.touches[0].clientY - y0;
    dy = d > 0 ? d : -Math.sqrt(-d) * 2; // rubber-band kalau ditarik ke atas
    el.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (y0 === null) return;
    const v = dy / Math.max(1, performance.now() - t0);
    el.classList.remove('dragging'); el.style.transform = '';
    if (dy > 120 || v > 0.6) s.close();
    y0 = null;
  });
}

// ---------- Pickers ----------
export function pickList({ title, items, selected, search = false, footer = '', full = false, top = '' }) {
  return new Promise(resolve => {
    const rows = list => list.map(it => it.header ? `<div class="section-h">${esc(it.header)}</div>` :
      `<button class="row" data-act="pick" data-id="${esc(it.id)}">${it.ico ? (it.col ? badge(it.ico, it.col, 20) : `<span class="ic ${it.id === selected ? 'acc' : ''}">${icon(it.ico, 20)}</span>`) : ''}
        <div class="main"><div class="t1">${esc(it.label)}</div>${it.sub ? `<div class="t2 ${it.subNum ? 'num' : ''}">${esc(it.sub)}</div>` : ''}</div>
        ${it.id === selected ? `<span style="color:var(--accent-text)">${icon('check', 20)}</span>` : ''}</button>`).join('');
    const group = list => { // bungkus baris di antara header dengan .list
      let html = '', buf = [];
      const flush = () => { if (buf.length) { html += `<div class="list">${rows(buf)}</div>`; buf = []; } };
      list.forEach(it => { if (it.header) { flush(); html += rows([it]); } else buf.push(it); });
      flush();
      return html;
    };
    const s = openSheet({
      title, cls: full ? 'full' : '', html: `${search ? `<div class="search">${icon('search', 18)}<input data-input="pick-search" placeholder="Cari kategori" autocomplete="off"></div>` : ''}
        ${top}<div class="pick-items" style="padding-top:8px">${group(items)}</div>${footer}`,
      onClose: v => resolve(v ?? null),
      onMount: el => {
        el.addEventListener('click', e => { const b = e.target.closest('[data-act=pick]'); if (b) { e.stopPropagation(); s.close(b.dataset.id); } });
        const inp = el.querySelector('[data-input=pick-search]');
        if (inp) inp.addEventListener('input', () => {
          const q = inp.value.trim().toLowerCase();
          const f = q ? items.filter(it => !it.header && (it.label + ' ' + (it.sub || '')).toLowerCase().includes(q)) : items;
          el.querySelector('.pick-items').innerHTML = group(f);
        });
      },
    });
  });
}

export function catItems(kinds, { withSys = false, grouped = false } = {}) {
  const out = [];
  const usage = new Map();
  kinds.forEach(k => {
    const list = alive('categories').filter(c => c.kind === k && (withSys || !c.id.startsWith('sys_') || ['debt', 'loan', 'repayment', 'collection'].includes(k)))
      .sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
    if (!list.length) return;
    if (grouped && k === 'expense') {
      const byG = new Map();
      list.forEach(c => { const g = groupOf(c.id); if (!byG.has(g)) byG.set(g, []); byG.get(g).push(c); });
      expenseGroups().filter(g => byG.has(g)).forEach(g => { out.push({ header: g }); byG.get(g).forEach(c => out.push({ id: c.id, ico: catIconName(c), col: catColor(c, g), label: c.name })); });
      return;
    }
    if (kinds.length > 1 || grouped) out.push({ header: KINDS[k].label });
    list.forEach(c => out.push({ id: c.id, ico: catIconName(c), col: catColor(c, groupOf(c.id)), label: c.name }));
  });
  return out;
}
export const pickCategory = (kinds, selected) => pickList({ title: 'Kategori', items: catItems(kinds), selected, search: true });

export function walletItems({ exclude } = {}) {
  const list = alive('wallets').filter(w => !w.archived && w.id !== exclude).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
  const item = w => ({ id: w.id, ico: walletIconName(w), col: walletColor(w), label: w.name, sub: fmtCur(walletBal(w.id), w.currency) + (w.currency && w.currency !== 'IDR' ? ' · ≈ ' + rp(walletBalIDR(w.id)) : ''), subNum: true });
  const inc = list.filter(w => walletClass(w) !== 'abaikan'), exc = list.filter(w => walletClass(w) === 'abaikan');
  return [...(exc.length ? [{ header: 'Termasuk total' }] : []), ...inc.map(item), ...(exc.length ? [{ header: 'Tidak termasuk total' }, ...exc.map(item)] : [])];
}
export const pickWallet = (selected, exclude) => pickList({ title: 'Dompet', items: walletItems({ exclude }), selected });

import { D } from './store.js';
export const walletBal = id => D.balances.get(id) || 0;
export const walletBalIDR = id => toIDR(walletBal(id), (wallet(id) || {}).currency);
const CUR_SYM = { USD: '$', SGD: 'S$', EUR: '€', JPY: '¥', THB: '฿', MYR: 'RM', AUD: 'A$', GBP: '£', CNY: '¥', KRW: '₩' };
export function fmtCur(n, cur) {
  if (!cur || cur === 'IDR') return rp(n);
  if (state.config.hide) return '•••';
  const v = Number(n) || 0;
  return (v < 0 ? '-' : '') + (CUR_SYM[cur] || cur + ' ') + Math.abs(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const WALLET_TYPES = { cash: ['Tunai'], bank: ['Bank'], ewallet: ['E-wallet'], credit: ['Kartu kredit'], invest: ['Investasi (nilai naik-turun)'], receivable: ['Piutang / talangan'], saving: ['Tabungan / goal'], other: ['Lainnya'] };
export const walletIcon = (w, size = 18) => icon(walletIconName(w), size);
export const catBadge = (c, size = 20, extra = '') => badge(catIconName(c), catColor(c, c ? groupOf(c.id) : ''), size, extra);
export { walletBadge };
export const catIcon = (id, size = 20) => icon(catIconName(cat(id)), size);
export const catName = id => { const c = cat(id); return c ? c.name : 'Tanpa kategori'; };
export const walletName = id => { const w = wallet(id); return w ? w.name : '—'; };

// Baris transaksi standar.
export function txnRow(t, { showDate = false, showWallet = true } = {}) {
  const c = cat(t.category_id);
  const sub = [t.note, t.person && 'dengan ' + t.person, showDate && dateShort(t.date), showWallet && walletName(t.wallet_id)].filter(Boolean).join(' · ');
  const k = c ? c.kind : (t.amount < 0 ? 'expense' : 'income');
  const cls = k === 'transfer' || k === 'adjust' ? '' : t.amount < 0 ? 'neg' : 'pos';
  const w = wallet(t.wallet_id), cur = w && w.currency && w.currency !== 'IDR' ? w.currency : '';
  return `<button class="row" data-act="edit-txn" data-id="${esc(t.id)}">${catBadge(c)}
    <div class="main"><div class="t1">${esc(c ? c.name : 'Tanpa kategori')}</div>${sub ? `<div class="t2">${esc(sub)}</div>` : ''}</div>
    <div class="end ${cls}">${state.config.hide ? '•••' : (cur ? fmtCur(Math.abs(t.amount), cur) : fmtNum(Math.abs(t.amount)))}</div></button>`;
}
