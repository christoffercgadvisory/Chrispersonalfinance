// Grafik di Beranda: laporan bulan ini vs budget vs histori, donut pengeluaran, cashflow.
import { state, D, today, monthTxns, cat, wallet, rate } from './store.js';
import { esc, fmtNum, act } from './ui.js';
import { jt, addMonths, MON, budgetFor, groupOf, PLAN_EXCLUDE } from './plan.js';

const hide = () => state.config.hide;
const J = (n, dp) => hide() ? '•••' : Math.abs(n) >= 1e6 ? jt(n, dp) : (n < 0 ? '-' : '') + fmtNum(Math.round(Math.abs(n) / 1000)) + ' rb';
const num = n => hide() ? '•••' : fmtNum(n);
const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

// Pengeluaran rutin kumulatif per hari (grup yang dikecualikan dari rencana tidak dihitung,
// supaya sebanding dengan budget).
const cumCache = new Map();
export function routineCum(ym) {
  const k = ym + '|' + D.version + '|' + state.config.ratesAt;
  if (cumCache.has(k)) return cumCache.get(k);
  const n = daysIn(ym), arr = new Array(n).fill(0);
  for (const t of monthTxns(ym)) {
    if (t.deleted || t.exclude) continue;
    const c = cat(t.category_id); if (!c || c.kind !== 'expense') continue;
    if (PLAN_EXCLUDE[groupOf(t.category_id)]) continue;
    arr[+t.date.slice(8, 10) - 1] -= (Number(t.amount) || 0) * rate((wallet(t.wallet_id) || {}).currency);
  }
  for (let i = 1; i < n; i++) arr[i] += arr[i - 1];
  if (cumCache.size > 60) cumCache.clear();
  cumCache.set(k, arr);
  return arr;
}

export const CMP = [['m1', 'Bln lalu'], ['a3', 'Rata 3'], ['a6', 'Rata 6'], ['a12', 'Rata 12'], ['yoy', 'YoY']];
const CMP_LONG = { m1: 'bulan lalu', a3: 'rata-rata 3 bulan', a6: 'rata-rata 6 bulan', a12: 'rata-rata 12 bulan', yoy: 'bulan yang sama tahun lalu' };

function compareSeries(ym, mode) {
  const first = D.months[0];
  const months = mode === 'yoy' ? [addMonths(ym, -12)] : Array.from({ length: mode === 'm1' ? 1 : +mode.slice(1) }, (_, i) => addMonths(ym, -1 - i));
  const have = months.filter(m => first && m >= first);
  if (!have.length) return null;
  const n = daysIn(ym), curves = have.map(routineCum);
  // Kurva dipetakan per tanggal; bulan yang lebih pendek ditahan di nilai akhirnya.
  const arr = Array.from({ length: n }, (_, i) => curves.reduce((s, c) => s + c[Math.min(i, c.length - 1)], 0) / curves.length);
  return { arr, n: have.length, want: months.length };
}

export function monthReport(S, ym, mode) {
  const cur = routineCum(ym), n = cur.length;
  const isNow = ym === today().slice(0, 7), day = isNow ? +today().slice(8, 10) : n, di = day - 1;
  const cmp = compareSeries(ym, mode);
  const bv = budgetFor(S, ym), budget = bv ? Object.values(bv.plan).reduce((s, v) => s + (+v || 0), 0) : 0;
  const bArr = budget ? Array.from({ length: n }, (_, i) => budget * (i + 1) / n) : null;
  const W = 340, H = 160, pb = 18, pr = 38;
  const hi = Math.max(1, ...cur.slice(0, day), ...(cmp ? cmp.arr : []), budget);
  const x = i => 4 + i * (W - pr - 4) / (n - 1), y = v => 8 + (H - 8 - pb) * (1 - v / hi);
  const path = (a, upto) => a.slice(0, upto + 1).map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  let s = '';
  [0.5, 1].forEach(f => { s += `<line x1="4" x2="${W - pr}" y1="${y(hi * f)}" y2="${y(hi * f)}" style="stroke:var(--sep)"/><text x="${W - pr + 4}" y="${y(hi * f) + 4}" font-size="10" style="fill:var(--label3)">${J(hi * f, 0)}</text>`; });
  s += `<line x1="4" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" style="stroke:var(--sep)"/>`;
  if (bArr) s += `<path d="${path(bArr, n - 1)}" style="fill:none;stroke:var(--label)" stroke-width="1.5" stroke-dasharray="4 4" opacity=".55"/>`;
  if (cmp) s += `<path d="${path(cmp.arr, n - 1)}" style="fill:none;stroke:var(--label3)" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<path d="${path(cur, di)}" style="fill:none;stroke:var(--orange)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  s += `<circle cx="${x(di)}" cy="${y(cur[di])}" r="4.5" style="fill:var(--card);stroke:var(--orange)" stroke-width="2.5"/>`;
  s += `<text x="4" y="${H - 3}" font-size="10" style="fill:var(--label3)">1 ${MON[+ym.slice(5) - 1]}</text><text x="${W - pr}" y="${H - 3}" text-anchor="end" font-size="10" style="fill:var(--label3)">${n} ${MON[+ym.slice(5) - 1]}</text>`;
  s += `<line class="xh" x1="0" x2="0" y1="8" y2="${H - pb}" style="stroke:var(--label2)" stroke-width="1" opacity="0"/>`;
  const now = cur[di], cmpNow = cmp ? cmp.arr[di] : null, bNow = bArr ? bArr[di] : null;
  const data = { n, day, cur: cur.map(Math.round), cmp: cmp ? cmp.arr.map(Math.round) : null, bud: bArr ? bArr.map(Math.round) : null, x0: 4, w: W - pr - 4, W, mon: MON[+ym.slice(5) - 1], cmpLabel: CMP_LONG[mode] };
  // Ringkasan dua kalimat.
  const lines = [];
  if (cmpNow) {
    const d = now - cmpNow, pct = Math.round(Math.abs(d) / cmpNow * 100);
    lines.push(`${d <= 0 ? 'Lebih hemat' : 'Lebih boros'} <b>${hide() ? '•••' : J(Math.abs(d))}</b> (${d <= 0 ? '−' : '+'}${pct}%) dibanding ${CMP_LONG[mode]} di tanggal yang sama.`);
  } else lines.push(`Belum ada data ${CMP_LONG[mode]} buat dibandingin.`);
  if (budget) {
    const left = budget - now, dl = n - day;
    lines.push(left >= 0 ? `Sisa budget <b>${hide() ? '•••' : J(left)}</b>${isNow && dl > 0 ? ` buat ${dl} hari (≈ ${hide() ? '•••' : J(left / dl)}/hari)` : ''}.` : `Budget lewat <b>${hide() ? '•••' : J(-left)}</b>.`);
  }
  return `<div class="cmp-seg"><div class="seg">${CMP.map(([k, l]) => `<button class="${k === mode ? 'on' : ''}" data-act="home-cmp" data-k="${k}">${l}</button>`).join('')}</div></div>
    <div class="stats rep3" style="border:0;grid-template-columns:1fr 1fr 1fr">
      <div><div class="k">Keluar s/d tgl ${day}</div><div class="v" style="color:var(--orange-800)">${hide() ? '•••' : J(now)}</div></div>
      <div><div class="k">${cmp && cmp.n < cmp.want ? `Rata ${cmp.n} bln` : CMP.find(c => c[0] === mode)[1]}</div><div class="v">${cmpNow !== null ? (hide() ? '•••' : J(cmpNow)) : '—'}</div></div>
      <div><div class="k">Budget</div><div class="v">${budget ? (hide() ? '•••' : J(budget)) : '—'}</div></div></div>
    <div class="chart scrub" data-scrub='${esc(JSON.stringify(data))}'><svg viewBox="0 0 ${W} ${H}">${s}</svg>
      <div class="scrub-tip"></div>
      <div class="legend" style="padding-top:6px"><span><i style="background:var(--orange)"></i>Bulan ini</span>${cmp ? `<span><i style="background:var(--label3)"></i>${esc(CMP_LONG[mode][0].toUpperCase() + CMP_LONG[mode].slice(1))}</span>` : ''}${budget ? `<span><i class="dash"></i>Budget</span>` : ''}</div></div>
    <div class="tip rep-note">${lines.join('<br>')}</div>
    <div class="foot" style="padding:0 16px 12px">Pengeluaran rutin, di luar ${Object.keys(PLAN_EXCLUDE).join(', ')}.</div>`;
}

// Geser jari di grafik buat lihat angka per tanggal.
function scrubAt(el, clientX) {
  const d = JSON.parse(el.dataset.scrub), svg = el.querySelector('svg'), r = svg.getBoundingClientRect();
  const sx = (clientX - r.left) / r.width * d.W;
  const i = Math.max(0, Math.min(d.n - 1, Math.round((sx - d.x0) / d.w * (d.n - 1))));
  const xh = svg.querySelector('.xh');
  const px = d.x0 + i * d.w / (d.n - 1);
  xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.setAttribute('opacity', '.5');
  const tip = el.querySelector('.scrub-tip');
  const parts = [`<b>${i + 1} ${d.mon}</b>`];
  if (i < d.day) parts.push(`bulan ini ${num(d.cur[i])}`);
  if (d.cmp) parts.push(`${d.cmpLabel} ${num(d.cmp[i])}`);
  if (d.bud) parts.push(`budget ${num(d.bud[i])}`);
  tip.innerHTML = parts.join(' · ');
  tip.classList.add('on');
}
function scrubEnd(el) {
  const xh = el.querySelector('.xh'); if (xh) xh.setAttribute('opacity', '0');
  const tip = el.querySelector('.scrub-tip'); if (tip) tip.classList.remove('on');
}
let scrubEl = null;
document.addEventListener('pointerdown', e => { const el = e.target.closest && e.target.closest('.scrub'); if (!el) return; scrubEl = el; scrubAt(el, e.clientX); });
document.addEventListener('pointermove', e => { if (scrubEl) scrubAt(scrubEl, e.clientX); else if (e.pointerType === 'mouse') { const el = e.target.closest && e.target.closest('.scrub'); if (el) scrubAt(el, e.clientX); } });
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { if (scrubEl) { const el = scrubEl; scrubEl = null; setTimeout(() => scrubEnd(el), 1600); } }));
document.addEventListener('pointerout', e => { if (e.pointerType === 'mouse' && !scrubEl) { const el = e.target.closest && e.target.closest('.scrub'); if (el && !el.contains(e.relatedTarget)) scrubEnd(el); } });

// ---------- Donut pengeluaran teratas ----------
// Urutan warna sudah dicek buta warna (ΔE adjacent ≥ 7,5) + pemisah 2px dan label di legenda.
const DONUT = ['#E3721C', '#3B7BD4', '#7F9228', '#C8506A', '#8B5FBF', '#2A9D8F'];
const OTHER = '#B9B4AA';
export function topDonut(agg, ym) {
  const items = Object.entries(agg.cats || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = items.reduce((s, [, v]) => s + v, 0);
  if (!total) return '<div class="empty">Belum ada pengeluaran bulan ini.</div>';
  const top = items.slice(0, 5), rest = items.slice(5).reduce((s, [, v]) => s + v, 0);
  const segs = top.map(([g, v], i) => ({ g, v, col: DONUT[i] }));
  if (rest > 0) segs.push({ g: 'Lainnya', v: rest, col: OTHER, other: true });
  const R = 62, SW = 20, C = 2 * Math.PI * R, gap = segs.length > 1 ? 2.5 : 0;
  let off = 0, arcs = '';
  segs.forEach(sg => {
    const len = Math.max(0.5, sg.v / total * C - gap);
    arcs += `<circle r="${R}" cx="80" cy="80" fill="none" stroke="${sg.col}" stroke-width="${SW}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 80 80)"><title>${esc(sg.g)}: ${fmtNum(sg.v)}</title></circle>`;
    off += sg.v / total * C;
  });
  return `<div class="donut-wrap"><div class="donut"><svg viewBox="0 0 160 160">${arcs}</svg>
      <div class="donut-c"><div class="k">Total keluar</div><div class="v">${hide() ? '•••' : J(total)}</div><div class="k">${MON[+ym.slice(5) - 1]} ${ym.slice(0, 4)}</div></div></div>
    <div class="donut-leg">${segs.map(sg => `<button class="dl" ${sg.other ? 'data-act="open-report" data-ym="' + ym + '"' : `data-act="open-group" data-g="${esc(sg.g)}" data-ym="${ym}"`}>
      <i style="background:${sg.col}"></i><span class="n">${esc(sg.g)}</span><span class="p">${Math.round(sg.v / total * 100)}%</span><span class="a">${hide() ? '•••' : J(sg.v)}</span></button>`).join('')}</div></div>`;
}

// ---------- Cashflow 6 bulan ----------
export const CF = { sel: null };
act('cf-sel', d => { CF.sel = d.ym; window.__render(); });
export function cashflow(S) {
  const now = today().slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(now, i - 5));
  const sel = months.includes(CF.sel) ? CF.sel : now;
  const M = ym => S.byYm[ym] || { in: 0, out: 0, talangan: 0 };
  const hi = Math.max(1, ...months.map(m => Math.max(M(m).in, M(m).out + M(m).talangan)));
  const W = 340, H = 150, pb = 20, top = 8, gw = (W - 8) / 6, bw = 15;
  const y = v => top + (H - top - pb) * (1 - v / hi), h = v => (H - top - pb) * v / hi;
  let s = `<line x1="4" x2="${W - 4}" y1="${y(0)}" y2="${y(0)}" style="stroke:var(--sep)"/>`;
  months.forEach((m, i) => {
    const d = M(m), cx = 4 + gw * i + gw / 2, on = m === sel;
    if (on) s += `<rect x="${cx - gw / 2 + 2}" y="2" width="${gw - 4}" height="${H - 4}" rx="10" style="fill:var(--orange-050)"/>`;
    const bar = (x, v0, v, col) => v > 0 ? `<rect x="${x}" y="${y(v0 + v)}" width="${bw}" height="${Math.max(1, h(v) - (v0 ? 2 : 0))}" rx="4" style="fill:${col}"/>` : '';
    s += bar(cx - bw - 1.5, 0, d.in, 'var(--green)');
    s += bar(cx + 1.5, 0, d.out, 'var(--orange)');
    s += bar(cx + 1.5, d.out, d.talangan, 'var(--label3)');
    s += `<text x="${cx}" y="${H - 5}" text-anchor="middle" font-size="11" style="fill:${on ? 'var(--label)' : 'var(--label3)'};font-weight:${on ? 600 : 400}">${MON[+m.slice(5) - 1]}</text>`;
    s += `<rect x="${cx - gw / 2}" y="0" width="${gw}" height="${H}" fill="transparent" data-act="cf-sel" data-ym="${m}" style="cursor:pointer"/>`;
  });
  const d = M(sel), sisa = d.in - d.out - d.talangan, partial = sel === now;
  const full = months.filter(m => m !== now && S.byYm[m]);
  const avgSisa = full.length ? full.reduce((t, m) => t + (M(m).in - M(m).out - M(m).talangan), 0) / full.length : null;
  return `<div class="chart cf"><svg viewBox="0 0 ${W} ${H}">${s}</svg>
    <div class="legend" style="padding-top:4px"><span><i style="background:var(--green)"></i>Masuk</span><span><i style="background:var(--orange)"></i>Pengeluaran</span><span><i style="background:var(--label3)"></i>Talangan</span></div></div>
    <div class="cf-detail"><div class="cf-h">${MON[+sel.slice(5) - 1]} ${sel.slice(0, 4)}${partial ? ' · berjalan' : ''}</div>
      <div class="cf-row"><span>Masuk</span><b class="pos">${num(d.in)}</b></div>
      <div class="cf-row"><span>Pengeluaran</span><b>${num(d.out)}</b></div>
      ${d.talangan ? `<div class="cf-row"><span>Talangan</span><b>${num(d.talangan)}</b></div>` : ''}
      <div class="cf-row tot"><span>Sisa${d.in > 0 ? ` (${Math.round(sisa / d.in * 100)}% dari masuk)` : ''}</span><b class="${sisa < 0 ? 'neg' : 'pos'}">${hide() ? '•••' : (sisa < 0 ? '−' : '') + fmtNum(Math.abs(sisa))}</b></div>
      ${avgSisa !== null ? `<div class="foot" style="padding:6px 0 0">Rata-rata sisa ${full.length} bulan penuh terakhir: ${hide() ? '•••' : J(avgSisa)}/bulan. Tap bulan buat lihat detail.</div>` : ''}</div>`;
}
