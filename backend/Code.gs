/**
 * Duit - backend Google Apps Script
 * Spreadsheet ini adalah master data. App di HP sync ke sini lewat doPost.
 *
 * Cara pasang: lihat README.md di repo.
 * Kolom dibaca berdasarkan nama header, jadi kolom boleh digeser dan kamu boleh
 * tambah kolom sendiri (rumus, catatan). Jangan ganti nama header bawaan.
 */

var TABLES = {
  transactions: ['id', 'date', 'amount', 'category_id', 'wallet_id', 'note', 'person', 'event_id',
    'transfer_id', 'recurring_id', 'exclude', 'created_at', 'updated_at', 'deleted'],
  wallets: ['id', 'name', 'type', 'currency', 'initial_balance', 'exclude_total', 'archived',
    'sort', 'color', 'updated_at', 'deleted'],
  categories: ['id', 'name', 'kind', 'group', 'parent_id', 'icon', 'sort', 'updated_at', 'deleted'],
  budgets: ['id', 'name', 'category_ids', 'wallet_id', 'amount', 'start_month', 'end_month',
    'updated_at', 'deleted'],
  recurring: ['id', 'name', 'amount', 'category_id', 'wallet_id', 'note', 'person', 'freq',
    'interval', 'next_date', 'end_date', 'active', 'updated_at', 'deleted'],
  events: ['id', 'name', 'icon', 'start_date', 'end_date', 'active', 'updated_at', 'deleted'],
  settings: ['id', 'value', 'updated_at', 'deleted']
};

// Kolom bantu yang diisi server supaya sheet Transactions enak dibaca / di-pivot.
var EXTRA = {
  transactions: ['category_name', 'category_kind', 'category_group', 'wallet_name', 'event_name']
};

var SHEET_NAMES = {
  transactions: 'Transactions', wallets: 'Wallets', categories: 'Categories',
  budgets: 'Budgets', recurring: 'Recurring', events: 'Events', settings: 'Settings'
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
  var sh = ss.getSheetByName(SHEET_NAMES[table]);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAMES[table]);
    sh.setFrozenRows(1);
  }
  headerMap(sh, table);
  return sh;
}

// Baca header; kolom bawaan yang belum ada ditambahkan di paling kanan.
function headerMap(sh, table) {
  var lastCol = sh.getLastColumn();
  var hdr = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  var want = columnsFor(table);
  var missing = want.filter(function (c) { return hdr.indexOf(c) < 0; });
  if (missing.length) {
    var need = hdr.length + missing.length;
    if (sh.getMaxColumns() < need) sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());
    sh.getRange(1, hdr.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#f1f3f4');
    missing.forEach(function (c, i) { formatColumn(sh, c, hdr.length + i + 1, 2, sh.getMaxRows() - 1); });
    hdr = hdr.concat(missing);
  }
  var map = {};
  hdr.forEach(function (h, i) { if (h !== '' && map[h] === undefined) map[h] = i; });
  return { map: map, width: hdr.length };
}

function formatColumn(sh, c, col, fromRow, n) {
  if (n < 1) return;
  var r = sh.getRange(fromRow, col, n, 1);
  if (DATE_FIELDS[c]) r.setNumberFormat('yyyy-mm-dd');
  else if (c === 'amount' || c === 'initial_balance') r.setNumberFormat('#,##0');
  else if (NUM_FIELDS[c] || c === '_synced') r.setNumberFormat('0');
  else if (BOOL_FIELDS[c]) r.setNumberFormat('General');
  else r.setNumberFormat('@'); // teks polos: catatan "1/2" tidak berubah jadi tanggal
}

function formatColumns(sh, table, fromRow, n) {
  var hm = headerMap(sh, table);
  columnsFor(table).forEach(function (c) { formatColumn(sh, c, hm.map[c] + 1, fromRow, n); });
}

// Kelompokkan kolom milik app jadi blok bersebelahan, supaya kolom buatan kamu sendiri tidak ketimpa.
function runsFor(hm, cols) {
  var pairs = cols.map(function (c, i) { return [hm.map[c], i]; }).sort(function (a, b) { return a[0] - b[0]; });
  var runs = [], cur = null;
  pairs.forEach(function (p) {
    if (cur && p[0] === cur.start + cur.idxs.length) cur.idxs.push(p[1]);
    else { cur = { start: p[0], idxs: [p[1]] }; runs.push(cur); }
  });
  return runs;
}

function writeRows(sh, row, matrix, runs) {
  runs.forEach(function (r) {
    sh.getRange(row, r.start + 1, matrix.length, r.idxs.length)
      .setValues(matrix.map(function (m) { return r.idxs.map(function (i) { return m[i]; }); }));
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
    var hm = headerMap(sh, table);
    var cId = hm.map.id + 1, cUpd = hm.map.updated_at + 1, cSync = hm.map._synced + 1;
    var editedCol = e.range.getColumn ? e.range.getColumn() : 0;
    if (editedCol === cSync || editedCol === cUpd) return;
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
  var order = ['settings', 'wallets', 'categories', 'events', 'budgets', 'recurring', 'transactions'];
  order.forEach(function (t) {
    var rows = changes[t];
    if (!rows || !rows.length) return;
    var sh = ss.getSheetByName(SHEET_NAMES[t]) || ensureSheet(ss, t);
    var hm = headerMap(sh, t);
    var cols = columnsFor(t);
    var runs = runsFor(hm, cols);
    if (t === 'transactions') lookups = buildLookups(ss);
    var lastRow = sh.getLastRow();
    var index = {};
    if (lastRow > 1) {
      var ids = sh.getRange(2, hm.map.id + 1, lastRow - 1, 1).getValues();
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
      runs.forEach(function (run) {
        var rg = sh.getRange(2, run.start + 1, lastRow - 1, run.idxs.length);
        var data = rg.getValues();
        updates.forEach(function (u) { data[u[0] - 2] = run.idxs.map(function (i) { return u[1][i]; }); });
        rg.setValues(data);
      });
    } else {
      updates.forEach(function (u) { writeRows(sh, u[0], [u[1]], runs); });
    }
    if (inserts.length) {
      ensureRows(sh, t, lastRow + inserts.length);
      writeRows(sh, lastRow + 1, inserts, runs);
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
    if (c === 'category_group') return lookups ? (lookups.cat[r.category_id] || {}).group || '' : '';
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
  readObjects(ss, 'categories').forEach(function (c) { L.cat[c.id] = { name: c.name, kind: c.kind, group: c.group }; });
  readObjects(ss, 'wallets').forEach(function (w) { L.wallet[w.id] = w.name; });
  readObjects(ss, 'events').forEach(function (e) { L.event[e.id] = e.name; });
  return L;
}

function refreshNames(ss) {
  var sh = ss.getSheetByName(SHEET_NAMES.transactions);
  if (!sh) return;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return;
  var hm = headerMap(sh, 'transactions');
  var L = buildLookups(ss);
  var n = lastRow - 1;
  var col = function (c) { return sh.getRange(2, hm.map[c] + 1, n, 1).getValues(); };
  var cat = col('category_id'), wal = col('wallet_id'), evt = col('event_id');
  var names = EXTRA.transactions;
  var out = [];
  for (var i = 0; i < n; i++) {
    var c = L.cat[cat[i][0]] || {};
    out.push([c.name || '', c.kind || '', c.group || '', L.wallet[wal[i][0]] || '', L.event[evt[i][0]] || '']);
  }
  writeRows(sh, 2, out, runsFor(hm, names));
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
    var hm = headerMap(sh, t);
    // Baca kolom _synced dulu; baca baris lengkap hanya kalau ada yang berubah.
    var stamps = sh.getRange(2, hm.map._synced + 1, lastRow - 1, 1).getValues();
    var hit = false;
    for (var i = 0; i < stamps.length; i++) {
      var s = Number(stamps[i][0]) || 0;
      if (s > since && !skip[s]) { hit = true; break; }
    }
    if (!hit) { data[t] = []; return; }
    var values = sh.getRange(2, 1, lastRow - 1, hm.width).getValues();
    var tz = ss.getSpreadsheetTimeZone();
    var rows = [];
    for (var j = 0; j < values.length; j++) {
      var st = Number(stamps[j][0]) || 0;
      if (!(st > since) || skip[st]) continue;
      var o = rowToObject(t, values[j], tz, hm);
      if (o.id) rows.push(o);
    }
    data[t] = rows;
  });
  return data;
}

function readObjects(ss, t) {
  var sh = ss.getSheetByName(SHEET_NAMES[t]);
  if (!sh || sh.getLastRow() < 2) return [];
  var hm = headerMap(sh, t);
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, hm.width).getValues();
  var tz = ss.getSpreadsheetTimeZone();
  return values.map(function (v) { return rowToObject(t, v, tz, hm); });
}

function rowToObject(t, row, tz, hm) {
  var o = {};
  TABLES[t].forEach(function (c) {
    var v = row[hm.map[c]];
    if (v instanceof Date) v = DATE_FIELDS[c] ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v.toISOString();
    else if (BOOL_FIELDS[c]) v = v === true || v === 'TRUE' || v === 'true';
    else if (NUM_FIELDS[c]) v = v === '' || v === undefined ? null : Number(v);
    else v = v === null || v === undefined ? '' : String(v);
    o[c] = v;
  });
  return o;
}
