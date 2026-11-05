/**
 * Duit — backend Google Apps Script
 * Spreadsheet ini adalah master data. App di HP sync ke sini lewat doPost.
 *
 * Cara pasang: lihat README.md di repo.
 * Jangan ubah urutan kolom yang sudah ada. Boleh tambah kolom baru di paling kanan.
 */

var TABLES = {
  transactions: ['id', 'date', 'amount', 'category_id', 'wallet_id', 'note', 'person', 'event_id',
    'transfer_id', 'recurring_id', 'exclude', 'created_at', 'updated_at', 'deleted'],
  wallets: ['id', 'name', 'type', 'currency', 'initial_balance', 'exclude_total', 'archived',
    'sort', 'color', 'updated_at', 'deleted'],
  categories: ['id', 'name', 'kind', 'parent_id', 'icon', 'sort', 'updated_at', 'deleted'],
  budgets: ['id', 'name', 'category_ids', 'wallet_id', 'amount', 'start_month', 'end_month',
    'updated_at', 'deleted'],
  recurring: ['id', 'name', 'amount', 'category_id', 'wallet_id', 'note', 'person', 'freq',
    'interval', 'next_date', 'end_date', 'active', 'updated_at', 'deleted'],
  events: ['id', 'name', 'icon', 'start_date', 'end_date', 'active', 'updated_at', 'deleted']
};

// Kolom bantu yang diisi server supaya sheet Transactions enak dibaca / di-pivot.
var EXTRA = {
  transactions: ['category_name', 'category_kind', 'wallet_name', 'event_name']
};

var SHEET_NAMES = {
  transactions: 'Transactions', wallets: 'Wallets', categories: 'Categories',
  budgets: 'Budgets', recurring: 'Recurring', events: 'Events'
};

var DATE_FIELDS = { date: 1, next_date: 1, end_date: 1, start_date: 1 };
var NUM_FIELDS = { amount: 1, initial_balance: 1, sort: 1, interval: 1 };
var BOOL_FIELDS = { exclude: 1, exclude_total: 1, archived: 1, active: 1, deleted: 1 };

function columnsFor(table) {
  return TABLES[table].concat(EXTRA[table] || []).concat(['_synced']);
}

// ---------- Setup ----------

function setup() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Asia/Jakarta');
  Object.keys(TABLES).forEach(function (t) { ensureSheet(ss, t); });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    props.setProperty('TOKEN', token);
  }
  Logger.log('Setup selesai. TOKEN kamu: ' + token);
  return token;
}

function ensureSheet(ss, table) {
  var name = SHEET_NAMES[table];
  var sh = ss.getSheetByName(name);
  var cols = columnsFor(table);
  if (!sh) sh = ss.insertSheet(name);
  var header = sh.getRange(1, 1, 1, cols.length);
  header.setValues([cols]).setFontWeight('bold').setBackground('#f1f3f4');
  sh.setFrozenRows(1);
  formatColumns(sh, table, 2, sh.getMaxRows() - 1);
  return sh;
}

function formatColumns(sh, table, fromRow, n) {
  var cols = columnsFor(table);
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  cols.forEach(function (c, i) {
    var col = sh.getRange(fromRow, i + 1, n, 1);
    if (DATE_FIELDS[c]) col.setNumberFormat('yyyy-mm-dd');
    else if (c === 'amount' || c === 'initial_balance') col.setNumberFormat('#,##0');
    else if (NUM_FIELDS[c] || c === '_synced') col.setNumberFormat('0');
    else if (BOOL_FIELDS[c]) col.setNumberFormat('General');
    else col.setNumberFormat('@'); // teks polos: catatan "1/2" tidak berubah jadi tanggal
  });
}

// Menu kecil di spreadsheet untuk lihat token lagi.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Duit')
    .addItem('Tampilkan token', 'showToken')
    .addItem('Buat token baru', 'resetToken')
    .addToUi();
}

function showToken() {
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN') || setup();
  try { SpreadsheetApp.getUi().alert('Token Duit:\n\n' + token); } catch (e) { Logger.log(token); }
}

function resetToken() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  showToken();
}

// Kalau kamu edit langsung di sheet, tandai barisnya supaya app ikut narik perubahannya.
function onEdit(e) {
  try {
    var sh = e.range.getSheet();
    var table = tableForSheet(sh.getName());
    if (!table) return;
    var startRow = e.range.getRow(), n = e.range.getNumRows();
    if (startRow + n - 1 < 2) return;
    if (startRow < 2) { n -= (2 - startRow); startRow = 2; }
    var cols = columnsFor(table);
    var cId = cols.indexOf('id') + 1, cUpd = cols.indexOf('updated_at') + 1, cSync = cols.indexOf('_synced') + 1;
    var ids = sh.getRange(startRow, cId, n, 1).getValues();
    var now = new Date().toISOString(), stamp = Date.now();
    var upd = [], syn = [];
    for (var i = 0; i < n; i++) {
      if (!ids[i][0]) ids[i][0] = 'x' + stamp.toString(36) + Math.random().toString(36).slice(2, 6);
      upd.push([now]); syn.push([stamp]);
    }
    sh.getRange(startRow, cId, n, 1).setValues(ids);
    sh.getRange(startRow, cUpd, n, 1).setValues(upd);
    sh.getRange(startRow, cSync, n, 1).setValues(syn);
  } catch (err) { /* edit manual tetap jalan walau ini gagal */ }
}

function tableForSheet(name) {
  for (var t in SHEET_NAMES) if (SHEET_NAMES[t] === name) return t;
  return null;
}

// ---------- API ----------

function doGet() {
  return json({ ok: true, app: 'duit', message: 'API jalan. App pakai POST.' });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'bad_json' }); }
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || body.token !== token) return json({ ok: false, error: 'unauthorized' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return json({ ok: false, error: 'busy' });
  try {
    var ss = SpreadsheetApp.getActive();
    var out = { ok: true };
    var stamp = Date.now();
    if (body.action === 'ping') {
      out.pong = true;
    } else if (body.action === 'push' || body.action === 'sync') {
      out.pushed = push(ss, body.changes || {}, stamp);
      out.stamp = stamp;
      if (body.action === 'sync') {
        var skip = (body.skip_stamps || []).concat([stamp]);
        out.data = pull(ss, Number(body.since) || 0, skip);
      }
    } else if (body.action === 'pull') {
      out.data = pull(ss, Number(body.since) || 0, []);
    } else {
      return json({ ok: false, error: 'unknown_action' });
    }
    out.server_time = Date.now();
    return json(out);
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Push (upsert by id) ----------

var TZ = 'Asia/Jakarta';

function push(ss, changes, stamp) {
  TZ = ss.getSpreadsheetTimeZone();
  var counts = {};
  var lookups = null;
  // Master tables dulu, supaya nama kategori/dompet baru sudah ada saat transaksi ditulis.
  var order = ['wallets', 'categories', 'events', 'budgets', 'recurring', 'transactions'];
  order.forEach(function (t) {
    var rows = changes[t];
    if (!rows || !rows.length) return;
    var sh = ss.getSheetByName(SHEET_NAMES[t]) || ensureSheet(ss, t);
    var cols = columnsFor(t);
    if (t === 'transactions') lookups = buildLookups(ss);
    var lastRow = sh.getLastRow();
    var index = {};
    if (lastRow > 1) {
      var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) if (ids[i][0] !== '') index[String(ids[i][0])] = i + 2;
    }
    var updates = [], inserts = [], insertAt = {};
    rows.forEach(function (r) {
      if (!r || !r.id) return;
      var vals = toRow(t, r, cols, stamp, lookups);
      var at = index[String(r.id)];
      if (at) updates.push([at, vals]);
      else if (insertAt[r.id] !== undefined) inserts[insertAt[r.id]] = vals;
      else { insertAt[r.id] = inserts.length; inserts.push(vals); }
    });
    if (updates.length > 40 && lastRow > 1) {
      var data = sh.getRange(2, 1, lastRow - 1, cols.length).getValues();
      updates.forEach(function (u) { data[u[0] - 2] = u[1]; });
      sh.getRange(2, 1, data.length, cols.length).setValues(data);
    } else {
      updates.forEach(function (u) { sh.getRange(u[0], 1, 1, cols.length).setValues([u[1]]); });
    }
    if (inserts.length) {
      ensureRows(sh, t, lastRow + inserts.length);
      sh.getRange(lastRow + 1, 1, inserts.length, cols.length).setValues(inserts);
    }
    counts[t] = rows.length;
  });
  // Rename kategori/dompet/event: isi ulang kolom nama di Transactions.
  if ((changes.categories && changes.categories.length) || (changes.wallets && changes.wallets.length) ||
      (changes.events && changes.events.length)) {
    refreshNames(ss);
  }
  return counts;
}

function toRow(table, r, cols, stamp, lookups) {
  return cols.map(function (c) {
    if (c === '_synced') return stamp;
    if (c === 'category_name') return lookups ? (lookups.cat[r.category_id] || {}).name || '' : '';
    if (c === 'category_kind') return lookups ? (lookups.cat[r.category_id] || {}).kind || '' : '';
    if (c === 'wallet_name') return lookups ? lookups.wallet[r.wallet_id] || '' : '';
    if (c === 'event_name') return lookups ? lookups.event[r.event_id] || '' : '';
    var v = r[c];
    if (v === undefined || v === null) return '';
    if (BOOL_FIELDS[c]) return v === true || v === 'true' || v === 'TRUE' || v === 1;
    if (NUM_FIELDS[c]) { var n = Number(v); return isNaN(n) ? '' : n; }
    if (DATE_FIELDS[c]) {
      var ds = String(v).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return '';
      return Utilities.parseDate(ds, TZ, 'yyyy-MM-dd'); // tanggal asli, bisa di-pivot
    }
    return String(v);
  });
}

// Tambah baris kosong (dengan format kolom yang sama) kalau sheet hampir penuh.
function ensureRows(sh, table, needLastRow) {
  var max = sh.getMaxRows();
  if (needLastRow <= max) return;
  var add = needLastRow - max + 1000;
  sh.insertRowsAfter(max, add);
  formatColumns(sh, table, max + 1, add);
}

function buildLookups(ss) {
  var L = { cat: {}, wallet: {}, event: {} };
  readObjects(ss, 'categories').forEach(function (c) { L.cat[c.id] = { name: c.name, kind: c.kind }; });
  readObjects(ss, 'wallets').forEach(function (w) { L.wallet[w.id] = w.name; });
  readObjects(ss, 'events').forEach(function (e) { L.event[e.id] = e.name; });
  return L;
}

function refreshNames(ss) {
  var sh = ss.getSheetByName(SHEET_NAMES.transactions);
  if (!sh) return;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  var cols = columnsFor('transactions');
  var L = buildLookups(ss);
  var n = lastRow - 1;
  var cat = sh.getRange(2, cols.indexOf('category_id') + 1, n, 1).getValues();
  var wal = sh.getRange(2, cols.indexOf('wallet_id') + 1, n, 1).getValues();
  var evt = sh.getRange(2, cols.indexOf('event_id') + 1, n, 1).getValues();
  var out = [];
  for (var i = 0; i < n; i++) {
    var c = L.cat[cat[i][0]] || {};
    out.push([c.name || '', c.kind || '', L.wallet[wal[i][0]] || '', L.event[evt[i][0]] || '']);
  }
  sh.getRange(2, cols.indexOf('category_name') + 1, n, 4).setValues(out);
}

// ---------- Pull ----------

function pull(ss, since, skipStamps) {
  var skip = {};
  (skipStamps || []).forEach(function (s) { skip[s] = 1; });
  var data = {};
  Object.keys(TABLES).forEach(function (t) {
    var sh = ss.getSheetByName(SHEET_NAMES[t]);
    if (!sh) { data[t] = []; return; }
    var lastRow = sh.getLastRow();
    if (lastRow < 2) { data[t] = []; return; }
    var cols = columnsFor(t);
    var cSync = cols.indexOf('_synced');
    // Baca kolom _synced dulu; baca baris lengkap hanya kalau ada yang berubah.
    var stamps = sh.getRange(2, cSync + 1, lastRow - 1, 1).getValues();
    var hit = false;
    for (var i = 0; i < stamps.length; i++) {
      var s = Number(stamps[i][0]) || 0;
      if (s > since && !skip[s]) { hit = true; break; }
    }
    if (!hit) { data[t] = []; return; }
    var values = sh.getRange(2, 1, lastRow - 1, TABLES[t].length).getValues();
    var tz = ss.getSpreadsheetTimeZone();
    var rows = [];
    for (var j = 0; j < values.length; j++) {
      var st = Number(stamps[j][0]) || 0;
      if (!(st > since) || skip[st]) continue;
      var o = rowToObject(t, values[j], tz);
      if (o.id) rows.push(o);
    }
    data[t] = rows;
  });
  return data;
}

function readObjects(ss, t) {
  var sh = ss.getSheetByName(SHEET_NAMES[t]);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, TABLES[t].length).getValues();
  var tz = ss.getSpreadsheetTimeZone();
  return values.map(function (v) { return rowToObject(t, v, tz); });
}

function rowToObject(t, row, tz) {
  var o = {};
  TABLES[t].forEach(function (c, i) {
    var v = row[i];
    if (v instanceof Date) v = DATE_FIELDS[c] ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v.toISOString();
    else if (BOOL_FIELDS[c]) v = v === true || v === 'TRUE' || v === 'true';
    else if (NUM_FIELDS[c]) v = v === '' ? null : Number(v);
    else v = v === null || v === undefined ? '' : String(v);
    o[c] = v;
  });
  return o;
}
