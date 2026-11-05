// Layar Rencana + Laporan versi tracker: proyeksi kas, health check, budget ideal per grup, P&L, target tabungan.
import { state, alive, cat, today } from './store.js';
import { icon } from './icons.js';
import { esc, rp, act, pushPage, popPage, pages, renderPage, refreshPages, txnRow, catIcon, catName, walletIcon, toast, pickList } from './ui.js';
import { burnFor, compute, cfg, saveCfg, jt, mLabel, mLabelLong, addMonths, MON, avg6, lastFullYm, periodAgg, baselineFor, idealFor, idealTotal,
  routineSpend, checks, insights, verdict, yearlyTotals, pmtFor, fv, modalDefault, expenseGroups, groupOf, PLAN_EXCLUDE, budgetFor, planFor,
  CLASS_LABEL, INCOME_GROUPS, DEFAULT_CFG } from './plan.js';

const top = () => pages[pages.length - 1];
const tone = c => c === 'bad' ? 'var(--red)' : c === 'tight' ? 'var(--orange)' : 'var(--green)';

// ---------- Charts ----------
function runwayChart(S, { W = 340, H = 140, labels = true } = {}) {
  const pts = S.P.rows.map(r => r.saldo), floor = S.cfg.lantaiKas;
  let lo = Math.min(...pts, floor, 0), hi = Math.max(...pts, floor);
  if (hi === lo) hi = lo + 1;
  const pv = (hi - lo) * 0.1; lo -= pv; hi += pv;
  const pb = labels ? 16 : 2;
  const x = i => 4 + i * (W - 8) / (pts.length - 1), y = v => 6 + (hi - v) * (H - 6 - pb) / (hi - lo);
  const line = pts.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const col = S.P.min.v < 0 ? 'var(--red)' : S.P.min.v < floor ? 'var(--orange)' : 'var(--green)';
  let s = `<path d="${line} L${x(pts.length - 1)} ${y(lo)} L${x(0)} ${y(lo)} Z" style="fill:${col}" opacity=".12"/>`;
  if (floor > lo && floor < hi) s += `<line x1="4" x2="${W - 4}" y1="${y(floor)}" y2="${y(floor)}" style="stroke:var(--label3)" stroke-dasharray="3 3"/>` +
    (labels ? `<text x="6" y="${y(floor) - 4}" font-size="9" style="fill:var(--label2)">Lantai ${jt(floor, 0)}</text>` : '');
  if (0 > lo && 0 < hi) s += `<line x1="4" x2="${W - 4}" y1="${y(0)}" y2="${y(0)}" style="stroke:var(--red)" opacity=".4"/>`;
  s += `<path d="${line}" style="fill:none;stroke:${col}" stroke-width="2" stroke-linejoin="round"/>`;
  const mi = S.P.rows.findIndex(r => r.ym === S.P.min.ym);
  if (mi > 0) s += `<circle cx="${x(mi)}" cy="${y(S.P.min.v)}" r="3.5" style="fill:${col}"/>` +
    (labels ? `<text x="${x(mi)}" y="${y(S.P.min.v) + 14}" text-anchor="${mi > pts.length * .75 ? 'end' : 'middle'}" font-size="10" style="fill:${col}">${jt(S.P.min.v)}</text>` : '');
  if (labels) S.P.rows.forEach((r, i) => { if (i % 4 === 0 || i === pts.length - 1) s += `<text x="${x(i)}" y="${H - 3}" text-anchor="middle" font-size="9" style="fill:var(--label2)">${mLabel(r.ym)}</text>`; });
  return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%">${s}</svg>`;
}

function barsChart(ms) {
  const W = 340, H = 150, pb = 16;
  const hi = Math.max(1, ...ms.map(m => Math.max(m.in, m.out + m.talangan)));
  const step = W / ms.length, bw = Math.min(13, step / 3);
  const y = v => (H - pb) * (1 - v / hi);
  let s = '';
  ms.forEach((m, i) => {
    const cx = i * step + step / 2, op = m.partial ? .45 : .95;
    s += `<rect x="${cx - bw - 1}" y="${y(m.in)}" width="${bw}" height="${H - pb - y(m.in)}" rx="2.5" style="fill:var(--label3)" opacity="${op}"/>`;
    s += `<rect x="${cx + 1}" y="${y(m.out)}" width="${bw}" height="${H - pb - y(m.out)}" rx="2.5" style="fill:var(--orange)" opacity="${op}"/>`;
    if (m.talangan > 0) { const th = H - pb - y(m.talangan); s += `<rect x="${cx + 1}" y="${y(m.out) - th}" width="${bw}" height="${th}" rx="2.5" style="fill:var(--orange-300)"/>`; }
    if (ms.length <= 7 || i % 2 === 0 || i === ms.length - 1) s += `<text x="${cx}" y="${H - 3}" text-anchor="middle" font-size="9.5" style="fill:var(--label2)">${MON[+m.ym.slice(5, 7) - 1]}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%">${s}</svg>`;
}

// ---------- Home: aset + verdict ----------
export function homeAssets() {
  const S = compute(), v = verdict(S);
  const total = S.totalCash + S.pots.piutang + S.pots.kartu;
  const m = S.byYm[today().slice(0, 7)] || { in: 0, out: 0, talangan: 0, gaji: 0, sisaGaji: 0 };
  return `<div class="card">
    <div class="hero"><div class="label">Total Cash <button data-act="toggle-hide" style="color:var(--accent);font-size:15px">${state.config.hide ? 'Tampilkan' : 'Sembunyikan'}</button></div>
      <div class="big num">${rp(S.totalCash)}</div>
      ${S.volatil > 0 ? `<div class="muted small" style="margin-top:2px">${jt(S.volatil)} di aset yang nilainya naik-turun</div>` : ''}</div>
    <div class="stats" style="grid-template-columns:1fr 1fr 1fr">
      <div><div class="k">Piutang</div><div class="v num" style="font-size:16px">${jt(S.pots.piutang)}</div></div>
      <div><div class="k">Kartu kredit</div><div class="v num" style="font-size:16px">${jt(S.pots.kartu)}</div></div>
      <div><div class="k">Total aset</div><div class="v num" style="font-size:16px">${jt(total)}</div></div></div>
    <div class="stats" style="grid-template-columns:1fr 1fr 1fr">
      <div><div class="k">Masuk · ${MON[+today().slice(5, 7) - 1]}</div><div class="v num pos" style="font-size:16px">${jt(m.in)}</div></div>
      <div><div class="k">Keluar</div><div class="v num" style="font-size:16px">${jt(m.out)}</div></div>
      <div><div class="k">Talangan</div><div class="v num" style="font-size:16px">${jt(m.talangan)}</div></div></div>
  </div>
  <button class="card" data-act="open-plan" style="display:block;width:calc(100% - 32px);text-align:left;margin-top:14px">
    <div style="padding:14px 16px 4px;display:flex;gap:10px;align-items:flex-start">
      <span style="width:9px;height:9px;border-radius:5px;margin-top:7px;flex:none;background:${tone(v.cls)}"></span>
      <div style="flex:1"><div style="font-weight:600">${esc(v.txt)}</div>
      <div class="muted small" style="margin-top:2px">Titik terendah ${jt(S.P.min.v)} · ${mLabelLong(S.P.min.ym)} · ${S.mode === 'budget' ? 'pakai budget' : 'pakai rata-rata'} ${jt(S.burn)}/bln</div></div>
      <span class="chev muted">${icon('chevron-right', 18)}</span></div>
    <div style="padding:0 8px 8px">${runwayChart(S, { H: 64, labels: false })}</div></button>`;
}

// ---------- Laporan ----------
export const R = { type: 'm', sel: today().slice(0, 7), kind: 'expense' };
export function renderReportPlan({ inPage = false } = {}) {
  const S = compute();
  if (!S.months.length) return `<div class="title-row"><h1 class="large-title">Laporan</h1></div><div class="empty">Belum ada data.</div>`;
  const years = [...new Set(S.months.map(m => m.ym.slice(0, 4)))];
  if (R.type === 'y' && !years.includes(R.sel)) R.sel = years[years.length - 1];
  const m = periodAgg(S, R.type, R.sel), n = Math.max(1, m.n);
  const a = baselineFor(S, R.type, R.sel), ideal = idealFor(S, n), rutin = routineSpend(m), perMo = rutin / n;
  const delta = (now, av, lowerGood) => { if (!av) return ''; const p = (now - av) / av * 100, good = lowerGood ? p < 0 : p > 0; return `<span style="color:${good ? 'var(--green)' : 'var(--red)'}">${p >= 0 ? '+' : ''}${p.toFixed(0)}%</span>`; };
  const label = R.type === 'm' ? mLabelLong(R.sel) : 'Tahun ' + R.sel;
  const ms = R.type === 'm' ? Array.from({ length: 6 }, (_, i) => S.byYm[addMonths(R.sel, i - 5)] || { ym: addMonths(R.sel, i - 5), in: 0, out: 0, talangan: 0 })
    : Array.from({ length: 12 }, (_, i) => S.byYm[R.sel + '-' + String(i + 1).padStart(2, '0')] || { ym: R.sel + '-' + String(i + 1).padStart(2, '0'), in: 0, out: 0, talangan: 0 });
  const kpi = (k, v, d) => `<div><div class="k">${k}</div><div class="v num">${v}</div><div class="small muted" style="margin-top:2px">${d}</div></div>`;
  // Budget periode: jumlah budget yang berlaku tiap bulan di periode (kalau belum ada budget, pakai budget ideal).
  const pms = R.type === 'm' ? [R.sel] : Array.from({ length: 12 }, (_, i) => R.sel + '-' + String(i + 1).padStart(2, '0')).filter(x => x <= today().slice(0, 7));
  const hasBud = pms.some(x => budgetFor(S, x));
  const budOf = g => hasBud ? pms.reduce((t, x) => { const b = budgetFor(S, x); return t + (b ? +b.plan[g] || 0 : 0); }, 0) : ideal[g] || 0;
  const budLabel = hasBud ? 'budget' : 'ideal';
  const groups = expenseGroups().map(g => ({ g, now: m.cats[g] || 0, avg: a[g] || 0, bud: budOf(g) }))
    .filter(r => r.now > 0 || r.avg > 0 || r.bud > 0).sort((x, y) => y.now - x.now);
  const max = Math.max(1, ...groups.map(r => Math.max(r.now, r.avg, r.bud)));
  const incRows = Object.entries(m.inc).filter(([, v]) => v).sort((x, y) => y[1] - x[1]);
  const ck = checks(S, m, R.type === 'm' ? R.sel : null);
  const ins = insights(S, R.type, R.sel);
  return `
  ${inPage ? '' : '<div class="title-row"><h1 class="large-title">Laporan</h1></div>'}
  <div class="seg" style="margin:4px 16px 10px"><button class="${R.type === 'm' ? 'on' : ''}" data-act="rp-type" data-t="m">Bulanan</button><button class="${R.type === 'y' ? 'on' : ''}" data-act="rp-type" data-t="y">Tahunan</button></div>
  <div class="month-nav"><button data-act="rp-step" data-d="-1">${icon('chevron-left', 20)}</button><span class="m">${label}${m.partial ? ' <span class="muted small">· berjalan</span>' : ''}</span><button data-act="rp-step" data-d="1">${icon('chevron-right', 20)}</button></div>
  <div class="card"><div class="stats" style="border:0">${kpi('Masuk', jt(m.in), delta(m.in, a._in, false) + ' vs ' + esc(a._label))}${kpi('Keluar', jt(m.out), delta(m.out, a._out, true) + ' vs ' + esc(a._label))}</div>
    <div class="stats">${kpi('Sisa', jt(m.net), (m.rate * 100).toFixed(0) + '% dari pemasukan')}${kpi('Sisa dari gaji', jt(m.sisaGaji), 'gaji − keluar − talangan')}</div>
    <div class="stats">${kpi('Budget ideal', jt(ideal._total), rutin <= ideal._total ? `<span style="color:var(--green)">hemat ${jt(ideal._total - rutin)}</span>` : `<span style="color:var(--red)">lewat ${jt(rutin - ideal._total)}</span>`)}
      ${kpi('Tahan tanpa income', perMo > 0 ? (S.kasBersih / perMo).toFixed(1).replace('.', ',') + ' bln' : '—', 'kas ' + jt(S.kasBersih) + ' ÷ ' + jt(perMo) + '/bln')}</div>
    <div class="stats" style="grid-template-columns:1fr 1fr 1fr">${kpi('Gaji', jt(m.gaji), '')}${kpi('CG Advisory', jt(m.cg), '')}${kpi('Lainnya', jt(m.lain), '')}</div></div>
  <div class="section-h">Yang perlu lu tahu</div>
  <div class="list plain">${ins.map(c => `<div class="row" style="align-items:flex-start;padding-top:12px;padding-bottom:12px"><span style="width:8px;height:8px;border-radius:4px;margin-top:7px;flex:none;background:var(--${c.tone === 'neg' ? 'red' : c.tone === 'pos' ? 'green' : c.tone === 'warn' ? 'orange' : 'accent'})"></span>
    <div class="main" style="padding:0"><div class="t2" style="white-space:normal">${esc(c.t)}</div><div style="font-weight:600;margin:1px 0 3px">${esc(c.h)}</div><div class="small muted" style="line-height:1.4">${esc(c.p)}</div></div></div>`).join('')}</div>
  <div class="section-h">${R.type === 'm' ? '6 bulan terakhir' : 'Per bulan'}</div>
  <div class="card chart"><div class="legend"><span><i style="background:var(--label3)"></i>Masuk</span><span><i style="background:var(--orange)"></i>Keluar</span><span><i style="background:var(--orange-300)"></i>Talangan</span></div>${barsChart(ms)}</div>
  <div class="seg" style="margin:22px 16px 8px"><button class="${R.kind === 'expense' ? 'on' : ''}" data-act="rp-kind2" data-k="expense">Pengeluaran per grup</button><button class="${R.kind === 'income' ? 'on' : ''}" data-act="rp-kind2" data-k="income">Pemasukan</button></div>
  ${R.kind === 'expense' ? `<div class="foot" style="margin:0 32px 8px">Garis tipis = rata-rata (${esc(a._label)}), garis biru = ${hasBud ? 'budget lu' : 'budget ideal dari target tabungan (belum ada budget)'}.</div>
    <div class="list">${groups.map(r => {
      const d = r.bud > 0 ? r.now - r.bud : null, over = r.bud > 0 && r.now > r.bud;
      return `<button class="row" data-act="group-drill" data-g="${esc(r.g)}"><div class="main">
        <div style="display:flex;justify-content:space-between;gap:8px"><span class="t1">${esc(r.g)}${PLAN_EXCLUDE[r.g] ? ' <span class="muted small">· ' + esc(PLAN_EXCLUDE[r.g]) + '</span>' : ''}</span><span class="num">${jt(r.now)}</span></div>
        <div style="position:relative;height:6px;border-radius:3px;background:var(--fill);margin-top:6px">
          <i style="position:absolute;left:0;top:0;bottom:0;border-radius:3px;width:${(r.now / max * 100).toFixed(1)}%;background:${over ? 'var(--red)' : 'var(--label2)'}"></i>
          ${r.avg > 0 ? `<i style="position:absolute;top:-3px;bottom:-3px;width:1.5px;left:${(r.avg / max * 100).toFixed(1)}%;background:var(--label)"></i>` : ''}
          ${r.bud > 0 ? `<i style="position:absolute;top:-3px;bottom:-3px;width:2px;left:${(r.bud / max * 100).toFixed(1)}%;background:var(--accent)"></i>` : ''}</div>
        <div class="t2" style="margin-top:4px">rata ${r.avg ? jt(r.avg) : '—'} · ${budLabel} ${r.bud ? jt(r.bud) : '—'}${d === null ? '' : ` · <span style="color:${d > 0 ? 'var(--red)' : 'var(--green)'}">${d > 0 ? '+' : ''}${jt(d)}</span>`}</div></div><span class="chev">${icon('chevron-right', 18)}</span></button>`;
    }).join('') || '<div class="empty">Belum ada pengeluaran.</div>'}</div>`
    : `<div class="list">${incRows.map(([g, v]) => `<button class="row" data-act="group-drill" data-g="${esc(g)}" data-inc="1"><div class="main"><div class="t1">${esc(g)}</div></div><span class="num pos">${jt(v)}</span><span class="chev">${icon('chevron-right', 18)}</span></button>`).join('') || '<div class="empty">Belum ada pemasukan.</div>'}</div>`}
  <div class="section-h">Health check</div>
  <div class="list plain">${ck.map(c => `<div class="row"><div class="main"><div class="t1">${esc(c.t)}</div><div class="t2">${jt(c.v)} · ${c.lower ? 'batas' : 'minimum'} ${jt(c.lim)}</div></div>
    <span class="small" style="font-weight:600;padding:3px 9px;border-radius:10px;color:#fff;background:${c.cls === 'pass' ? 'var(--green)' : c.cls === 'mid' ? 'var(--orange)' : 'var(--red)'}">${c.tag}</span></div>`).join('')}</div>
  <div class="btn-row"><button class="btn secondary" data-act="open-plan">Lihat proyeksi & rencana</button></div>`;
}
const rr = () => { window.__render(); refreshPages(); };
act('rp-type', d => { R.type = d.t; R.sel = d.t === 'm' ? today().slice(0, 7) : today().slice(0, 4); rr(); });
act('rp-step', d => { R.sel = R.type === 'm' ? addMonths(R.sel, +d.d) : String(+R.sel + +d.d); rr(); });
act('rp-kind2', d => { R.kind = d.k; rr(); });

act('group-drill', d => openGroupDrill(d.g, !!d.inc));
export function openGroupDrill(g, inc) {
  const type = R.type, sel = R.sel;
  pushPage({ title: g, live: true, v: { sort: 'v', cat: '' }, render() {
    const rows = [];
    for (const t of state.transactions.values()) {
      if (t.deleted || t.exclude || !t.date) continue;
      if ((type === 'm' ? t.date.slice(0, 7) : t.date.slice(0, 4)) !== sel) continue;
      const c = cat(t.category_id); if (!c || c.kind !== (inc ? 'income' : 'expense')) continue;
      if (groupOf(t.category_id) !== g) continue;
      rows.push(t);
    }
    const byCat = {};
    rows.forEach(t => { byCat[t.category_id] = (byCat[t.category_id] || 0) + Math.abs(t.amount); });
    const tot = rows.reduce((s, t) => s + Math.abs(t.amount), 0);
    const list = rows.filter(t => !this.v.cat || t.category_id === this.v.cat)
      .sort(this.v.sort === 'v' ? (a, b) => Math.abs(b.amount) - Math.abs(a.amount) : (a, b) => b.date.localeCompare(a.date));
    const big = list.reduce((s, t) => Math.max(s, Math.abs(t.amount)), 0);
    const top5 = list.slice().sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5).reduce((s, t) => s + Math.abs(t.amount), 0);
    const ltot = list.reduce((s, t) => s + Math.abs(t.amount), 0);
    return `<div class="card hero"><div class="label">${type === 'm' ? mLabelLong(sel) : 'Tahun ' + sel}</div><div class="big num">${rp(tot)}</div>
        <div class="muted small">${rows.length} transaksi · rata-rata ${rp(rows.length ? tot / rows.length : 0)} · terbesar ${rp(big)}${ltot ? ' · 5 terbesar ' + (top5 / ltot * 100).toFixed(0) + '%' : ''}</div></div>
      ${Object.keys(byCat).length > 1 ? `<div class="chips" style="margin-top:12px"><button class="chip ${!this.v.cat ? 'on' : ''}" data-act="gd-cat" data-id="">Semua</button>
        ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([id, v]) => `<button class="chip ${this.v.cat === id ? 'on' : ''}" data-act="gd-cat" data-id="${esc(id)}">${esc(catName(id))} · ${jt(v)}</button>`).join('')}</div>` : ''}
      <div class="seg" style="margin:12px 16px 8px"><button class="${this.v.sort === 'v' ? 'on' : ''}" data-act="gd-sort" data-s="v">Terbesar</button><button class="${this.v.sort === 'd' ? 'on' : ''}" data-act="gd-sort" data-s="d">Terbaru</button></div>
      <div class="list">${list.slice(0, 300).map(t => txnRow(t, { showDate: true })).join('')}</div>
      ${list.length > 300 ? `<div class="foot">Nampilin 300 dari ${list.length}.</div>` : ''}`;
  } });
}
act('gd-cat', d => { const p = top(); p.v.cat = d.id; renderPage(p); });
act('gd-sort', d => { const p = top(); p.v.sort = d.s; renderPage(p); });

// ---------- Rencana ----------
function planPage() {
  pushPage({ title: 'Rencana', live: true, v: { year: null }, right: { act: 'plan-settings', label: 'Atur' }, render() {
    const S = compute(), c = S.cfg, v = verdict(S), a = avg6(S, lastFullYm(S));
    const nowY = +S.P.rows[0].ym.slice(0, 4);
    const year = this.v.year || nowY + 1;
    // P&L
    const yt = yearlyTotals(c, year), b = S.burn;
    const yms = Array.from({ length: 12 }, (_, i) => year + '-' + String(i + 1).padStart(2, '0'));
    const grpYear = {}; let rutinYear = 0;
    yms.forEach(x => { const pl = planFor(S, x); Object.entries(pl).forEach(([g, val]) => { grpYear[g] = (grpYear[g] || 0) + (+val || 0); rutinYear += +val || 0; }); });
    const agenda = (c.agenda || []).filter(r => r.m && +r.m.slice(0, 4) === year);
    let agMasuk = 0, agKeluar = 0; agenda.forEach(r => { if (r.v > 0) agMasuk += +r.v; else agKeluar -= +r.v; });
    const pend = c.gaji * 12 + yt.masuk + agMasuk + (+c.cgBulanan || 0) * 12 + (+c.pasanganBulanan || 0) * 12;
    const totalKeluar = rutinYear + yt.keluar + agKeluar, surplus = pend - totalKeluar;
    const pl = (n, mo, yr, cls = '') => `<div class="row" style="min-height:40px"><div class="main" style="padding:6px 0"><div class="t1 ${cls}">${esc(n)}</div></div><span class="num small muted" style="min-width:58px;text-align:right">${mo}</span><span class="num" style="min-width:72px;text-align:right">${yr}</span></div>`;
    // goal
    const g = c.goal, n = Math.max(1, Math.round((+g.tahun || 1) * 12)), r = (+g.ret || 0) / 100 / 12;
    const modal = g.modal === null || g.modal === undefined ? modalDefault(S) : +g.modal;
    const ytN = yearlyTotals(c, nowY + 1), tahunanNet = (ytN.keluar - ytN.masuk) / 12, tal = +c.talanganTarget || 0;
    const need = pmtFor(+g.target || 0, modal, r, n), incomeMin = need + b + tahunanNet + tal, gap = incomeMin - c.gaji;
    const surplusNow = c.gaji - b - tahunanNet - tal, reach = fv(modal, surplusNow, r, n);
    // pots
    const totalNikah = c.sisaNikah + S.nikahTerbayar, pctN = totalNikah > 0 ? Math.min(100, S.nikahTerbayar / totalNikah * 100) : 0;
    const apt = (c.tahunan || []).filter(x => /apart|sewa/i.test(x.n) && x.v < 0).reduce((s, x) => s - x.v, 0);
    const butuh = c.sisaNikah + apt + c.lantaiKas, pctK = butuh > 0 ? Math.min(100, Math.max(0, S.kasBersih / butuh * 100)) : 100;
    const byClass = cl => S.wallets.filter(w => w.c === cl && Math.abs(w.v) > 50000);
    return `<div class="card hero"><div style="font-size:22px;font-weight:700;letter-spacing:-.01em;color:${tone(v.cls)}">${esc(v.txt)}</div>
        <div class="muted small" style="margin-top:6px;line-height:1.45">${esc(v.detail)}</div></div>
      <div class="seg" style="margin:14px 16px 0"><button class="${S.mode === 'avg' ? 'on' : ''}" data-act="plan-mode" data-m="avg">Rata-rata belanja</button><button class="${S.mode === 'budget' ? 'on' : ''}" data-act="plan-mode" data-m="budget">Budget</button></div>
      <div class="card chart" style="margin-top:10px">${runwayChart(S)}</div>
      <div class="list plain" style="margin-top:12px">
        <div class="row"><div class="main"><div class="t1">Rata-rata belanja</div><div class="t2">${jt(S.burnAvg)}/bln · rutin 6 bln terakhir</div></div><div class="end"><div class="num">${jt(S.Pavg.min.v)}</div><div class="t2">${mLabelLong(S.Pavg.min.ym)}</div></div></div>
        ${S.Pbud ? `<div class="row"><div class="main"><div class="t1">Budget</div><div class="t2">${jt(burnFor0(S))}/bln sekarang${S.budgets.length > 1 ? ' · ' + S.budgets.length + ' versi' : ''}</div></div><div class="end"><div class="num">${jt(S.Pbud.min.v)}</div><div class="t2">${mLabelLong(S.Pbud.min.ym)}</div></div></div>`
          : `<button class="row" data-act="plan-settings"><div class="main"><div class="t1">Budget</div><div class="t2">Belum dibuat. Tap buat atur.</div></div><span class="chev">${icon('chevron-right', 18)}</span></button>`}</div>
      <div class="foot">Angka kanan = titik terendah kas di proyeksi 24 bulan.</div>
      <div class="card" style="margin-top:12px"><div class="stats" style="border:0"><div><div class="k">Kas dipakai proyeksi</div><div class="v num">${jt(S.kasBersih)}</div></div><div><div class="k">Belanja / bln (${S.mode === 'budget' ? 'budget' : 'rata-rata'})</div><div class="v num">${jt(S.burn)}</div><div class="small muted">rata 6 bln ${jt(a._out)} termasuk nikah & asuransi</div></div></div>
        <div class="stats"><div><div class="k">Piutang belum balik</div><div class="v num">${jt(S.pots.piutang)}</div></div><div><div class="k">Titik terendah</div><div class="v num">${jt(S.P.min.v)}</div><div class="small muted">${mLabelLong(S.P.min.ym)}</div></div></div></div>

      <div class="section-h">Kantong</div>
      <div class="list plain">
        <div class="row" style="display:block;padding:12px 16px"><div style="display:flex;justify-content:space-between"><b>Dana nikah</b><span class="small muted">${pctN.toFixed(0)}%</span></div><div class="bar"><i style="width:${pctN}%"></i></div><div class="t2" style="margin-top:4px;white-space:normal">Kebayar ${jt(S.nikahTerbayar)} dari perkiraan ${jt(totalNikah)}. Sisa ${jt(c.sisaNikah)}.</div></div>
        <div class="row" style="display:block;padding:12px 16px"><div style="display:flex;justify-content:space-between"><b>Kesiapan kas</b><span class="small muted">${pctK.toFixed(0)}%</span></div><div class="bar ${pctK >= 100 ? '' : pctK >= 70 ? 'warn' : 'over'}"><i style="width:${pctK}%"></i></div><div class="t2" style="margin-top:4px;white-space:normal">Kas ${jt(S.kasBersih)} vs kebutuhan ${jt(butuh)} (nikah + apartment + lantai kas).</div></div>
        ${['kas', 'piutang', 'kartu'].map(cl => `<div class="row" style="display:block;padding:12px 16px"><b>${CLASS_LABEL[cl]} · ${jt(S.pots[cl])}</b><div class="t2" style="white-space:normal;margin-top:3px">${byClass(cl).map(w => esc(w.w.name) + ' ' + jt(w.v) + (w.vol ? ' (naik-turun)' : '')).join(' · ') || '—'}</div></div>`).join('')}</div>

      <div class="section-h">Arus kas 24 bulan</div>
      <div class="list plain">${S.P.rows.map((x, i) => `<div class="row" style="min-height:44px"><div class="main" style="padding:7px 0"><div class="t1">${mLabelLong(x.ym)}${i === 0 ? ' <span class="muted small">· sekarang</span>' : ''}</div>
        ${x.ev.length ? `<div class="t2">${esc(x.ev.map(e => e.n).join(', '))} · <span style="color:${x.evV > 0 ? 'var(--green)' : 'var(--red)'}">${jt(x.evV)}</span></div>` : ''}</div>
        <span class="num" style="color:${x.saldo < 0 || x.saldo < c.lantaiKas ? 'var(--red)' : 'inherit'}">${jt(x.saldo)}</span></div>`).join('')}</div>
      <div class="foot">Tiap bulan: + gaji ${jt(c.gaji)} − belanja ${jt(b)} − talangan ${jt(tal)}, ditambah biaya tahunan dan agenda.</div>

      <div class="section-h">Proyeksi P&L</div>
      <div class="chips">${[nowY, nowY + 1, nowY + 2, nowY + 3].map(y => `<button class="chip ${y === year ? 'on' : ''}" data-act="plan-year" data-y="${y}">${y}</button>`).join('')}</div>
      <div class="list plain" style="margin-top:8px">
        ${pl('', '/bln', 'setahun', 'muted small')}
        ${pl('Gaji', jt(c.gaji), jt(c.gaji * 12))}
        ${c.cgBulanan ? pl('CG Advisory (asumsi)', jt(c.cgBulanan), jt(c.cgBulanan * 12)) : ''}
        ${c.pasanganBulanan ? pl('Kontribusi pasangan', jt(c.pasanganBulanan), jt(c.pasanganBulanan * 12)) : ''}
        ${yt.rows.filter(x => x.v > 0).map(x => pl(x.n + ' (' + MON[x.mo - 1] + ')', jt(x.v / 12), jt(x.v))).join('')}
        ${agenda.filter(x => x.v > 0).map(x => pl(x.n + ' (' + mLabel(x.m) + ')', '—', jt(x.v))).join('')}
        ${pl('Total pendapatan', jt(pend / 12), jt(pend))}
        ${expenseGroups().filter(gr => grpYear[gr]).map(gr => pl(gr, jt(grpYear[gr] / 12), jt(grpYear[gr]))).join('')}
        ${pl('Subtotal belanja rutin (' + (S.mode === 'budget' ? 'budget' : 'rata-rata') + ')', jt(rutinYear / 12), jt(rutinYear))}
        ${yt.rows.filter(x => x.v < 0).map(x => pl(x.n + ' (' + MON[x.mo - 1] + ')', jt(-x.v / 12), jt(-x.v))).join('')}
        ${agenda.filter(x => x.v < 0).map(x => pl(x.n + ' (' + mLabel(x.m) + ')', '—', jt(-x.v))).join('')}
        <div class="row" style="min-height:44px"><div class="main"><b>Surplus ${year}</b></div><span class="num small" style="min-width:58px;text-align:right;color:${surplus >= 0 ? 'var(--green)' : 'var(--red)'}">${jt(surplus / 12)}</span><b class="num" style="min-width:72px;text-align:right;color:${surplus >= 0 ? 'var(--green)' : 'var(--red)'}">${jt(surplus)}</b></div>
        ${pl('Margin tabungan', '', pend ? (surplus / pend * 100).toFixed(0) + '%' : '—')}</div>

      <div class="section-h">Target tabungan</div>
      <div class="card"><div class="stats" style="border:0"><div><div class="k">Harus nabung</div><div class="v num">${need <= 0 ? 'Rp 0' : jt(need)}</div><div class="small muted">per bulan, ${+g.tahun} tahun</div></div>
        <div><div class="k">Income minimum</div><div class="v num">${jt(Math.max(0, incomeMin))}</div><div class="small muted">nabung + belanja + tahunan${tal ? ' + talangan' : ''}</div></div></div>
        <div class="stats"><div><div class="k">${gap > 0 ? 'Kurang' : 'Lebih'}</div><div class="v num" style="color:${gap > 0 ? 'var(--red)' : 'var(--green)'}">${jt(Math.abs(gap))}</div><div class="small muted">per bulan vs gaji sekarang</div></div>
        <div><div class="k">Kalau jalan apa adanya</div><div class="v num">${jt(reach)}</div><div class="small muted">di tahun ke-${+g.tahun}, surplus ${jt(surplusNow)}/bln</div></div></div></div>
      <div class="foot">Target ${jt(+g.target || 0)} dalam ${+g.tahun} tahun, return ${+g.ret}%/thn, modal awal ${jt(modal)}. Ubah di "Atur".</div>`;
  } });
}
const burnFor0 = S => Object.values(planFor(S, today().slice(0, 7), 'budget')).reduce((t, x) => t + (+x || 0), 0);
act('open-plan', planPage);
act('plan-mode', async d => { const c = cfg(); c.projMode = d.m; if (d.m === 'budget' && !(c.budgets || []).length) { toast('Bikin budget dulu di "Atur"'); return; } await saveCfg(c); });
act('plan-year', d => { const p = top(); p.v.year = +d.y; renderPage(p); });

// ---------- Atur rencana ----------
function setPath(o, path, val) { const k = path.split('.'); let x = o; for (let i = 0; i < k.length - 1; i++) x = x[k[i]]; x[k[k.length - 1]] = val; }
const getPath = (o, path) => path.split('.').reduce((x, k) => x == null ? x : x[k], o);
const money = (path, label, v, foot = '') => `<div class="field"><label>${esc(label)}</label><input inputmode="text" data-input="pl-money" data-p="${path}" value="${v === null || v === undefined || v === '' ? '' : (v < 0 ? '-' : '') + Math.abs(Math.round(v)).toLocaleString('id-ID')}" placeholder="0"></div>`;
const num = (path, label, v, ph = '') => `<div class="field"><label>${esc(label)}</label><input inputmode="decimal" data-input="pl-num" data-p="${path}" value="${v ?? ''}" placeholder="${ph}"></div>`;
const txt = (path, label, v) => `<div class="field"><label>${esc(label)}</label><input data-input="pl-txt" data-p="${path}" value="${esc(v ?? '')}"></div>`;

function planSettings() {
  const S = compute();
  const v = structuredClone(S.cfg);
  delete v.plan;
  v.budgets = (v.budgets || []).slice().sort((a, b) => a.from.localeCompare(b.from));
  pushPage({ title: 'Atur rencana', back: 'Batal', v, right: { act: 'plan-save', label: 'Simpan' }, render() {
    const v = this.v, a = avg6(S, lastFullYm(S));
    const tw = v.talanganWallets || [...S.talSet];
    return `<div class="section-h">Pemasukan rutin</div><div class="list">${money('gaji', 'Gaji / bulan', v.gaji)}${money('cgBulanan', 'CG Advisory / bulan', v.cgBulanan)}${money('pasanganBulanan', 'Kontribusi pasangan', v.pasanganBulanan)}</div>
      <div class="foot">Proyeksi kas cuma pakai gaji. CG & pasangan dipakai buat hitung budget ideal dan P&L.</div>
      <div class="section-h">Batas & target</div><div class="list">${money('lantaiKas', 'Lantai kas', v.lantaiKas)}${money('shoppingTarget', 'Batas Shopping / bln', v.shoppingTarget)}
        ${money('sisaGajiTarget', 'Min. sisa dari gaji', v.sisaGajiTarget)}${money('talanganTarget', 'Talangan / bln', v.talanganTarget)}${money('sisaNikah', 'Sisa biaya nikah', v.sisaNikah)}</div>
      <div class="section-h">Kantong talangan</div><div class="list">${alive('wallets').filter(w => w.type === 'receivable').map(w => `<div class="field"><label>${walletIcon(w)}<span style="margin-left:8px">${esc(w.name)}</span></label><input type="checkbox" class="toggle" data-change="pl-tw" data-id="${w.id}" ${tw.includes(w.id) ? 'checked' : ''}></div>`).join('') || '<div class="field"><label class="muted">Belum ada dompet berjenis Piutang</label></div>'}</div>
      <div class="foot">Transfer masuk ke kantong ini dihitung sebagai talangan bulanan.</div>
      <div class="section-h">Rata-rata belanja / bulan</div>
      <div class="list plain">${expenseGroups().filter(g => !PLAN_EXCLUDE[g] && S.avgPlan[g]).map(g => `<div class="row" style="min-height:40px"><div class="main" style="padding:6px 0">${esc(g)}</div><span class="num muted">${jt(S.avgPlan[g])}</span></div>`).join('')}
        <div class="row"><div class="main"><b>Total</b></div><b class="num">${jt(S.burnAvg)}</b></div></div>
      <div class="foot">Otomatis dari 6 bulan penuh terakhir, dibulatkan 100 rb. Nggak perlu diisi.</div>
      <div class="section-h">Budget<button data-act="bud-add">${v.budgets.length ? 'Tambah versi' : 'Buat budget'}</button></div>
      ${v.budgets.length ? '' : '<div class="foot" style="margin-top:0">Belum ada budget. "Buat budget" akan mulai dari angka rata-rata, lalu lu ubah sesuai target.</div>'}
      ${v.budgets.map((b, i) => {
        const tot = Object.values(b.plan).reduce((t, x) => t + (+x || 0), 0);
        return `<div class="list" style="margin-bottom:10px">${txt(`budgets.${i}.name`, 'Nama', b.name)}
          <div class="field"><label>Berlaku mulai</label><input type="month" data-change="pl-sel" data-p="budgets.${i}.from" value="${esc(b.from)}" style="text-align:right"></div>
          ${expenseGroups().filter(g => !PLAN_EXCLUDE[g]).map(g => money(`budgets.${i}.plan.${g}`, g + (S.avgPlan[g] ? ` (rata ${jt(S.avgPlan[g])})` : ''), b.plan[g] || 0)).join('')}
          <div class="field"><label><b>Total</b></label><b class="num" style="margin-left:auto">${jt(tot)}</b><span class="muted small" style="margin-left:6px">vs rata ${jt(S.burnAvg)}</span></div>
          <button class="field" style="width:100%;color:var(--red)" data-act="bud-del" data-i="${i}">Hapus versi ini</button></div>`;
      }).join('')}
      <div class="foot">Budget bisa punya beberapa versi, misal "Sebelum nikah" mulai Des 2026 dan "Setelah nikah" mulai Mei 2027. Tiap bulan pakai versi terakhir yang sudah berlaku. Budget ideal dari target tabungan saat ini: ${jt(Math.max(0, idealTotal(S)))}/bln.</div>
      <div class="section-h">Biaya & pemasukan tahunan<button data-act="plan-add" data-k="tahunan">Tambah</button></div>
      ${(v.tahunan || []).map((r, i) => `<div class="list" style="margin-bottom:8px">${txt(`tahunan.${i}.n`, 'Nama', r.n)}
        <div class="field"><label>Bulan</label><select data-change="pl-sel" data-p="tahunan.${i}.mo">${MON.map((m, k) => `<option value="${k + 1}" ${+r.mo === k + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        ${money(`tahunan.${i}.v`, 'Nominal (− keluar)', r.v)}${num(`tahunan.${i}.from`, 'Mulai tahun', r.from, 'sekarang')}
        <button class="field" style="width:100%;color:var(--red)" data-act="plan-del" data-k="tahunan" data-i="${i}">Hapus baris</button></div>`).join('')}
      <div class="section-h">Agenda sekali jalan<button data-act="plan-add" data-k="agenda">Tambah</button></div>
      ${(v.agenda || []).map((r, i) => `<div class="list" style="margin-bottom:8px">${txt(`agenda.${i}.n`, 'Nama', r.n)}
        <div class="field"><label>Bulan</label><input type="month" data-change="pl-sel" data-p="agenda.${i}.m" value="${esc(r.m || '')}" style="text-align:right"></div>
        ${money(`agenda.${i}.v`, 'Nominal (− keluar)', r.v)}
        <button class="field" style="width:100%;color:var(--red)" data-act="plan-del" data-k="agenda" data-i="${i}">Hapus baris</button></div>`).join('')}
      <div class="section-h">Target tabungan</div><div class="list">${money('goal.target', 'Target', v.goal.target)}${num('goal.tahun', 'Dalam (tahun)', v.goal.tahun)}
        ${num('goal.ret', 'Return (%/thn)', v.goal.ret)}${money('goal.modal', 'Modal awal', v.goal.modal ?? modalDefault(S))}</div>
      <div class="foot">Modal awal default = proyeksi saldo setelah agenda terakhir.</div>
      <div class="btn-row"><button class="btn danger" data-act="plan-defaults">Kembalikan ke default</button></div>`;
  } });
}
act('plan-settings', planSettings);
act('pl-money', (d, el) => {
  const neg = el.value.trim().startsWith('-'), digits = el.value.replace(/[^0-9]/g, '');
  const n = digits ? Number(digits) * (neg ? -1 : 1) : 0;
  setPath(top().v, d.p, n);
  el.value = (neg ? '-' : '') + (digits ? Number(digits).toLocaleString('id-ID') : '');
});
act('pl-num', (d, el) => { const x = el.value.replace(',', '.'); setPath(top().v, d.p, x === '' ? '' : Number(x)); });
act('pl-txt', (d, el) => setPath(top().v, d.p, el.value));
act('pl-sel', (d, el) => setPath(top().v, d.p, /\.mo$/.test(d.p) ? +el.value : el.value));
document.addEventListener('focusout', e => { const el = e.target; if (el && el.dataset && el.dataset.input === 'pl-money' && /^budgets\./.test(el.dataset.p)) { const p = top(); if (p && p.title === 'Atur rencana') setTimeout(() => { if (!document.activeElement || document.activeElement.dataset.input !== 'pl-money') renderPage(p); }, 0); } });
act('pl-tw', (d, el) => {
  const p = top(), S = compute();
  const set = new Set(p.v.talanganWallets || [...S.talSet]);
  el.checked ? set.add(d.id) : set.delete(d.id);
  p.v.talanganWallets = [...set];
});
act('plan-add', d => { const p = top(); p.v[d.k] = p.v[d.k] || []; p.v[d.k].push(d.k === 'tahunan' ? { n: '', mo: 1, v: 0, from: '' } : { n: '', m: today().slice(0, 7), v: 0 }); renderPage(p); });
act('plan-del', d => { const p = top(); p.v[d.k].splice(+d.i, 1); renderPage(p); });
act('bud-add', () => {
  const p = top(), S = compute(), list = p.v.budgets;
  const last = list[list.length - 1];
  const from = last ? addMonths(last.from, 1) : addMonths(today().slice(0, 7), 1);
  const plan = last ? { ...last.plan } : Object.fromEntries(Object.entries(S.avgPlan).filter(([g]) => !PLAN_EXCLUDE[g]));
  list.push({ from, name: last ? 'Budget ' + mLabelLong(from) : 'Budget', plan });
  renderPage(p);
});
act('bud-del', d => { const p = top(); if (!confirm('Hapus versi budget ini?')) return; p.v.budgets.splice(+d.i, 1); renderPage(p); });
act('plan-reset', () => {
  const p = top(), S = compute(), a = avg6(S, lastFullYm(S));
  expenseGroups().forEach(g => { p.v.plan[g] = PLAN_EXCLUDE[g] ? 0 : Math.round((a[g] || 0) / 100000) * 100000; });
  renderPage(p); toast('Rencana belanja = rata-rata 6 bulan');
});
act('plan-defaults', async () => { if (!confirm('Kembalikan semua pengaturan rencana ke default?')) return; await saveCfg({}); popPage(); toast('Dikembalikan ke default'); });
act('plan-save', async () => {
  const v = top().v;
  const froms = v.budgets.map(b => b.from);
  if (froms.some(f => !f)) return toast('Isi bulan "Berlaku mulai" tiap budget');
  if (new Set(froms).size !== froms.length) return toast('Dua versi budget nggak boleh mulai di bulan yang sama');
  v.budgets.sort((a, b) => a.from.localeCompare(b.from));
  if (v.budgets.length && !v.projMode) v.projMode = 'budget';
  await saveCfg(v); popPage(); toast('Rencana disimpan');
});
