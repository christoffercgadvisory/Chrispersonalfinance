// Empat tab utama, alurnya mengikuti Money Lover: Beranda · Transaksi · Budget · Akun.
import { state, D, alive, cat, wallet, today, monthTxns, saveConfig, rate, save } from './store.js';
import { esc, rp, fmtNum, act, pushPage, pickList, txnRow, walletBal, walletBalIDR, fmtCur, ago, refreshPages, walletItems, walletBadge, sortHandlers } from './ui.js';
import { icon, WALLET_ICON } from './icons.js';
import { compute, jt, MON, mLabelLong, addMonths, budgetFor, routineSpend, PLAN_EXCLUDE, expenseGroups, groupOf, walletClass, verdict, avg6, lastFullYm } from './plan.js';
import { renderReportPlan, R, openGroupDrill } from './rencana.js';

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const thisYm = () => today().slice(0, 7);
const money = n => state.config.hide ? 'Rp •••' : rp(n);

function syncPill() {
  const s = state.sync;
  if (!state.config.url) return `<button class="sync-pill" data-act="open-settings"><i></i>Belum terhubung</button>`;
  const label = s.status === 'syncing' ? 'Sync…' : s.status === 'error' ? 'Gagal sync' : s.status === 'offline' ? 'Offline' : s.pending ? `${s.pending} antre` : ago(s.last);
  return `<button class="sync-pill ${s.status}" data-act="open-settings"><i></i>${esc(label)}</button>`;
}
const includedWallets = () => alive('wallets').filter(w => walletClass(w) !== 'abaikan');
const totalIncluded = () => includedWallets().reduce((s, w) => s + walletBalIDR(w.id), 0);

// ---------- Beranda ----------
function cumulative(ym) { // pengeluaran rutin kumulatif per hari
  const [y, m] = ym.split('-').map(Number), days = new Date(y, m, 0).getDate(), arr = new Array(days).fill(0);
  for (const t of monthTxns(ym)) {
    if (t.exclude) continue;
    const c = cat(t.category_id); if (!c || c.kind !== 'expense') continue;
    const w = wallet(t.wallet_id);
    arr[+t.date.slice(8, 10) - 1] -= t.amount * rate(w && w.currency);
  }
  for (let i = 1; i < days; i++) arr[i] += arr[i - 1];
  return arr;
}
function spendChart(ym) {
  const cur = cumulative(ym), prev = [1, 2, 3].map(k => cumulative(addMonths(ym, -k)));
  const n = cur.length, avg = Array.from({ length: n }, (_, i) => prev.reduce((s, p) => s + (p[Math.min(i, p.length - 1)] || 0), 0) / 3);
  const isNow = ym === thisYm(), dayIdx = isNow ? +today().slice(8, 10) - 1 : n - 1;
  const W = 340, H = 150, pb = 18, hi = Math.max(1, ...avg, ...cur.slice(0, dayIdx + 1));
  const x = i => 4 + i * (W - 40) / (n - 1), y = v => 6 + (H - 6 - pb) * (1 - v / hi);
  const path = (a, upto) => a.slice(0, upto + 1).map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  let s = '';
  [0.5, 1].forEach(f => { s += `<line x1="4" x2="${W - 36}" y1="${y(hi * f)}" y2="${y(hi * f)}" style="stroke:var(--sep)" stroke-dasharray="3 3"/><text x="${W - 32}" y="${y(hi * f) + 4}" font-size="10" style="fill:var(--label3);font-family:var(--f-num)">${jt(hi * f, 0)}</text>`; });
  s += `<path d="${path(avg, n - 1)}" style="fill:none;stroke:var(--label3)" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<path d="${path(cur, dayIdx)}" style="fill:none;stroke:var(--orange)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  s += `<circle cx="${x(dayIdx)}" cy="${y(cur[dayIdx])}" r="4.5" style="fill:var(--card);stroke:var(--orange)" stroke-width="2.5"/>`;
  s += `<text x="4" y="${H - 3}" font-size="10" style="fill:var(--label3)">01/${ym.slice(5)}</text><text x="${W - 36}" y="${H - 3}" text-anchor="end" font-size="10" style="fill:var(--label3)">${n}/${ym.slice(5)}</text>`;
  return { svg: `<svg viewBox="0 0 ${W} ${H}">${s}</svg>`, now: cur[dayIdx], avg: avg[dayIdx], day: dayIdx + 1 };
}

export function renderHome() {
  const S = compute(), m = thisYm(), agg = S.byYm[m] || { in: 0, out: 0, cats: {} };
  const ws = orderedWallets();
  const shown = H.all ? ws : ws.slice(0, 5);
  const recent = [];
  for (let i = D.months.length - 1; i >= 0 && recent.length < 5; i--) recent.push(...D.byMonth.get(D.months[i]).filter(t => t.date <= today()).slice(0, 5 - recent.length));
  const ch = spendChart(m);
  const top = Object.entries(agg.cats).filter(([g, v]) => v > 0 && !PLAN_EXCLUDE[g]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const topTot = Object.entries(agg.cats).filter(([g]) => !PLAN_EXCLUDE[g]).reduce((s, [, v]) => s + Math.max(0, v), 0);
  const v = verdict(S);
  const vcol = v.cls === 'bad' ? 'var(--red)' : v.cls === 'tight' ? 'var(--orange-warn)' : 'var(--green)';
  if (!alive('wallets').length) return `<div class="title-row"><h1 class="large-title">DOIT</h1>${syncPill()}</div>
    ${!state.config.url ? `<div class="card hero" style="margin-bottom:12px"><b>Hubungkan ke Google Sheets</b><div class="muted small" style="margin:4px 0 12px">Semua transaksi tersimpan di spreadsheet lu.</div><button class="btn" data-act="open-settings">Setup sinkronisasi</button></div>` : ''}
    <div class="card hero"><b>Mulai dari sini</b><div class="muted small" style="margin:4px 0 12px">Import data Money Lover lu, atau bikin dompet pertama.</div>
    <div style="display:grid;gap:8px"><button class="btn" data-act="open-import">Import dari Money Lover</button><button class="btn secondary" data-act="new-wallet">Tambah dompet manual</button></div></div>`;
  return `
  <div class="title-row"><div><div class="muted small" style="display:flex;align-items:center;gap:8px">Total saldo
    <button data-act="toggle-hide" style="color:var(--label3)">${icon(state.config.hide ? 'eye-off' : 'eye', 18)}</button></div>
    <div class="num bal">${money(totalIncluded())}</div></div>${syncPill()}</div>
  <div class="card"><div class="stats" style="border:0;grid-template-columns:1fr 1fr 1fr">
    <div><div class="k">Cash</div><div class="v">${jt(S.totalCash)}</div></div>
    <div><div class="k">Piutang</div><div class="v">${jt(S.pots.piutang)}</div></div>
    <div><div class="k">Kartu kredit</div><div class="v">${jt(S.pots.kartu)}</div></div></div></div>

  <div class="section-h">Dompet saya<button data-act="open-wallets">Kelola</button></div>
  <div class="list" data-sortable="home-wallets">${shown.map(w => `<button class="row" data-act="open-wallet" data-id="${w.id}" data-sort-id="${w.id}">${walletBadge(w)}
    <div class="main"><div class="t1">${esc(w.name)}</div>${w.currency && w.currency !== 'IDR' ? `<div class="t2">${fmtCur(walletBal(w.id), w.currency)}</div>` : ''}</div><div class="end">${state.config.hide ? '•••' : fmtNum(walletBalIDR(w.id))}</div>
    <span class="grip" aria-label="Geser untuk mengurutkan">${icon('grip-vertical', 18)}</span></button>`).join('')}</div>
  ${ws.length > 5 ? `<button class="link-btn" data-act="home-all" style="padding-bottom:0">${H.all ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${ws.length})`}</button>` : ''}
  <div class="foot" style="text-align:center;margin-top:6px">Tahan ikon ${icon('grip-vertical', 12).replace('class="ico ', 'style="display:inline;vertical-align:-1px" class="ico ')} lalu geser buat atur urutan.</div>

  <div class="section-h">Laporan bulan ini<button data-act="open-report" data-ym="${m}">Lihat laporan</button></div>
  <div class="card"><div class="kpi-tabs"><div><div class="k">Total keluar</div><div class="v neg">${state.config.hide ? '•••' : fmtNum(agg.out)}</div></div>
    <div><div class="k">Total masuk</div><div class="v pos">${state.config.hide ? '•••' : fmtNum(agg.in)}</div></div></div>
    <div class="tip">${String(ch.day).padStart(2, '0')}/${m.slice(5)}: <b>${state.config.hide ? '•••' : fmtNum(ch.now)}</b> · rata-rata 3 bln: <b>${state.config.hide ? '•••' : fmtNum(ch.avg)}</b></div>
    <div class="chart">${ch.svg}<div class="legend" style="padding-top:6px"><span><i style="background:var(--orange)"></i>Bulan ini</span><span><i style="background:var(--label3)"></i>Rata-rata 3 bulan sebelumnya</span></div></div></div>

  ${top.length ? `<div class="section-h">Pengeluaran teratas<button data-act="open-report" data-ym="${m}">Detail</button></div>
  <div class="list">${top.map(([g, val]) => `<button class="row" data-act="open-group" data-g="${esc(g)}" data-ym="${m}"><div class="main">
    <div style="display:flex;justify-content:space-between;gap:8px"><span class="t1">${esc(g)}</span><span class="num neg">${topTot ? Math.round(val / topTot * 100) : 0}%</span></div>
    <div class="bar"><i style="width:${topTot ? (val / topTot * 100).toFixed(1) : 0}%"></i></div><div class="t2 num" style="margin-top:4px">${state.config.hide ? '•••' : fmtNum(val)}</div></div></button>`).join('')}</div>` : ''}

  <div class="section-h">Rencana</div>
  <button class="card" data-act="open-plan" style="display:block;width:calc(100% - 32px);text-align:left">
    <div style="padding:14px 16px;display:flex;gap:12px;align-items:flex-start"><span style="width:9px;height:9px;border-radius:5px;margin-top:7px;flex:none;background:${vcol}"></span>
    <div style="flex:1"><div style="font-weight:600">${esc(v.txt)}</div><div class="muted small" style="margin-top:3px">Titik terendah ${jt(S.P.min.v)} · ${mLabelLong(S.P.min.ym)}</div></div>
    <span class="chev muted">${icon('chevron-right', 18)}</span></div></button>

  <div class="section-h">Transaksi terakhir<button data-act="tab" data-tab="txns">Lihat semua</button></div>
  ${recent.length ? `<div class="list">${recent.map(t => txnRow(t, { showDate: true })).join('')}</div>` : '<div class="empty">Belum ada transaksi.</div>'}`;
}
act('open-report', d => openReport('m', d.ym || thisYm()));
const H = { all: false };
act('home-all', () => { H.all = !H.all; window.__render(); });
// Urutan dompet: sesuai urutan yang lu atur (field sort), lalu saldo terbesar.
export function orderedWallets() {
  return alive('wallets').filter(w => !w.archived && walletClass(w) !== 'abaikan')
    .sort((a, b) => (a.sort || 0) - (b.sort || 0) || Math.abs(walletBalIDR(b.id)) - Math.abs(walletBalIDR(a.id)));
}
export function saveWalletOrder(visibleIds) {
  const all = orderedWallets().map(w => w.id);
  const rest = all.filter(id => !visibleIds.includes(id));
  const order = [...visibleIds, ...rest];
  const changed = order.map((id, i) => ({ ...wallet(id), sort: i + 1 })).filter(w => (wallet(w.id).sort || 0) !== w.sort);
  if (changed.length) save('wallets', changed);
}
sortHandlers['home-wallets'] = saveWalletOrder;
act('open-group', d => { R.type = 'm'; R.sel = d.ym; openGroupDrill(d.g, false); });
export function openReport(type, sel) {
  R.type = type; R.sel = sel;
  pushPage({ title: 'Laporan', live: true, render: () => renderReportPlan({ inPage: true }) });
}

// ---------- Transaksi ----------
export const T = { wallet: '', period: thisYm(), q: '', search: false };
function periodList() {
  const now = thisYm(), first = D.months.find(m => m <= now) || now;
  const out = [];
  let m = addMonths(now, -23) < first ? first : addMonths(now, -23);
  while (m <= now) { out.push(m); m = addMonths(m, 1); }
  out.push('future');
  return out;
}
const periodLabel = p => p === 'future' ? 'Masa depan' : p === thisYm() ? 'Bulan ini' : p === addMonths(thisYm(), -1) ? 'Bulan lalu' : MON[+p.slice(5, 7) - 1] + ' ' + p.slice(0, 4);

export function renderTxns() {
  const w = T.wallet ? wallet(T.wallet) : null;
  const inSet = t => T.wallet ? t.wallet_id === T.wallet : walletClass(wallet(t.wallet_id)) !== 'abaikan';
  const bal = w ? walletBal(w.id) : totalIncluded();
  const fxOf = t => w ? 1 : rate((wallet(t.wallet_id) || {}).currency);
  let list, opening = null, ending = null;
  const q = T.q.trim().toLowerCase();
  if (T.search && q) {
    list = [];
    for (let i = D.months.length - 1; i >= 0 && list.length < 300; i--) for (const t of D.byMonth.get(D.months[i])) {
      if (!inSet(t)) continue;
      const c = cat(t.category_id), wn = (wallet(t.wallet_id) || {}).name || '';
      if (((c ? c.name : '') + ' ' + (t.note || '') + ' ' + (t.person || '') + ' ' + wn + ' ' + Math.abs(t.amount)).toLowerCase().includes(q)) list.push(t);
    }
  } else if (T.period === 'future') {
    list = [];
    D.months.forEach(m => { if (m >= thisYm()) D.byMonth.get(m).forEach(t => { if (t.date > today() && inSet(t)) list.push(t); }); });
    list.sort((a, b) => a.date.localeCompare(b.date));
  } else {
    list = monthTxns(T.period).filter(inSet);
    const start = T.period + '-01';
    let after = 0, inMonth = 0;
    D.months.forEach(m => { if (m >= T.period) D.byMonth.get(m).forEach(t => { if (inSet(t)) { const a = t.amount * fxOf(t); after += a; if (m === T.period) inMonth += a; } }); });
    opening = bal - after; ending = opening + inMonth;
  }
  const groups = new Map();
  list.forEach(t => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yest = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
  const curW = w && w.currency && w.currency !== 'IDR' ? w.currency : '';
  const sign = n => (n > 0 ? '+' : n < 0 ? '-' : '') + (state.config.hide ? '•••' : curW ? fmtCur(Math.abs(n), curW) : fmtNum(Math.abs(n)));
  return `
  <div class="title-row" style="padding-bottom:4px">
    <button class="icon-btn" data-act="tx-search">${icon(T.search ? 'x' : 'search', 20)}</button>
    <button class="wallet-pill" data-act="tx-wallet-pick">${w ? walletBadge(w, 16) : icon('layers', 20)}<span>${esc(w ? w.name : 'Total')}</span>${icon('chevrons-up-down', 16)}</button>
    ${syncPill()}
  </div>
  ${T.search ? `<div class="search" style="margin-top:8px">${icon('search', 18)}<input data-input="tx-q" placeholder="Cari kategori, catatan, nominal" value="${esc(T.q)}" autocomplete="off" enterkeyhint="search"></div>`
    : `<div class="balance-h"><div class="k">Saldo</div><div class="v">${curW ? fmtCur(bal, curW) : money(bal)}</div>${curW ? `<div class="muted small">≈ ${money(walletBalIDR(w.id))}</div>` : ''}</div>
  <div class="periods">${periodList().map(p => `<button class="${p === T.period ? 'on' : ''}" data-act="tx-period" data-p="${p}">${periodLabel(p)}</button>`).join('')}</div>
  ${opening !== null ? `<div class="card sum-card"><div class="r"><span>Saldo awal</span><span class="num">${sign(opening)}</span></div>
    <div class="r"><span>Saldo akhir</span><span class="num">${sign(ending)}</span></div>
    <div class="net num ${ending - opening < 0 ? 'neg' : 'pos'}">${sign(ending - opening)}</div>
    <button class="link-btn" data-act="open-report" data-ym="${T.period}">Lihat laporan periode ini</button></div>` : ''}`}
  ${groups.size ? [...groups].map(([d, ts]) => {
    const [Y, M, DD] = d.split('-').map(Number), dt = new Date(Y, M - 1, DD);
    const lbl = d === today() ? 'Hari ini' : d === yest ? 'Kemarin' : DAYS[dt.getDay()];
    const net = ts.reduce((s, t) => s + t.amount * fxOf(t), 0);
    return `<div class="txday"><div class="txday-h"><span class="d">${String(DD).padStart(2, '0')}</span><div class="w"><b>${lbl}</b><span>${MONTHS[M - 1]} ${Y}</span></div>
      <span class="tot ${net < 0 ? '' : 'pos'}">${sign(net)}</span></div>${ts.map(t => txnRow(t, { showWallet: !T.wallet })).join('')}</div>`;
  }).join('') : `<div class="empty">${T.search ? (q ? 'Nggak ketemu.' : 'Ketik buat cari transaksi.') : 'Belum ada transaksi di periode ini.'}</div>`}`;
}
act('tx-period', d => { T.period = d.p; window.__render(); });
act('tx-search', () => { T.search = !T.search; if (!T.search) T.q = ''; window.__render(); if (T.search) setTimeout(() => document.querySelector('[data-input=tx-q]')?.focus(), 30); });
let qT;
act('tx-q', (d, el) => { T.q = el.value; clearTimeout(qT); qT = setTimeout(() => window.__render(), 180); });
act('tx-wallet-pick', async () => {
  const items = [{ id: '__total', ico: 'layers', label: 'Total', sub: rp(totalIncluded()), subNum: true }, ...walletItems()];
  const id = await pickList({ title: 'Pilih dompet', items, selected: T.wallet || '__total' });
  if (id) { T.wallet = id === '__total' ? '' : id; window.__render(); }
});

// ---------- Budget ----------
export const B = { m: thisYm() };
export function renderBudget() {
  const S = compute(), m = B.m, bud = budgetFor(S, m), agg = S.byYm[m] || { out: 0, cats: {} };
  const spent = routineSpend(agg);
  const isNow = m === thisYm();
  const [y, mo] = m.split('-').map(Number), daysInM = new Date(y, mo, 0).getDate(), daysLeft = isNow ? daysInM - new Date().getDate() + 1 : 0;
  const nav = `<div class="month-nav"><button data-act="bud-step" data-d="-1">${icon('chevron-left', 20)}</button><span class="m">${MONTHS[mo - 1]} ${y}</span><button data-act="bud-step" data-d="1">${icon('chevron-right', 20)}</button></div>`;
  if (!bud) return `<div class="title-row"><h1 class="large-title">Budget</h1></div>${nav}
    <div class="card hero"><b>Belum ada budget untuk bulan ini</b><div class="muted small" style="margin:4px 0 12px">Rata-rata belanja rutin lu ${jt(S.burnAvg)}/bulan. Bikin budget dari angka itu, lalu sesuaikan.</div>
    <button class="btn" data-act="plan-settings">Atur budget</button></div>`;
  const total = Object.entries(bud.plan).reduce((s, [g, v]) => s + (PLAN_EXCLUDE[g] ? 0 : +v || 0), 0);
  const left = total - spent, pct = total ? spent / total : 0;
  const a = avg6(S, lastFullYm(S));
  const rows = expenseGroups().filter(g => !PLAN_EXCLUDE[g] && ((+bud.plan[g] || 0) > 0 || (agg.cats[g] || 0) > 0))
    .map(g => ({ g, b: +bud.plan[g] || 0, s: agg.cats[g] || 0 })).sort((p, q) => (q.s / (q.b || 1)) - (p.s / (p.b || 1)));
  return `<div class="title-row"><h1 class="large-title">Budget</h1><button class="icon-btn" data-act="plan-settings">${icon('settings', 20)}</button></div>${nav}
  <div class="card hero" style="text-align:center"><div class="label" style="justify-content:center">${left >= 0 ? 'Sisa budget' : 'Lewat budget'} · ${esc(bud.name || 'Budget')}</div>
    <div class="big ${left < 0 ? 'neg' : ''}">${money(Math.abs(left))}</div>
    <div class="bar ${pct > 1 ? 'over' : pct > .85 ? 'warn' : ''}" style="height:8px;margin:12px 0 8px"><i style="width:${Math.min(100, pct * 100).toFixed(1)}%"></i></div>
    <div class="muted small">Terpakai <span class="num">${jt(spent)}</span> dari <span class="num">${jt(total)}</span>${isNow && left > 0 ? ` · <span class="num">${jt(left / daysLeft)}</span>/hari untuk ${daysLeft} hari lagi` : ''}</div></div>
  <div class="section-h">Per grup</div>
  <div class="list">${rows.map(r => { const p = r.b ? r.s / r.b : (r.s > 0 ? 2 : 0), l = r.b - r.s;
    return `<button class="row" data-act="open-group" data-g="${esc(r.g)}" data-ym="${m}"><div class="main">
      <div style="display:flex;justify-content:space-between;gap:8px"><span class="t1">${esc(r.g)}</span><span class="num small muted">${jt(r.s)} / ${jt(r.b)}</span></div>
      <div class="bar ${p > 1 ? 'over' : p > .85 ? 'warn' : ''}"><i style="width:${Math.min(100, p * 100).toFixed(1)}%"></i></div>
      <div class="t2" style="margin-top:4px">${l >= 0 ? 'Sisa ' + jt(l) : '<span class="neg">Lewat ' + jt(-l) + '</span>'} · rata-rata ${jt(a[r.g] || 0)}</div></div></button>`; }).join('')}</div>
  <div class="btn-row" style="grid-template-columns:1fr 1fr"><button class="btn secondary" data-act="plan-settings">Atur budget</button><button class="btn secondary" data-act="open-plan">Proyeksi kas</button></div>
  <div class="section-h">Budget khusus<button data-act="open-budgets">Kelola</button></div>
  <div class="foot" style="margin-top:0">Budget tambahan per kategori atau dompet tertentu, di luar budget bulanan di atas.</div>`;
}
act('bud-step', d => { B.m = addMonths(B.m, +d.d); window.__render(); });

// ---------- Akun ----------
export function renderAccount() {
  const item = (a, ic, label, sub = '') => `<button class="row" data-act="${a}"><span class="ic">${icon(ic, 20)}</span><div class="main"><div class="t1">${label}</div>${sub ? `<div class="t2">${esc(sub)}</div>` : ''}</div><span class="chev">${icon('chevron-right', 18)}</span></button>`;
  const persons = [...D.persons.values()].filter(p => Math.round(p.iOwe) || Math.round(p.theyOwe)).length;
  return `<div class="title-row"><h1 class="large-title">Akun</h1>${syncPill()}</div>
  <div class="list" style="margin-top:6px">
    ${item('open-plan', 'compass', 'Rencana & proyeksi kas', 'Budget ideal, P&L, target tabungan')}
    ${item('open-report-now', 'chart-column', 'Laporan', 'Bulanan & tahunan, per grup')}
  </div>
  <div class="list" style="margin-top:20px">
    ${item('open-wallets', 'wallet', 'Dompet', alive('wallets').length + ' dompet')}
    ${item('open-debts', 'handshake', 'Hutang & piutang', persons ? persons + ' orang belum lunas' : '')}
    ${item('open-recurring', 'repeat', 'Transaksi berulang', alive('recurring').filter(r => r.active).length + ' aktif')}
    ${item('open-events', 'calendar', 'Event / trip', alive('events').length + ' event')}
    ${item('open-categories', 'layers', 'Kategori', alive('categories').filter(c => !c.id.startsWith('sys_')).length + ' kategori')}
    ${item('open-budgets', 'target', 'Budget khusus')}
  </div>
  <div class="list" style="margin-top:20px">
    ${item('open-import', 'upload', 'Import dari Money Lover')}
    ${item('open-settings', 'cloud', 'Sinkronisasi Google Sheets', state.config.url ? 'Terakhir ' + ago(state.sync.last) : 'Belum terhubung')}
  </div>
  <div class="foot" style="margin-top:20px;text-align:center">${fmtNum(alive('transactions').length)} transaksi tersimpan di HP ini</div>`;
}
act('open-report-now', () => openReport('m', thisYm()));
