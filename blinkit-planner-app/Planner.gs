/**
 * Blinkit Shipment Planner — server side.
 *
 * This file (Planner.gs) sits in the Blinkit Google Sheet's Apps Script project next to the daily inventory
 * updater (Code.gs + UploadDialog.html) and is deployed as a web app. It shares no names with that script and
 * needs no other permissions than the spreadsheet access the project already has.
 * The page (Index.html) reads the two Blinkit downloads in the browser, works out the plan and calls the
 * functions below to keep the RO Log and the month tabs (columns D–H) of this sheet up to date.
 *
 * It only ever writes to columns D–H (and the RO heading cell above them) of a month tab, inserts a row for an
 * item that is missing from a warehouse block, and creates a new month tab by copying the last one.
 * Columns I onwards are never changed.
 */
const SERVER_VERSION = 2;

const TAB = {
  SETTINGS: 'Planner Settings',
  SKUS: 'Planner SKUs',
  USERS: 'Planner Users',
  LOG: 'RO Log',
  SNAP: 'Planner Snapshot',
};

const LOG_HEAD = ['RO Key', 'Batch', 'Created At', 'Created By', 'RO Date', 'Warehouse', 'Group', 'Item ID', 'SKU',
  'Item Name', 'Qty', 'Status', 'Appointment Date', 'Blinkit RO No.', 'Source', 'Month Tab', 'Notes', 'Updated At',
  'Updated By', 'Tab Refs', 'Blinkit Created At', 'Merged RO', 'Dispatch Date', 'Delivered On', 'Removed From Tab'];
const L = {}; LOG_HEAD.forEach((h, i) => { L[h] = i; });

// 'TI SKU' = the SKU's name in the Travalate Inventory (TI) app, when it differs from 'SKU' (blank = same as SKU).
const SKU_HEAD = ['Item ID', 'SKU', 'Item Name', 'Group', 'Tier', 'Active', 'TI SKU'];
const USER_HEAD = ['User ID', 'Name', 'PIN', 'Role', 'Active'];
// 'Blinkit Incoming' + 'RO Log Incoming' = 'Planned' (its two parts, for the Dashboard's Planned breakdown).
const SNAP_HEAD = ['Warehouse', 'Item ID', 'Item Name', 'Group', 'Status', 'Daily Rate', 'Stock + Incoming',
  'Days Cover', 'Suggested', 'Locked', 'Has', 'Planned', 'Blinkit Incoming', 'RO Log Incoming'];

// Delivered: asks for the delivery date; 2 days later the RO's quantities and heading are removed from the month tab.
const STATUSES = ['Planned', 'Created', 'Delivered', 'Cancelled'];
const DELIVERED_KEEP_DAYS = 2;
const OPEN_STATUSES = ['Planned', 'Created'];
const ROLES = ['Admin', 'Planner', 'Viewer'];
const GROUPS = ['TBI', 'TBO', 'TBG'];
const GROUP_NAMES = { TBI: 'TBI – Travalate Bags Inhouse', TBO: 'TBO – Travalate Bags Outsourced', TBG: 'TBG' };
// A warehouse without a block for a group (e.g. no "-TBG" block yet) gets that group's ROs in the next block here.
const GROUP_FALLBACK = { TBG: ['TBO', 'TBI'] };

const DEFAULT_SETTINGS = [
  ['Company', 'Travalate', 'Shown at the top of the app'],
  ['Cover Days', 26, 'Days of stock each plan should cover, counted from the day you plan'],
  ['Min Line Qty', 10, 'Smallest quantity worth sending for one item'],
  ['Round To', 5, 'Quantities are rounded up to a multiple of this'],
  ['Shipping Address', 'H-1177, SITAPURA INDUSTRIAL AREA, Jaipur', 'Must match an address in the Blinkit file dropdown'],
  ['New Listing Starters', 'No', 'Yes = also suggest a small starter qty where an item is not live at a warehouse yet'],
  ['Carry Over Days', 5, 'When a new month tab starts, open ROs from this many last days of the old month are copied in (0 = none)'],
  ['Dispatch Capacity', 2800, 'Most units that can be dispatched in one day (the calendar\'s load bar)'],
  ['Dispatch Days', 'Mon,Tue,Wed,Thu,Fri,Sat', 'Days on which shipments are dispatched'],
  ['Lead Days', 15, 'Days from packing start to arrival at a warehouse (incl. packing)'],
  ['Short Lead Days', 4, 'Lead days for the warehouses listed in Short Lead Warehouses'],
  ['Short Lead Warehouses', 'Faridabad, Kundli, Jaipur', 'Warehouses with the short lead time (names or parts of names, comma separated)'],
  ['Packing Days', 2, 'Days of packing before dispatch (part of the lead days)'],
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];
const MONTH_TAB_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const BLOCK_RE = /^(.+)-(TBI|TBO|TBG)$/;
const RO_COLS = ['D', 'E', 'F', 'G', 'H'];
const FIRST_RO_COL = 4; // D
const SESSION_DAYS = 30;
// "Month Tab" of an RO that was already typed into the month tab by hand: never written there by the app.
const LOG_ONLY = 'Log only';
// The daily inventory updater (Code.gs) pastes Blinkit's Inventory download here, starting at C1.
const FORMULA_SHEET = 'Formula Sheet';
const FORMULA_FIRST_COL = 3; // C
const FORMULA_COLS = 27;     // C:AC

/* ---------------- Web app entry points ---------------- */

function doGet(e) {
  if (e && e.parameter && e.parameter.ping) {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'blinkit-planner', v: SERVER_VERSION }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Blinkit Shipment Planner')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Functions the hosted page (GitHub Pages) may call through doPost. */
const API_FUNCTIONS = {
  publicInfo, login, logout, changePin, getBoot, getSheetInventory, saveSnapshot, getDashboard, createROs, listROs, updateROLine,
  updateBatch, importPdfRO, saveSettings, saveSkus, listUsers, saveUser, resetUserPin, startMonth, syncMonthTabs,
  groupsFromMonthTab, getTiStock, getTiLink, saveTiLink, setDispatchDates,
};

/** Request body (sent as text/plain): { "fn": "getBoot", "args": [token, ...], "rid": "<retry id>" } */
function doPost(e) {
  const t0 = Date.now();
  let json, rid = '';
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    // A retried request carries the same id and gets the first answer, so an RO is never logged twice.
    rid = /^[\w-]{8,64}$/.test(String(req.rid || '')) ? 'rid_' + req.rid : '';
    const done = rid ? CacheService.getScriptCache().get(rid) : null;
    if (done) return ContentService.createTextOutput(done).setMimeType(ContentService.MimeType.JSON);
    const fn = Object.prototype.hasOwnProperty.call(API_FUNCTIONS, req.fn) ? API_FUNCTIONS[req.fn] : null;
    if (!fn) throw new Error('Unknown action.');
    const result = fn.apply(null, Array.isArray(req.args) ? req.args : []);
    json = JSON.stringify({ ok: true, result: result === undefined ? null : result, ms: Date.now() - t0 });
  } catch (err) {
    json = JSON.stringify({ ok: false, error: String((err && err.message) || err), ms: Date.now() - t0 });
  }
  if (rid && json.length < 95000) {
    try { CacheService.getScriptCache().put(rid, json, 600); } catch (err) { /* ignore */ }
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- Setup ---------------- */

/**
 * Run once from the Apps Script editor (and again after an update; it never deletes anything).
 * Creates the planner tabs, fills the SKU list from the newest month tab and makes the first admin.
 */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(TAB.SETTINGS, ['Setting', 'Value', 'What it does']);
  const st = ss.getSheetByName(TAB.SETTINGS);
  const have = st.getLastRow() > 1 ? st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  DEFAULT_SETTINGS.forEach(row => { if (have.indexOf(row[0]) < 0) st.appendRow(row); });

  ensureSheet_(TAB.SKUS, SKU_HEAD);
  ensureSheet_(TAB.USERS, USER_HEAD);
  const log = ensureSheet_(TAB.LOG, LOG_HEAD);
  log.getRange('E:E').setNumberFormat('dd-mmm-yyyy');
  log.getRange('M:M').setNumberFormat('dd-mmm-yyyy');
  log.getRange('C:C').setNumberFormat('dd-mmm-yyyy hh:mm');
  log.getRange('R:R').setNumberFormat('dd-mmm-yyyy hh:mm');
  log.getRange('U:U').setNumberFormat('dd-mmm-yyyy hh:mm');
  ensureSheet_(TAB.SNAP, SNAP_HEAD);

  const added = seedSkus_();
  const users = ss.getSheetByName(TAB.USERS);
  let adminMsg = '';
  if (users.getLastRow() < 2) {
    users.appendRow(['admin', 'Admin', hashPin_('1234'), 'Admin', 'Yes']);
    adminMsg = ' First login: User ID "admin", PIN "1234" — change it in the app (Account → Change PIN).';
  }
  const msg = 'Setup done. SKUs added from the month tabs: ' + added + '.' + adminMsg;
  Logger.log(msg);
  return msg;
}

function ensureSheet_(name, head) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name, ss.getSheets().length);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#1f4e78').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  } else {
    // Add columns a newer version needs, never remove any.
    const cur = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    head.forEach(h => {
      if (cur.indexOf(h) < 0) { sh.getRange(1, cur.length + 1).setValue(h).setFontWeight('bold'); cur.push(h); }
    });
  }
  return sh;
}

/** Adds every item found under a TBI/TBO/TBG block of the month tabs (newest first) to the SKU list. */
function seedSkus_() {
  const sh = sheet_(TAB.SKUS);
  const known = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(r => { known[String(r[0])] = 1; });
  const add = [];
  monthTabs_().forEach(t => {
    const v = t.sheet.getRange(1, 1, Math.max(1, t.sheet.getLastRow()), 3).getValues();
    let group = '';
    v.forEach(r => {
      const a = r[0];
      if (typeof a === 'string' && BLOCK_RE.test(a.trim())) group = a.trim().match(BLOCK_RE)[2];
      else if (group && typeof a === 'number' && a > 1000 && !known[String(a)]) {
        known[String(a)] = 1;
        add.push([a, r[1] === '' ? '' : String(r[1]), '', group, r[2] === '' ? '' : String(r[2]), 'Yes', '']);
      }
    });
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, SKU_HEAD.length).setValues(add);
  return add.length;
}

/* ---------------- Helpers ---------------- */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('The tab "' + name + '" is missing. Run setup in Apps Script once.');
  return sh;
}

/** Warehouse names compared ignoring spaces and capitals. */
function whNorm_(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }

function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }
function fmtDate_(d) { return d instanceof Date && !isNaN(d) ? Utilities.formatDate(d, tz_(), 'yyyy-MM-dd') : ''; }
function fmtStamp_(d) { return d instanceof Date && !isNaN(d) ? d.getTime() : null; }
function parseDate_(s) {
  if (s instanceof Date) return s;
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}
function shortDate_(d) { return Utilities.formatDate(d, tz_(), 'd MMM'); }

function getSettings_() {
  const sh = sheet_(TAB.SETTINGS), out = {};
  DEFAULT_SETTINGS.forEach(r => { out[r[0]] = r[1]; });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { if (r[0]) out[String(r[0])] = r[1]; });
  return {
    company: String(out['Company'] || 'Travalate'),
    coverDays: Number(out['Cover Days']) || 26,
    minLine: Number(out['Min Line Qty']) || 10,
    roundTo: Number(out['Round To']) || 5,
    address: String(out['Shipping Address'] || ''),
    starters: /^y/i.test(String(out['New Listing Starters'])),
    carryDays: out['Carry Over Days'] === '' || isNaN(Number(out['Carry Over Days'])) ? 5 : Number(out['Carry Over Days']),
    dispatchCap: Number(out['Dispatch Capacity']) || 2800,
    dispatchDays: String(out['Dispatch Days'] || 'Mon,Tue,Wed,Thu,Fri,Sat'),
    leadDays: Number(out['Lead Days']) || 15,
    shortLeadDays: Number(out['Short Lead Days']) || 4,
    shortLeadWh: String(out['Short Lead Warehouses'] || ''),
    packDays: out['Packing Days'] === '' || isNaN(Number(out['Packing Days'])) ? 2 : Number(out['Packing Days']),
  };
}

function getSkus_() {
  const sh = sheet_(TAB.SKUS);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, SKU_HEAD.length).getValues()
    .filter(r => r[0] !== '')
    .map(r => ({ item: Number(r[0]), sku: String(r[1]), name: String(r[2]), group: String(r[3]).toUpperCase(),
      tier: String(r[4]), active: !/^n/i.test(String(r[5])), tiSku: String(r[6] == null ? '' : r[6]).trim() }));
}

/* ---------------- Users & sessions ---------------- */

function hashPin_(pin, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8);
  return 'sha256$' + salt + '$' + bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function verifyPin_(stored, pin) {
  stored = String(stored || '');
  if (!/^sha256\$/.test(stored)) return stored !== '' && stored === String(pin);
  return hashPin_(String(pin), stored.split('$')[1]) === stored;
}

function users_() {
  const sh = sheet_(TAB.USERS);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, USER_HEAD.length).getValues().map((r, i) => ({
    row: i + 2, id: String(r[0]).trim(), name: String(r[1]), pin: String(r[2]),
    role: ROLES.indexOf(String(r[3])) >= 0 ? String(r[3]) : 'Viewer', active: !/^n/i.test(String(r[4])),
  })).filter(u => u.id);
}

function findUser_(id) {
  id = String(id || '').trim().toLowerCase();
  return users_().filter(u => u.id.toLowerCase() === id)[0] || null;
}

function publicInfo() {
  return { company: getSettings_().company, version: SERVER_VERSION };
}

function login(userId, pin) {
  const key = 'bp_fail_' + String(userId || '').toLowerCase();
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get(key) || 0);
  if (fails >= 5) throw new Error('Too many wrong PINs. Try again in 15 minutes.');
  const u = findUser_(userId);
  if (!u || !u.active || !verifyPin_(u.pin, pin)) {
    cache.put(key, String(fails + 1), 900);
    throw new Error('Wrong User ID or PIN.');
  }
  cache.remove(key);
  const token = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('tok_' + token,
    JSON.stringify({ u: u.id, x: Date.now() + SESSION_DAYS * 864e5 }));
  return { token: token, boot: getBoot(token) };
}

function logout(token) {
  if (token) {
    try { PropertiesService.getScriptProperties().deleteProperty('tok_' + token); } catch (e) { /* ignore */ }
    CacheService.getScriptCache().remove('tok_' + token);
  }
  return true;
}

/** The signed-in user, or an error the page turns into "please log in again". */
function auth_(token, minRole) {
  if (!token) throw new Error('SESSION_EXPIRED');
  const cache = CacheService.getScriptCache();
  let id = cache.get('tok_' + token);
  if (!id) {
    let v = null;
    try { v = JSON.parse(PropertiesService.getScriptProperties().getProperty('tok_' + token) || 'null'); } catch (e) { v = null; }
    if (!v || v.x < Date.now()) throw new Error('SESSION_EXPIRED');
    id = v.u;
    cache.put('tok_' + token, id, 21600);
  }
  const u = findUser_(id);
  if (!u || !u.active) throw new Error('SESSION_EXPIRED');
  if (minRole && ROLES.indexOf(u.role) > ROLES.indexOf(minRole)) {
    throw new Error('You do not have permission for this. Ask an admin.');
  }
  return u;
}

function changePin(token, oldPin, newPin) {
  const u = auth_(token);
  if (!verifyPin_(u.pin, oldPin)) throw new Error('The current PIN is wrong.');
  if (!/^\d{4,8}$/.test(String(newPin))) throw new Error('The new PIN must be 4 to 8 digits.');
  sheet_(TAB.USERS).getRange(u.row, 3).setValue(hashPin_(String(newPin)));
  return true;
}

function listUsers(token) {
  auth_(token, 'Admin');
  return users_().map(u => ({ id: u.id, name: u.name, role: u.role, active: u.active }));
}

function saveUser(token, data) {
  const me = auth_(token, 'Admin');
  const id = String(data.id || '').trim();
  if (!/^[\w.-]{2,30}$/.test(id)) throw new Error('User ID: 2–30 letters, digits, dot, dash or underscore.');
  const role = ROLES.indexOf(data.role) >= 0 ? data.role : 'Viewer';
  const existing = findUser_(id);
  const sh = sheet_(TAB.USERS);
  if (existing) {
    if (existing.id === me.id && (role !== 'Admin' || data.active === false)) throw new Error('You cannot remove your own admin access.');
    sh.getRange(existing.row, 2).setValue(String(data.name || ''));
    sh.getRange(existing.row, 4, 1, 2).setValues([[role, data.active === false ? 'No' : 'Yes']]);
    return { created: false };
  }
  const pin = String(data.pin || '');
  if (!/^\d{4,8}$/.test(pin)) throw new Error('Give the new user a PIN of 4 to 8 digits.');
  sh.appendRow([id, String(data.name || ''), hashPin_(pin), role, 'Yes']);
  return { created: true };
}

function resetUserPin(token, id, pin) {
  auth_(token, 'Admin');
  const u = findUser_(id);
  if (!u) throw new Error('No such user.');
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('The PIN must be 4 to 8 digits.');
  sheet_(TAB.USERS).getRange(u.row, 3).setValue(hashPin_(String(pin)));
  return true;
}

/* ---------------- Boot data ---------------- */

/** Everything the page needs after login: who you are, settings, SKUs, warehouses and the open ROs. */
/**
 * ROs marked Delivered: 2 days after the delivery date their quantities and RO heading are removed from the month
 * tab (columns D–H), so the column is free again; the RO Log keeps them ("Removed From Tab" = when). Runs when the
 * planner is opened (at most every 30 minutes) and from cleanupDeliveredROs (e.g. a daily trigger).
 */
function cleanupDelivered_() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = readLog_().filter(r => r.status === 'Delivered' && r.deliveredOn instanceof Date && !r.removedAt && r.refs.length &&
    today.getTime() >= r.deliveredOn.getTime() + DELIVERED_KEEP_DAYS * 864e5);
  if (!due.length) return 0;
  const log = ensureSheet_(TAB.LOG, LOG_HEAD), now = new Date(), cols = {};
  due.forEach(r => {
    r.refs.forEach(ref => {
      const sh = SpreadsheetApp.getActive().getSheetByName(ref.t);
      if (!sh) return;
      adjustCell_(sh, r.wh, r.group, r.item, r.sku, ref.c, -r.qty);
      cols[ref.t + '|' + r.wh + '|' + r.group + '|' + ref.c] = { sh: sh, wh: r.wh, group: r.group, c: ref.c };
    });
    log.getRange(r.row, L['Removed From Tab'] + 1).setValue(now);
  });
  // A column left without quantities in its block also loses its RO heading.
  Object.keys(cols).forEach(k => {
    const x = cols[k], ci = RO_COLS.indexOf(x.c), b = blockFor_(readBlockValues_(x.sh), x.wh, x.group);
    if (!b || ci < 0) return;
    const v = x.sh.getRange(b.start + 1, FIRST_RO_COL + ci, b.end - b.start + 1, 1).getValues();
    const empty = Object.keys(b.items).every(it => { const val = v[b.items[it] - b.start][0]; return val === '' || val === null || Number(val) === 0; });
    if (empty) x.sh.getRange(b.headRow + 1, FIRST_RO_COL + ci).clearContent();
  });
  return due.length;
}

/** For a time-driven trigger (Apps Script → Triggers → cleanupDeliveredROs, daily). */
function cleanupDeliveredROs() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return cleanupDelivered_(); } finally { lock.releaseLock(); }
}

function getBoot(token) {
  const u = auth_(token);
  const cache = CacheService.getScriptCache();
  if (!cache.get('deliv_clean')) {
    cache.put('deliv_clean', '1', 1800);
    try { cleanupDeliveredROs(); } catch (e) { /* never blocks opening the planner */ }
  }
  const latest = monthTabs_()[0];
  return {
    user: { id: u.id, name: u.name, role: u.role },
    version: SERVER_VERSION,
    settings: getSettings_(),
    skus: getSkus_(),
    groups: GROUP_NAMES,
    warehouses: latest ? blockWarehouses_(latest.sheet) : [],
    months: monthTabs_().slice(0, 6).map(t => t.name),
    openROs: readLog_().filter(r => OPEN_STATUSES.indexOf(r.status) >= 0).map(publicRo_),
    snapshot: snapshotMeta_(),
  };
}

function blockWarehouses_(sh) {
  const out = [];
  sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 1).getValues().forEach(r => {
    const a = typeof r[0] === 'string' ? r[0].trim() : '';
    const m = a.match(BLOCK_RE);
    if (m && out.indexOf(m[1].trim()) < 0) out.push(m[1].trim());
  });
  return out;
}

/* ---------------- Inventory from "Formula Sheet" ---------------- */

/**
 * The Blinkit Inventory download that the daily inventory updater pasted into "Formula Sheet" (C:AC), as rows,
 * the same as reading the downloaded file itself. Saves uploading the Inventory file a second time.
 */
function getSheetInventory(token) {
  auth_(token);
  const sh = SpreadsheetApp.getActive().getSheetByName(FORMULA_SHEET);
  if (!sh) throw new Error('There is no "' + FORMULA_SHEET + '" tab. Upload the Inventory file instead.');
  const last = sh.getLastRow();
  if (last < 4) throw new Error('"' + FORMULA_SHEET + '" is empty. Run 📦 Blinkit Inventory → Upload Today\'s Inventory in the sheet first.');
  const v = sh.getRange(1, FORMULA_FIRST_COL, last, FORMULA_COLS).getValues();
  let width = 0;
  v.forEach(r => { for (let c = r.length - 1; c >= width; c--) if (r[c] !== '' && r[c] !== null) { width = c + 1; break; } });
  return v.map(r => r.slice(0, width).map(x => (x instanceof Date ? fmtDate_(x) : x)));
}

/* ---------------- Snapshot (for the dashboard) ---------------- */

/** Saves the newest plan's per warehouse × item figures, and the names / new items for the SKU list. */
function saveSnapshot(token, rows, meta) {
  const u = auth_(token, 'Planner');
  if (!Array.isArray(rows)) throw new Error('No data.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = ensureSheet_(TAB.SNAP, SNAP_HEAD); // adds the Has / Planned headings to an existing tab
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, SNAP_HEAD.length).clearContent();
    const vals = rows.slice(0, 5000).map(r => SNAP_HEAD.map((h, i) => (r[i] === null || r[i] === undefined ? '' : r[i])));
    if (vals.length) sh.getRange(2, 1, vals.length, SNAP_HEAD.length).setValues(vals);
    PropertiesService.getScriptProperties().setProperty('snap_meta', JSON.stringify({
      at: Date.now(), by: u.name || u.id, inventoryAt: String((meta && meta.inventoryAt) || ''),
      bulkAt: (meta && meta.bulkAt) || null, units: (meta && meta.units) || 0, lines: (meta && meta.lines) || 0,
    }));
    // Item names and new items for the SKU list.
    const skuSh = sheet_(TAB.SKUS);
    const skus = skuSh.getLastRow() > 1 ? skuSh.getRange(2, 1, skuSh.getLastRow() - 1, 3).getValues() : [];
    const at = {};
    skus.forEach((r, i) => { at[String(r[0])] = i; });
    const names = {};
    ((meta && meta.items) || []).forEach(it => { names[String(it.item)] = it; });
    Object.keys(names).forEach(id => {
      const it = names[id];
      if (at[id] === undefined) {
        skuSh.appendRow([Number(id), '', it.name || '', '', '', 'Yes']);
      } else if (!skus[at[id]][2] && it.name) {
        skuSh.getRange(at[id] + 2, 3).setValue(it.name);
      }
    });
  } finally {
    lock.releaseLock();
  }
  return snapshotMeta_();
}

function snapshotMeta_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('snap_meta') || 'null'); } catch (e) { return null; }
}

function getDashboard(token) {
  auth_(token);
  const sh = sheet_(TAB.SNAP);
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, SNAP_HEAD.length).getValues() : [];
  return {
    meta: snapshotMeta_(),
    rows: rows.map(r => r.map(v => (v instanceof Date ? fmtDate_(v) : v))),
    openROs: readLog_().filter(r => OPEN_STATUSES.indexOf(r.status) >= 0).map(publicRo_),
  };
}

/* ---------------- RO Log ---------------- */

function readLog_() {
  const sh = sheet_(TAB.LOG);
  if (sh.getLastRow() < 2) return [];
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, LOG_HEAD.length).getValues();
  return v.map((r, i) => ({
    row: i + 2, key: String(r[L['RO Key']]), batch: String(r[L['Batch']]), createdAt: r[L['Created At']],
    createdBy: String(r[L['Created By']]), roDate: r[L['RO Date']], wh: String(r[L['Warehouse']]),
    group: String(r[L['Group']]), item: Number(r[L['Item ID']]), sku: String(r[L['SKU']]),
    name: String(r[L['Item Name']]), qty: Number(r[L['Qty']]) || 0, status: String(r[L['Status']]),
    appt: r[L['Appointment Date']], roNo: String(r[L['Blinkit RO No.']]), source: String(r[L['Source']]),
    notes: String(r[L['Notes']]), refs: parseRefs_(r[L['Tab Refs']]), logOnly: String(r[L['Month Tab']]) === LOG_ONLY,
    blinkitAt: r[L['Blinkit Created At']], merged: String(r[L['Merged RO']] == null ? '' : r[L['Merged RO']]),
    dispatch: r[L['Dispatch Date']], deliveredOn: r[L['Delivered On']], removedAt: r[L['Removed From Tab']],
  })).filter(r => r.key);
}

function parseRefs_(s) {
  try { const v = JSON.parse(String(s || '[]')); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

function publicRo_(r) {
  return {
    key: r.key, batch: r.batch, createdAt: fmtStamp_(r.createdAt), createdBy: r.createdBy, roDate: fmtDate_(r.roDate),
    wh: r.wh, group: r.group, item: r.item, sku: r.sku, name: r.name, qty: r.qty, status: r.status,
    appt: fmtDate_(r.appt), roNo: r.roNo, source: r.source, notes: r.notes, blinkitAt: fmtStamp_(r.blinkitAt), merged: r.merged, dispatch: fmtDate_(r.dispatch),
    deliveredOn: fmtDate_(r.deliveredOn), removedAt: fmtDate_(r.removedAt),
    tabs: r.logOnly ? LOG_ONLY : r.refs.map(x => x.t + ' (' + x.c + ')').join(', '),
  };
}

function listROs(token, filter) {
  auth_(token);
  filter = filter || {};
  const from = parseDate_(filter.from), to = parseDate_(filter.to);
  if (to) to.setHours(23, 59, 59);
  return readLog_().filter(r => {
    const d = r.roDate instanceof Date ? r.roDate : null;
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
    if (filter.wh && r.wh !== filter.wh) return false;
    if (filter.status && r.status !== filter.status) return false;
    return true;
  }).slice(-3000).map(publicRo_);
}

/**
 * Logs ROs and writes them into the month tab.
 * data = { lines: [{ wh, item, sku, name, group, qty }], roDate: 'yyyy-mm-dd', status: 'Created'|'Planned',
 *          source: 'Plan'|'Manual'|'PDF', appt, roNo, notes }
 * All lines of one warehouse + group become one RO (one column in that warehouse's block).
 */
function createROs(token, data) {
  const u = auth_(token, 'Planner');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return createROs_(u, data);
  } finally {
    lock.releaseLock();
  }
}

/** createROs without the lock, for callers that already hold it. */
function createROs_(u, data) {
  data = data || {};
  const lines = (data.lines || []).filter(l => l && l.wh && Number(l.item) && Number(l.qty) > 0);
  if (!lines.length) throw new Error('Nothing to save: no line has a quantity.');
  const status = OPEN_STATUSES.indexOf(data.status) >= 0 ? data.status : 'Created';
  const roDate = parseDate_(data.roDate) || new Date();
  const appt = parseDate_(data.appt);
  const skuMap = {};
  getSkus_().forEach(s => { skuMap[s.item] = s; });

  {
    const now = new Date();
    const batches = {};
    lines.forEach(l => {
      const s = skuMap[Number(l.item)] || {};
      const group = GROUPS.indexOf(String(l.group || s.group || '').toUpperCase()) >= 0 ? String(l.group || s.group).toUpperCase() : '';
      if (!group) throw new Error('Item ' + l.item + ' (' + (l.name || l.sku || '') + ') has no group. Set TBI or TBO for it in Settings → SKUs first.');
      const k = l.wh + '|' + group;
      (batches[k] = batches[k] || { wh: l.wh, group: group, lines: [] }).lines.push({
        item: Number(l.item), sku: String(l.sku || s.sku || ''), name: String(l.name || s.name || ''), qty: Math.round(Number(l.qty)),
      });
    });

    const tab = monthTabFor_(roDate);
    const out = { batches: [], warnings: [] };
    // Created with one merged Blinkit file: the group batches of a warehouse are one RO, shown as one in the RO Log.
    // (Each group still gets its own batch, because each goes into its own TBI / TBO / TBG block of the month tab.)
    const mergedId = data.merged ? Utilities.formatDate(now, tz_(), 'yyMMdd-HHmmss') + '-M' + Utilities.getUuid().slice(0, 4) : '';
    const rows = [];
    Object.keys(batches).forEach(k => {
      const b = batches[k];
      const batchId = Utilities.formatDate(now, tz_(), 'yyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 4);
      let ref = null;
      if (data.logOnly) {
        // Already typed into the month tab by hand: only logged.
      } else if (tab) {
        const w = writeBatch_(tab.sheet, b.wh, b.group, b.lines, roLabel_(roDate, data.roNo, appt, b.wh, null));
        if (w.col) ref = { t: tab.name, c: w.col };
        w.warnings.forEach(x => out.warnings.push(b.wh + ' ' + b.group + ': ' + x));
      } else {
        out.warnings.push('No month tab for ' + MONTHS[roDate.getMonth()] + ' ' + roDate.getFullYear() +
          ' yet. The RO is saved in the RO Log; use Settings → Start new month, then it is written in.');
      }
      b.lines.forEach((l, i) => {
        const r = [];
        r[L['RO Key']] = batchId + '-' + (i + 1);
        r[L['Batch']] = batchId;
        r[L['Created At']] = now;
        r[L['Created By']] = u.name || u.id;
        r[L['RO Date']] = roDate;
        r[L['Warehouse']] = b.wh;
        r[L['Group']] = b.group;
        r[L['Item ID']] = l.item;
        r[L['SKU']] = l.sku;
        r[L['Item Name']] = l.name;
        r[L['Qty']] = l.qty;
        r[L['Status']] = status;
        r[L['Appointment Date']] = appt || '';
        r[L['Blinkit RO No.']] = String(data.roNo || '');
        r[L['Source']] = ['Manual', 'PDF'].indexOf(data.source) >= 0 ? data.source : 'Plan';
        r[L['Month Tab']] = ref ? ref.t + ' (' + ref.c + ')' : (data.logOnly ? LOG_ONLY : '');
        r[L['Notes']] = String(data.notes || '');
        r[L['Updated At']] = now;
        r[L['Updated By']] = u.name || u.id;
        r[L['Tab Refs']] = JSON.stringify(ref ? [ref] : []);
        r[L['Blinkit Created At']] = data.blinkitAt instanceof Date ? data.blinkitAt : '';
        r[L['Merged RO']] = mergedId;
        r[L['Dispatch Date']] = ''; // set right after by the planner (spread over the next working days)
        r[L['Delivered On']] = '';
        r[L['Removed From Tab']] = '';
        rows.push(r);
      });
      out.batches.push({ batch: batchId, wh: b.wh, group: b.group, units: b.lines.reduce((s, l) => s + l.qty, 0),
        lines: b.lines.length, tab: ref ? ref.t + ' (' + ref.c + ')' : '' });
    });
    const log = ensureSheet_(TAB.LOG, LOG_HEAD); // adds a column a newer version needs (e.g. "Merged RO") by itself
    log.getRange(log.getLastRow() + 1, 1, rows.length, LOG_HEAD.length).setValues(rows);
    out.openROs = readLog_().filter(r => OPEN_STATUSES.indexOf(r.status) >= 0).map(publicRo_);
    return out;
  }
}

/**
 * Saves an RO read from a Blinkit R.O. PDF (parsed in the browser).
 * pdf = { roNo, roDate: 'yyyy-mm-dd', roAt: ms (Blinkit's R.O. date and time), expiry: 'yyyy-mm-dd', wh, lines: [{ item, qty }] }
 * matchBatches = batch ids of the planner's RO(s) this PDF is (same warehouse, no RO number yet, same items).
 *   Given → those lines get the RO number and the PDF's quantities (the month tab follows); nothing new is added.
 *   Empty → saved as a new RO (status Created, source PDF).
 * An RO number that is already in the RO Log is never saved twice.
 * logOnly = the RO is already typed into the month tab by hand: it is only logged, the tab is not changed.
 */
function importPdfRO(token, pdf, matchBatches, logOnly) {
  const u = auth_(token, 'Planner');
  pdf = pdf || {};
  const roNo = String(pdf.roNo || '').trim();
  if (!/^\d{6,20}$/.test(roNo)) throw new Error('The PDF has no valid R.O. Number.');
  if (!pdf.wh) throw new Error('Choose the warehouse for RO ' + roNo + '.');
  const want = {};
  (pdf.lines || []).forEach(l => { if (Number(l.item) && Number(l.qty) > 0) want[Number(l.item)] = (want[Number(l.item)] || 0) + Math.round(Number(l.qty)); });
  if (!Object.keys(want).length) throw new Error('RO ' + roNo + ' has no items.');
  const expiry = parseDate_(pdf.expiry);
  const notes = expiry ? 'R.O. expiry ' + Utilities.formatDate(expiry, tz_(), 'd MMM yyyy') : '';
  // When Blinkit created the RO (printed on the PDF). The planner compares this, not the upload time, with the
  // Bulk RO file's download time, so an older RO that Blinkit's file already shows as incoming is not added again.
  const roAt = Number(pdf.roAt) > 0 ? new Date(Number(pdf.roAt)) : null;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSheet_(TAB.LOG, LOG_HEAD);
    const log = readLog_();
    if (log.some(r => r.roNo === roNo && r.status !== 'Cancelled')) {
      return { skipped: true, message: 'RO ' + roNo + ' is already in the RO Log.' };
    }
    const out = { roNo: roNo, matched: false, warnings: [], changes: [] };
    if (matchBatches && matchBatches.length) {
      const rows = log.filter(r => matchBatches.indexOf(r.batch) >= 0 && r.status !== 'Cancelled');
      const ok = rows.length && rows.every(r => whNorm_(r.wh) === whNorm_(pdf.wh) && OPEN_STATUSES.indexOf(r.status) >= 0 && !r.roNo);
      const items = {};
      rows.forEach(r => { items[r.item] = 1; });
      const same = ok && Object.keys(items).length === Object.keys(want).length && Object.keys(want).every(i => items[i]);
      if (!same) throw new Error('The planner RO for RO ' + roNo + ' changed meanwhile. Reload and try again.');
      const sh = sheet_(TAB.LOG), now = new Date(), left = Object.assign({}, want);
      rows.forEach(r => {
        const q = left[r.item] || 0;
        delete left[r.item];
        if (q !== r.qty) {
          r.refs.forEach(ref => {
            const tsh = SpreadsheetApp.getActive().getSheetByName(ref.t);
            const w = tsh ? adjustCell_(tsh, r.wh, r.group, r.item, r.sku, ref.c, q - r.qty) : '';
            if (w) out.warnings.push(w);
          });
          out.changes.push((r.sku || r.item) + ': ' + r.qty + ' → ' + q);
          sh.getRange(r.row, L['Qty'] + 1).setValue(q || r.qty);
          if (!q) sh.getRange(r.row, L['Status'] + 1).setValue('Cancelled');
        }
        if (q) sh.getRange(r.row, L['Status'] + 1).setValue('Created');
        sh.getRange(r.row, L['Blinkit RO No.'] + 1).setValue(roNo);
        if (roAt) sh.getRange(r.row, L['Blinkit Created At'] + 1).setValue(roAt);
        if (notes) sh.getRange(r.row, L['Notes'] + 1).setValue(r.notes ? r.notes + '; ' + notes : notes);
        sh.getRange(r.row, L['Updated At'] + 1, 1, 2).setValues([[now, u.name || u.id]]);
      });
      // The RO heading in the month tab gets the RO number.
      const seen = {};
      rows.forEach(r => {
        if (seen[r.batch]) return;
        seen[r.batch] = 1;
        const appt = r.appt instanceof Date ? r.appt : null;
        r.refs.forEach(ref => {
          const tsh = SpreadsheetApp.getActive().getSheetByName(ref.t);
          if (tsh) setBatchLabel_(tsh, r.wh, r.group, ref.c, roLabel_(r.roDate instanceof Date ? r.roDate : now, roNo, appt, r.wh, r.dispatch));
        });
      });
      out.matched = true;
    } else {
      const skuMap = {};
      getSkus_().forEach(s => { skuMap[s.item] = s; });
      const res = createROs_(u, {
        lines: Object.keys(want).map(i => ({ wh: pdf.wh, item: Number(i), qty: want[i],
          sku: (skuMap[i] || {}).sku, name: (skuMap[i] || {}).name, group: (skuMap[i] || {}).group })),
        roDate: pdf.roDate, status: 'Created', source: 'PDF', roNo: roNo, notes: notes, logOnly: !!logOnly, blinkitAt: roAt,
      });
      out.batches = res.batches;
      out.warnings = res.warnings;
    }
    out.openROs = readLog_().filter(r => OPEN_STATUSES.indexOf(r.status) >= 0).map(publicRo_);
    return out;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Heading written above an RO column (centred), e.g.
 *   RO 21 NOV
 *   612345          ← last 6 digits of the Blinkit RO number
 *   23/11 - 30/11   ← dispatch day - appointment ("23/11 -" until there is an appointment)
 * The dispatch day comes from the appointment (appointment − shipping days, on a dispatch day), else the day set
 * for the RO (RO Log "Dispatch Date"). A line is left out while its value is not known yet.
 */
function roLabel_(roDate, roNo, appt, wh, dispatch) {
  let s = 'RO ' + Utilities.formatDate(roDate, tz_(), 'd MMM').toUpperCase();
  const no = String(roNo || '').replace(/\s+/g, '');
  if (no) s += '\n' + no.slice(-6);
  const ap = appt instanceof Date ? ymd_(appt) : '';
  const disp = dispatchDay_(wh, ap, dispatch instanceof Date ? ymd_(dispatch) : '');
  if (disp) s += '\n' + dm_(disp) + ' -' + (ap ? ' ' + dm_(ap) : '');
  return s;
}

/** The heading of an RO Log line's RO. */
function roLabelOf_(r) {
  return roLabel_(r.roDate instanceof Date ? r.roDate : new Date(), r.roNo, r.appt instanceof Date ? r.appt : null, r.wh, r.dispatch);
}

/* Dispatch days on the server, the same way the page works them out (Settings → Dispatch). Dates as 'yyyy-MM-dd'. */
function ymd_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function dm_(s) { const p = s.split('-'); return p[2] + '/' + p[1]; }
function addDaysYmd_(s, n) { const p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); }
let DISPATCH_CONF_CACHE_ = null;
function dispatchConfOf_() {
  if (!DISPATCH_CONF_CACHE_) DISPATCH_CONF_CACHE_ = getSettings_();
  return DISPATCH_CONF_CACHE_;
}
function isDispatchDay_(s) {
  const p = s.split('-');
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()];
  return String(dispatchConfOf_().dispatchDays).toLowerCase().indexOf(dow.toLowerCase()) >= 0;
}
function transitDays_(wh) {
  const c = dispatchConfOf_(), k = String(wh || '').toLowerCase().replace(/\s+/g, '');
  const isShort = String(c.shortLeadWh || '').split(',').map(x => x.trim().toLowerCase().replace(/\s+/g, '')).filter(Boolean).some(x => k.indexOf(x) >= 0);
  return Math.max(0, (isShort ? c.shortLeadDays : c.leadDays) - c.packDays);
}
function dispatchDay_(wh, appt, dispatch) {
  if (!appt) return dispatch || '';
  let d = addDaysYmd_(appt, -transitDays_(wh));
  for (let i = 0; i < 14 && !isDispatchDay_(d); i++) d = addDaysYmd_(d, -1);
  return d;
}

/**
 * Rewrites the month-tab headings of these RO Log lines' ROs (one per batch and tab), reading each tab once.
 * Returns how many headings were written.
 */
function refreshHeadings_(records) {
  const byTab = {}, seen = {};
  records.forEach(r => {
    r.refs.forEach(ref => {
      const id = r.batch + '|' + ref.t + '|' + ref.c;
      if (seen[id]) return;
      seen[id] = 1;
      (byTab[ref.t] = byTab[ref.t] || []).push({ r: r, c: ref.c });
    });
  });
  let n = 0;
  Object.keys(byTab).forEach(t => {
    const sh = SpreadsheetApp.getActive().getSheetByName(t);
    if (!sh) return;
    const v = readBlockValues_(sh);
    byTab[t].forEach(x => {
      const ci = RO_COLS.indexOf(x.c), b = blockFor_(v, x.r.wh, x.r.group);
      if (ci < 0 || !b) return;
      writeLabel_(sh.getRange(b.headRow + 1, FIRST_RO_COL + ci), roLabelOf_(x.r));
      n++;
    });
  });
  return n;
}

/** An RO heading cell: the text, centred across and down. */
function writeLabel_(range, label) {
  range.setValue(label).setHorizontalAlignment('center').setVerticalAlignment('middle');
}

/**
 * Sets the planned dispatch day of ROs: dates = { batchId: 'yyyy-mm-dd' or '' (none) }. All lines of each batch get
 * it. (A RO with an appointment is dispatched by its appointment; this day is used while it has none.)
 */
function setDispatchDates(token, dates) {
  auth_(token, 'Planner');
  dates = dates || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const log = ensureSheet_(TAB.LOG, LOG_HEAD); // adds the "Dispatch Date" heading to an older RO Log
    // Rows to change, written run by run (a batch's lines sit on consecutive rows), not cell by cell.
    const rows = [];
    readLog_().forEach(r => {
      if (!Object.prototype.hasOwnProperty.call(dates, r.batch)) return;
      const d = dates[r.batch] ? parseDate_(dates[r.batch]) : null;
      if (dates[r.batch] && !d) throw new Error('Bad date: ' + dates[r.batch]);
      rows.push({ row: r.row, v: d || '' });
    });
    rows.sort((a, b) => a.row - b.row);
    for (let i = 0; i < rows.length;) {
      let j = i;
      while (j + 1 < rows.length && rows[j + 1].row === rows[j].row + 1) j++;
      log.getRange(rows[i].row, L['Dispatch Date'] + 1, j - i + 1, 1).setValues(rows.slice(i, j + 1).map(x => [x.v]));
      i = j + 1;
    }
    const n = rows.length;
    const all = readLog_();
    // The month-tab headings show the dispatch day: rewrite those of the ROs that changed.
    try { refreshHeadings_(all.filter(r => Object.prototype.hasOwnProperty.call(dates, r.batch) && r.status !== 'Cancelled')); } catch (e) { /* the dates are saved either way */ }
    return { lines: n, openROs: all.filter(r => OPEN_STATUSES.indexOf(r.status) >= 0).map(publicRo_) };
  } finally {
    lock.releaseLock();
  }
}

/** Changes one line: qty, status or notes. The month tab follows (a cancelled line is taken out of it). */
function updateROLine(token, key, changes) {
  const u = auth_(token, 'Planner');
  changes = changes || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const r = readLog_().filter(x => x.key === key)[0];
    if (!r) throw new Error('This RO line was not found. Reload the RO Log.');
    const log = sheet_(TAB.LOG);
    const warnings = [];
    const oldEff = r.status === 'Cancelled' ? 0 : r.qty;
    let qty = r.qty, status = r.status;
    if (changes.qty !== undefined) {
      qty = Math.round(Number(changes.qty));
      if (!(qty > 0)) throw new Error('Quantity must be more than 0. To remove a line, cancel it.');
    }
    if (changes.status !== undefined) {
      if (STATUSES.indexOf(changes.status) < 0) throw new Error('Unknown status.');
      status = changes.status;
    }
    const newEff = status === 'Cancelled' ? 0 : qty;
    if (newEff !== oldEff) {
      r.refs.forEach(ref => {
        const sh = SpreadsheetApp.getActive().getSheetByName(ref.t);
        if (!sh) { warnings.push('Tab ' + ref.t + ' no longer exists.'); return; }
        const w = adjustCell_(sh, r.wh, r.group, r.item, r.sku, ref.c, newEff - oldEff);
        if (w) warnings.push(w);
      });
    }
    log.getRange(r.row, L['Qty'] + 1).setValue(qty);
    log.getRange(r.row, L['Status'] + 1).setValue(status);
    if (changes.notes !== undefined) log.getRange(r.row, L['Notes'] + 1).setValue(String(changes.notes));
    log.getRange(r.row, L['Updated At'] + 1, 1, 2).setValues([[new Date(), u.name || u.id]]);
    return { warnings: warnings };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Changes a whole RO (all lines of a batch): status, appointment date, Blinkit RO number.
 * The RO heading in the month tab is updated with the RO number and appointment.
 */
function updateBatch(token, batch, changes) {
  const u = auth_(token, 'Planner');
  changes = changes || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const lines = readLog_().filter(x => x.batch === batch);
    if (!lines.length) throw new Error('This RO was not found. Reload the RO Log.');
    const log = sheet_(TAB.LOG);
    const warnings = [];
    const now = new Date();
    const appt = changes.appt !== undefined ? parseDate_(changes.appt) : (lines[0].appt instanceof Date ? lines[0].appt : null);
    const roNo = changes.roNo !== undefined ? String(changes.roNo) : lines[0].roNo;
    if (changes.status !== undefined && STATUSES.indexOf(changes.status) < 0) throw new Error('Unknown status.');
    const delivered = changes.status === 'Delivered' ? parseDate_(changes.deliveredOn) : null;
    if (changes.status === 'Delivered' && !delivered) throw new Error('Enter the delivery date.');
    if (changes.status !== undefined) ensureSheet_(TAB.LOG, LOG_HEAD); // "Delivered On" / "Removed From Tab" headings
    lines.forEach(r => {
      if (changes.status !== undefined && (changes.status === 'Delivered' || r.status === 'Delivered')) {
        // Delivered: keep the date (the quantities leave the month tab 2 days later); un-delivered: clear it.
        log.getRange(r.row, L['Delivered On'] + 1).setValue(changes.status === 'Delivered' ? delivered : '');
        if (changes.status !== 'Delivered' && r.removedAt) warnings.push('RO ' + (r.roNo || r.batch) + ' was already removed from the month tab; its quantities are not put back.');
      }
      if (changes.status !== undefined && changes.status !== r.status) {
        const oldEff = r.status === 'Cancelled' ? 0 : r.qty, newEff = changes.status === 'Cancelled' ? 0 : r.qty;
        if (newEff !== oldEff) {
          r.refs.forEach(ref => {
            const sh = SpreadsheetApp.getActive().getSheetByName(ref.t);
            const w = sh ? adjustCell_(sh, r.wh, r.group, r.item, r.sku, ref.c, newEff - oldEff) : 'Tab ' + ref.t + ' no longer exists.';
            if (w) warnings.push(w);
          });
        }
        log.getRange(r.row, L['Status'] + 1).setValue(changes.status);
      }
      log.getRange(r.row, L['Appointment Date'] + 1, 1, 2).setValues([[appt || '', roNo]]);
      log.getRange(r.row, L['Updated At'] + 1, 1, 2).setValues([[now, u.name || u.id]]);
    });
    if (changes.appt !== undefined || changes.roNo !== undefined) {
      const r0 = lines[0];
      const roDate = r0.roDate instanceof Date ? r0.roDate : now;
      r0.refs.forEach(ref => {
        const sh = SpreadsheetApp.getActive().getSheetByName(ref.t);
        if (sh) setBatchLabel_(sh, r0.wh, r0.group, ref.c, roLabel_(roDate, roNo, appt, r0.wh, r0.dispatch));
      });
    }
    return { warnings: warnings };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Month tabs ---------------- */

/** Month tabs such as "Oct 2026", "Sept 2026", "January 2026", newest first. */
function monthTabs_() {
  const out = [];
  SpreadsheetApp.getActive().getSheets().forEach(sh => {
    const m = sh.getName().trim().match(/^([A-Za-z]+)[\s-]*(\d{4})$/);
    if (!m) return;
    const word = m[1].slice(0, 3).toLowerCase();
    const mi = MONTHS.findIndex(n => n.slice(0, 3).toLowerCase() === word);
    if (mi < 0) return;
    out.push({ name: sh.getName(), sheet: sh, key: Number(m[2]) * 12 + mi });
  });
  return out.sort((a, b) => b.key - a.key);
}

function monthTabFor_(d) {
  const key = d.getFullYear() * 12 + d.getMonth();
  return monthTabs_().filter(t => t.key === key)[0] || null;
}

/** Rows of a warehouse block: title row, heading row, item rows by item ID, and the block's last row. */
function findBlock_(values, wh, group) {
  const title = (wh + '-' + group).toLowerCase().replace(/\s+/g, ' ');
  let start = -1, end = values.length - 1;
  for (let i = 0; i < values.length; i++) {
    const a = typeof values[i][0] === 'string' ? values[i][0].trim() : '';
    if (start < 0) {
      if (a && a.toLowerCase().replace(/\s+/g, ' ') === title) start = i;
    } else if (a && BLOCK_RE.test(a)) { end = i - 1; break; }
  }
  if (start < 0) return null;
  const items = {};
  let firstItem = -1, lastItem = -1;
  for (let i = start + 1; i <= end; i++) {
    const a = values[i][0];
    if (typeof a === 'number' && a > 1000) {
      if (items[a] === undefined) items[a] = i;
      if (firstItem < 0) firstItem = i;
      lastItem = i;
    }
  }
  // The RO headings sit on the title row in some blocks and on the rows below it in others.
  let headRow = start;
  const titleHasHeads = [3, 4, 5, 6, 7].some(c => String(values[start][c] || '') !== '');
  if (!titleHasHeads) headRow = firstItem > start + 1 ? firstItem - 1 : start;
  return { start: start, end: end, items: items, firstItem: firstItem, lastItem: lastItem, headRow: headRow };
}

/** findBlock_, but a missing group block falls back to GROUP_FALLBACK (b.group = the block actually used). */
function blockFor_(values, wh, group) {
  const tries = [group].concat(GROUP_FALLBACK[group] || []);
  for (let i = 0; i < tries.length; i++) {
    const b = findBlock_(values, wh, tries[i]);
    if (b) { b.group = tries[i]; return b; }
  }
  return null;
}

function readBlockValues_(sh) {
  return sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 8).getValues();
}

/**
 * Writes one RO (several items) into the next free column D–H of the warehouse block.
 * A column is free when no item row of the block has a quantity in it. A missing item gets its own row,
 * copied from the item row above so the formulas in columns I onwards keep working.
 */
function writeBatch_(sh, wh, group, lines, label) {
  const warnings = [];
  let v = readBlockValues_(sh);
  let b = blockFor_(v, wh, group);
  if (!b) return { col: '', warnings: ['No block "' + wh + '-' + group + '" in tab ' + sh.getName() + '. Saved in the RO Log only.'] };
  if (b.group !== group) warnings.push('No "' + wh + '-' + group + '" block in ' + sh.getName() + ', so it went into the ' + b.group + ' block.');

  const missing = lines.filter(l => b.items[l.item] === undefined);
  if (missing.length) {
    missing.forEach(l => { insertItemRow_(sh, b, l.item, l.sku); v = readBlockValues_(sh); b = blockFor_(v, wh, group); });
    warnings.push('Added a row for ' + missing.map(l => l.sku || l.item).join(', ') + ' (it was not in this block).');
  }

  let col = -1;
  for (let c = 0; c < RO_COLS.length; c++) {
    const ci = FIRST_RO_COL - 1 + c;
    let used = false;
    for (let i = b.start + 1; i <= b.end; i++) {
      const a = v[i][0];
      if (typeof a === 'number' && a > 1000 && v[i][ci] !== '' && v[i][ci] !== null) { used = true; break; }
    }
    if (!used) { col = c; break; }
  }
  if (col < 0) {
    return { col: '', warnings: warnings.concat(['Columns D–H are all used in this block. Saved in the RO Log only; ' +
      'free a column (or start the new month) and use Settings → Sync month tabs.']) };
  }
  const colNo = FIRST_RO_COL + col;
  lines.forEach(l => { sh.getRange(b.items[l.item] + 1, colNo).setValue(l.qty); });
  writeLabel_(sh.getRange(b.headRow + 1, colNo), label);
  return { col: RO_COLS[col], warnings: warnings };
}

function insertItemRow_(sh, b, item, sku) {
  const after = (b.lastItem >= 0 ? b.lastItem : b.headRow) + 1; // 1-based row to insert after
  sh.insertRowAfter(after);
  if (b.lastItem >= 0) {
    // Copy the formatting and the formulas of the item row above, not its numbers (the daily columns from
    // L onwards hold that item's own figures).
    const width = sh.getMaxColumns();
    const src = sh.getRange(after, 1, 1, width), dst = sh.getRange(after + 1, 1, 1, width);
    src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    dst.setFormulasR1C1(src.getFormulasR1C1());
  }
  sh.getRange(after + 1, 1, 1, 2).setValues([[item, sku || '']]);
  sh.getRange(after + 1, FIRST_RO_COL, 1, RO_COLS.length).clearContent();
}

/** Adds delta to an item's cell in an RO column (to change or cancel a line). Returns a warning or ''. */
function adjustCell_(sh, wh, group, item, sku, colLetter, delta) {
  const ci = RO_COLS.indexOf(colLetter);
  if (ci < 0 || !delta) return '';
  let v = readBlockValues_(sh);
  let b = blockFor_(v, wh, group);
  if (!b) return 'Block ' + wh + '-' + group + ' not found in ' + sh.getName() + '.';
  if (b.items[item] === undefined) {
    if (delta < 0) return '';
    insertItemRow_(sh, b, item, sku);
    v = readBlockValues_(sh); b = blockFor_(v, wh, group);
  }
  const cell = sh.getRange(b.items[item] + 1, FIRST_RO_COL + ci);
  const cur = Number(cell.getValue()) || 0;
  const next = cur + delta;
  if (next > 0) cell.setValue(next); else cell.clearContent();
  return '';
}

function setBatchLabel_(sh, wh, group, colLetter, label) {
  const ci = RO_COLS.indexOf(colLetter);
  if (ci < 0) return;
  const b = blockFor_(readBlockValues_(sh), wh, group);
  if (b) writeLabel_(sh.getRange(b.headRow + 1, FIRST_RO_COL + ci), label);
}

/**
 * Starts a month: creates its tab by copying the newest month tab (columns D–H emptied, everything else kept)
 * if it does not exist yet, then copies in the open ROs of the last "Carry Over Days" of the previous month and
 * writes any RO of this month that is not in a tab yet.  month = 'yyyy-mm'.
 */
function startMonth(token, month) {
  auth_(token, 'Admin');
  const m = String(month || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error('Pick a month.');
  const y = Number(m[1]), mi = Number(m[2]) - 1;
  const first = new Date(y, mi, 1, 12);
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const out = { created: false, tab: '', carried: 0, written: 0, warnings: [] };
    let tab = monthTabFor_(first);
    if (!tab) {
      const src = monthTabs_()[0];
      if (!src) throw new Error('There is no month tab to copy from.');
      const ss = SpreadsheetApp.getActive();
      const name = MONTH_TAB_NAMES[mi] + ' ' + y;
      const copy = src.sheet.copyTo(ss).setName(name);
      ss.setActiveSheet(copy);
      ss.moveActiveSheet(src.sheet.getIndex() + 1);
      clearRoColumns_(copy);
      tab = { name: name, sheet: copy };
      out.created = true;
      out.warnings.push('Created "' + name + '" from "' + src.name + '" with columns D–H emptied. ' +
        'Columns I onwards are copied as they were — set the dates there as you usually do.');
    }
    out.tab = tab.name;
    const s = getSettings_();
    const carryFrom = new Date(first.getTime() - s.carryDays * 864e5);
    const nextFirst = new Date(y, mi + 1, 1, 12);
    const log = readLog_();
    const todo = {};
    log.forEach(r => {
      if (OPEN_STATUSES.indexOf(r.status) < 0 || !(r.roDate instanceof Date) || r.logOnly) return;
      if (r.refs.some(x => x.t === tab.name)) return;
      const inMonth = r.roDate >= new Date(y, mi, 1) && r.roDate < nextFirst;
      const carry = r.roDate >= carryFrom && r.roDate < new Date(y, mi, 1);
      if (!inMonth && !carry) return;
      (todo[r.batch] = todo[r.batch] || []).push(r);
      if (carry) out.carried++; else out.written++;
    });
    out.warnings = out.warnings.concat(writeBatchesToTab_(tab, todo));
    return out;
  } finally {
    lock.releaseLock();
  }
}

/** Empties the RO quantities and headings (columns D–H) of every warehouse block. */
function clearRoColumns_(sh) {
  const v = readBlockValues_(sh);
  let inBlock = false;
  for (let i = 0; i < v.length; i++) {
    const a = v[i][0];
    if (typeof a === 'string' && BLOCK_RE.test(a.trim())) inBlock = true;
    if (!inBlock) continue;
    if ([3, 4, 5, 6, 7].some(c => v[i][c] !== '' && v[i][c] !== null)) {
      sh.getRange(i + 1, FIRST_RO_COL, 1, RO_COLS.length).clearContent();
    }
  }
}

/** Writes RO Log batches into a tab and stores where they went. Returns warnings. */
function writeBatchesToTab_(tab, todo) {
  const warnings = [];
  const log = sheet_(TAB.LOG);
  Object.keys(todo).forEach(batch => {
    const rs = todo[batch], r0 = rs[0];
    const appt = r0.appt instanceof Date ? r0.appt : null;
    const w = writeBatch_(tab.sheet, r0.wh, r0.group,
      rs.map(r => ({ item: r.item, sku: r.sku, qty: r.qty })), roLabel_(r0.roDate, r0.roNo, appt, r0.wh, r0.dispatch));
    w.warnings.forEach(x => warnings.push(r0.wh + ' ' + r0.group + ': ' + x));
    if (!w.col) return;
    rs.forEach(r => {
      const refs = r.refs.concat([{ t: tab.name, c: w.col }]);
      log.getRange(r.row, L['Month Tab'] + 1).setValue(refs.map(x => x.t + ' (' + x.c + ')').join(', '));
      log.getRange(r.row, L['Tab Refs'] + 1).setValue(JSON.stringify(refs));
    });
  });
  return warnings;
}

/** Writes every open RO that is not in its month's tab yet (for example, the tab was created later). */
function syncMonthTabs(token) {
  auth_(token, 'Planner');
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const byTab = {};
    readLog_().forEach(r => {
      if (OPEN_STATUSES.indexOf(r.status) < 0 || !(r.roDate instanceof Date) || r.logOnly) return;
      const tab = monthTabFor_(r.roDate);
      if (!tab || r.refs.some(x => x.t === tab.name)) return;
      const t = byTab[tab.name] = byTab[tab.name] || { tab: tab, todo: {} };
      (t.todo[r.batch] = t.todo[r.batch] || []).push(r);
    });
    let warnings = [], n = 0;
    Object.keys(byTab).forEach(k => {
      n += Object.keys(byTab[k].todo).length;
      warnings = warnings.concat(writeBatchesToTab_(byTab[k].tab, byTab[k].todo));
    });
    // Every open RO's heading in the current layout (RO date / last 6 digits / dispatch - appointment).
    const heads = refreshHeadings_(readLog_().filter(r => OPEN_STATUSES.indexOf(r.status) >= 0 && !r.logOnly));
    return { ros: n, headings: heads, warnings: warnings };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Travalate Inventory (TI) stock ---------------- */

// The Travalate Inventory app's web app (same link the Shipment Manager uses). Its shared secret is never kept in
// the repo: an admin enters it once in Settings → Travalate Inventory, and it is stored in this script's Script
// Properties (TI_SECRET). The link can be changed there too (TI_URL).
const TI_DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbwyU5NATMoqY3La_piZ7XG34HohF5qhKsxJwUDOHdYOFdSBShtBmmIqrPJBgTvxhXx9/exec';

function tiCall_(url, secret) {
  const resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ secret: secret, action: 'getStockSnapshot' }),
  });
  let res;
  try { res = JSON.parse(resp.getContentText()); } catch (e) {
    throw new Error('Travalate Inventory did not answer properly (HTTP ' + resp.getResponseCode() + '). Check its link in Settings.');
  }
  if (!res || !res.success) throw new Error('Travalate Inventory: ' + ((res && res.error) || 'no data') + (res && res.error === 'Unauthorized.' ? ' Check the shared secret in Settings.' : ''));
  return res;
}

/** Current company stock per SKU from Travalate Inventory: { ok, updatedAt, monthLabel, stocks: [{ sku, qty, asOf }] }. */
function getTiStock(token) {
  auth_(token, 'Viewer');
  const p = PropertiesService.getScriptProperties();
  const secret = p.getProperty('TI_SECRET');
  if (!secret) return { ok: false, setup: true, error: 'Travalate Inventory is not connected yet. An admin enters its shared secret in Settings → Travalate Inventory.' };
  const cache = CacheService.getScriptCache();
  const hit = cache.get('ti_stock');
  if (hit) return JSON.parse(hit);
  const res = tiCall_(p.getProperty('TI_URL') || TI_DEFAULT_URL, secret);
  const out = { ok: true, updatedAt: res.updatedAt, monthLabel: res.monthLabel,
    stocks: (res.stocks || []).map(x => ({ sku: String(x.sku), qty: Number(x.qty) || 0, asOf: String(x.asOf || '') })) };
  const json = JSON.stringify(out);
  if (json.length < 90000) cache.put('ti_stock', json, 120); // 2 minutes: quick reloads don't call Inventory again
  return out;
}

function getTiLink(token) {
  auth_(token, 'Admin');
  const p = PropertiesService.getScriptProperties();
  return { url: p.getProperty('TI_URL') || TI_DEFAULT_URL, hasSecret: !!p.getProperty('TI_SECRET') };
}

/** Saves the TI link / shared secret (secret '' = keep the saved one) after checking they work. */
function saveTiLink(token, url, secret) {
  auth_(token, 'Admin');
  const p = PropertiesService.getScriptProperties();
  url = String(url || '').trim() || TI_DEFAULT_URL;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) throw new Error('The link must be the Inventory web app link ending in /exec.');
  secret = String(secret || '') || p.getProperty('TI_SECRET') || '';
  if (!secret) throw new Error('Enter the shared secret.');
  const res = tiCall_(url, secret); // throws with the reason if it doesn't work; nothing is saved then
  p.setProperty('TI_URL', url);
  p.setProperty('TI_SECRET', secret);
  CacheService.getScriptCache().remove('ti_stock');
  return { ok: true, skus: (res.stocks || []).length, monthLabel: res.monthLabel };
}

/* ---------------- Settings & SKUs ---------------- */

function saveSettings(token, s) {
  auth_(token, 'Admin');
  s = s || {};
  const map = {
    'Company': s.company, 'Cover Days': s.coverDays, 'Min Line Qty': s.minLine, 'Round To': s.roundTo,
    'Shipping Address': s.address, 'New Listing Starters': s.starters === undefined ? undefined : (s.starters ? 'Yes' : 'No'),
    'Carry Over Days': s.carryDays,
    'Dispatch Capacity': s.dispatchCap, 'Dispatch Days': s.dispatchDays, 'Lead Days': s.leadDays,
    'Short Lead Days': s.shortLeadDays, 'Short Lead Warehouses': s.shortLeadWh, 'Packing Days': s.packDays,
  };
  if (map['Dispatch Capacity'] !== undefined && !(Number(map['Dispatch Capacity']) >= 1)) throw new Error('Dispatch Capacity must be a number above 0.');
  ['Lead Days', 'Short Lead Days'].forEach(k => {
    if (map[k] !== undefined && !(Number(map[k]) >= 1 && Number(map[k]) <= 60)) throw new Error(k + ' must be a number from 1 to 60.');
  });
  if (map['Packing Days'] !== undefined && !(Number(map['Packing Days']) >= 0 && Number(map['Packing Days']) <= 10)) throw new Error('Packing Days must be a number from 0 to 10.');
  ['Cover Days', 'Min Line Qty', 'Round To'].forEach(k => {
    if (map[k] !== undefined && !(Number(map[k]) >= 1 && Number(map[k]) <= 120)) throw new Error(k + ' must be a number from 1 to 120.');
  });
  if (map['Carry Over Days'] !== undefined && !(Number(map['Carry Over Days']) >= 0 && Number(map['Carry Over Days']) <= 31)) {
    throw new Error('Carry Over Days must be a number from 0 to 31 (0 = do not carry over).');
  }
  const sh = sheet_(TAB.SETTINGS);
  const keys = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  Object.keys(map).forEach(k => {
    if (map[k] === undefined) return;
    const i = keys.indexOf(k);
    const val = typeof map[k] === 'string' ? map[k] : Number(map[k]);
    if (i >= 0) sh.getRange(i + 2, 2).setValue(val);
    else sh.appendRow([k, val, '']);
  });
  // Lead / packing / dispatch days move the dispatch day shown in the month-tab RO headings: rewrite them.
  if (['Dispatch Days', 'Lead Days', 'Short Lead Days', 'Short Lead Warehouses', 'Packing Days'].some(k => map[k] !== undefined)) {
    DISPATCH_CONF_CACHE_ = null;
    try { refreshHeadings_(readLog_().filter(r => OPEN_STATUSES.indexOf(r.status) >= 0 && !r.logOnly)); } catch (e) { /* settings are saved either way */ }
  }
  return getSettings_();
}

/**
 * Reads the newest month tab that has items and compares it with the SKU list:
 *  - Group = the block (TBI / TBO / TBG) the item sits in; Tier = column C of its rows (L1–L4 …). When an item
 *    differs between warehouses, the value it has most often wins (a tie keeps the SKU list's value).
 *  - Clashes = an item listed in two different group blocks of the SAME warehouse (fix those in the sheet).
 * apply = false only lists the changes; apply = true also saves them.
 */
function groupsFromMonthTab(token, apply) {
  auth_(token, 'Admin');
  const tabs = monthTabs_();
  let tab = null, seen = null;
  for (let t = 0; t < tabs.length && !tab; t++) {
    const sh = tabs[t].sheet;
    const v = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 3).getValues();
    const c = {};
    let group = '', wh = '';
    v.forEach(r => {
      const a = typeof r[0] === 'string' ? r[0].trim() : r[0];
      const m = typeof a === 'string' ? a.match(BLOCK_RE) : null;
      if (m) { wh = m[1].trim(); group = m[2]; return; }
      if (!group || typeof a !== 'number' || a <= 1000) return;
      const k = String(a);
      const x = c[k] = c[k] || { groups: {}, tiers: {}, sku: '', where: {} };
      if (!x.sku && r[1] !== '') x.sku = String(r[1]);
      x.groups[group] = (x.groups[group] || 0) + 1;
      const tier = String(r[2] == null ? '' : r[2]).trim();
      if (tier) x.tiers[tier] = (x.tiers[tier] || 0) + 1;
      (x.where[wh] = x.where[wh] || []).indexOf(group) < 0 && x.where[wh].push(group);
    });
    if (Object.keys(c).length) { tab = tabs[t]; seen = c; }
  }
  if (!tab) return { tab: '', changes: [], clashes: [] };

  const pick = (counts, cur) => {
    let best = '';
    Object.keys(counts).forEach(k => { if (!best || counts[k] > counts[best]) best = k; });
    return cur && counts[cur] && counts[cur] === counts[best] ? cur : best;
  };
  const byItem = {};
  getSkus_().forEach(s => { byItem[String(s.item)] = s; });
  const changes = [], clashes = [];
  Object.keys(seen).sort().forEach(k => {
    const x = seen[k], s = byItem[k];
    const curG = s ? s.group : '', curT = s ? String(s.tier || '').trim() : '';
    const g = pick(x.groups, curG) || curG, t = pick(x.tiers, curT) || curT;
    Object.keys(x.where).forEach(w => {
      if (x.where[w].length > 1) clashes.push({ item: Number(k), sku: s ? s.sku : x.sku, wh: w, groups: x.where[w].join(' + ') });
    });
    if (g === curG && t === curT && s) return;
    changes.push({
      item: Number(k), sku: s ? s.sku : x.sku, from: curG, to: g, fromTier: curT, toTier: t,
      where: GROUPS.filter(q => x.groups[q]).map(q => q + ' ×' + x.groups[q]).join(', ') +
        (Object.keys(x.tiers).length > 1 ? ' · tiers ' + Object.keys(x.tiers).map(q => q + ' ×' + x.tiers[q]).join(', ') : ''),
      row: s ? { item: s.item, sku: s.sku, name: s.name, group: g, tier: t, active: s.active }
             : { item: Number(k), sku: x.sku, name: '', group: g, tier: t, active: true },
    });
  });
  if (apply && changes.length) saveSkus(token, changes.map(x => x.row));
  return {
    tab: tab.name, applied: !!apply, clashes: clashes, skus: apply ? getSkus_() : undefined,
    changes: changes.map(x => ({ item: x.item, sku: x.sku, from: x.from, to: x.to, fromTier: x.fromTier, toTier: x.toTier, where: x.where })),
  };
}

/** rows = [{ item, sku, name, group, tier, active }] — adds or updates by Item ID. */
function saveSkus(token, rows) {
  auth_(token, 'Admin');
  const sh = ensureSheet_(TAB.SKUS, SKU_HEAD); // adds the "TI SKU" heading to an older tab
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cur = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
    (rows || []).forEach(r => {
      const id = Number(r.item);
      if (!id) return;
      const group = String(r.group || '').toUpperCase();
      if (group && GROUPS.indexOf(group) < 0) throw new Error('Group must be ' + GROUPS.join(', ') + '.');
      const vals = [id, String(r.sku || ''), String(r.name || ''), group, String(r.tier || ''), r.active === false ? 'No' : 'Yes'];
      const i = cur.indexOf(String(id));
      // TI SKU is only changed when the caller sends it (e.g. "Take groups & tiers" leaves it as it is).
      const ti = r.tiSku === undefined ? undefined : String(r.tiSku || '').trim();
      if (i >= 0) {
        sh.getRange(i + 2, 1, 1, vals.length).setValues([vals]);
        if (ti !== undefined) sh.getRange(i + 2, vals.length + 1).setValue(ti);
      } else { sh.appendRow(vals.concat([ti || ''])); cur.push(String(id)); }
    });
  } finally {
    lock.releaseLock();
  }
  return getSkus_();
}
