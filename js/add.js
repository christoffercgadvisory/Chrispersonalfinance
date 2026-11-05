import { state, D, KINDS, DEBT_KINDS, cat, wallet, alive, save, removeTxn, today, uid, saveConfig } from './store.js';
import { esc, rp, fmtNum, openSheet, closeSheet, pickCategory, pickWallet, pickList, toast, act, dayLabel, catItems, walletIcon } from './ui.js';

const MODES = [['expense', 'Keluar'], ['income', 'Masuk'], ['transfer', 'Transfer'], ['debt', 'Hutang']];
let S = null; // state form yang sedang terbuka
let sheet = null;

const modeKinds = m => m === 'debt' ? DEBT_KINDS : m === 'other' ? ['transfer', 'adjust'] : [m];

function evalExpr(e) {
  const parts = e.match(/[+−]?\d+/g);
  if (!parts) return 0;
  return parts.reduce((s, p) => s + (p[0] === '−' ? -Number(p.slice(1)) : Number(p.replace('+', ''))), 0);
}

function defaultWallet() {
  const w = wallet(state.config.lastWallet);
  if (w && !w.deleted && !w.archived) return w.id;
  const list = alive('wallets').filter(x => !x.archived).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  return list[0] ? list[0].id : '';
}

function topCats(mode) {
  const kinds = modeKinds(mode);
  let list = alive('categories').filter(c => kinds.includes(c.kind) && (mode !== 'other' || c.id.startsWith('sys_')));
  if (mode === 'debt') list.sort((a, b) => DEBT_KINDS.indexOf(a.kind) - DEBT_KINDS.indexOf(b.kind) || (a.id.startsWith('sys_') ? -1 : 1));
  else list.sort((a, b) => (D.usage.get(b.id) || 0) - (D.usage.get(a.id) || 0) || (a.sort || 0) - (b.sort || 0));
  const n = mode === 'debt' || mode === 'other' ? 8 : 7;
  let top = list.slice(0, n);
  if (S.category_id && !top.find(c => c.id === S.category_id)) { const c = cat(S.category_id); if (c) top = [c, ...top.slice(0, n - 1)]; }
  return { top, more: list.length > n };
}

export function openAdd(id = null, preset = {}) {
  const t = id ? state.transactions.get(id) : null;
  S = { id, expr: '', mode: 'expense', category_id: '', wallet_id: defaultWallet(), to_wallet: '', date: today(),
    note: '', person: '', event_id: '', pair: null, sign: -1 };
  const activeEvent = alive('events').find(e => e.active);
  if (activeEvent && !t) S.event_id = activeEvent.id;
  if (t) {
    const c = cat(t.category_id);
    const kind = c ? c.kind : (t.amount < 0 ? 'expense' : 'income');
    Object.assign(S, { expr: String(Math.abs(Math.round(t.amount))), category_id: t.category_id, wallet_id: t.wallet_id,
      date: t.date, note: t.note || '', person: t.person || '', event_id: t.event_id || '', sign: t.amount < 0 ? -1 : 1 });
    if (kind === 'transfer' && t.transfer_id) {
      const pair = [...state.transactions.values()].find(x => x.transfer_id === t.transfer_id && x.id !== t.id && !x.deleted);
      if (pair) {
        S.mode = 'transfer'; S.pair = pair;
        const out = t.amount < 0 ? t : pair, inn = t.amount < 0 ? pair : t;
        S.out = out; S.inn = inn; S.wallet_id = out.wallet_id; S.to_wallet = inn.wallet_id;
      } else S.mode = 'other';
    } else if (kind === 'transfer' || kind === 'adjust') S.mode = 'other';
    else if (DEBT_KINDS.includes(kind)) S.mode = 'debt';
    else S.mode = kind;
  }
  Object.assign(S, preset);
  if (S.mode === 'transfer' && !S.to_wallet) {
    const other = alive('wallets').find(w => !w.archived && w.id !== S.wallet_id);
    S.to_wallet = other ? other.id : '';
  }
  sheet = openSheet({
    cls: 'add', head: true, title: id ? 'Edit transaksi' : '',
    left: { act: 'sheet-close', label: 'Batal' },
    right: id ? { act: 'add-delete', label: 'Hapus' } : null,
    html: '<div class="add-body"></div>',
    onMount: (el, sh) => { sheet = sh; el.querySelector('.sheet-head .navbtn.bold')?.style.setProperty('color', 'var(--red)'); render(); bindPad(el); },
    onClose: () => { S = null; sheet = null; },
  });
}

function render() {
  if (!S || !sheet) return;
  const body = sheet.el.querySelector('.add-body');
  const val = evalExpr(S.expr);
  const isIncome = S.mode === 'income' || (S.mode === 'debt' && KINDS[cat(S.category_id)?.kind]?.sign > 0);
  const events = alive('events');
  const evt = events.find(e => e.id === S.event_id);
  const w = wallet(S.wallet_id), w2 = wallet(S.to_wallet);
  let mid = '';
  if (S.mode === 'transfer') {
    mid = `<div class="transfer-pick">
      <button data-act="add-wallet"><div class="k">Dari</div><div class="n">${w ? walletIcon(w) + ' ' + esc(w.name) : 'Pilih'}</div></button>
      <button data-act="add-swap" style="background:none;padding:4px;color:var(--accent);font-size:20px">⇄</button>
      <button data-act="add-wallet2"><div class="k">Ke</div><div class="n">${w2 ? walletIcon(w2) + ' ' + esc(w2.name) : 'Pilih'}</div></button></div>`;
  } else {
    const { top, more } = topCats(S.mode);
    mid = `<div class="cats">${top.map(c => `<button class="cat ${c.id === S.category_id ? 'on' : ''}" data-act="add-cat" data-id="${c.id}">
      <span class="e">${esc(c.icon || '•')}</span><span>${esc(c.name)}</span></button>`).join('')}
      ${more || !top.length ? `<button class="cat" data-act="add-cat-more"><span class="e">⋯</span><span>${top.length ? 'Lainnya' : 'Pilih kategori'}</span></button>` : ''}</div>`;
  }
  body.innerHTML = `
    ${S.mode === 'other' ? '' : `<div class="seg" style="margin-top:2px">${MODES.map(([m, l]) => `<button class="${S.mode === m ? 'on' : ''}" data-act="add-mode" data-m="${m}">${l}</button>`).join('')}</div>`}
    <div class="amount"><div class="expr num">${/[+−]/.test(S.expr) ? esc(S.expr.replace(/\B(?=(\d{3})+(?!\d))/g, '.')) : ''}</div>
      <div class="val num ${!val ? 'zero' : isIncome ? 'income' : ''}">Rp ${fmtNum(Math.abs(val))}</div></div>
    ${mid}
    <div class="meta">
      ${S.mode !== 'transfer' ? `<button class="chip ${w ? 'set' : ''}" data-act="add-wallet">${w ? walletIcon(w) + ' ' + esc(w.name) : '👛 Pilih dompet'}</button>` : ''}
      <label class="chip set">📅 ${esc(dayLabel(S.date))}<input type="date" value="${S.date}" data-change="add-date"></label>
      ${S.date !== today() ? '' : `<button class="chip" data-act="add-yesterday">Kemarin</button>`}
      ${events.length && S.mode !== 'transfer' ? `<button class="chip ${evt ? 'set' : ''}" data-act="add-event">${evt ? esc((evt.icon || '🎟️') + ' ' + evt.name) : '🎟️ Event'}</button>` : ''}
    </div>
    ${S.mode === 'debt' ? `<div class="note-in"><input placeholder="Dengan siapa? (wajib)" value="${esc(S.person)}" data-input="add-person" list="persons" autocomplete="off">
      <datalist id="persons">${[...D.persons.values()].map(p => `<option value="${esc(p.name)}">`).join('')}</datalist></div>` : ''}
    <div class="note-in"><input placeholder="Catatan" value="${esc(S.note)}" data-input="add-note" enterkeyhint="done" autocomplete="off"></div>
    <div class="pad">
      ${['1', '2', '3', '⌫', '4', '5', '6', '+', '7', '8', '9', '−'].map(k => `<button data-k="${k}" class="${/[⌫+−]/.test(k) ? 'fn' : ''}">${k}</button>`).join('')}
      <button data-k="000">000</button><button data-k="0">0</button><button class="save" data-k="save">${S.id ? 'Simpan' : 'Simpan'}</button>
    </div>`;
}

// Numpad merespon di pointerdown supaya terasa instan.
function bindPad(el) {
  el.addEventListener('pointerdown', e => {
    const b = e.target.closest('.pad button');
    if (!b) return;
    e.preventDefault();
    b.classList.add('pressed');
    const up = () => { b.classList.remove('pressed'); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    key(b.dataset.k);
  });
}

function key(k) {
  if (!S) return;
  if (k === 'save') return submit();
  if (k === '⌫') S.expr = S.expr.slice(0, -1);
  else if (k === '+' || k === '−') { if (!S.expr) return; S.expr = S.expr.replace(/[+−]$/, '') + k; }
  else {
    const lastNum = S.expr.split(/[+−]/).pop();
    if (lastNum.length >= 13) return;
    if (lastNum === '' && (k === '0' || k === '000')) return;
    S.expr += k;
  }
  updateAmount();
}

function updateAmount() {
  const v = evalExpr(S.expr);
  const box = sheet.el.querySelector('.amount');
  box.querySelector('.expr').textContent = /[+−]/.test(S.expr) ? S.expr.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
  const vEl = box.querySelector('.val');
  vEl.textContent = 'Rp ' + fmtNum(Math.abs(v));
  vEl.classList.toggle('zero', !v);
}

act('add-mode', d => {
  if (S.mode === d.m) return;
  S.mode = d.m;
  const c = cat(S.category_id);
  if (!c || !modeKinds(S.mode).includes(c.kind)) S.category_id = S.mode === 'debt' ? 'sys_debt' : '';
  if (S.mode === 'transfer' && !S.to_wallet) { const o = alive('wallets').find(w => !w.archived && w.id !== S.wallet_id); S.to_wallet = o ? o.id : ''; }
  render();
});
act('add-cat', d => { S.category_id = d.id; render(); });
act('add-cat-more', async () => {
  const id = await pickList({ title: 'Kategori', items: catItems(modeKinds(S.mode), { withSys: S.mode === 'other' }), selected: S.category_id, search: true });
  if (id && S) { S.category_id = id; render(); }
});
act('add-wallet', async () => { const id = await pickWallet(S.wallet_id); if (id && S) { S.wallet_id = id; if (id === S.to_wallet) S.to_wallet = ''; render(); } });
act('add-wallet2', async () => { const id = await pickWallet(S.to_wallet, S.wallet_id); if (id && S) { S.to_wallet = id; render(); } });
act('add-swap', () => { [S.wallet_id, S.to_wallet] = [S.to_wallet, S.wallet_id]; render(); });
act('add-date', (d, el) => { if (el.value) { S.date = el.value; render(); } });
act('add-yesterday', () => { const y = new Date(); y.setDate(y.getDate() - 1); S.date = y.toISOString().slice(0, 10); const p = n => String(n).padStart(2, '0'); S.date = y.getFullYear() + '-' + p(y.getMonth() + 1) + '-' + p(y.getDate()); render(); });
act('add-event', async () => {
  const items = [{ id: '__none', label: 'Tanpa event', icon: '—' }, ...alive('events').map(e => ({ id: e.id, icon: e.icon || '🎟️', label: e.name, sub: e.active ? 'Aktif' : '' }))];
  const id = await pickList({ title: 'Event', items, selected: S.event_id || '__none' });
  if (id && S) { S.event_id = id === '__none' ? '' : id; render(); }
});
act('add-note', (d, el) => { S.note = el.value; });
act('add-person', (d, el) => { S.person = el.value; });
act('add-delete', async () => {
  if (!S || !S.id) return;
  if (!confirm('Hapus transaksi ini?')) return;
  await removeTxn(S.id);
  closeSheet(sheet);
  toast('Dihapus');
});

async function submit() {
  const amt = Math.abs(evalExpr(S.expr));
  if (!amt) return toast('Isi nominal dulu');
  if (!S.wallet_id) return toast('Pilih dompet dulu');
  const base = { date: S.date, note: S.note.trim(), event_id: S.event_id };
  if (S.mode === 'transfer') {
    if (!S.to_wallet || S.to_wallet === S.wallet_id) return toast('Pilih dompet tujuan yang beda');
    const tid = S.out?.transfer_id || uid('tf');
    const rows = [
      { ...(S.out || {}), ...base, id: S.out?.id, amount: -amt, category_id: 'sys_tout', wallet_id: S.wallet_id, transfer_id: tid, person: '' },
      { ...(S.inn || {}), ...base, id: S.inn?.id, amount: amt, category_id: 'sys_tin', wallet_id: S.to_wallet, transfer_id: tid, person: '' },
    ];
    await save('transactions', rows);
  } else {
    const c = cat(S.category_id);
    if (!c) return toast('Pilih kategori dulu');
    if (S.mode === 'debt' && !S.person.trim()) return toast('Isi nama orangnya');
    let sign = KINDS[c.kind] ? KINDS[c.kind].sign : -1;
    if (c.id === 'sys_tout') sign = -1; else if (c.id === 'sys_tin') sign = 1; else if (!sign) sign = S.sign;
    const prev = S.id ? state.transactions.get(S.id) : {};
    await save('transactions', [{ ...prev, ...base, id: S.id || undefined, amount: sign * amt, category_id: c.id, wallet_id: S.wallet_id, person: S.person.trim() }]);
  }
  if (state.config.lastWallet !== S.wallet_id) saveConfig({ lastWallet: S.wallet_id });
  const edited = !!S.id;
  closeSheet(sheet);
  toast(edited ? 'Perubahan disimpan' : 'Tersimpan ✓');
}

export const refreshAdd = () => { if (S && sheet) render(); };
