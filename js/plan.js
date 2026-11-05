// Logic perencanaan, diport dari "Financial Tracker Christoffer":
// grup kategori, kelas kantong, talangan, budget ideal, proyeksi kas 24 bulan, health check, P&L, target tabungan.
import { state, alive, cat, save, D, today } from './store.js';

// ---------- Grup kategori ----------
export const GROUPS = [
  ['Food', ['Food & Beverage', 'Grab Food', 'Grabfood', 'Coffee / Cafe', 'Cafe', 'Café', 'Restaurants']],
  ['Dating', ['Dating']],
  ['Transportation', ['Transportation', 'Petrol', 'Grabcar', 'Grabbike', 'Vehicle Maintenance', 'Parking Fees']],
  ['Rent & Home', ['Home Services', 'Home Improvement', 'Bills & Utilities', 'Water Bill', 'Electricity Bill', 'Internet Bill', 'Phone Bill']],
  ['Family', ['Family']],
  ['Dad expense', ['Dad expense']],
  ['Shopping', ['Shopping', 'Clothing', 'Footwear', 'Electronics', 'Accessories']],
  ['Personal Care', ['Personal Care', 'Beauty', 'Haircut', 'Laundry']],
  ['Entertainment', ['Entertainment', 'Movies', 'Education', 'Books', 'Subscription', 'Subscriptions', 'Hobby']],
  ['Sports', ['Sports', 'Health & Fitness']],
  ['Kesehatan', ['Doctor', 'Pharmacy', 'Vitamin', 'Vitamins', 'Vitamins & Supplements', 'Vitamin & Supplement', 'Supplement', 'Supplements', 'Medical', 'Health']],
  ['Social & Gifts', ['Friends & Lover', 'Gifts & Donations', 'Charity', 'Funeral']],
  ['Travel', ['Travel']],
  ['Business', ['Business', 'CG Advisory Expense', 'Hypefast', 'TOVR', 'TOVR Business', 'Simple boost business', 'Soxsweet', 'Chag', 'Tukulaku']],
  ['Insurance', ['Insurances', 'Insurance']],
  ['Nikah', ['Marriage']],
  ['Investasi', ['Investment']],
  ['Tarik Tunai', ['Withdrawal']],
  ['Belum Terkategori', ['Other Expense', 'Unknown (missing)', 'Fees & Charges']],
];
export const INCOME_GROUPS = [['Gaji', ['Salary', 'Gaji']], ['CG Advisory', ['CG Advisory Income']], ['Pemasukan lain', []]];
const EXP_GROUP = new Map(), INC_GROUP = new Map();
GROUPS.forEach(([g, cs]) => cs.forEach(c => EXP_GROUP.set(c.toLowerCase(), g)));
INCOME_GROUPS.forEach(([g, cs]) => cs.forEach(c => INC_GROUP.set(c.toLowerCase(), g)));
// Ditangani lewat daftar tahunan / agenda / target tabungan, bukan belanja rutin.
export const PLAN_EXCLUDE = { Insurance: 'dari daftar tahunan', Nikah: 'dari agenda', Investasi: 'dari target tabungan', 'Dad expense': 'sudah selesai, tidak berulang' };
export const UNMAPPED = 'Belum Terkategori';

export function defaultGroup(name, kind) {
  const k = String(name).toLowerCase();
  if (kind === 'income') return INC_GROUP.get(k) || 'Pemasukan lain';
  if (kind === 'expense') return EXP_GROUP.get(k) || UNMAPPED;
  return '';
}
export function groupOf(catId) {
  const c = cat(catId);
  if (!c) return UNMAPPED;
  return c.group || defaultGroup(c.name, c.kind) || UNMAPPED;
}
export function expenseGroups() { // urutan bawaan + grup custom
  const order = GROUPS.map(g => g[0]);
  alive('categories').forEach(c => { if (c.kind === 'expense' && c.group && !order.includes(c.group)) order.splice(order.length - 1, 0, c.group); });
  return order;
}

// ---------- Kantong ----------
export const CLASS_LABEL = { kas: 'Cash', piutang: 'Piutang', kartu: 'Kartu kredit', abaikan: 'Diabaikan' };
export function walletClass(w) {
  if (!w) return 'abaikan';
  if (w.exclude_total || (w.currency && w.currency !== 'IDR')) return 'abaikan';
  if (w.type === 'credit') return 'kartu';
  if (w.type === 'receivable') return 'piutang';
  return 'kas';
}
export const isVolatile = w => w && w.type === 'invest';

// ---------- Pengaturan rencana (disimpan di sheet Settings) ----------
export const DEFAULT_CFG = {
  gaji: 47322132, cgBulanan: 0, pasanganBulanan: 0,
  shoppingTarget: 3000000, lantaiKas: 100000000, sisaGajiTarget: 10000000, talanganTarget: 12000000, sisaNikah: 200000000,
  talanganWallets: null, // null = kantong Piutang bernama "Rumah…" (atau semua kantong Piutang)
  // Versi budget, berlaku mulai bulan `from`. Disepakati 5 Nov 2026; Food 3 jt = 150 rb/hari kerja × 20 hari.
  budgets: [{
    from: '2026-11', name: 'Sebelum nikah', plan: {
      Food: 3000000, Dating: 4500000, Transportation: 3500000, 'Rent & Home': 3000000, Shopping: 2000000,
      Kesehatan: 1500000, Business: 1500000, 'Belum Terkategori': 1500000, Sports: 1000000,
      Family: 700000, 'Social & Gifts': 500000, Travel: 500000, 'Personal Care': 300000, Entertainment: 300000,
    },
  }, {
    // Kos 2,85 jt hilang; sewa + IPL apartemen sudah di daftar tahunan (Mar). Sisa Rent & Home: listrik, air,
    // internet apartemen (±1,5 jt, asumsi) + pulsa & iCloud (±0,2 jt). Patricia menanggung biaya hidupnya sendiri.
    from: '2027-03', name: 'Pindah apartemen', plan: {
      Food: 3000000, Dating: 4500000, Transportation: 3500000, 'Rent & Home': 1700000, Shopping: 2000000,
      Kesehatan: 1500000, Business: 1500000, 'Belum Terkategori': 1500000, Sports: 1000000,
      Family: 700000, 'Social & Gifts': 500000, Travel: 500000, 'Personal Care': 300000, Entertainment: 300000,
    },
  }],
  projMode: null,        // 'avg' | 'budget'; null = budget kalau ada, selain itu rata-rata
  tahunan: [
    { n: 'THR', mo: 4, v: 47322132, from: '' },
    { n: 'Asuransi', mo: 6, v: -10400000, from: '' },
    { n: 'Pajak kendaraan', mo: 5, v: -7600000, from: '' },
    { n: 'Sewa apartment + IPL', mo: 3, v: -112000000, from: 2027 },
  ],
  agenda: [
    { n: 'Pelunasan nikah 1', m: '2026-12', v: -70000000 },
    { n: 'Pelunasan nikah 2', m: '2027-02', v: -70000000 },
    { n: 'Pelunasan nikah 3', m: '2027-04', v: -60000000 },
  ],
  goal: { target: 2000000000, tahun: 10, ret: 7, modal: null },
};
export function cfg() {
  const row = state.settings.get('plan');
  let v = {};
  if (row && !row.deleted && row.value) { try { v = JSON.parse(row.value); } catch { } }
  return { ...structuredClone(DEFAULT_CFG), ...v, goal: { ...DEFAULT_CFG.goal, ...(v.goal || {}) } };
}
export function saveCfg(next) { return save('settings', [{ id: 'plan', value: JSON.stringify(next) }]); }

// ---------- Helpers ----------
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const mLabel = ym => MON[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4);
export const mLabelLong = ym => MON[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
export function addMonths(ym, k) {
  let y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + String(m + 1).padStart(2, '0');
}
export function jt(n, dp) {
  if (!isFinite(n)) return '—';
  if (state.config.hide) return '•••';
  const s = n < 0 ? '-' : '', x = Math.abs(n);
  if (x >= 1e9) return s + (x / 1e9).toFixed(2).replace('.', ',') + ' M';
  return s + (x / 1e6).toFixed(dp === undefined ? 1 : dp).replace('.', ',') + ' jt';
}
const sum = o => Object.values(o || {}).reduce((s, v) => s + (+v || 0), 0);

// ---------- Compute (di-cache per versi data) ----------
let cache = null, cacheKey = '';
function key() { return [state.transactions.size, state.wallets.size, state.categories.size, D.version, (state.settings.get('plan') || {}).updated_at].join('|'); }

export function compute() {
  const k = key();
  if (cache && cacheKey === k) return cache;
  const c = cfg();
  const wallets = alive('wallets');
  const talSet = new Set(c.talanganWallets || wallets.filter(w => w.type === 'receivable' && /rumah/i.test(w.name)).map(w => w.id));
  if (!c.talanganWallets && !talSet.size) wallets.filter(w => w.type === 'receivable').forEach(w => talSet.add(w.id));
  const months = {};
  let nikah = 0;
  for (const t of state.transactions.values()) {
    if (t.deleted || t.exclude || !t.date) continue;
    const w = state.wallets.get(t.wallet_id);
    if (w && w.currency && w.currency !== 'IDR') continue;
    const ct = cat(t.category_id);
    const kind = ct ? ct.kind : (t.amount < 0 ? 'expense' : 'income');
    const ym = t.date.slice(0, 7);
    const M = months[ym] || (months[ym] = { ym, in: 0, out: 0, gaji: 0, cg: 0, lain: 0, talangan: 0, cats: {}, inc: {} });
    const a = Number(t.amount) || 0;
    if (kind === 'transfer') { if (talSet.has(t.wallet_id) && a > 0) M.talangan += a; continue; }
    if (kind === 'income') {
      M.in += a;
      const g = groupOf(t.category_id);
      if (g === 'Gaji') M.gaji += a; else if (g === 'CG Advisory') M.cg += a; else M.lain += a;
      M.inc[g] = (M.inc[g] || 0) + a;
    } else if (kind === 'expense') {
      M.out -= a;
      const g = groupOf(t.category_id);
      M.cats[g] = (M.cats[g] || 0) - a;
      if (g === 'Nikah') nikah -= a;
    }
  }
  const nowYm = today().slice(0, 7);
  const list = Object.keys(months).sort().filter(m => m <= nowYm).map(m => {
    const x = months[m];
    x.net = x.in - x.out; x.sisaGaji = x.gaji - x.out - x.talangan; x.rate = x.in > 0 ? x.net / x.in : 0;
    x.partial = m === nowYm;
    return x;
  });
  const pots = { kas: 0, piutang: 0, kartu: 0, abaikan: 0 };
  let volatil = 0;
  const wl = wallets.map(w => {
    const v = D.balances.get(w.id) || 0, cl = walletClass(w);
    pots[cl] += v;
    if (cl === 'kas' && isVolatile(w)) volatil += v;
    return { w, v, c: cl, vol: isVolatile(w) };
  }).sort((a, b) => b.v - a.v);
  cache = { cfg: c, months: list, byYm: Object.fromEntries(list.map(m => [m.ym, m])), wallets: wl, pots, volatil,
    totalCash: pots.kas, kasBersih: pots.kas + pots.kartu, nikahTerbayar: nikah, talSet };
  cacheKey = k;
  cache.avgPlan = defaultPlan(cache);
  cache.burnAvg = sum(cache.avgPlan);
  cache.budgets = (c.budgets || []).filter(b => b && b.from && b.plan).sort((a, b) => a.from.localeCompare(b.from));
  cache.Pavg = project(cache, 'avg');
  cache.Pbud = cache.budgets.length ? project(cache, 'budget') : null;
  cache.mode = c.projMode === 'avg' || !cache.Pbud ? 'avg' : 'budget';
  cache.P = cache.mode === 'budget' ? cache.Pbud : cache.Pavg;
  cache.plan = planFor(cache, today().slice(0, 7));
  cache.burn = sum(cache.plan);
  return cache;
}
export const invalidate = () => { cache = null; };

export function lastFullYm(S) {
  const full = S.months.filter(m => !m.partial);
  return full.length ? full[full.length - 1].ym : (S.months.length ? S.months[S.months.length - 1].ym : today().slice(0, 7));
}

export function avg6(S, ym) {
  const i = S.months.findIndex(m => m.ym === ym);
  let prev = S.months.slice(Math.max(0, (i < 0 ? S.months.length : i) - 6), i < 0 ? S.months.length : i).filter(m => !m.partial);
  if (!prev.length) prev = S.months.filter(m => !m.partial).slice(-6);
  const o = { _n: prev.length, _in: 0, _out: 0, _gaji: 0, _cg: 0, _lain: 0, _tal: 0 };
  expenseGroups().forEach(g => { o[g] = 0; });
  prev.forEach(m => {
    o._in += m.in; o._out += m.out; o._gaji += m.gaji; o._cg += m.cg; o._lain += m.lain; o._tal += m.talangan;
    Object.keys(m.cats).forEach(g => { o[g] = (o[g] || 0) + m.cats[g]; });
  });
  const n = prev.length || 1;
  Object.keys(o).forEach(k => { if (k !== '_n') o[k] /= n; });
  return o;
}

// Budget yang berlaku di bulan ym (versi terakhir dengan from <= ym). null kalau belum ada.
export function budgetFor(S, ym) {
  let b = null;
  for (const v of S.budgets) if (v.from <= ym) b = v;
  return b;
}
// Rencana belanja per grup untuk bulan ym, sesuai mode proyeksi.
export function planFor(S, ym, mode = S.mode) {
  if (mode === 'budget') { const b = budgetFor(S, ym) || S.budgets[0]; if (b) return b.plan; }
  return S.avgPlan;
}
export const burnFor = (S, ym, mode) => sum(planFor(S, ym, mode));

function defaultPlan(S) {
  const a = avg6(S, lastFullYm(S));
  const p = {};
  expenseGroups().forEach(g => { p[g] = PLAN_EXCLUDE[g] ? 0 : Math.round((a[g] || 0) / 100000) * 100000; });
  return p;
}

export function eventsFor(c, ym) {
  const y = +ym.slice(0, 4), mo = +ym.slice(5, 7), out = [];
  (c.tahunan || []).forEach(r => { if (+r.mo !== mo) return; if (r.from && y < +r.from) return; out.push({ n: r.n, v: +r.v || 0 }); });
  (c.agenda || []).forEach(r => { if (r.m === ym) out.push({ n: r.n, v: +r.v || 0 }); });
  return out;
}
export function yearlyTotals(c, year) {
  let masuk = 0, keluar = 0; const rows = [];
  (c.tahunan || []).forEach(r => { if (r.from && year < +r.from) return; const v = +r.v || 0; rows.push({ n: r.n, v, mo: +r.mo }); if (v > 0) masuk += v; else keluar -= v; });
  return { masuk, keluar, rows };
}

function project(S, mode) {
  const c = S.cfg;
  const start = S.months.length ? S.months[S.months.length - 1].ym : today().slice(0, 7);
  let cash = S.kasBersih;
  const rows = [{ ym: start, masuk: 0, keluar: 0, ev: [], evV: 0, saldo: cash, now: true }];
  let min = { v: cash, ym: start };
  for (let i = 1; i <= 24; i++) {
    const ym = addMonths(start, i), ev = eventsFor(c, ym), b = burnFor(S, ym, mode);
    const evV = ev.reduce((s, e) => s + e.v, 0);
    const masuk = c.gaji + ev.filter(e => e.v > 0).reduce((s, e) => s + e.v, 0);
    const keluar = b + (+c.talanganTarget || 0) + ev.filter(e => e.v < 0).reduce((s, e) => s - e.v, 0);
    cash += masuk - keluar;
    rows.push({ ym, masuk, keluar, ev, evV, saldo: cash, burn: b });
    if (cash < min.v) min = { v: cash, ym };
  }
  return { rows, min, burn: rows[1] ? rows[1].burn : 0, mode };
}
export function projectWith(S, burnVal) {
  const c = S.cfg, start = S.months.length ? S.months[S.months.length - 1].ym : today().slice(0, 7);
  let cash = S.kasBersih, min = { v: cash, ym: start };
  for (let i = 1; i <= 24; i++) {
    const ym = addMonths(start, i);
    cash += c.gaji - burnVal - (+c.talanganTarget || 0) + eventsFor(c, ym).reduce((s, e) => s + e.v, 0);
    if (cash < min.v) min = { v: cash, ym };
  }
  return min;
}

export const routineSpend = m => m.out - Object.keys(PLAN_EXCLUDE).reduce((s, g) => s + (m.cats[g] || 0), 0);

// ---------- Periode (bulan / tahun) ----------
export function periodMonths(S, type, sel) { return S.months.filter(m => type === 'm' ? m.ym === sel : m.ym.slice(0, 4) === sel); }
export function periodAgg(S, type, sel) {
  const ms = periodMonths(S, type, sel);
  const o = { in: 0, out: 0, gaji: 0, cg: 0, lain: 0, talangan: 0, cats: {}, inc: {}, n: ms.length, partial: false };
  ms.forEach(m => {
    o.in += m.in; o.out += m.out; o.gaji += m.gaji; o.cg += m.cg; o.lain += m.lain; o.talangan += m.talangan;
    if (m.partial) o.partial = true;
    Object.keys(m.cats).forEach(g => { o.cats[g] = (o.cats[g] || 0) + m.cats[g]; });
    Object.keys(m.inc).forEach(g => { o.inc[g] = (o.inc[g] || 0) + m.inc[g]; });
  });
  o.net = o.in - o.out; o.sisaGaji = o.gaji - o.out - o.talangan; o.rate = o.in > 0 ? o.net / o.in : 0;
  return o;
}
export function baselineFor(S, type, sel) {
  const n = Math.max(1, periodMonths(S, type, sel).length);
  if (type === 'm') { const a = avg6(S, sel); a._label = 'rata ' + a._n + ' bln sebelumnya'; return a; }
  const py = String(+sel - 1);
  let prev = S.months.filter(m => m.ym.slice(0, 4) === py && !m.partial);
  if (!prev.length) prev = S.months.filter(m => m.ym < sel + '-01' && !m.partial).slice(-12);
  const o = { _n: prev.length, _in: 0, _out: 0, _gaji: 0, _cg: 0, _lain: 0, _tal: 0 };
  prev.forEach(m => { o._in += m.in; o._out += m.out; o._gaji += m.gaji; o._cg += m.cg; o._lain += m.lain; o._tal += m.talangan; Object.keys(m.cats).forEach(g => { o[g] = (o[g] || 0) + m.cats[g]; }); });
  const k = prev.length ? n / prev.length : 0;
  Object.keys(o).forEach(key => { if (key !== '_n') o[key] *= k; });
  o._label = prev.length ? 'setara ' + py : 'belum ada pembanding';
  return o;
}

export function pmtFor(target, modal, r, n) {
  if (n <= 0) return Infinity;
  if (r === 0) return (target - modal) / n;
  const g = Math.pow(1 + r, n);
  return (target - modal * g) * r / (g - 1);
}
export function fv(modal, pmt, r, n) {
  if (r === 0) return modal + pmt * n;
  const g = Math.pow(1 + r, n);
  return modal * g + pmt * (g - 1) / r;
}
export function modalDefault(S) {
  let last = null;
  (S.cfg.agenda || []).forEach(r => { if (r.m && (!last || r.m > last)) last = r.m; });
  const row = last ? S.P.rows.find(r => r.ym === last) : null;
  return Math.round(row ? row.saldo : S.kasBersih);
}
// Belanja maksimal per bulan supaya target tabungan tetap kekejar.
export function idealTotal(S) {
  const c = S.cfg, g = c.goal || {};
  const n = Math.max(1, Math.round((+g.tahun || 1) * 12));
  const r = (+g.ret || 0) / 100 / 12;
  const base = +lastFullYm(S).slice(0, 4);
  const yt = yearlyTotals(c, base + 1);
  const modal = g.modal === null || g.modal === undefined ? modalDefault(S) : +g.modal;
  const need = Math.max(0, pmtFor(+g.target || 0, modal, r, n));
  const income = c.gaji + (+c.cgBulanan || 0) + (+c.pasanganBulanan || 0);
  return income - need - (yt.keluar - yt.masuk) / 12 - (+c.talanganTarget || 0);
}
export function idealFor(S, nMonths, plan = S.plan) {
  const tot = idealTotal(S), ps = sum(plan), o = {};
  expenseGroups().forEach(g => { o[g] = ps > 0 ? Math.max(0, tot) * ((plan[g] || 0) / ps) * nMonths : 0; });
  o._total = Math.max(0, tot) * nMonths; o._raw = tot;
  return o;
}

export function checks(S, m, ym) {
  const c = S.cfg, n = Math.max(1, m.n), ideal = idealFor(S, n);
  const bud = ym && budgetFor(S, ym);
  return [
    { t: bud ? 'Belanja rutin vs budget' : 'Belanja rutin vs rata-rata', v: routineSpend(m), lim: (bud ? sum(bud.plan) : S.burnAvg) * n, lower: true },
    { t: 'Budget ideal (dari target tabungan)', v: routineSpend(m), lim: ideal._total, lower: true },
    { t: 'Shopping', v: m.cats.Shopping || 0, lim: c.shoppingTarget * n, lower: true },
    { t: 'Talangan piutang', v: m.talangan, lim: c.talanganTarget * n, lower: true },
    { t: 'Kas bersih', v: S.kasBersih, lim: c.lantaiKas, lower: false },
    { t: 'Sisa dari gaji', v: m.sisaGaji, lim: c.sisaGajiTarget * n, lower: false },
  ].map(x => {
    const ok = x.lower ? x.v <= x.lim : x.v >= x.lim;
    const near = !ok && (x.lower ? x.v <= x.lim * 1.15 : x.v >= x.lim * 0.85);
    return { ...x, cls: ok ? 'pass' : near ? 'mid' : 'fail', tag: ok ? 'Aman' : near ? 'Mepet' : 'Lewat' };
  });
}

// Transaksi pengeluaran rutin di periode, urut nominal terbesar.
export function periodTxns(type, sel) {
  const out = [];
  for (const t of state.transactions.values()) {
    if (t.deleted || t.exclude || !t.date) continue;
    const k = type === 'm' ? t.date.slice(0, 7) : t.date.slice(0, 4);
    if (k !== sel) continue;
    const c = cat(t.category_id);
    if (!c || c.kind !== 'expense' || t.amount >= 0) continue;
    const g = groupOf(t.category_id);
    if (PLAN_EXCLUDE[g]) continue;
    out.push({ v: -t.amount, g, c: c.name, n: t.note, d: t.date, t });
  }
  return out.sort((a, b) => b.v - a.v);
}

export function insights(S, type, sel) {
  const m = periodAgg(S, type, sel), n = Math.max(1, m.n), ideal = idealFor(S, n);
  const rutin = routineSpend(m), perMo = rutin / n, over = rutin - ideal._total, cards = [];
  const label = type === 'm' ? mLabelLong(sel) : 'tahun ' + sel;
  const wi = projectWith(S, perMo), d = wi.v - S.P.min.v;
  cards.push({ tone: d < -3e6 ? 'neg' : d > 3e6 ? 'pos' : 'tint', t: 'Dampak ke rencana', h: jt(wi.v) + ' di ' + mLabelLong(wi.ym),
    p: `Kalau belanja rutin lo terus di ${jt(perMo)}/bulan kayak ${label}, titik terendah kas jadi segitu: ${d < 0 ? 'turun' : 'naik'} ${jt(Math.abs(d))} dari rencana sekarang (${jt(S.P.min.v)} di ${mLabelLong(S.P.min.ym)}).` });
  let worst = null;
  expenseGroups().forEach(g => {
    if (PLAN_EXCLUDE[g] || !(ideal[g] > 0)) return;
    const gap = (m.cats[g] || 0) - ideal[g];
    if (!worst || gap > worst.gap) worst = { g, gap, now: m.cats[g] || 0, bud: ideal[g] };
  });
  const txs = periodTxns(type, sel);
  if (worst && worst.gap > 0) {
    const top = txs.find(t => t.g === worst.g);
    cards.push({ tone: 'neg', t: 'Penyumbang terbesar', h: worst.g + ' lewat ' + jt(worst.gap),
      p: `Kepakai ${jt(worst.now)} dari budget ${jt(worst.bud)}.` + (top ? ` Transaksi terbesarnya Rp ${Math.round(top.v).toLocaleString('id-ID')}${top.n ? ', ' + top.n : ' di ' + top.c}.` : '') });
  } else if (worst) {
    cards.push({ tone: 'pos', t: 'Kategori paling ketat', h: worst.g + ' masih sisa ' + jt(-worst.gap), p: `Semua grup di bawah budget ideal. ${worst.g} yang paling mepet: ${jt(worst.now)} dari ${jt(worst.bud)}.` });
  }
  if (over > 0 && txs.length) {
    let acc = 0, k = 0;
    while (k < txs.length && acc < over) { acc += txs[k].v; k++; }
    const few = k <= 3;
    const names = txs.slice(0, Math.min(k, 3)).map(t => (t.n || t.c) + ' Rp ' + Math.round(t.v).toLocaleString('id-ID')).join('; ');
    cards.push({ tone: few ? 'warn' : 'neg', t: 'Terkonsentrasi atau menyebar?',
      h: few ? `Kelebihan ${jt(over)} setara ${k} belanjaan terbesar` : `Kelebihan ${jt(over)} tersebar di ${k} transaksi`,
      p: few ? names + '. Kalau itu pos rutin kayak sewa atau tagihan, berarti budget grupnya kekecilan. Kalau sekali jalan, bulan depan balik normal sendiri.'
        : `Butuh ${k} transaksi terbesar buat nutup kelebihannya, jadi ini bukan gara-gara satu belanjaan. Borosnya dari kebiasaan harian.` });
  }
  const idealMo = idealTotal(S);
  const last6 = S.months.filter(x => !x.partial).slice(-6);
  const okN = last6.filter(x => routineSpend(x) <= idealMo).length;
  cards.push({ tone: okN >= 4 ? 'pos' : okN >= 2 ? 'warn' : 'neg', t: 'Konsistensi', h: `${okN} dari ${last6.length} bulan terakhir di bawah budget`,
    p: `Batasnya ${jt(idealMo)} belanja rutin per bulan. ` + (okN >= 4 ? 'Polanya udah bagus, tinggal dijaga.' : okN >= 2 ? 'Masih naik-turun. Target tabungan meleset bukan karena satu bulan jebol, tapi karena jebolnya berulang.'
      : 'Belanja rutin konsisten di atas batas. Entah budgetnya yang nggak realistis, atau targetnya yang perlu diturunin.') });
  return cards;
}

export function verdict(S) {
  const P = S.P, min = P.min, floor = S.cfg.lantaiKas;
  let cls = '', txt, detail;
  if (min.v < 0) { cls = 'bad'; txt = `Kas lo habis di ${mLabelLong(min.ym)}.`; detail = `Dengan gaji ${jt(S.cfg.gaji)}, belanja ${S.mode === 'budget' ? 'sesuai budget' : 'rata-rata'} ${jt(P.burn)}/bulan, dan biaya tahunan plus agenda yang lo set, saldo nyentuh ${jt(min.v)}. Harus ada yang diubah.`; }
  else if (min.v < floor) { cls = 'tight'; txt = `Kas lo ketat di ${mLabelLong(min.ym)}.`; detail = `Titik terendah ${jt(min.v)}, di bawah lantai ${jt(floor, 0)}, sekitar ${P.burn ? (min.v / P.burn).toFixed(1).replace('.', ',') : 0} bulan biaya hidup. Masih positif, tapi nggak ada ruang buat kejadian tak terduga.`; }
  else { txt = `Kas lo aman sampai ${mLabelLong(P.rows[P.rows.length - 1].ym)}.`; detail = `Titik terendah ${jt(min.v)} di ${mLabelLong(min.ym)}, masih di atas lantai ${jt(floor, 0)}. Proyeksi ini pakai gaji doang; CG Advisory dan income pasangan jadi bonus.`; }
  if (S.volatil > 0) detail += ` Kas awal ${jt(S.kasBersih)} termasuk ${jt(S.volatil)} di aset yang harganya naik-turun.`;
  return { cls, txt, detail };
}
