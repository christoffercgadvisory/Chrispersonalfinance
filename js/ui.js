import { state, cat, wallet, alive, KINDS, today } from './store.js';

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
export function openSheet({ title = '', html, left, right, cls = '', onMount, onClose, head = true }) {
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const el = document.createElement('div'); el.className = 'sheet ' + cls;
  el.innerHTML = `<div class="grabber"></div>${head ? `<div class="sheet-head"><div>${left ? `<button class="navbtn" data-act="${left.act}">${esc(left.label)}</button>` : `<button class="navbtn" data-act="sheet-close">Tutup</button>`}</div>
    <div class="title">${esc(title)}</div><div style="display:flex;justify-content:flex-end">${right ? `<button class="navbtn bold" data-act="${right.act}">${esc(right.label)}</button>` : ''}</div></div>` : ''}
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
export function pickList({ title, items, selected, search = false, footer = '' }) {
  return new Promise(resolve => {
    const rows = list => list.map(it => it.header ? `<div class="section-h">${esc(it.header)}</div>` :
      `<button class="row" data-act="pick" data-id="${esc(it.id)}">${it.icon !== undefined ? `<span class="ic">${esc(it.icon)}</span>` : ''}
        <div class="main"><div class="t1">${esc(it.label)}</div>${it.sub ? `<div class="t2">${esc(it.sub)}</div>` : ''}</div>
        ${it.id === selected ? '<span style="color:var(--accent);font-weight:600">✓</span>' : ''}</button>`).join('');
    const group = list => { // bungkus baris di antara header dengan .list
      let html = '', buf = [];
      const flush = () => { if (buf.length) { html += `<div class="list">${rows(buf)}</div>`; buf = []; } };
      list.forEach(it => { if (it.header) { flush(); html += rows([it]); } else buf.push(it); });
      flush();
      return html;
    };
    const s = openSheet({
      title, html: `${search ? '<div class="search"><span class="muted">⌕</span><input data-input="pick-search" placeholder="Cari" autocomplete="off"></div>' : ''}
        <div class="pick-items" style="padding-top:8px">${group(items)}</div>${footer}`,
      onClose: v => resolve(v ?? null),
      onMount: el => {
        el.querySelector('.pick-items').addEventListener('click', e => { const b = e.target.closest('[data-act=pick]'); if (b) { e.stopPropagation(); s.close(b.dataset.id); } });
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

export function catItems(kinds, { withSys = false } = {}) {
  const out = [];
  kinds.forEach(k => {
    const list = alive('categories').filter(c => c.kind === k && (withSys || !c.id.startsWith('sys_') || ['debt', 'loan', 'repayment', 'collection'].includes(k)))
      .sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
    if (!list.length) return;
    if (kinds.length > 1) out.push({ header: KINDS[k].label });
    list.forEach(c => out.push({ id: c.id, icon: c.icon || '•', label: c.name }));
  });
  return out;
}
export const pickCategory = (kinds, selected) => pickList({ title: 'Kategori', items: catItems(kinds), selected, search: true });

export function walletItems({ exclude } = {}) {
  return alive('wallets').filter(w => !w.archived && w.id !== exclude).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name))
    .map(w => ({ id: w.id, icon: walletIcon(w), label: w.name, sub: rp(walletBal(w.id)) }));
}
export const pickWallet = (selected, exclude) => pickList({ title: 'Dompet', items: walletItems({ exclude }), selected });

import { D } from './store.js';
export const walletBal = id => D.balances.get(id) || 0;
export const WALLET_TYPES = { cash: ['Tunai', '💵'], bank: ['Bank', '🏦'], ewallet: ['E-wallet', '📱'], credit: ['Kartu kredit', '💳'], invest: ['Investasi (nilai naik-turun)', '📈'], receivable: ['Piutang / talangan', '🤝'], saving: ['Tabungan / goal', '🎯'], other: ['Lainnya', '👛'] };
export const walletIcon = w => (WALLET_TYPES[w.type] || WALLET_TYPES.other)[1];
export const catIcon = id => { const c = cat(id); return c ? (c.icon || '•') : '❔'; };
export const catName = id => { const c = cat(id); return c ? c.name : 'Tanpa kategori'; };
export const walletName = id => { const w = wallet(id); return w ? w.name : '—'; };

// Baris transaksi standar.
export function txnRow(t, { showDate = false } = {}) {
  const sub = [t.note, t.person && '👤 ' + t.person, showDate && dateShort(t.date), walletName(t.wallet_id)].filter(Boolean).join(' · ');
  return `<button class="row" data-act="edit-txn" data-id="${esc(t.id)}"><span class="ic">${esc(catIcon(t.category_id))}</span>
    <div class="main"><div class="t1">${esc(catName(t.category_id))}</div><div class="t2">${esc(sub)}</div></div>
    <div class="end num ${amtClass(t)}">${rp(t.amount, { sign: true })}</div></button>`;
}
