// Pemilih ikon + warna, dan form kategori baru (dipakai dari form transaksi dan halaman Kategori).
import { state, alive, save, KINDS } from './store.js';
import { esc, openSheet, closeSheet, toast, act } from './ui.js';
import { icon, badge, PICKER_ICONS, PALETTE, catIconName, catColor, joinIcon } from './icons.js';
import { expenseGroups, INCOME_GROUPS, defaultGroup } from './plan.js';

let P = null; // state sheet yang sedang terbuka

function grid(sel, color) {
  return `<div class="icon-grid">${PICKER_ICONS.map(n => `<button data-act="ic-pick" data-n="${n}" class="${n === sel ? 'on' : ''}" style="--ic:var(--${color})">${icon(n, 22)}</button>`).join('')}</div>`;
}
const swatches = sel => `<div class="swatches">${PALETTE.map(c => `<button data-act="ic-col" data-c="${c}" class="${c === sel ? 'on' : ''}" style="--sw:var(--${c})" aria-label="${c}"></button>`).join('')}</div>`;

function renderBody() {
  if (!P) return;
  const b = P.sheet.el.querySelector('.ic-body');
  const groups = P.kind === 'expense' ? expenseGroups() : P.kind === 'income' ? INCOME_GROUPS.map(g => g[0]) : [];
  b.innerHTML = `<div class="icon-preview">${badge(P.name, P.color, 30)}</div>
    ${P.form ? `<div class="list">
      <div class="field"><label>Nama</label><input data-input="ic-name" value="${esc(P.label)}" placeholder="Nama kategori" autocomplete="off"></div>
      ${P.kindFixed ? '' : `<div class="field"><label>Jenis</label><select data-change="ic-kind">${['expense', 'income', 'debt', 'loan', 'repayment', 'collection'].map(k => `<option value="${k}" ${k === P.kind ? 'selected' : ''}>${esc(KINDS[k].label)}</option>`).join('')}</select></div>`}
      ${groups.length ? `<div class="field"><label>Grup laporan</label><select data-change="ic-group">${[...new Set([...groups, P.group].filter(Boolean))].map(g => `<option value="${esc(g)}" ${g === P.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}<option value="__new">+ Grup baru…</option></select></div>` : ''}
    </div>` : ''}
    <div class="section-h">Warna</div>${swatches(P.color)}
    <div class="section-h">Ikon</div>${grid(P.name, P.color)}
    <div class="add-foot"><button class="btn" data-act="ic-save">${P.form ? 'Simpan kategori' : 'Pakai ikon ini'}</button></div>`;
}

// Pilih ikon & warna. current: { name, color }. Hasil: { name, color } atau null.
export function pickIcon(current) {
  return new Promise(resolve => {
    P = { name: current.name || 'package', color: current.color || 'c9', form: false, resolve };
    P.sheet = openSheet({ title: 'Ikon & warna', cls: 'full', right: { act: 'ic-save', label: 'Pakai' }, html: '<div class="ic-body"></div>',
      onMount: (el, sh) => { P.sheet = sh; renderBody(); }, onClose: v => { const r = P && P.resolve; P = null; r && r(v || null); } });
  });
}

// Bikin kategori baru. Hasil: id kategori baru atau null.
export function newCategory({ kind = 'expense', kindFixed = true, name = '' } = {}) {
  return new Promise(resolve => {
    const group = defaultGroup(name, kind);
    P = { name: 'package', color: kind === 'income' ? 'c5' : 'c0', form: true, kind, kindFixed, label: name, group: kind === 'expense' && group === 'Belum Terkategori' ? 'Food' : group, resolve };
    P.sheet = openSheet({ title: 'Kategori baru', cls: 'full', right: { act: 'ic-save', label: 'Simpan' }, html: '<div class="ic-body"></div>',
      onMount: (el, sh) => { P.sheet = sh; renderBody(); setTimeout(() => el.querySelector('[data-input=ic-name]')?.focus({ preventScroll: true }), 50); },
      onClose: v => { const r = P && P.resolve; P = null; r && r(v || null); } });
  });
}

act('ic-pick', d => { P.name = d.n; renderBody(); });
act('ic-col', d => { P.color = d.c; renderBody(); });
act('ic-name', (d, el) => { P.label = el.value; });
act('ic-kind', (d, el) => { P.kind = el.value; P.group = defaultGroup(P.label, P.kind); renderBody(); });
act('ic-group', (d, el) => {
  if (el.value === '__new') { const g = prompt('Nama grup baru:'); if (g && g.trim()) P.group = g.trim(); renderBody(); return; }
  P.group = el.value;
});
act('ic-save', async () => {
  if (!P) return;
  if (!P.form) return closeSheet(P.sheet, { name: P.name, color: P.color });
  const name = (P.label || '').trim();
  if (!name) return toast('Isi nama kategori');
  if (alive('categories').some(c => c.kind === P.kind && c.name.toLowerCase() === name.toLowerCase())) return toast('Kategori itu sudah ada');
  const [row] = await save('categories', [{ name, kind: P.kind, group: P.group || '', icon: joinIcon(P.name, P.color), sort: 0 }]);
  toast('Kategori dibuat');
  closeSheet(P.sheet, row.id);
});
