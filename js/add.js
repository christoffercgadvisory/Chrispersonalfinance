// Form tambah/edit transaksi, alurnya mengikuti Money Lover:
// jenis → dompet → nominal (+ saran dari histori) → kategori → catatan → tanggal → simpan.
import { state, D, KINDS, DEBT_KINDS, cat, wallet, alive, save, removeTxn, today, uid, saveConfig, toYmd, nextDate, toIDR, rate } from './store.js';
import { esc, fmtNum, rp, openSheet, closeSheet, pickList, toast, act, catItems, walletItems, catBadge, walletBadge } from './ui.js';
import { newCategory } from './catedit.js';
import { icon, catIconName, catColor, badge, WALLET_ICON } from './icons.js';
import { groupOf } from './plan.js';
import { suggestByAmount, suggestNotes } from './suggest.js';
import { ledger, pcfg, POINT_GROUP } from './points.js';

// Info poin waktu kategorinya Shopping: saldo poin sebelum → sesudah transaksi ini.
function ptsHint() {
  const c = S && S.category_id && cat(S.category_id);
  if (!c || c.kind !== 'expense' || groupOf(c.id) !== POINT_GROUP || !state.activities.size) return '';
  const since = pcfg().since || today();
  if (S.date < since) return '';
  const P = ledger();
  const old = S.id && state.transactions.get(S.id);
  const back = old && !old.deleted && old.date >= since && groupOf(old.category_id) === POINT_GROUP ? -(Number(old.amount) || 0) * rate((wallet(old.wallet_id) || {}).currency) : 0;
  const before = P.balance + back, after = before - toIDR(S.amount, curOf());
  const f = n => (n < 0 ? '−' : '') + 'Rp ' + fmtNum(Math.abs(n));
  return `<div class="add-pts">Poin ${f(before)} → <b class="${after < 0 ? 'neg' : ''}">${f(after)}</b>${after < 0 ? ' · minus, kejar lewat aktivitas' : ''}</div>`;
}

const MODES = [['expense', 'Keluar'], ['income', 'Masuk'], ['transfer', 'Transfer'], ['debt', 'Hutang']];
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
let S = null, sheet = null, suggT = null;

const modeKinds = m => m === 'debt' ? DEBT_KINDS : m === 'other' ? ['transfer', 'adjust'] : [m];
const digits = s => Number(String(s || '').replace(/[^0-9]/g, '')) || 0;
const curOf = () => { const w = wallet(S && S.wallet_id); return w && w.currency ? w.currency : 'IDR'; };
// IDR: angka bulat "1.250.000". Mata uang asing: boleh desimal "1.250,50".
function parseAmt(str, dec) {
  if (!dec) { const n = digits(str); return { v: n, text: n ? fmtNum(n) : '' }; }
  const raw = String(str || '').replace(/[^0-9,]/g, '');
  const [i, ...rest] = raw.split(',');
  const frac = rest.join('').slice(0, 2), hasC = raw.includes(',');
  const iv = digits(i);
  return { v: Number(iv + '.' + (frac || '0')), text: (i ? iv.toLocaleString('id-ID') : (hasC ? '0' : '')) + (hasC ? ',' + frac : '') };
}
const fmtAmt = (v, dec) => !v ? '' : dec ? v.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : fmtNum(v);
const FREQS = [['', 'Tidak berulang'], ['daily', 'Setiap hari'], ['weekly', 'Setiap minggu'], ['monthly', 'Setiap bulan'], ['yearly', 'Setiap tahun']];

function defaultWallet() {
  const w = wallet(state.config.lastWallet);
  if (w && !w.deleted && !w.archived) return w.id;
  const list = alive('wallets').filter(x => !x.archived).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  return list[0] ? list[0].id : '';
}
function dateLabel(d) {
  const [y, m, dd] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, dd);
  const t = today();
  const pre = d === t ? 'Hari ini' : DAYS[dt.getDay()];
  return `${pre}, ${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
const shiftDate = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return toYmd(new Date(y, m - 1, dd + n)); };

export function openAdd(id = null, preset = {}) {
  const t = id ? state.transactions.get(id) : null;
  S = { id, amount: 0, mode: 'expense', category_id: '', wallet_id: defaultWallet(), to_wallet: '', date: today(),
    note: '', person: '', event_id: '', exclude: false, more: false, out: null, inn: null, sign: -1, touchedNote: false, freq: '', until: '' };
  const activeEvent = alive('events').find(e => e.active);
  if (activeEvent && !t) S.event_id = activeEvent.id;
  if (t) {
    const c = cat(t.category_id);
    const kind = c ? c.kind : (t.amount < 0 ? 'expense' : 'income');
    Object.assign(S, { amount: Math.abs(Math.round(t.amount * 100) / 100), category_id: t.category_id, wallet_id: t.wallet_id, date: t.date,
      note: t.note || '', person: t.person || '', event_id: t.event_id || '', exclude: !!t.exclude, sign: t.amount < 0 ? -1 : 1, touchedNote: true });
    S.more = !!(t.event_id || t.exclude);
    if (kind === 'transfer' && t.transfer_id) {
      const pair = [...state.transactions.values()].find(x => x.transfer_id === t.transfer_id && x.id !== t.id && !x.deleted);
      if (pair) { S.mode = 'transfer'; S.out = t.amount < 0 ? t : pair; S.inn = t.amount < 0 ? pair : t; S.wallet_id = S.out.wallet_id; S.to_wallet = S.inn.wallet_id; }
      else S.mode = 'other';
    } else if (kind === 'transfer' || kind === 'adjust') S.mode = 'other';
    else if (DEBT_KINDS.includes(kind)) S.mode = 'debt';
    else S.mode = kind;
  }
  Object.assign(S, preset);
  if (preset.expr) S.amount = digits(preset.expr);
  if (S.mode === 'debt' && !S.category_id) S.category_id = 'sys_debt';
  if (S.mode === 'transfer' && !S.to_wallet) { const o = alive('wallets').find(w => !w.archived && w.id !== S.wallet_id); S.to_wallet = o ? o.id : ''; }
  sheet = openSheet({
    cls: 'add full', title: id ? 'Edit transaksi' : 'Tambah transaksi',
    left: { act: 'sheet-close', html: icon('x', 22) },
    right: { act: 'add-save', label: 'Simpan' },
    html: '<div class="add-body"></div>',
    onMount: (el, sh) => {
      sheet = sh; render();
      el.addEventListener('focusin', e => { if (e.target.id === 'note') renderSuggestions(); });
      if (!id && !S.amount) { const i = el.querySelector('#amt'); if (i) i.focus({ preventScroll: true }); }
    },
    onClose: () => { S = null; sheet = null; },
  });
}

function walletRow(id, label, act) {
  const w = wallet(id);
  return `<button class="frow" data-act="${act}">${w ? walletBadge(w, 20) : `<span class="ic">${icon('wallet', 22)}</span>`}
    <span class="main ${w ? '' : 'ph'}">${label ? `<span class="small muted" style="display:block">${label}</span>` : ''}${w ? esc(w.name) : 'Pilih dompet'}</span><span class="chev">${icon('chevron-right', 18)}</span></button>`;
}

function render() {
  if (!S || !sheet) return;
  const body = sheet.el.querySelector('.add-body');
  const c = cat(S.category_id);
  const evt = alive('events').find(e => e.id === S.event_id);
  const isIncome = S.mode === 'income' || (S.mode === 'debt' && c && KINDS[c.kind] && KINDS[c.kind].sign > 0);
  const persons = [...D.persons.values()];
  body.innerHTML = `<div class="add">
    ${S.mode === 'other' ? '' : `<div class="seg">${MODES.map(([m, l]) => `<button class="${S.mode === m ? 'on' : ''}" data-act="add-mode" data-m="${m}">${l}</button>`).join('')}</div>`}
    <div class="form-card">
      ${S.mode === 'transfer' ? walletRow(S.wallet_id, 'Dari', 'add-wallet') + walletRow(S.to_wallet, 'Ke', 'add-wallet2') : walletRow(S.wallet_id, '', 'add-wallet')}
      <div class="frow amt"><span class="cur">${esc(curOf())}</span><span class="main"><span class="lab">Jumlah</span>
        <input id="amt" inputmode="${curOf() === 'IDR' ? 'numeric' : 'decimal'}" autocomplete="off" placeholder="0" value="${fmtAmt(S.amount, curOf() !== 'IDR')}" data-input="add-amt" class="${S.mode === 'transfer' || S.mode === 'other' ? '' : isIncome ? 'income' : 'expense'}">
        <span class="conv">${curOf() !== 'IDR' && S.amount ? '≈ ' + rp(toIDR(S.amount, curOf())) : ''}</span></span></div>
      <div class="sugg-amt"></div>
      ${S.mode === 'transfer' ? '' : `<button class="frow" data-act="add-cat">${c ? catBadge(c, 20) : `<span class="ic cat">${icon('layers', 20)}</span>`}
        <span class="main ${c ? '' : 'ph'}" style="font-size:${c ? 17 : 20}px">${c ? esc(c.name) : 'Pilih kategori'}</span><span class="chev">${icon('chevron-right', 18)}</span></button>`}
      <div class="add-pts-slot">${ptsHint()}</div>
      ${S.mode === 'debt' ? `<div class="frow"><span class="ic">${icon('user', 22)}</span><span class="main"><input placeholder="Dengan siapa? (wajib)" value="${esc(S.person)}" data-input="add-person" list="persons" autocomplete="off"></span>
        <datalist id="persons">${persons.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist></div>` : ''}
      <div class="frow"><span class="ic">${icon('align-left', 22)}</span><span class="main"><input id="note" placeholder="Catatan" value="${esc(S.note)}" data-input="add-note" enterkeyhint="done" autocomplete="off"></span></div>
      <div class="sugg-note"></div>
      <div class="frow"><span class="ic">${icon('calendar-days', 22)}</span><div class="date-c">
        <button data-act="add-day" data-d="-1">${icon('chevron-left', 18)}</button>
        <label>${esc(dateLabel(S.date))}<input type="date" value="${S.date}" data-change="add-date"></label>
        <button data-act="add-day" data-d="1">${icon('chevron-right', 18)}</button></div></div>
    </div>
    ${S.mode === 'transfer' ? '' : S.more ? `<div class="form-card" style="margin-top:12px">
      ${`<button class="frow" data-act="add-event"><span class="ic">${icon('calendar', 22)}</span><span class="main ${evt ? '' : 'ph'}">${evt ? esc(evt.name) : 'Event / trip'}</span>${evt ? '' : `<span class="chev">${icon('chevron-right', 18)}</span>`}</button>`}
      ${S.id ? '' : `<button class="frow" data-act="add-freq"><span class="ic">${icon('repeat', 22)}</span><span class="main ${S.freq ? '' : 'ph'}">${esc(FREQS.find(f => f[0] === S.freq)[1])}</span><span class="chev">${icon('chevron-right', 18)}</span></button>
      ${S.freq ? `<button class="frow" data-act="add-until"><span class="ic">${icon('calendar', 22)}</span><span class="main">${S.until ? 'Sampai ' + esc(dateLabel(S.until).split(', ')[1]) : 'Selamanya'}</span><span class="chev">${icon('chevron-right', 18)}</span></button>` : ''}`}
      ${`<div class="frow"><span class="ic">${icon('eye-off', 22)}</span><span class="main">Jangan hitung di laporan</span><input type="checkbox" class="toggle" data-change="add-excl" ${S.exclude ? 'checked' : ''}></div>`}
    </div>` : `<button class="more-btn" data-act="add-more">Tambah detail</button>`}
    <div class="add-foot"><button class="btn" data-act="add-save">${S.id ? 'Simpan perubahan' : 'Simpan'}</button>
      ${S.id ? `<button class="btn link-danger" data-act="add-delete" style="margin-top:8px">Hapus transaksi</button>` : ''}</div>
  </div>`;
  renderSuggestions();
  updateSave();
}

function updateSave() {
  const bs = sheet ? sheet.el.querySelectorAll('[data-act=add-save]') : [];
  if (!bs.length) return;
  const ok = S.amount > 0 && S.wallet_id && (S.mode === 'transfer' ? S.to_wallet && S.to_wallet !== S.wallet_id : !!cat(S.category_id)) && (S.mode !== 'debt' || S.person.trim());
  bs.forEach(b => { b.style.opacity = ok ? '1' : '.45'; });
}

// Saran: nominal mirip → kategori + catatan; kategori terpilih → catatan yang sering dipakai.
function renderSuggestions() {
  if (!S || !sheet) return;
  const a = sheet.el.querySelector('.sugg-amt'), n = sheet.el.querySelector('.sugg-note');
  if (a) {
    const list = S.mode === 'transfer' || S.mode === 'other' || (S.category_id && S.touchedNote) ? [] :
      suggestByAmount(S.amount, { walletId: S.wallet_id, kinds: modeKinds(S.mode), date: S.date })
        .filter(s => !(s.category_id === S.category_id && s.note === S.note));
    a.innerHTML = list.length ? `<div class="sugg"><span class="k">Saran</span>${list.map((s, i) => {
      const c = cat(s.category_id);
      return `<button data-act="add-sugg" data-i="${i}">${icon(catIconName(c), 16)}<span>${esc(s.note || (c ? c.name : ''))}</span>${s.note && c ? `<span class="a">${esc(c.name)}</span>` : ''}</button>`;
    }).join('')}</div>` : '';
    a._list = list;
  }
  if (n) {
    const list = S.mode === 'transfer' || !S.category_id ? [] : suggestNotes(S.category_id, { walletId: S.wallet_id, date: S.date, typed: S.note });
    n.innerHTML = list.length && !(S.touchedNote && S.note && !document.activeElement?.matches('#note')) ? `<div class="sugg"><span class="k">Catatan</span>${list.map((s, i) =>
      `<button data-act="add-note-sugg" data-i="${i}"><span>${esc(s.note)}</span>${!S.amount && s.amount ? `<span class="a">${fmtNum(s.amount)}</span>` : ''}</button>`).join('')}</div>` : '';
    n._list = list;
  }
}
const scheduleSugg = () => { clearTimeout(suggT); suggT = setTimeout(renderSuggestions, 120); };

act('add-amt', (d, el) => {
  const dec = curOf() !== 'IDR';
  const r = parseAmt(el.value, dec);
  if (r.v <= 1e13) { S.amount = r.v; el.value = r.text; } else el.value = fmtAmt(S.amount, dec);
  try { el.setSelectionRange(el.value.length, el.value.length); } catch { }
  const conv = sheet.el.querySelector('.frow.amt .conv');
  if (conv) conv.textContent = dec && S.amount ? '≈ ' + rp(toIDR(S.amount, curOf())) : '';
  const ps = sheet.el.querySelector('.add-pts-slot'); if (ps) ps.innerHTML = ptsHint();
  updateSave(); scheduleSugg();
});
act('add-sugg', d => {
  const s = sheet.el.querySelector('.sugg-amt')._list[+d.i];
  if (!s) return;
  S.category_id = s.category_id; S.note = s.note; S.touchedNote = true;
  render();
});
act('add-note-sugg', d => {
  const s = sheet.el.querySelector('.sugg-note')._list[+d.i];
  if (!s) return;
  S.note = s.note; S.touchedNote = true;
  if (!S.amount && s.amount) S.amount = s.amount;
  render();
});
act('add-note', (d, el) => { S.note = el.value; S.touchedNote = !!el.value; scheduleSugg(); });
act('add-person', (d, el) => { S.person = el.value; updateSave(); });
act('add-mode', d => {
  if (S.mode === d.m) return;
  S.mode = d.m;
  const c = cat(S.category_id);
  if (!c || !modeKinds(S.mode).includes(c.kind)) S.category_id = S.mode === 'debt' ? 'sys_debt' : '';
  if (S.mode === 'transfer' && !S.to_wallet) { const o = alive('wallets').find(w => !w.archived && w.id !== S.wallet_id); S.to_wallet = o ? o.id : ''; }
  render();
});
act('add-cat', async () => {
  const newRow = S.mode === 'other' ? '' : `<div class="list" style="margin-top:8px"><button class="row" data-act="pick" data-id="__new"><span class="ic acc">${icon('plus', 20)}</span><div class="main"><div class="t1" style="color:var(--accent-text)">Kategori baru</div></div></button></div>`;
  let id = await pickList({ title: 'Pilih kategori', items: catItems(modeKinds(S.mode), { withSys: S.mode === 'other', grouped: true }), selected: S.category_id, search: true, full: true, top: newRow });
  if (id === '__new') id = await newCategory({ kind: S.mode === 'debt' ? 'debt' : S.mode, kindFixed: S.mode !== 'debt' });
  if (id && S) { S.category_id = id; S.touchedNote = !!S.note; render(); }
});
act('add-freq', async () => {
  const id = await pickList({ title: 'Ulangi', items: FREQS.map(([k, l]) => ({ id: k || '__none', label: l, ico: k ? 'repeat' : 'x' })), selected: S.freq || '__none' });
  if (id && S) { S.freq = id === '__none' ? '' : id; render(); }
});
act('add-until', async () => {
  const id = await pickList({ title: 'Sampai kapan?', items: [{ id: '__forever', label: 'Selamanya', ico: 'repeat' }, { id: '__date', label: S.until ? 'Sampai ' + dateLabel(S.until).split(', ')[1] : 'Pilih tanggal selesai…', ico: 'calendar' }], selected: S.until ? '__date' : '__forever' });
  if (!id || !S) return;
  if (id === '__forever') { S.until = ''; render(); return; }
  const inp = document.createElement('input'); inp.type = 'date'; inp.value = S.until || shiftDate(S.date, 365);
  inp.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => { if (inp.value && S) { S.until = inp.value; render(); } inp.remove(); });
  inp.addEventListener('blur', () => setTimeout(() => inp.remove(), 500));
  try { inp.showPicker(); } catch { inp.focus(); inp.click(); }
});
act('add-wallet', async () => {
  const id = await pickList({ title: 'Pilih dompet', items: walletItems(), selected: S.wallet_id });
  if (id && S) { const was = curOf(); S.wallet_id = id; if (id === S.to_wallet) S.to_wallet = ''; if (curOf() === 'IDR' && was !== 'IDR') S.amount = Math.round(S.amount); render(); }
});
act('add-wallet2', async () => {
  const id = await pickList({ title: 'Ke dompet', items: walletItems({ exclude: S.wallet_id }), selected: S.to_wallet });
  if (id && S) { S.to_wallet = id; render(); }
});
act('add-date', (d, el) => { if (el.value) { S.date = el.value; render(); } });
act('add-day', d => { S.date = shiftDate(S.date, +d.d); render(); });
act('add-more', () => { S.more = true; render(); });
act('add-excl', (d, el) => { S.exclude = el.checked; });
act('add-event', async () => {
  const items = [{ id: '__none', label: 'Tanpa event', ico: 'x' }, ...alive('events').map(e => ({ id: e.id, ico: 'calendar', label: e.name, sub: e.active ? 'Aktif' : '' }))];
  const id = await pickList({ title: 'Event', items, selected: S.event_id || '__none' });
  if (id && S) { S.event_id = id === '__none' ? '' : id; render(); }
});
act('add-delete', async () => {
  if (!S || !S.id) return;
  if (!confirm('Hapus transaksi ini?')) return;
  await removeTxn(S.id);
  closeSheet(sheet);
  toast('Dihapus');
});
act('add-save', () => submit());

async function submit() {
  const amt = S.amount;
  if (!amt) return toast('Isi nominal dulu');
  if (!S.wallet_id) return toast('Pilih dompet dulu');
  const base = { date: S.date, note: S.note.trim(), event_id: S.event_id, exclude: S.exclude };
  if (S.mode === 'transfer') {
    if (!S.to_wallet || S.to_wallet === S.wallet_id) return toast('Pilih dompet tujuan yang beda');
    const tid = S.out?.transfer_id || uid('tf');
    await save('transactions', [
      { ...(S.out || {}), ...base, exclude: false, event_id: '', id: S.out?.id, amount: -amt, category_id: 'sys_tout', wallet_id: S.wallet_id, transfer_id: tid, person: '' },
      { ...(S.inn || {}), ...base, exclude: false, event_id: '', id: S.inn?.id, amount: amt, category_id: 'sys_tin', wallet_id: S.to_wallet, transfer_id: tid, person: '' },
    ]);
  } else {
    const c = cat(S.category_id);
    if (!c) return toast('Pilih kategori dulu');
    if (S.mode === 'debt' && !S.person.trim()) return toast('Isi nama orangnya');
    let sign = KINDS[c.kind] ? KINDS[c.kind].sign : -1;
    if (c.id === 'sys_tout') sign = -1; else if (c.id === 'sys_tin') sign = 1; else if (!sign) sign = S.sign;
    const prev = S.id ? state.transactions.get(S.id) : {};
    let recurring_id = prev && prev.recurring_id || '';
    if (!S.id && S.freq) {
      // Transaksi ini = kejadian pertama; aturan berulang mulai dari jadwal berikutnya.
      const [rule] = await save('recurring', [{ name: S.note.trim() || c.name, amount: sign * amt, category_id: c.id, wallet_id: S.wallet_id, note: S.note.trim(),
        person: S.person.trim(), freq: S.freq, interval: 1, next_date: nextDate(S.date, S.freq, 1), end_date: S.until || '', active: true }]);
      recurring_id = rule.id;
    }
    await save('transactions', [{ ...prev, ...base, id: S.id || undefined, amount: sign * amt, category_id: c.id, wallet_id: S.wallet_id, person: S.person.trim(), recurring_id }]);
  }
  if (state.config.lastWallet !== S.wallet_id) saveConfig({ lastWallet: S.wallet_id });
  const edited = !!S.id, freq = S.mode === 'transfer' ? '' : S.freq;
  closeSheet(sheet);
  toast(edited ? 'Perubahan disimpan' : freq ? 'Tersimpan, ' + FREQS.find(f => f[0] === freq)[1].toLowerCase() : 'Tersimpan');
}

export const refreshAdd = () => { if (S && sheet) render(); };
