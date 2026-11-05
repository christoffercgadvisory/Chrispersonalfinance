import { refreshRates, walletCurrencies, rate, DEFAULT_RATES } from './store.js';
import { state, D, KINDS, DEBT_KINDS, alive, get, cat, wallet, save, remove, summarize, monthTxns, rangeTxns, totalBalance,
  today, uid, nextDate, runRecurring, sync, saveConfig, ping, resetLocal, seedDefaultCategories, guessIcon } from './store.js';
import { catBadge, walletBadge, walletBalIDR, fmtCur } from './ui.js';
import { esc, rp, short, fmtNum, monthLabel, monShort, dayLabel, dateShort, addMonths, thisMonth, ago, act, toast, pushPage, popPage,
  pages, renderPage, pickList, pickCategory, pickWallet, catItems, txnRow, walletIcon, walletBal, catIcon, catName, walletName, WALLET_TYPES } from './ui.js';
import { openAdd } from './add.js';
import { readFile, parseDelimited, buildImport } from './importer.js';
import { homeAssets, renderReportPlan } from './rencana.js';
import { icon, catIconName, badge, parseIcon, joinIcon, catColor, walletIconName, walletColor } from './icons.js';
import { pickIcon, newCategory } from './catedit.js';
import { expenseGroups, groupOf, defaultGroup, INCOME_GROUPS, UNMAPPED, invalidate } from './plan.js';

export const V = { tab: 'home', txMonth: thisMonth(), txWallet: '', txQuery: '', rpMode: 'month', rpMonth: thisMonth(), rpYear: thisMonth().slice(0, 4), rpKind: 'expense' };

// ---------- Budget ----------
export function budgetsFor(m) {
  return alive('budgets').filter(b => (!b.start_month || b.start_month <= m) && (!b.end_month || b.end_month >= m));
}
export function budgetSpent(b, m) {
  const ids = String(b.category_ids || '').split(',').filter(Boolean);
  let s = 0;
  for (const t of monthTxns(m)) {
    if (t.exclude) continue;
    if (b.wallet_id && t.wallet_id !== b.wallet_id) continue;
    const c = cat(t.category_id);
    if (!c || c.kind !== 'expense') continue;
    if (ids.length && !ids.includes(t.category_id)) continue;
    s -= t.amount;
  }
  return s;
}
function budgetRow(b, m) {
  const spent = budgetSpent(b, m), lim = Number(b.amount) || 0;
  const pct = lim ? spent / lim : 0;
  const left = lim - spent;
  let sub = left >= 0 ? `Sisa ${rp(left)}` : `Lewat ${rp(-left)}`;
  if (m === thisMonth() && left > 0) {
    const d = new Date(), daysLeft = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
    sub += ` · ${short(left / daysLeft)}/hari`;
  }
  return `<button class="row" data-act="open-budget" data-id="${b.id}"><div class="main">
    <div style="display:flex;justify-content:space-between;gap:8px"><span class="t1">${esc(b.name)}</span><span class="num small muted">${short(spent)} / ${short(lim)}</span></div>
    <div class="bar ${pct > 1 ? 'over' : pct > .85 ? 'warn' : ''}"><i style="width:${Math.min(100, pct * 100).toFixed(1)}%"></i></div>
    <div class="t2" style="margin-top:4px">${sub}</div></div></button>`;
}

// ---------- Sync pill ----------
function syncPill() {
  const s = state.sync;
  if (!state.config.url) return `<button class="sync-pill" data-act="open-settings"><i></i>Belum terhubung</button>`;
  const label = s.status === 'syncing' ? 'Sync…' : s.status === 'error' ? 'Gagal sync' : s.status === 'offline' ? 'Offline' :
    s.pending ? `${s.pending} antre` : ago(s.last);
  return `<button class="sync-pill ${s.status}" data-act="open-settings"><i></i>${esc(label)}</button>`;
}

// ---------- Home ----------
export function renderHome() {
  const m = thisMonth();
  const sum = summarize(monthTxns(m));
  const wallets = alive('wallets').filter(w => !w.archived).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
  const recent = [];
  for (let i = D.months.length - 1; i >= 0 && recent.length < 8; i--) recent.push(...D.byMonth.get(D.months[i]).filter(t => t.date <= today() || true).slice(0, 8 - recent.length));
  const budgets = budgetsFor(m);
  const debts = [...D.persons.values()];
  const iOwe = debts.reduce((s, p) => s + Math.max(0, p.iOwe), 0), theyOwe = debts.reduce((s, p) => s + Math.max(0, p.theyOwe), 0);
  const ev = alive('events').filter(e => e.active);
  return `
  <div class="title-row"><h1 class="large-title">Duit</h1>${syncPill()}</div>
  ${!state.config.url ? `<button class="card hero" data-act="open-settings" style="display:block;width:calc(100% - 32px);text-align:left;margin-bottom:14px">
     <div style="font-weight:600">☁️ Hubungkan ke Google Sheets</div><div class="muted small" style="margin-top:4px">Biar semua transaksi tersimpan di spreadsheet lu. Tap buat setup.</div></button>` : ''}
  ${!wallets.length ? `<div class="card hero" style="margin-bottom:14px"><div style="font-weight:600;font-size:19px">Mulai dari sini</div>
     <p class="muted" style="margin:6px 0 14px;font-size:15px">Import data Money Lover lu, atau bikin dompet pertama.</p>
     <div style="display:grid;gap:8px"><button class="btn" data-act="open-import">Import dari Money Lover</button>
     <button class="btn secondary" data-act="new-wallet">Tambah dompet manual</button></div></div>` : ''}
  ${wallets.length ? homeAssets() : ''}
  ${ev.length ? `<div class="section-h">Event aktif</div><div class="list">${ev.map(e => eventRow(e)).join('')}</div>` : ''}
  ${budgets.length ? `<div class="section-h">Budget ${monShort(m)}<button data-act="open-budgets">Semua</button></div>
    <div class="list">${budgets.slice(0, 3).map(b => budgetRow(b, m)).join('')}</div>` : ''}
  ${wallets.length ? `<div class="section-h">Dompet<button data-act="open-wallets">Kelola</button></div>
    <div class="wallet-strip">${wallets.map(w => `<button class="wcard" data-act="open-wallet" data-id="${w.id}">
      <div class="n">${esc(w.name)}</div><div class="b num">${short(walletBal(w.id))}</div></button>`).join('')}</div>` : ''}
  ${iOwe || theyOwe ? `<div class="section-h">Hutang & piutang<button data-act="open-debts">Detail</button></div>
    <div class="card"><div class="stats" style="border:0"><div><div class="k">Gw berhutang</div><div class="v num">${short(iOwe)}</div></div>
    <div><div class="k">Orang berhutang</div><div class="v num">${short(theyOwe)}</div></div></div></div>` : ''}
  <div class="section-h">Terakhir<button data-act="tab" data-tab="txns">Semua</button></div>
  ${recent.length ? `<div class="list">${recent.map(t => txnRow(t, { showDate: true })).join('')}</div>` : `<div class="empty">Belum ada transaksi. Tap + buat nambah.</div>`}`;
}

// ---------- Transactions ----------
export function renderTxns() {
  const q = V.txQuery.trim().toLowerCase();
  let list;
  if (q) {
    list = [];
    for (let i = D.months.length - 1; i >= 0 && list.length < 300; i--) {
      for (const t of D.byMonth.get(D.months[i])) {
        if (V.txWallet && t.wallet_id !== V.txWallet) continue;
        const hay = (catName(t.category_id) + ' ' + (t.note || '') + ' ' + (t.person || '') + ' ' + walletName(t.wallet_id) + ' ' + Math.abs(t.amount)).toLowerCase();
        if (hay.includes(q)) list.push(t);
      }
    }
  } else {
    list = monthTxns(V.txMonth).filter(t => !V.txWallet || t.wallet_id === V.txWallet);
  }
  const sum = summarize(list, { wallet: V.txWallet || undefined });
  const groups = new Map();
  list.forEach(t => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });
  const wallets = alive('wallets').filter(w => !w.archived);
  return `
  <div class="title-row"><h1 class="large-title">Transaksi</h1>${syncPill()}</div>
  <div class="search"><span class="muted">⌕</span><input data-input="tx-search" placeholder="Cari kategori, catatan, nominal" value="${esc(V.txQuery)}" autocomplete="off" enterkeyhint="search">
    ${V.txQuery ? '<button data-act="tx-clear" class="muted">✕</button>' : ''}</div>
  ${wallets.length > 1 ? `<div class="chips" style="margin:6px 0 8px"><button class="chip ${!V.txWallet ? 'on' : ''}" data-act="tx-wallet" data-id="">Semua</button>
    ${wallets.map(w => `<button class="chip ${V.txWallet === w.id ? 'on' : ''}" data-act="tx-wallet" data-id="${w.id}">${esc(w.name)}</button>`).join('')}</div>` : ''}
  ${q ? `<div class="foot" style="margin:4px 20px 0">${list.length}${list.length >= 300 ? '+' : ''} hasil</div>` :
    `<div class="month-nav"><button data-act="tx-month" data-d="-1">‹</button><span class="m">${monthLabel(V.txMonth)}</span><button data-act="tx-month" data-d="1">›</button></div>`}
  <div class="card"><div class="stats" style="border:0;grid-template-columns:1fr 1fr 1fr">
    <div><div class="k">Masuk</div><div class="v num pos" style="font-size:16px">${short(sum.income)}</div></div>
    <div><div class="k">Keluar</div><div class="v num" style="font-size:16px">${short(sum.expense)}</div></div>
    <div><div class="k">Selisih</div><div class="v num" style="font-size:16px">${short(sum.net)}</div></div></div></div>
  ${groups.size ? [...groups].map(([d, ts]) => {
    const net = ts.reduce((s, t) => { const c = cat(t.category_id); return c && (c.kind === 'expense' || c.kind === 'income') && !t.exclude ? s + t.amount : s; }, 0);
    return `<div class="day-h"><span>${esc(dayLabel(d))}</span><span class="num">${net ? rp(net, { sign: true }) : ''}</span></div><div class="list">${ts.map(t => txnRow(t)).join('')}</div>`;
  }).join('') : `<div class="empty">${q ? 'Nggak ketemu.' : 'Belum ada transaksi di bulan ini.'}</div>`}`;
}

// ---------- Report ----------
function barChart(labels, a, b) {
  const W = 340, H = 150, pb = 18, n = labels.length;
  const max = Math.max(1, ...a, ...b);
  const step = W / n, bw = Math.min(14, step / 3);
  let s = '';
  [0.5, 1].forEach(f => { const y = (H - pb) * (1 - f); s += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" style="stroke:var(--sep)" stroke-width=".5"/><text x="${W}" y="${y + 11}" text-anchor="end" font-size="9" style="fill:var(--label2)">${short(max * f)}</text>`; });
  labels.forEach((l, i) => {
    const x = i * step + step / 2;
    const ha = (H - pb) * a[i] / max, hb = (H - pb) * b[i] / max;
    s += `<rect x="${x - bw - 1}" y="${H - pb - ha}" width="${bw}" height="${ha}" rx="3" style="fill:var(--income)"/>`;
    s += `<rect x="${x + 1}" y="${H - pb - hb}" width="${bw}" height="${hb}" rx="3" style="fill:var(--accent)"/>`;
    s += `<text x="${x}" y="${H - 4}" text-anchor="middle" font-size="10" style="fill:var(--label2)">${esc(l)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}">${s}</svg>`;
}

export function renderReport() { return renderReportPlan(); }
export function renderReportOld() {
  const isM = V.rpMode === 'month';
  const from = isM ? V.rpMonth : V.rpYear + '-01', to = isM ? V.rpMonth : V.rpYear + '-12';
  const txns = rangeTxns(from, to);
  const sum = summarize(txns);
  let days;
  if (isM) { const [y, m] = V.rpMonth.split('-').map(Number); days = V.rpMonth === thisMonth() ? new Date().getDate() : new Date(y, m, 0).getDate(); }
  else days = V.rpYear === today().slice(0, 4) ? Math.ceil((Date.now() - new Date(Number(V.rpYear), 0, 1)) / 864e5) : 365;
  const months = isM ? Array.from({ length: 6 }, (_, i) => addMonths(V.rpMonth, i - 5)) : Array.from({ length: 12 }, (_, i) => V.rpYear + '-' + String(i + 1).padStart(2, '0'));
  const ms = months.map(m => summarize(monthTxns(m)));
  const cats = sum.byCat.filter(c => c.kind === V.rpKind).sort((a, b) => b.total - a.total);
  const tot = V.rpKind === 'expense' ? sum.expense : sum.income;
  const maxC = cats.length ? Math.max(...cats.map(c => c.total)) : 1;
  return `
  <div class="title-row"><h1 class="large-title">Laporan</h1></div>
  <div class="seg" style="margin:4px 16px 10px"><button class="${isM ? 'on' : ''}" data-act="rp-mode" data-m="month">Bulanan</button><button class="${!isM ? 'on' : ''}" data-act="rp-mode" data-m="year">Tahunan</button></div>
  <div class="month-nav"><button data-act="rp-nav" data-d="-1">‹</button><span class="m">${isM ? monthLabel(V.rpMonth) : V.rpYear}</span><button data-act="rp-nav" data-d="1">›</button></div>
  <div class="card"><div class="stats" style="border:0">
    <div><div class="k">Masuk</div><div class="v num pos">${short(sum.income)}</div></div><div><div class="k">Keluar</div><div class="v num">${short(sum.expense)}</div></div></div>
    <div class="stats"><div><div class="k">Selisih</div><div class="v num">${short(sum.net)}</div></div>
    <div><div class="k">Rata-rata keluar/hari</div><div class="v num">${short(sum.expense / Math.max(1, days))}</div></div></div></div>
  <div class="section-h">${isM ? '6 bulan terakhir' : 'Per bulan'}</div>
  <div class="card chart"><div class="legend"><span><i style="background:var(--income)"></i>Masuk</span><span><i style="background:var(--accent)"></i>Keluar</span></div>
    ${barChart(months.map(monShort), ms.map(x => Math.max(0, x.income)), ms.map(x => Math.max(0, x.expense)))}</div>
  <div class="seg" style="margin:22px 16px 8px"><button class="${V.rpKind === 'expense' ? 'on' : ''}" data-act="rp-kind" data-k="expense">Pengeluaran</button><button class="${V.rpKind === 'income' ? 'on' : ''}" data-act="rp-kind" data-k="income">Pemasukan</button></div>
  ${cats.length ? `<div class="list">${cats.map(c => `<button class="row" data-act="cat-drill" data-id="${esc(c.id)}" data-from="${from}" data-to="${to}">
    <span class="ic">${catIcon(c.id)}</span><div class="main"><div style="display:flex;justify-content:space-between;gap:8px"><span class="t1">${esc(catName(c.id))}</span>
    <span class="num">${rp(c.total)}</span></div><div class="catbar" style="width:${(c.total / maxC * 100).toFixed(1)}%;${V.rpKind === 'income' ? 'background:var(--income)' : ''}"></div>
    <div class="t2" style="margin-top:3px">${tot ? (c.total / tot * 100).toFixed(1).replace('.', ',') : 0}% · ${c.count} transaksi</div></div></button>`).join('')}</div>`
    : '<div class="empty">Belum ada data.</div>'}`;
}

// ---------- More ----------
export function renderMore() {
  const item = (act, icon, label, sub = '') => `<button class="row" data-act="${act}"><span class="ic">${icon}</span><div class="main"><div class="t1">${label}</div>${sub ? `<div class="t2">${esc(sub)}</div>` : ''}</div><span class="chev">${icon('chevron-right', 18)}</span></button>`;
  const persons = [...D.persons.values()].filter(p => Math.round(p.iOwe) || Math.round(p.theyOwe)).length;
  return `<div class="title-row"><h1 class="large-title">Lainnya</h1>${syncPill()}</div>
  <div class="list" style="margin-top:10px">
    ${item('open-plan', '🧭', 'Rencana & proyeksi kas', 'Budget ideal, P&L, target tabungan')}
  </div>
  <div class="list" style="margin-top:22px">
    ${item('open-wallets', '👛', 'Dompet', alive('wallets').length + ' dompet')}
    ${item('open-budgets', '🎯', 'Budget', budgetsFor(thisMonth()).length + ' aktif bulan ini')}
    ${item('open-recurring', '🔁', 'Transaksi berulang', alive('recurring').filter(r => r.active).length + ' aktif')}
    ${item('open-debts', '🤝', 'Hutang & piutang', persons ? persons + ' orang belum lunas' : '')}
    ${item('open-events', '🎟️', 'Event / trip', alive('events').length + ' event')}
    ${item('open-categories', '🗂️', 'Kategori', alive('categories').filter(c => !c.id.startsWith('sys_')).length + ' kategori')}
  </div>
  <div class="list" style="margin-top:22px">
    ${item('open-import', '📥', 'Import dari Money Lover')}
    ${item('open-settings', '☁️', 'Sinkronisasi Google Sheets', state.config.url ? 'Terakhir ' + ago(state.sync.last) : 'Belum terhubung')}
  </div>
  <div class="foot" style="margin-top:20px;text-align:center">${state.transactions.size} transaksi tersimpan di HP ini</div>`;
}

// ---------- Form helper ----------
// Semua nilai form disimpan di page.v, jadi re-render aman.
const top = () => pages[pages.length - 1];
function field(f, v) {
  const val = v[f.k];
  const lab = `<label>${esc(f.label)}</label>`;
  switch (f.type) {
    case 'toggle': return `<div class="field">${lab}<input type="checkbox" class="toggle" data-change="f-toggle" data-k="${f.k}" ${val ? 'checked' : ''}></div>`;
    case 'select': return `<div class="field">${lab}<select data-change="f-in" data-k="${f.k}">${f.options.map(([o, l]) => `<option value="${esc(o)}" ${String(val) === String(o) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    case 'money': return `<div class="field">${lab}<input inputmode="${f.neg ? 'text' : 'numeric'}" data-input="f-money" data-k="${f.k}" value="${val || val === 0 ? (val < 0 ? '-' : '') + fmtNum(Math.abs(val)) : ''}" placeholder="${esc(f.placeholder || '0')}"></div>`;
    case 'number': return `<div class="field">${lab}<input inputmode="numeric" data-input="f-num" data-k="${f.k}" value="${esc(val ?? '')}" placeholder="${esc(f.placeholder || '')}"></div>`;
    case 'date': case 'month': return `<div class="field">${lab}<input type="${f.type}" data-change="f-in" data-k="${f.k}" value="${esc(val || '')}" style="text-align:right">${f.clear && val ? `<button data-act="f-clear" data-k="${f.k}" class="muted">${icon('x', 16)}</button>` : ''}</div>`;
    case 'cat': return `<button class="field" style="width:100%" data-act="f-cat" data-k="${f.k}">${lab}<span class="pick">${val ? esc(catName(val)) : 'Pilih'}</span></button>`;
    case 'wallet': return `<button class="field" style="width:100%" data-act="f-wallet" data-k="${f.k}">${lab}<span class="pick">${val ? esc(walletName(val)) : (f.none || 'Pilih')}</span></button>`;
    case 'cats': { const ids = String(val || '').split(',').filter(Boolean); return `<button class="field" style="width:100%" data-act="f-cats" data-k="${f.k}">${lab}<span class="pick">${ids.length ? esc(ids.map(catName).join(', ')) : 'Semua pengeluaran'}</span></button>`; }
    default: return `<div class="field">${lab}<input data-input="f-in" data-k="${f.k}" value="${esc(val ?? '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off"></div>`;
  }
}
const formHtml = (groups, v) => groups.map(g => `${g.head ? `<div class="section-h">${esc(g.head)}</div>` : '<div style="height:22px"></div>'}<div class="list">${g.fields.map(f => field(f, v)).join('')}</div>${g.foot ? `<div class="foot">${g.foot}</div>` : ''}`).join('');
act('f-in', (d, el) => { const p = top(); p.v[d.k] = el.value; if (d.k === 'kind' && p.title && /kategori/i.test(p.title)) { p.v.group = ''; renderPage(p); } });
act('f-toggle', (d, el) => { const p = top(); p.v[d.k] = el.checked; if (d.k === 'forever') { if (!el.checked && !p.v.end_date) { const [y, m, dd] = (p.v.next_date || today()).split('-').map(Number); p.v.end_date = (y + 1) + '-' + String(m).padStart(2, '0') + '-' + String(dd).padStart(2, '0'); } renderPage(p); } });
act('f-num', (d, el) => { top().v[d.k] = el.value.replace(/[^0-9]/g, ''); });
act('f-money', (d, el) => {
  const neg = el.value.trim().startsWith('-');
  const digits = el.value.replace(/[^0-9]/g, '');
  const n = digits ? Number(digits) * (neg ? -1 : 1) : (neg ? '-' : '');
  top().v[d.k] = n === '-' ? 0 : n;
  el.value = (neg ? '-' : '') + (digits ? fmtNum(Number(digits)) : '');
});
act('f-clear', d => { top().v[d.k] = ''; renderPage(top()); });
act('f-cat', async d => { const p = top(); const id = await pickCategory(p.catKinds || ['expense', 'income'], p.v[d.k]); if (id) { p.v[d.k] = id; renderPage(p); } });
act('f-wallet', async d => {
  const p = top();
  const opt = p.walletNone ? [{ id: '__none', label: p.walletNone, icon: '—' }] : [];
  const id = await pickList({ title: 'Dompet', items: [...opt, ...alive('wallets').filter(w => !w.archived).map(w => ({ id: w.id, icon: walletIcon(w), label: w.name }))], selected: p.v[d.k] || '__none' });
  if (id) { p.v[d.k] = id === '__none' ? '' : id; renderPage(p); }
});
act('f-cats', d => {
  const p = top();
  const sel = new Set(String(p.v[d.k] || '').split(',').filter(Boolean));
  pushPage({ title: 'Kategori budget', back: 'Budget', right: { act: 'f-cats-done', label: 'Selesai' }, v: { sel }, parent: p, key: d.k,
    render() { return `<div class="foot" style="margin:0 32px 8px">Kosongkan semua = budget untuk semua pengeluaran.</div><div class="list">${catItems(['expense']).map(c => `<button class="row" data-act="f-cats-toggle" data-id="${c.id}"><span class="ic">${icon(c.ico, 20)}</span><div class="main"><div class="t1">${esc(c.label)}</div></div>${this.v.sel.has(c.id) ? `<span style="color:var(--accent-text)">${icon('check', 20)}</span>` : ''}</button>`).join('')}</div>`; } });
});
act('f-cats-toggle', d => { const p = top(); p.v.sel.has(d.id) ? p.v.sel.delete(d.id) : p.v.sel.add(d.id); renderPage(p); });
act('f-cats-done', () => { const p = top(); p.parent.v[p.key] = [...p.v.sel].join(','); popPage(); renderPage(p.parent); });

// ---------- Wallets ----------
function walletsPage() {
  pushPage({ title: 'Dompet', live: true, right: { act: 'new-wallet', label: 'Tambah' }, render() {
    const ws = alive('wallets').sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
    const row = w => `<button class="row" data-act="open-wallet" data-id="${w.id}">${walletBadge(w)}<div class="main"><div class="t1">${esc(w.name)}</div>
      <div class="t2">${esc((WALLET_TYPES[w.type] || WALLET_TYPES.other)[0])}${w.exclude_total ? ' · tidak dihitung di total' : ''}${w.currency && w.currency !== 'IDR' ? ' · ' + esc(w.currency) : ''}</div></div>
      <div class="end num">${w.currency && w.currency !== 'IDR' ? fmtCur(walletBal(w.id), w.currency) : rp(walletBal(w.id))}</div></button>`;
    const act = ws.filter(w => !w.archived), arc = ws.filter(w => w.archived);
    return `<div class="card hero" style="margin-bottom:6px"><div class="label">Total (yang dihitung)</div><div class="big num" style="font-size:30px">${rp(totalBalance())}</div></div>
      ${act.length ? `<div class="section-h">Aktif</div><div class="list">${act.map(row).join('')}</div>` : '<div class="empty">Belum ada dompet.</div>'}
      ${arc.length ? `<div class="section-h">Diarsipkan</div><div class="list">${arc.map(row).join('')}</div>` : ''}`;
  } });
}
function walletDetail(id) {
  pushPage({ title: () => walletName(id), live: true, right: { act: 'edit-wallet', label: 'Edit', data: `data-id="${id}"` }, render() {
    const w = get('wallets', id); if (!w) return '<div class="empty">Dompet sudah dihapus.</div>';
    const list = [];
    for (let i = D.months.length - 1; i >= 0 && list.length < 100; i--) list.push(...D.byMonth.get(D.months[i]).filter(t => t.wallet_id === id));
    const groups = new Map(); list.slice(0, 100).forEach(t => { const m = t.date.slice(0, 7); if (!groups.has(m)) groups.set(m, []); groups.get(m).push(t); });
    const fx = w.currency && w.currency !== 'IDR';
    return `<div class="card hero"><div class="label">Saldo</div><div class="big num">${fx ? fmtCur(walletBal(id), w.currency) : rp(walletBal(id))}</div>${fx ? `<div class="muted small">≈ ${rp(walletBalIDR(id))}</div>` : ''}</div>
      <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:12px"><button class="btn secondary" data-act="adjust-wallet" data-id="${id}">Sesuaikan saldo</button>
        <button class="btn secondary" data-act="wallet-add-txn" data-id="${id}">+ Transaksi</button></div>
      ${[...groups].map(([m, ts]) => `<div class="section-h">${monthLabel(m)}</div><div class="list">${ts.map(t => txnRow(t, { showDate: true })).join('')}</div>`).join('') || '<div class="empty">Belum ada transaksi.</div>'}`;
  } });
}
function walletForm(id) {
  const w = id ? get('wallets', id) : null;
  const v = w ? { ...w } : { name: '', type: 'bank', currency: 'IDR', initial_balance: 0, exclude_total: false, archived: false, sort: alive('wallets').length };
  pushPage({ title: w ? 'Edit dompet' : 'Dompet baru', back: 'Batal', v, right: { act: 'wallet-save', label: 'Simpan' }, render() {
    const pw = { ...this.v };
    return `<button class="field" style="width:100%" data-act="w-icon"><label>Ikon & warna</label><span style="margin-left:auto">${badge(walletIconName(pw), walletColor(pw), 18)}</span></button>`.replace('<button class="field"', '<div class="list" style="margin-top:6px"><button class="field"') + '</div>' + formHtml([{ fields: [{ k: 'name', label: 'Nama', placeholder: 'BCA, Cash, GoPay…' }, { k: 'type', label: 'Jenis', type: 'select', options: Object.entries(WALLET_TYPES).map(([k, [l]]) => [k, l]) }] },
      { fields: [{ k: 'initial_balance', label: 'Saldo awal', type: 'money', neg: true }, { k: 'currency', label: 'Mata uang', type: 'select', options: ['IDR', ...Object.keys(DEFAULT_RATES)].map(c => [c, c]) }],
        foot: 'Saldo = saldo awal + semua transaksi. Kalau saldo di app beda sama aslinya, pakai "Sesuaikan saldo" di halaman dompet.' },
      { fields: [{ k: 'exclude_total', label: 'Jangan hitung di total', type: 'toggle' }, { k: 'archived', label: 'Arsipkan', type: 'toggle' }, { k: 'sort', label: 'Urutan', type: 'number' }] }], this.v)
      + (w ? `<div class="btn-row"><button class="btn danger" data-act="wallet-del" data-id="${w.id}">Hapus dompet</button></div>` : '');
  } });
}
export const newWallet = () => walletForm();
act('open-wallets', walletsPage);
act('open-wallet', d => walletDetail(d.id));
act('new-wallet', () => walletForm());
act('edit-wallet', d => walletForm(d.id));
act('w-icon', async () => {
  const p = top(), r = await pickIcon({ name: walletIconName(p.v), color: walletColor(p.v) });
  if (r) { p.v.color = joinIcon(r.name, r.color); renderPage(p); }
});
act('wallet-save', async () => {
  const p = top(), v = p.v;
  if (!String(v.name || '').trim()) return toast('Nama dompet wajib');
  await save('wallets', [{ ...v, name: v.name.trim(), currency: (v.currency || 'IDR').toUpperCase(), initial_balance: Number(v.initial_balance) || 0, sort: Number(v.sort) || 0 }]);
  popPage(); toast('Dompet disimpan');
});
act('wallet-del', async d => {
  const n = [...state.transactions.values()].filter(t => !t.deleted && t.wallet_id === d.id).length;
  if (n) return alert(`Dompet ini masih punya ${n} transaksi. Arsipkan aja kalau udah nggak dipakai.`);
  if (!confirm('Hapus dompet ini?')) return;
  await remove('wallets', d.id); popPage(); popPage();
});
act('adjust-wallet', async d => {
  const cur = walletBal(d.id);
  const input = prompt('Saldo sebenarnya sekarang (angka saja):', String(Math.round(cur)));
  if (input === null) return;
  const neg = input.trim().startsWith('-');
  const target = Number(input.replace(/[^0-9]/g, '')) * (neg ? -1 : 1);
  if (!isFinite(target)) return;
  const diff = target - cur;
  if (!diff) return toast('Saldo sudah sesuai');
  await save('transactions', [{ date: today(), amount: diff, category_id: 'sys_adjust', wallet_id: d.id, note: 'Penyesuaian saldo' }]);
  toast('Saldo disesuaikan');
});
act('wallet-add-txn', d => openAdd(null, { wallet_id: d.id }));

// ---------- Budgets ----------
function budgetsPage() {
  pushPage({ title: 'Budget', live: true, v: { m: thisMonth() }, right: { act: 'new-budget', label: 'Tambah' }, render() {
    const m = this.v.m, list = budgetsFor(m);
    const lim = list.reduce((s, b) => s + (Number(b.amount) || 0), 0), sp = list.reduce((s, b) => s + budgetSpent(b, m), 0);
    return `<div class="month-nav"><button data-act="bud-month" data-d="-1">${icon('chevron-left', 20)}</button><span class="m">${monthLabel(m)}</span><button data-act="bud-month" data-d="1">${icon('chevron-right', 20)}</button></div>
      ${list.length ? `<div class="card"><div class="stats" style="border:0"><div><div class="k">Total budget</div><div class="v num">${short(lim)}</div></div><div><div class="k">Terpakai</div><div class="v num">${short(sp)}</div></div></div></div>
      <div style="height:16px"></div><div class="list">${list.map(b => budgetRow(b, m)).join('')}</div>` : '<div class="empty">Belum ada budget untuk bulan ini.</div>'}`;
  } });
}
function budgetForm(id) {
  const b = id ? get('budgets', id) : null;
  const v = b ? { ...b } : { name: '', category_ids: '', wallet_id: '', amount: '', start_month: thisMonth(), end_month: '' };
  pushPage({ title: b ? 'Edit budget' : 'Budget baru', back: 'Batal', v, walletNone: 'Semua dompet', right: { act: 'budget-save', label: 'Simpan' }, render() {
    return formHtml([{ fields: [{ k: 'name', label: 'Nama', placeholder: 'Makan bulanan' }, { k: 'amount', label: 'Limit / bulan', type: 'money' }] },
      { fields: [{ k: 'category_ids', label: 'Kategori', type: 'cats' }, { k: 'wallet_id', label: 'Dompet', type: 'wallet', none: 'Semua dompet' }] },
      { fields: [{ k: 'start_month', label: 'Mulai', type: 'month' }, { k: 'end_month', label: 'Sampai', type: 'month', clear: true }], foot: 'Kosongkan "Sampai" kalau budget ini berlaku terus tiap bulan.' }], this.v)
      + (b ? `<div class="btn-row"><button class="btn danger" data-act="budget-del" data-id="${b.id}">Hapus budget</button></div>` : '');
  } });
}
act('open-budgets', budgetsPage);
act('open-budget', d => budgetForm(d.id));
act('new-budget', () => budgetForm());
act('bud-month', d => { const p = top(); p.v.m = addMonths(p.v.m, Number(d.d)); renderPage(p); });
act('budget-save', async () => {
  const v = top().v;
  if (!Number(v.amount)) return toast('Isi limit budget');
  const name = String(v.name || '').trim() || (v.category_ids ? v.category_ids.split(',').map(catName).join(', ') : 'Semua pengeluaran');
  await save('budgets', [{ ...v, name, amount: Number(v.amount) }]);
  popPage(); toast('Budget disimpan');
});
act('budget-del', async d => { if (!confirm('Hapus budget ini?')) return; await remove('budgets', d.id); popPage(); });

// ---------- Recurring ----------
const FREQ = [['daily', 'Harian'], ['weekly', 'Mingguan'], ['monthly', 'Bulanan'], ['yearly', 'Tahunan']];
function recurringPage() {
  pushPage({ title: 'Transaksi berulang', live: true, right: { act: 'new-recurring', label: 'Tambah' }, render() {
    const list = alive('recurring').sort((a, b) => (a.next_date || '').localeCompare(b.next_date || ''));
    return list.length ? `<div class="list">${list.map(r => `<button class="row" data-act="open-recurring-item" data-id="${r.id}"><span class="ic">${catIcon(r.category_id)}</span>
      <div class="main"><div class="t1">${esc(r.name || catName(r.category_id))}</div><div class="t2">${esc((FREQ.find(f => f[0] === r.freq) || [, ''])[1])}${r.interval > 1 ? ' ×' + r.interval : ''} · ${r.active ? 'berikutnya ' + dateShort(r.next_date) + (r.end_date ? ' · sampai ' + dateShort(r.end_date) : ' · selamanya') : 'nonaktif'} · ${esc(walletName(r.wallet_id))}</div></div>
      <div class="end num ${r.amount > 0 ? 'pos' : ''}">${rp(r.amount, { sign: true })}</div></button>`).join('')}</div>
      <div class="foot">Transaksi dibuat otomatis waktu app dibuka di tanggal jatuh tempo.</div>` : '<div class="empty">Belum ada. Contoh: gaji tiap tanggal 25, sewa apartemen, langganan Netflix.</div>';
  } });
}
function recurringForm(id) {
  const r = id ? get('recurring', id) : null;
  const v = r ? { ...r, kind: r.amount < 0 ? 'expense' : 'income', amount: Math.abs(r.amount), forever: !r.end_date } : { name: '', kind: 'expense', amount: '', category_id: '', wallet_id: state.config.lastWallet || '', note: '', freq: 'monthly', interval: 1, next_date: today(), end_date: '', forever: true, active: true };
  pushPage({ title: r ? 'Edit berulang' : 'Transaksi berulang', back: 'Batal', v, get catKinds() { return [this.v.kind]; }, right: { act: 'recurring-save', label: 'Simpan' }, render() {
    return formHtml([{ fields: [{ k: 'name', label: 'Nama', placeholder: 'Sewa apartemen' }, { k: 'kind', label: 'Jenis', type: 'select', options: [['expense', 'Pengeluaran'], ['income', 'Pemasukan']] },
      { k: 'amount', label: 'Nominal', type: 'money' }, { k: 'category_id', label: 'Kategori', type: 'cat' }, { k: 'wallet_id', label: 'Dompet', type: 'wallet' }, { k: 'note', label: 'Catatan' }] },
      { fields: [{ k: 'freq', label: 'Ulangi', type: 'select', options: FREQ }, { k: 'interval', label: 'Setiap', type: 'number', placeholder: '1' },
        { k: 'next_date', label: r ? 'Berikutnya' : 'Mulai', type: 'date' }, { k: 'forever', label: 'Selamanya', type: 'toggle' },
        ...(this.v.forever ? [] : [{ k: 'end_date', label: 'Sampai', type: 'date' }]), { k: 'active', label: 'Aktif', type: 'toggle' }],
        foot: '"Setiap 2" + Bulanan = tiap 2 bulan. Kalau tanggal mulai sudah lewat, transaksi yang terlewat langsung dibuat.' }], this.v)
      + (r ? `<div class="btn-row"><button class="btn danger" data-act="recurring-del" data-id="${r.id}">Hapus</button></div>` : '');
  } });
}
act('open-recurring', recurringPage);
act('open-recurring-item', d => recurringForm(d.id));
act('new-recurring', () => recurringForm());
act('recurring-save', async () => {
  const v = top().v;
  if (!Number(v.amount)) return toast('Isi nominal');
  if (!v.category_id) return toast('Pilih kategori');
  if (!v.wallet_id) return toast('Pilih dompet');
  if (!v.next_date) return toast('Isi tanggal mulai');
  const c = cat(v.category_id);
  const sign = c && KINDS[c.kind] && KINDS[c.kind].sign ? KINDS[c.kind].sign : (v.kind === 'income' ? 1 : -1);
  const { kind, forever, ...row } = v;
  if (forever) row.end_date = '';
  await save('recurring', [{ ...row, amount: sign * Math.abs(Number(v.amount)), interval: Number(v.interval) || 1, name: String(v.name || '').trim() || catName(v.category_id) }]);
  const n = runRecurring();
  popPage(); toast(n ? `Disimpan · ${n} transaksi dibuat` : 'Disimpan');
});
act('recurring-del', async d => { if (!confirm('Hapus aturan berulang ini? Transaksi yang sudah dibuat tetap ada.')) return; await remove('recurring', d.id); popPage(); });

// ---------- Debts ----------
function debtsPage() {
  pushPage({ title: 'Hutang & piutang', live: true, v: { showDone: false }, right: { act: 'debt-new', label: 'Tambah' }, render() {
    const ps = [...D.persons.values()];
    const open = p => Math.round(p.iOwe) !== 0 || Math.round(p.theyOwe) !== 0;
    const owe = ps.filter(p => Math.round(p.iOwe) > 0).sort((a, b) => b.iOwe - a.iOwe);
    const they = ps.filter(p => Math.round(p.theyOwe) > 0).sort((a, b) => b.theyOwe - a.theyOwe);
    const done = ps.filter(p => !open(p));
    const row = (p, v) => `<button class="row" data-act="open-person" data-name="${esc(p.name)}"><span class="ic">${icon('user', 20)}</span><div class="main"><div class="t1">${esc(p.name)}</div><div class="t2">${p.txns.length} transaksi · terakhir ${dateShort(p.txns[0].date)}</div></div><div class="end num">${rp(v)}</div><span class="chev">${icon('chevron-right', 18)}</span></button>`;
    return `<div class="card"><div class="stats" style="border:0"><div><div class="k">Gw berhutang</div><div class="v num">${short(owe.reduce((s, p) => s + p.iOwe, 0))}</div></div>
      <div><div class="k">Orang berhutang ke gw</div><div class="v num pos">${short(they.reduce((s, p) => s + p.theyOwe, 0))}</div></div></div></div>
      ${owe.length ? `<div class="section-h">Gw berhutang ke</div><div class="list">${owe.map(p => row(p, p.iOwe)).join('')}</div>` : ''}
      ${they.length ? `<div class="section-h">Berhutang ke gw</div><div class="list">${they.map(p => row(p, p.theyOwe)).join('')}</div>` : ''}
      ${!owe.length && !they.length ? '<div class="empty">Nggak ada hutang/piutang yang belum lunas.</div>' : ''}
      ${done.length ? `<div class="section-h">Lunas<button data-act="debt-toggle-done">${this.v.showDone ? 'Sembunyikan' : 'Tampilkan'}</button></div>${this.v.showDone ? `<div class="list">${done.map(p => row(p, 0)).join('')}</div>` : ''}` : ''}
      <div class="foot">Dihitung dari transaksi berkategori Hutang, Piutang, Bayar hutang, dan Terima pelunasan yang ada nama orangnya.</div>`;
  } });
}
function personPage(name) {
  pushPage({ title: name, live: true, render() {
    const p = D.persons.get(name.toLowerCase());
    if (!p) return '<div class="empty">Tidak ada transaksi.</div>';
    const iOwe = Math.round(p.iOwe), they = Math.round(p.theyOwe);
    return `<div class="card"><div class="stats" style="border:0"><div><div class="k">Gw berhutang</div><div class="v num">${rp(Math.max(0, iOwe))}</div></div><div><div class="k">Dia berhutang</div><div class="v num pos">${rp(Math.max(0, they))}</div></div></div></div>
      <div class="btn-row" style="grid-template-columns:1fr 1fr;margin-top:12px">
        <button class="btn secondary" data-act="debt-quick" data-cat="sys_repay" data-name="${esc(p.name)}" data-amt="${Math.max(0, iOwe)}">Bayar hutang</button>
        <button class="btn secondary" data-act="debt-quick" data-cat="sys_collect" data-name="${esc(p.name)}" data-amt="${Math.max(0, they)}">Terima pelunasan</button>
        <button class="btn secondary" data-act="debt-quick" data-cat="sys_debt" data-name="${esc(p.name)}" data-amt="0">Pinjam lagi</button>
        <button class="btn secondary" data-act="debt-quick" data-cat="sys_loan" data-name="${esc(p.name)}" data-amt="0">Pinjamkan lagi</button></div>
      <div class="section-h">Riwayat</div><div class="list">${p.txns.map(t => txnRow(t, { showDate: true })).join('')}</div>`;
  } });
}
act('open-debts', debtsPage);
act('open-person', d => personPage(d.name));
act('debt-toggle-done', () => { const p = top(); p.v.showDone = !p.v.showDone; renderPage(p); });
act('debt-new', () => openAdd(null, { mode: 'debt', category_id: 'sys_debt' }));
act('debt-quick', d => openAdd(null, { mode: 'debt', category_id: d.cat, person: d.name, expr: Number(d.amt) > 0 ? String(d.amt) : '' }));

// ---------- Events ----------
function eventStats(id) {
  let spent = 0, n = 0;
  state.transactions.forEach(t => { if (t.deleted || t.event_id !== id) return; const c = cat(t.category_id); if (c && c.kind === 'expense') spent -= t.amount; n++; });
  return { spent, n };
}
function eventRow(e) {
  const s = eventStats(e.id);
  return `<button class="row" data-act="open-event" data-id="${e.id}"><span class="ic">${icon('calendar', 20)}</span><div class="main"><div class="t1">${esc(e.name)}</div>
    <div class="t2">${[e.start_date && dateShort(e.start_date) + (e.end_date ? ' – ' + dateShort(e.end_date) : ''), s.n + ' transaksi', e.active ? 'aktif' : ''].filter(Boolean).join(' · ')}</div></div>
    <div class="end num">${rp(s.spent)}</div></button>`;
}
function eventsPage() {
  pushPage({ title: 'Event / trip', live: true, right: { act: 'new-event', label: 'Tambah' }, render() {
    const list = alive('events').sort((a, b) => (b.active - a.active) || (b.start_date || '').localeCompare(a.start_date || ''));
    return list.length ? `<div class="list">${list.map(eventRow).join('')}</div><div class="foot">Event yang aktif otomatis kepilih waktu lu nambah transaksi baru.</div>`
      : '<div class="empty">Bikin event buat ngelacak total biaya trip, nikahan, renovasi, dll.</div>';
  } });
}
function eventDetail(id) {
  pushPage({ title: () => (get('events', id) || {}).name || 'Event', live: true, right: { act: 'edit-event', label: 'Edit', data: `data-id="${id}"` }, render() {
    const e = get('events', id); if (!e) return '<div class="empty">Event dihapus.</div>';
    const txns = [...state.transactions.values()].filter(t => !t.deleted && t.event_id === id).sort((a, b) => b.date.localeCompare(a.date));
    const sum = summarize(txns);
    const cats = sum.byCat.filter(c => c.kind === 'expense').sort((a, b) => b.total - a.total);
    return `<div class="card hero"><div class="label">Total pengeluaran</div><div class="big num">${rp(sum.expense)}</div></div>
      ${cats.length ? `<div class="section-h">Per kategori</div><div class="list">${cats.map(c => `<div class="row"><span class="ic">${catIcon(c.id)}</span><div class="main"><div class="t1">${esc(catName(c.id))}</div></div><div class="end num">${rp(c.total)}</div></div>`).join('')}</div>` : ''}
      <div class="section-h">Transaksi</div>${txns.length ? `<div class="list">${txns.map(t => txnRow(t, { showDate: true })).join('')}</div>` : '<div class="empty">Belum ada transaksi di event ini.</div>'}`;
  } });
}
function eventForm(id) {
  const e = id ? get('events', id) : null;
  const v = e ? { ...e } : { name: '', icon: '', start_date: today(), end_date: '', active: true };
  pushPage({ title: e ? 'Edit event' : 'Event baru', back: 'Batal', v, right: { act: 'event-save', label: 'Simpan' }, render() {
    return formHtml([{ fields: [{ k: 'name', label: 'Nama', placeholder: 'Bali Desember' }] },
      { fields: [{ k: 'start_date', label: 'Mulai', type: 'date' }, { k: 'end_date', label: 'Selesai', type: 'date', clear: true }, { k: 'active', label: 'Aktif', type: 'toggle' }] }], this.v)
      + (e ? `<div class="btn-row"><button class="btn danger" data-act="event-del" data-id="${e.id}">Hapus event</button></div>` : '');
  } });
}
act('open-events', eventsPage);
act('open-event', d => eventDetail(d.id));
act('new-event', () => eventForm());
act('edit-event', d => eventForm(d.id));
act('event-save', async () => {
  const v = top().v;
  if (!String(v.name || '').trim()) return toast('Nama event wajib');
  await save('events', [{ ...v, name: v.name.trim() }]);
  popPage(); toast('Event disimpan');
});
act('event-del', async d => {
  if (!confirm('Hapus event? Transaksinya tetap ada, cuma lepas dari event ini.')) return;
  const txns = [...state.transactions.values()].filter(t => !t.deleted && t.event_id === d.id).map(t => ({ ...t, event_id: '' }));
  if (txns.length) await save('transactions', txns);
  await remove('events', d.id); popPage(); popPage();
});

// ---------- Categories ----------
function categoriesPage() {
  pushPage({ title: 'Kategori', live: true, right: { act: 'new-category', label: 'Tambah' }, render() {
    const counts = new Map();
    state.transactions.forEach(t => { if (!t.deleted) counts.set(t.category_id, (counts.get(t.category_id) || 0) + 1); });
    const has = alive('categories').some(c => !c.id.startsWith('sys_'));
    const row = c => `<button class="row" data-act="open-category" data-id="${c.id}">${catBadge(c)}
      <div class="main"><div class="t1">${esc(c.name)}</div></div><span class="val small">${counts.get(c.id) || 0}</span><span class="chev">${icon('chevron-right', 18)}</span></button>`;
    const exp = alive('categories').filter(c => c.kind === 'expense');
    const byG = new Map();
    exp.forEach(c => { const g = groupOf(c.id); if (!byG.has(g)) byG.set(g, []); byG.get(g).push(c); });
    const order = expenseGroups().filter(g => byG.has(g));
    const unm = (byG.get(UNMAPPED) || []).filter(c => !/other expense|unknown|fees/i.test(c.name));
    return (has ? '' : `<div class="card hero"><div style="font-weight:600">Belum ada kategori</div><p class="muted small">Import dari Money Lover akan bikin kategori lu otomatis. Atau pakai set default.</p><button class="btn" data-act="seed-cats">Pakai kategori default</button></div>`)
      + (unm.length ? `<div class="foot" style="margin:0 32px 6px;color:var(--orange)">${unm.length} kategori belum masuk grup laporan. Tap buat pilih grupnya.</div>` : '')
      + order.map(g => `<div class="section-h">${esc(g)}</div><div class="list">${byG.get(g).sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0)).map(row).join('')}</div>`).join('')
      + ['income', 'debt', 'loan', 'repayment', 'collection'].map(k => {
        const list = alive('categories').filter(c => c.kind === k).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
        if (!list.length) return '';
        if (k === 'income') {
          const gi = new Map(); list.forEach(c => { const g = groupOf(c.id); if (!gi.has(g)) gi.set(g, []); gi.get(g).push(c); });
          return [...gi].map(([g, cs]) => `<div class="section-h">Pemasukan · ${esc(g)}</div><div class="list">${cs.map(row).join('')}</div>`).join('');
        }
        return `<div class="section-h">${esc(KINDS[k].label)}</div><div class="list">${list.map(row).join('')}</div>`;
      }).join('') + '<div class="foot">Section = grup laporan (sama kayak di tracker). Angka di kanan = jumlah transaksi.</div>';
  } });
}
function categoryForm(id) {
  const c = id ? get('categories', id) : null;
  const v = c ? { ...c } : { name: '', kind: 'expense', icon: '', sort: 0 };
  const sys = c && c.id.startsWith('sys_');
  pushPage({ title: c ? 'Edit kategori' : 'Kategori baru', back: 'Batal', v, right: { act: 'category-save', label: 'Simpan' }, render() {
    const fields = [{ k: 'name', label: 'Nama' }];
    if (!sys) fields.push({ k: 'kind', label: 'Jenis', type: 'select', options: ['expense', 'income', 'debt', 'loan', 'repayment', 'collection'].map(k => [k, KINDS[k].label]) });
    if (this.v.kind === 'expense' || this.v.kind === 'income') {
      const opts = this.v.kind === 'expense' ? expenseGroups() : INCOME_GROUPS.map(g => g[0]);
      const cur = this.v.group || defaultGroup(this.v.name || '', this.v.kind);
      if (cur && !opts.includes(cur)) opts.push(cur);
      fields.push({ k: 'group', label: 'Grup laporan', type: 'select', options: [...opts.map(g => [g, g]), ['__new', '+ Grup baru…']] });
      if (!this.v.group) this.v.group = cur;
    }
    fields.push({ k: 'sort', label: 'Urutan', type: 'number' });
    const pc = { ...this.v, id: this.v.id || '' };
    return `<div class="list" style="margin-top:6px"><button class="field" style="width:100%" data-act="c-icon"><label>Ikon & warna</label><span style="margin-left:auto">${badge(catIconName(pc), catColor(pc, groupOf(pc.id) || this.v.group), 18)}</span></button></div>` + formHtml([{ fields }], this.v) + (c && !sys ? `<div class="btn-row"><button class="btn secondary" data-act="category-merge" data-id="${c.id}">Gabungkan ke kategori lain…</button>
      <button class="btn danger" data-act="category-del" data-id="${c.id}">Hapus kategori</button></div>` : '');
  } });
}
act('open-categories', categoriesPage);
act('open-category', d => categoryForm(d.id));
act('new-category', () => newCategory({ kindFixed: false }));
act('c-icon', async () => {
  const p = top(), pc = { ...p.v };
  const r = await pickIcon({ name: catIconName(pc), color: catColor(pc, p.v.group || groupOf(pc.id)) });
  if (r) { p.v.icon = joinIcon(r.name, r.color); renderPage(p); }
});
act('seed-cats', async () => { await seedDefaultCategories(); toast('Kategori default ditambahkan'); });
act('category-save', async () => {
  const v = top().v;
  if (v.group === '__new') { const g = prompt('Nama grup baru:'); if (!g || !g.trim()) return; v.group = g.trim(); }
  if (!String(v.name || '').trim()) return toast('Nama wajib');
  await save('categories', [{ ...v, name: v.name.trim(), sort: Number(v.sort) || 0 }]);
  popPage(); toast('Kategori disimpan');
});
act('category-merge', async d => {
  const src = get('categories', d.id);
  const target = await pickList({ title: 'Gabung ke', items: catItems([src.kind]).filter(i => i.id !== d.id), search: true });
  if (!target) return;
  const txns = [...state.transactions.values()].filter(t => !t.deleted && t.category_id === d.id).map(t => ({ ...t, category_id: target }));
  if (!confirm(`Pindahkan ${txns.length} transaksi dari "${src.name}" ke "${catName(target)}" lalu hapus "${src.name}"?`)) return;
  if (txns.length) await save('transactions', txns);
  const rec = alive('recurring').filter(r => r.category_id === d.id).map(r => ({ ...r, category_id: target }));
  if (rec.length) await save('recurring', rec);
  await remove('categories', d.id);
  popPage(); toast('Digabung');
});
act('category-del', async d => {
  const n = [...state.transactions.values()].filter(t => !t.deleted && t.category_id === d.id).length;
  if (n) return alert(`Masih dipakai ${n} transaksi. Pakai "Gabungkan" supaya transaksinya pindah dulu.`);
  if (!confirm('Hapus kategori ini?')) return;
  await remove('categories', d.id); popPage();
});

// ---------- Category drill-down (dari laporan) ----------
act('cat-drill', d => {
  pushPage({ title: catName(d.id), live: true, render() {
    const txns = rangeTxns(d.from, d.to).filter(t => t.category_id === d.id && !t.exclude);
    const total = txns.reduce((s, t) => s + t.amount, 0);
    return `<div class="card hero"><div class="label">${d.from === d.to ? monthLabel(d.from) : d.from.slice(0, 4)}</div><div class="big num">${rp(Math.abs(total))}</div><div class="muted small">${txns.length} transaksi</div></div>
      <div style="height:14px"></div><div class="list">${txns.map(t => txnRow(t, { showDate: true })).join('')}</div>`;
  } });
});

// ---------- Import ----------
function importPage() {
  pushPage({ title: 'Import Money Lover', v: { plan: null, error: '', busy: false, progress: '' }, render() {
    const v = this.v, s = v.plan && v.plan.summary;
    return `<div class="list plain"><div class="row" style="display:block;padding:14px 16px;font-size:15px;line-height:1.5">
      <b>Cara export dari Money Lover</b><br>Buka web.moneylover.me, pilih dompet "Total" (semua dompet), menu ... > Export, rentang dari awal sampai hari ini, format CSV. Simpan file-nya ke Files di iPhone, lalu pilih di bawah.</div></div>
      <div class="btn-row"><label class="btn ${v.busy ? 'secondary' : ''}" style="position:relative">${v.plan ? 'Pilih file lain' : 'Pilih file CSV'}<input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" data-change="import-file" style="position:absolute;inset:0;opacity:0"></label></div>
      ${v.error ? `<div class="foot" style="color:var(--red)">${esc(v.error)}</div>` : ''}
      ${s ? `<div class="section-h">Preview</div><div class="list plain">
        <div class="row"><div class="main">Transaksi</div><span class="val num">${fmtNum(s.rows)}</span></div>
        <div class="row"><div class="main">Periode</div><span class="val">${dateShort(s.from)} – ${dateShort(s.to)}</span></div>
        <div class="row"><div class="main">Dompet</div><span class="val">${s.wallets} (${v.plan.newWallets.length} baru)</span></div>
        <div class="row"><div class="main">Kategori</div><span class="val">${s.categories} (${v.plan.newCats.length} baru)</span></div>
        ${s.fixedTransfers ? `<div class="row"><div class="main">Transfer lama dirapikan</div><span class="val num">${fmtNum(s.fixedTransfers)}</span></div>` : ''}
        ${s.initials ? `<div class="row"><div class="main">Saldo awal (bukan pemasukan)</div><span class="val num">${fmtNum(s.initials)}</span></div>` : ''}
        ${v.plan.newEvents.length ? `<div class="row"><div class="main">Event baru</div><span class="val">${v.plan.newEvents.length}</span></div>` : ''}
        ${s.existing ? `<div class="row"><div class="main">Sudah ada (di-update)</div><span class="val">${fmtNum(s.existing)}</span></div>` : ''}
        ${v.plan.skipped.length ? `<div class="row"><div class="main">Baris dilewati</div><span class="val">${v.plan.skipped.length}</span></div>` : ''}</div>
        <div class="foot">Aman di-import ulang: transaksi yang sama nggak akan dobel. "Transfer lama dirapikan" = catatan "Received from / Send to" yang dulu kecatat sebagai Gifts / Other Income / Other Expense / Withdrawal.</div>
        <div class="btn-row"><button class="btn" data-act="import-go" ${v.busy ? 'disabled' : ''}>${v.busy ? esc(v.progress || 'Menyimpan…') : 'Import ' + fmtNum(s.rows) + ' transaksi'}</button></div>` : ''}`;
  } });
}
act('open-import', importPage);
act('import-file', async (d, el) => {
  const p = top(), f = el.files && el.files[0];
  if (!f) return;
  p.v.error = ''; p.v.plan = null;
  try { p.v.plan = buildImport(parseDelimited(await readFile(f))); }
  catch (e) { p.v.error = e.message || String(e); }
  renderPage(p);
});
act('import-go', async () => {
  const p = top(), plan = p.v.plan;
  if (!plan || p.v.busy) return;
  p.v.busy = true; p.v.progress = 'Menyimpan di HP…'; renderPage(p);
  if (plan.newWallets.length) await save('wallets', plan.newWallets);
  if (plan.newCats.length) await save('categories', plan.newCats);
  if (plan.newEvents.length) await save('events', plan.newEvents);
  await save('transactions', plan.txns);
  if (state.config.url) {
    p.v.progress = 'Upload ke Sheets…'; renderPage(p);
    await sync({ onProgress: (a, b) => { p.v.progress = `Upload ke Sheets… ${Math.round(a / b * 100)}%`; renderPage(p); } });
  }
  p.v.busy = false;
  popPage();
  toast(state.sync.status === 'error' ? 'Tersimpan di HP, sync gagal: ' + state.sync.error : 'Import selesai');
  if (plan.newWallets.length) setTimeout(() => alert('Import selesai. Cek saldo tiap dompet di menu Dompet. Kalau beda sama saldo asli, pakai "Sesuaikan saldo".'), 500);
});

// ---------- Settings / Sync ----------
function settingsPage() {
  pushPage({ title: 'Sinkronisasi', live: true, v: { url: state.config.url, token: state.config.token, testing: false }, render() {
    const v = this.v, s = state.sync;
    return `<div class="section-h">Google Apps Script</div><div class="list">
      <div class="field"><label>URL Web App</label><input data-input="set-in" data-k="url" value="${esc(v.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" autocapitalize="off"></div>
      <div class="field"><label>Token</label><input data-input="set-in" data-k="token" value="${esc(v.token)}" placeholder="dari menu Duit > Tampilkan token" autocomplete="off" autocapitalize="off"></div></div>
      <div class="btn-row"><button class="btn" data-act="set-save">${v.testing ? 'Ngecek…' : 'Simpan & tes koneksi'}</button></div>
      ${state.config.url ? `<div class="section-h">Status</div><div class="list plain">
        <div class="row"><div class="main">Terakhir sync</div><span class="val">${ago(s.last)}</span></div>
        <div class="row"><div class="main">Antrean upload</div><span class="val">${s.pending}</span></div>
        ${s.status === 'error' ? `<div class="row"><div class="main" style="color:var(--red)">${esc(s.error)}</div></div>` : ''}</div>
        <div class="btn-row"><button class="btn secondary" data-act="set-sync">${s.status === 'syncing' ? 'Sync…' : 'Sync sekarang'}</button>
        <button class="btn secondary" data-act="set-full">Tarik ulang semua dari Sheets</button></div>` : ''}
      <div class="section-h">Kurs ke Rupiah<button data-act="fx-refresh">Perbarui</button></div>
      ${walletCurrencies().length ? `<div class="list">${walletCurrencies().map(c => `<div class="field"><label>1 ${esc(c)}</label>
        <input inputmode="decimal" data-change="fx-in" data-c="${esc(c)}" value="${esc((state.config.ratesManual || {})[c] || '')}" placeholder="${Math.round(rate(c)).toLocaleString('id-ID')}"></div>`).join('')}</div>
        <div class="foot">${state.config.ratesAt ? 'Kurs otomatis terakhir diperbarui ' + ago(state.config.ratesAt) + '.' : 'Kurs otomatis belum pernah diambil, sementara pakai perkiraan.'} Isi angka kalau mau pakai kurs sendiri; kosongkan buat balik ke kurs otomatis.</div>`
        : '<div class="foot" style="margin-top:0">Belum ada dompet mata uang asing.</div>'}
      <div class="section-h">Tampilan</div><div class="list"><div class="field"><label>Sembunyikan nominal</label><input type="checkbox" class="toggle" data-change="set-hide" ${state.config.hide ? 'checked' : ''}></div></div>
      <div class="section-h">Data</div><div class="list plain"><div class="row"><div class="main">Transaksi di HP</div><span class="val num">${fmtNum([...state.transactions.values()].filter(t => !t.deleted).length)}</span></div></div>
      <div class="btn-row"><button class="btn danger" data-act="set-reset">Hapus data di HP ini</button></div>
      <div class="foot">Menghapus data di HP nggak menyentuh Google Sheets. Setelah itu tap "Tarik ulang semua" buat ambil lagi.</div>`;
  } });
}
act('open-settings', settingsPage);
act('set-in', (d, el) => { top().v[d.k] = el.value.trim(); });
act('set-save', async () => {
  const p = top(); const { url, token } = p.v;
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) return toast('URL harus dari script.google.com');
  if (!token) return toast('Isi token');
  p.v.testing = true; renderPage(p);
  try {
    await ping(url, token);
    const first = !state.config.url;
    await saveConfig({ url, token, since: first ? 0 : state.config.since });
    toast('Terhubung');
    await sync({ full: first });
  } catch (e) { alert('Gagal konek: ' + (e.message || e)); }
  p.v.testing = false; renderPage(p);
});
act('set-sync', () => sync());
act('fx-refresh', async () => { toast('Ambil kurs…'); const ok = await refreshRates(true); toast(ok ? 'Kurs diperbarui' : 'Gagal ambil kurs, coba lagi nanti'); renderPage(top()); });
act('fx-in', (d, el) => {
  const v = Number(el.value.replace(/\./g, '').replace(',', '.'));
  const m = { ...(state.config.ratesManual || {}) };
  if (el.value.trim() && v > 0) m[d.c] = v; else delete m[d.c];
  saveConfig({ ratesManual: m });
});
act('set-full', () => sync({ full: true }));
act('set-hide', (d, el) => saveConfig({ hide: el.checked }));
act('set-reset', async () => {
  if (!confirm('Hapus semua data di HP ini? Data yang belum ke-sync akan hilang.')) return;
  if (state.sync.pending && !confirm(`Masih ada ${state.sync.pending} perubahan yang belum ke-upload. Yakin?`)) return;
  await resetLocal(); toast('Data lokal dihapus');
});

// ---------- Tab-level actions ----------
act('toggle-hide', () => saveConfig({ hide: !state.config.hide }));
act('edit-txn', d => openAdd(d.id));
act('tx-month', d => { V.txMonth = addMonths(V.txMonth, Number(d.d)); window.__render(); });
act('tx-wallet', d => { V.txWallet = d.id; window.__render(); });
act('tx-clear', () => { V.txQuery = ''; window.__render(); });
let searchT;
act('tx-search', (d, el) => { V.txQuery = el.value; clearTimeout(searchT); searchT = setTimeout(() => { window.__render(); const i = document.querySelector('[data-input=tx-search]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200); });
act('rp-mode', d => { V.rpMode = d.m; window.__render(); });
act('rp-kind', d => { V.rpKind = d.k; window.__render(); });
act('rp-nav', d => { if (V.rpMode === 'month') V.rpMonth = addMonths(V.rpMonth, Number(d.d)); else V.rpYear = String(Number(V.rpYear) + Number(d.d)); window.__render(); });
