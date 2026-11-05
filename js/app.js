import { init, onChange, state, sync, runRecurring, alive, seedDefaultCategories } from './store.js';
import { bindActions, act, refreshPages, toast } from './ui.js';
import { V, renderHome, renderTxns, renderReport, renderMore, newWallet } from './views.js';
import { openAdd } from './add.js';

const VIEWS = { home: renderHome, txns: renderTxns, report: renderReport, more: renderMore };
const scrollPos = {};

function render() {
  const el = document.getElementById('view-' + V.tab);
  // Pertahankan fokus input (mis. kolom cari) saat re-render.
  const a = document.activeElement;
  const focusKey = a && el.contains(a) && a.dataset && a.dataset.input;
  const sel = focusKey ? [a.selectionStart, a.selectionEnd] : null;
  el.innerHTML = VIEWS[V.tab]();
  if (focusKey) { const i = el.querySelector(`[data-input="${focusKey}"]`); if (i) { i.focus(); try { i.setSelectionRange(...sel); } catch { } } }
  document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === V.tab));
}
window.__render = render;

function showTab(tab) {
  const cur = document.getElementById('view-' + V.tab);
  scrollPos[V.tab] = cur.scrollTop;
  if (V.tab === tab) { cur.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  cur.classList.add('hidden');
  V.tab = tab;
  const el = document.getElementById('view-' + tab);
  el.classList.remove('hidden');
  render();
  el.scrollTop = scrollPos[tab] || 0;
}

act('tab', d => showTab(d.tab));
act('add', async () => {
  if (!alive('wallets').some(w => !w.archived)) { toast('Bikin dompet dulu ya'); return newWallet(); }
  if (!alive('categories').some(c => !c.id.startsWith('sys_'))) await seedDefaultCategories();
  openAdd();
});

async function boot() {
  await init();
  bindActions(document.getElementById('app'));
  document.addEventListener('touchstart', () => { }, { passive: true }); // aktifkan :active di iOS
  render();
  let queued = false;
  onChange(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); refreshPages(); });
  });
  runRecurring();
  sync();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { runRecurring(); sync(); }
  });
  window.addEventListener('online', () => sync());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { });
}

boot().catch(e => {
  document.getElementById('app').innerHTML = `<div class="empty">Gagal membuka app: ${String(e && e.message || e)}</div>`;
  console.error(e);
});
