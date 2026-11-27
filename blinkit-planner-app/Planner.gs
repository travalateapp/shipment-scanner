/**
 * Blinkit Shipment Planner — server side.
 *
 * This file (Planner.gs) sits in the Blinkit Google Sheet's Apps Script project next to the daily inventory
 * updater (Code.gs + UploadDialog.html) and is deployed as a web app. It shares no names with that script and
 * needs no other permissions than the spreadsheet access the project already has.
 * The page (Index.html) reads the two Blinkit downloads in the browser, works out the plan and calls the
 * functions below to keep the RO Log and the month tabs (columns D–H) of this sheet up to date.
 *
 * It only ever writes to the RO columns (D–H, plus any it added when they were full) and the RO heading cell above
 * them of a month tab, inserts a row for an item that is missing from a warehouse block, inserts an RO column when
 * all are used, and creates a new month tab by copying the last one. The columns after the RO columns are never
 * written to.
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
  'Updated By', 'Tab Refs', 'Blinkit Created At', 'Merged RO', 'Dispatch Date', 'Delivered On', 'Removed From Tab', 'Dispatch Fixed',
  'Shipped Qty', 'GRN Base', 'Shipped On', 'Ship Sync Until', 'Short Note'];
const L = {}; LOG_HEAD.forEach((h, i) => { L[h] = i; });

// 'TI SKU' = the SKU's name in the Travalate Inventory (TI) app, when it differs from 'SKU' (blank = same as SKU).
const SKU_HEAD = ['Item ID', 'SKU', 'Item Name', 'Group', 'Tier', 'Active', 'TI SKU'];
const USER_HEAD = ['User ID', 'Name', 'PIN', 'Role', 'Active'];
// 'Blinkit Incoming' + 'RO Log Incoming' = 'Planned' (its two parts, for the Dashboard's Planned breakdown).
const SNAP_HEAD = ['Warehouse', 'Item ID', 'Item Name', 'Group', 'Status', 'Daily Rate', 'Stock + Incoming',
  'Days Cover', 'Suggested', 'Locked', 'Has', 'Planned', 'Blinkit Incoming', 'RO Log Incoming', 'Delivered (awaiting GRN)'];

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
  ['Lock RO Columns', 'Yes', 'Yes = values typed, pasted or deleted in the month tabs\' RO columns (D to the last RO column) are put back at once (colours stay free); needs the guardRoEdits trigger. No = off'],
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December'];
const MONTH_TAB_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const BLOCK_RE = /^(.+)-(TBI|TBO|TBG)$/;
const FIRST_RO_COL = 4; // D
const BASE_RO_COLS = 5;  // D–H
// When D–H (and any added ones) are full, the planner inserts one more RO column and marks it with this note in row 1;
// a tab's RO columns are D plus 5 + the number of marked columns (a marked column deleted by hand is simply not counted).
const RO_COL_NOTE = 'Blinkit Planner: RO column added (D–H were full)';
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
  groupsFromMonthTab, getTiStock, getTiLink, saveTiLink, setDispatchDates, getShipLink, saveShipLink, syncShipments,
  compactMonthTabs, tidyIfDue, getSmApi, saveSmApi, dummyRoInvoice,
};

/** Request body (sent as text/plain): { "fn": "getBoot", "args": [token, ...], "rid": "<retry id>" } */
function doPost(e) {
  const t0 = Date.now();
  let json, rid = '';
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    // The Production App's Projections ask for Blinkit's sales with the shared secret (no login).
    if (req.action === 'productionSales') return ContentService.createTextOutput(JSON.stringify(productionSales_(req.secret))).setMimeType(ContentService.MimeType.JSON);
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

/** The RO Log tab, with any heading a newer version needs (checked at most every 6 hours, not on every save). */
function ensureLog_() {
  const cache = CacheService.getScriptCache(), key = 'loghead_' + LOG_HEAD.length;
  if (cache.get(key)) return sheet_(TAB.LOG);
  const sh = ensureSheet_(TAB.LOG, LOG_HEAD);
  cache.put(key, '1', 21600);
  return sh;
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('The tab "' + name + '" is missing. Run setup in Apps Script once.');
  return sh;
}

/** Warehouse names compared ignoring spaces and capitals. */
function whNorm_(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }

let TZ_ = '';
function tz_() { return TZ_ || (TZ_ = SpreadsheetApp.getActive().getSpreadsheetTimeZone() || Session.getScriptTimeZone()); }
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
    lockRo: !/^n/i.test(String(out['Lock RO Columns'] == null ? 'Yes' : out['Lock RO Columns'])),
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
  let u = null;
  try { u = JSON.parse(cache.get('usr_' + String(id).toLowerCase()) || 'null'); } catch (e) { u = null; }
  if (!u) {
    u = findUser_(id);
    if (u) cache.put('usr_' + String(id).toLowerCase(), JSON.stringify({ row: u.row, id: u.id, name: u.name, role: u.role, active: u.active }), 300);
  }
  if (!u || !u.active) throw new Error('SESSION_EXPIRED');
  if (minRole && ROLES.indexOf(u.role) > ROLES.indexOf(minRole)) {
    throw new Error('You do not have permission for this. Ask an admin.');
  }
  return u;
}

function changePin(token, oldPin, newPin) {
  const u = findUser_(auth_(token).id); // with its PIN
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
    CacheService.getScriptCache().remove('usr_' + existing.id.toLowerCase());
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
  const log = ensureLog_(), now = new Date(), cols = {};
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
    const x = cols[k], ci = roCols_(x.sh).indexOf(x.c), v = tabValues_(x.sh), b = blockFor_(v, x.wh, x.group);
    if (!b || ci < 0) return;
    const c = FIRST_RO_COL - 1 + ci;
    const empty = Object.keys(b.items).every(it => { const val = v[b.items[it]][c]; return val === '' || val === null || Number(val) === 0; });
    if (empty) { x.sh.getRange(b.headRow + 1, c + 1).clearContent(); v[b.headRow][c] = ''; }
  });
  return due.length;
}

/** For a time-driven trigger (Apps Script → Triggers → cleanupDeliveredROs, daily). */
function cleanupDeliveredROs() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const n = cleanupDelivered_();
    try { maybeDailyTidy_(); } catch (e) { /* tried again next time */ }
    return n;
  } finally { lock.releaseLock(); }
}

const TIDY_HOUR = 10; // the month tabs are tidied once a day, from 10 AM (sheet's time zone)
/**
 * The daily tidy-up: once a day, at or after 10 AM — run by the dailyTidy trigger (Apps Script → Triggers →
 * dailyTidy, Day timer, 10am to 11am), or else by the first opening of the planner after 10 AM.
 */
function maybeDailyTidy_() {
  const props = PropertiesService.getScriptProperties(), now = new Date();
  const day = ymd_(now), hour = Number(Utilities.formatDate(now, tz_(), 'H'));
  if (hour < TIDY_HOUR || props.getProperty('TIDY_DAY') === day) return null;
  props.setProperty('TIDY_DAY', day);
  return compactMonthTabs_();
}
/** From the page, in the background after it opened: the daily tidy if it is due (after 10 AM, not done today). */
function tidyIfDue(token) {
  auth_(token);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return null; // busy: the next opening tries again
  try { return maybeDailyTidy_(); } finally { lock.releaseLock(); }
}
/** For a time-driven trigger: Apps Script → Triggers → dailyTidy, Day timer, 10am to 11am. */
function dailyTidy() {
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try { return maybeDailyTidy_(); } finally { lock.releaseLock(); }
}

/** Settings → "Tidy month tabs now" (Admin): the same tidy-up at once. */
function compactMonthTabs(token) {
  auth_(token, 'Admin');
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try { return compactMonthTabs_(); } finally { lock.releaseLock(); }
}

/**
 * Tidies the current and the previous month tab (any tab still holding open ROs is one of these):
 *  1. In every warehouse block (TBI / TBO / TBG), RO columns move left into empty RO columns before them, in order,
 *     with their quantities, heading, red "not sent" marks and notes; the RO Log follows (Month Tab / Tab Refs).
 *  2. RO columns added by the planner (from I on) that are then empty in every block are deleted, so the tab
 *     doesn't keep growing; D–H always stay. The daily updater's "Undo Last Upload" letters move along.
 * Returns { tab: { moved, deleted } } for the tabs that changed.
 */
function compactMonthTabs_() {
  const now = new Date(), out = {};
  const keys = [now.getFullYear() * 12 + now.getMonth(), now.getFullYear() * 12 + now.getMonth() - 1];
  monthTabs_().filter(x => keys.indexOf(x.key) >= 0).forEach(x => {
    const r = compactTab_(x.sheet);
    try { r.rowsFixed = repairItemRows_(x.sheet); } catch (e) { r.rowsFixed = 0; }
    if (r.moved || r.deleted || r.rowsFixed || r.cleaned) out[x.name] = r;
  });
  return out;
}

function compactTab_(sh) {
  const name = sh.getName();
  delete TABV_[name]; delete RO_N_[name];
  const n = roColCount_(sh), v = readBlockValues_(sh);
  const filled = x => x !== '' && x !== null && x !== undefined;
  const all = readLog_();
  // Every warehouse block and, per block, which RO columns hold an RO (any quantity; a heading alone is left over).
  const blocks = [];
  v.forEach((row, i) => {
    const a = typeof row[0] === 'string' ? row[0].trim() : '', m = a.match(BLOCK_RE);
    if (!m) return;
    const b = findBlock_(v, m[1].trim(), m[2]);
    if (!b || b.start !== i) return;
    b.wh = m[1].trim(); b.group = m[2];
    b.itemRows = Object.keys(b.items).map(it => b.items[it]).filter((x, k, arr) => arr.indexOf(x) === k).sort((p, q) => p - q);
    b.rows = [b.headRow].concat(b.itemRows.filter(x => x !== b.headRow)).sort((p, q) => p - q);
    b.used = [];
    for (let k = 0; k < n; k++) b.used.push(b.itemRows.some(rr => filled(v[rr][FIRST_RO_COL - 1 + k])));
    blocks.push(b);
  });
  // When each RO column's RO was made: its RO Log lines' RO date (then when they were saved); else the date in its
  // heading ("RO 21 NOV"); else it keeps its place after the dated ones.
  const when = {};
  const live = r => r.status !== 'Cancelled' && !r.removedAt; // lines whose quantities are in the tab
  all.forEach(r => r.refs.forEach(ref => {
    if (ref.t !== name || !(r.roDate instanceof Date) || !live(r)) return;
    const b = blockFor_(v, r.wh, r.group); if (!b) return;
    const k = b.start + '|' + ref.c, d = r.roDate.getTime(), c = r.createdAt instanceof Date ? r.createdAt.getTime() : 0;
    if (!when[k] || d < when[k].d || (d === when[k].d && c < when[k].c)) when[k] = { d: d, c: c };
  }));
  const tabKey = (monthTabs_().filter(x => x.name === name)[0] || {}).key;
  const headDate = label => {
    const m = String(label || '').match(/^\s*RO\s+(\d{1,2})\s+([A-Za-z]{3})/i); if (!m) return null;
    const mi = MONTHS.findIndex(x => x.slice(0, 3).toLowerCase() === m[2].toLowerCase()); if (mi < 0) return null;
    let y = tabKey ? Math.floor(tabKey / 12) : new Date().getFullYear();
    if (tabKey && mi > tabKey % 12 + 1) y--; // e.g. a December RO carried into the January tab
    return new Date(y, mi, Number(m[1])).getTime();
  };
  const temp = [];   // the RO columns being re-placed are parked here (same rows) while their block is rewritten
  let tempSh = null;
  const remap = []; // { b: block, from: letter, to: letter }
  let moved = 0;
  blocks.forEach(b => {
    const usedCols = [];
    for (let k = 0; k < n; k++) if (b.used[k]) usedCols.push(k);
    const key = k => {
      const w = when[b.start + '|' + colLetter_(FIRST_RO_COL + k)];
      if (w) return [w.d, w.c, k];
      const hd = headDate(v[b.headRow][FIRST_RO_COL - 1 + k]);
      return [hd == null ? Infinity : hd, 0, k];
    };
    const order = usedCols.slice().sort((p, q) => { const a = key(p), c = key(q); return a[0] - c[0] || a[1] - c[1] || a[2] - c[2]; });
    const inPlace = order.every((k, p) => k === p);
    // Leftovers: a heading (or note / colour) in a column with no quantities in this block.
    const leftovers = [];
    for (let k = order.length; k < n; k++) if (filled(v[b.headRow][FIRST_RO_COL - 1 + k])) leftovers.push(k);
    if (inPlace && !leftovers.length) return;
    if (!inPlace) {
      if (!tempSh) tempSh = tempSheet_();
      const runs = runsOf_(b.rows);
      // 1. Park every RO column of the block (values, formats, notes) in the temp sheet, in the new order.
      order.forEach((k, p) => runs.forEach(run => {
        sh.getRange(run[0] + 1, FIRST_RO_COL + k, run.length, 1).copyTo(tempSh.getRange(run[0] + 1, p + 1, run.length, 1));
        const notes = sh.getRange(run[0] + 1, FIRST_RO_COL + k, run.length, 1).getNotes();
        tempSh.getRange(run[0] + 1, p + 1, run.length, 1).setNotes(notes);
      }));
      // 2. Empty the block's RO cells, 3. bring them back left to right: earliest RO first.
      clearRoCells_(sh, b, 0, n);
      order.forEach((k, p) => runs.forEach(run => {
        const src = tempSh.getRange(run[0] + 1, p + 1, run.length, 1), dst = sh.getRange(run[0] + 1, FIRST_RO_COL + p, run.length, 1);
        src.copyTo(dst); dst.setNotes(src.getNotes());
      }));
      tempSh.getRange(1, 1, tempSh.getMaxRows(), Math.max(1, order.length)).clearNote();
      tempSh.clear();
      order.forEach((k, p) => {
        if (k !== p) { remap.push({ b: b, from: colLetter_(FIRST_RO_COL + k), to: colLetter_(FIRST_RO_COL + p) }); moved++; }
      });
      for (let k = 0; k < n; k++) b.used[k] = k < order.length;
    } else {
      leftovers.forEach(k => clearRoCells_(sh, b, k, 1));
    }
    temp.push(b);
  });
  if (remap.length) {
    // The RO Log follows: a line's reference to this tab moves when its block's column moved (all at once).
    const log = ensureLog_();
    readLog_().forEach(r => {
      if (!live(r)) return; // a cancelled / delivered-and-removed line no longer owns a column
      let ch = false;
      r.refs.forEach(ref => {
        if (ref.t !== name) return;
        const b = blockFor_(v, r.wh, r.group);
        const mv = b && remap.filter(x => x.b.start === b.start && x.from === ref.c)[0];
        if (mv) { ref.c = mv.to; ch = true; }
      });
      if (!ch) return;
      log.getRange(r.row, L['Month Tab'] + 1).setValue(refsText_(r.refs));
      log.getRange(r.row, L['Tab Refs'] + 1).setValue(JSON.stringify(r.refs));
    });
  }
  // Added RO columns (beyond D–H) empty in every block: deleted from the right end of the RO columns.
  const keep = Math.max(BASE_RO_COLS, blocks.reduce((mx, b) => Math.max(mx, b.used.lastIndexOf(true) + 1), 0));
  let deleted = 0;
  for (let k = n - 1; k >= keep; k--) {
    const col = FIRST_RO_COL + k;
    sh.deleteColumn(col);
    deleted++;
    shiftUndoMeta_(name, col);
  }
  if (deleted) {
    // Row 1 marks the added columns: keep exactly (RO columns − 5) marks.
    const notes = sh.getRange(1, FIRST_RO_COL, 1, keep).getNotes()[0];
    let marks = notes.filter(x => String(x || '').indexOf(RO_COL_NOTE) === 0).length;
    for (let k = keep - 1; k >= 0 && marks > keep - BASE_RO_COLS; k--) {
      if (String(notes[k] || '').indexOf(RO_COL_NOTE) === 0) { sh.getRange(1, FIRST_RO_COL + k).clearNote(); marks--; }
    }
    for (let k = keep - 1; k >= BASE_RO_COLS && marks < keep - BASE_RO_COLS; k--) { // (a mark removed by hand: put one back)
      if (String(notes[k] || '').indexOf(RO_COL_NOTE) !== 0) { sh.getRange(1, FIRST_RO_COL + k).setNote(RO_COL_NOTE); marks++; }
    }
  }
  delete TABV_[name];
  if (deleted) RO_N_[name] = keep; else delete RO_N_[name];
  return { moved: moved, deleted: deleted, cleaned: temp.length };
}

/**
 * Empties RO columns k0 … k0+cnt−1 of a block: item cells lose their value, note and formatting; the heading cell
 * loses its value, note and font colour / bold (the heading row keeps its own background and borders).
 */
function clearRoCells_(sh, b, k0, cnt) {
  runsOf_(b.itemRows).forEach(run => {
    const r = sh.getRange(run[0] + 1, FIRST_RO_COL + k0, run.length, cnt);
    r.clearContent(); r.clearNote(); r.clearFormat();
  });
  const h = sh.getRange(b.headRow + 1, FIRST_RO_COL + k0, 1, cnt);
  h.clearContent(); h.clearNote(); h.setFontColor(null).setFontWeight(null);
}

/** A hidden scratch tab where RO columns are parked while a block is rewritten (emptied after each use). */
function tempSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('_PlannerTemp');
  if (!sh) { sh = ss.insertSheet('_PlannerTemp', ss.getSheets().length); try { sh.hideSheet(); } catch (e) { /* shown is fine too */ } }
  return sh;
}

/** Sorted row numbers → runs of consecutive rows. */
function runsOf_(rows) {
  const out = [];
  rows.forEach(r => { const last = out[out.length - 1]; if (last && r === last[last.length - 1] + 1) last.push(r); else out.push([r]); });
  return out;
}

/** A column of this tab was deleted: the daily updater's remembered Undo columns right of it move one left. */
function shiftUndoMeta_(name, col) {
  try {
    const dp = PropertiesService.getDocumentProperties(), raw = dp.getProperty('BLINKIT_UNDO_META');
    if (!raw) return;
    const um = JSON.parse(raw);
    if (!um || um.mainSheetName !== name) return;
    ['sourceCol', 'targetCol'].forEach(k => { if (um[k] && colNumber_(um[k]) > col) um[k] = colLetter_(colNumber_(um[k]) - 1); });
    dp.setProperty('BLINKIT_UNDO_META', JSON.stringify(um));
  } catch (e) { /* the column is deleted either way */ }
}

function getBoot(token) {
  const u = auth_(token);
  const cache = CacheService.getScriptCache();
  if (!cache.get('deliv_clean')) {
    cache.put('deliv_clean', '1', 1800);
    try { // delivered clean-up only; the daily tidy runs after the page has opened (tidyIfDue)
      const lock = LockService.getScriptLock(); lock.waitLock(30000);
      try { cleanupDelivered_(); } finally { lock.releaseLock(); }
    } catch (e) { /* never blocks opening the planner */ }
  }
  const tabs = monthTabs_(), latest = tabs[0], bootLog = readLog_();
  return {
    user: { id: u.id, name: u.name, role: u.role },
    version: SERVER_VERSION,
    settings: getSettings_(),
    skus: getSkus_(),
    groups: GROUP_NAMES,
    warehouses: latest ? blockWarehouses_(latest.sheet) : [],
    months: tabs.slice(0, 6).map(t => t.name),
    openROs: openROsOf_(bootLog),
    delivered: recentDeliveredOf_(bootLog),
    shipLinked: !!PropertiesService.getScriptProperties().getProperty('SHIP_SHEET_ID'), // Shipped = found there
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
  const all = readLog_();
  return {
    meta: snapshotMeta_(),
    rows: rows.map(r => r.map(v => (v instanceof Date ? fmtDate_(v) : v))),
    openROs: openROsOf_(all),
    // ROs delivered in the last 45 days: shown on their delivery day in the calendar, and moved from Planned to Has
    // on the Dashboard when they were marked delivered after the last plan.
    delivered: recentDeliveredOf_(all),
  };
}

/* ---------------- RO Log ---------------- */

function readLog_() {
  const sh = ensureLog_(); // a newer heading (e.g. Short Note) is added before reading that many columns
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
    dispatchFixed: String(r[L['Dispatch Fixed']] || '') === 'Yes', updatedAt: r[L['Updated At']], updatedBy: String(r[L['Updated By']] || ''),
    shippedQty: r[L['Shipped Qty']] === '' || r[L['Shipped Qty']] == null ? null : Number(r[L['Shipped Qty']]),
    grnBase: r[L['GRN Base']] === '' || r[L['GRN Base']] == null ? null : Number(r[L['GRN Base']]),
    shippedOn: r[L['Shipped On']], shipSyncUntil: r[L['Ship Sync Until']], // a dispatch day set by hand: used even with an appointment
    shortNote: String(r[L['Short Note']] == null ? '' : r[L['Short Note']]), // why the not-sent part was not sent
  })).filter(r => r.key);
}

function parseRefs_(s) {
  try { const v = JSON.parse(String(s || '[]')); return Array.isArray(v) ? v.map(x => mkRef_(x.t, x.c)) : []; } catch (e) { return []; }
}

/** Units of the RO line the Shipment Manager says were not sent (0 until it has a shipment for it). */
function shortOf_(r) {
  return r.shippedOn instanceof Date && r.shippedQty != null && r.status !== 'Cancelled' ? Math.max(0, r.qty - r.shippedQty) : 0;
}

function publicRo_(r) {
  return {
    key: r.key, batch: r.batch, createdAt: fmtStamp_(r.createdAt), createdBy: r.createdBy, roDate: fmtDate_(r.roDate),
    wh: r.wh, group: r.group, item: r.item, sku: r.sku, name: r.name, qty: r.qty, status: r.status,
    appt: fmtDate_(r.appt), roNo: r.roNo, source: r.source, notes: r.notes, blinkitAt: fmtStamp_(r.blinkitAt), merged: r.merged, dispatch: fmtDate_(r.dispatch), dispatchFixed: !!r.dispatchFixed, updatedAt: fmtStamp_(r.updatedAt),
    shippedQty: r.shippedQty, grnBase: r.grnBase, shippedOn: fmtDate_(r.shippedOn),
    shortQty: shortOf_(r), shortNote: r.shortNote || '', updatedBy: r.updatedBy || '',
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
    const rows = [], written = []; // written: the month tab columns filled, undone if the RO Log can't be saved
    Object.keys(batches).forEach(k => {
      const b = batches[k];
      const batchId = Utilities.formatDate(now, tz_(), 'yyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 4);
      let ref = null;
      if (data.logOnly) {
        // Already typed into the month tab by hand: only logged.
      } else if (tab) {
        const w = writeBatch_(tab.sheet, b.wh, b.group, b.lines, roLabel_(roDate, data.roNo, appt, b.wh, null));
        if (w.col) { ref = mkRef_(tab.name, w.col); written.push({ sh: tab.sheet, wh: b.wh, group: b.group, lines: b.lines, col: w.col }); }
        w.warnings.forEach(x => out.warnings.push(b.wh + ' ' + b.group + ': ' + x));
      } else {
        out.warnings.push('No month tab for ' + MONTHS[roDate.getMonth()] + ' ' + roDate.getFullYear() +
          ' yet. The RO is saved in the RO Log; use Settings → Start new month, then it is written in.');
      }
      b.lines.forEach((l, i) => {
        const r = new Array(LOG_HEAD.length).fill(''); // every RO Log column, also ones added later (e.g. Short Note)
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
        r[L['Month Tab']] = ref; // filled in below (a column added for a later batch can move this one)
        r[L['Notes']] = String(data.notes || '');
        r[L['Updated At']] = now;
        r[L['Updated By']] = u.name || u.id;
        r[L['Tab Refs']] = ref;
        r[L['Blinkit Created At']] = data.blinkitAt instanceof Date ? data.blinkitAt : '';
        r[L['Merged RO']] = mergedId;
        r[L['Dispatch Date']] = ''; // set right after by the planner (spread over the next working days)
        r[L['Delivered On']] = '';
        r[L['Removed From Tab']] = '';
        r[L['Dispatch Fixed']] = '';
        r[L['Shipped Qty']] = '';
        r[L['GRN Base']] = '';
        r[L['Shipped On']] = '';
        r[L['Ship Sync Until']] = '';
        rows.push(r);
      });
      out.batches.push({ batch: batchId, wh: b.wh, group: b.group, units: b.lines.reduce((s, l) => s + l.qty, 0),
        lines: b.lines.length, ref: ref });
    });
    rows.forEach(r => {
      const ref = r[L['Tab Refs']];
      r[L['Month Tab']] = ref ? refsText_([ref]) : (data.logOnly ? LOG_ONLY : '');
      r[L['Tab Refs']] = JSON.stringify(ref ? [ref] : []);
    });
    out.batches.forEach(b => { b.tab = b.ref ? refsText_([b.ref]) : ''; delete b.ref; });
    const log = ensureLog_(); // adds a column a newer version needs (e.g. "Merged RO") by itself
    try {
      log.getRange(log.getLastRow() + 1, 1, rows.length, LOG_HEAD.length).setValues(rows);
    } catch (e) {
      // Not in the RO Log: take the quantities and headings back out of the month tab, so no column is left that
      // belongs to no RO (and a retry doesn't fill a second one).
      const undone = undoTabWrites_(written);
      throw new Error('The RO could not be saved in the RO Log (' + e.message + '). ' +
        (undone ? 'What was written in the month tab was taken out again; try again.' : 'Check the month tab for a column with this RO and clear it.'));
    }
    out.openROs = openROsOf_(readLog_());
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
    ensureLog_();
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
      rows.forEach(r => { r.roNo = roNo; });
      refreshHeadings_(rows);
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
      out.openROs = res.openROs;
      return out;
    }
    out.openROs = openROsOf_(readLog_());
    return out;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Heading written above an RO column (centred), e.g.
 *   RO 21 NOV
 *   4999612345      ← the Blinkit RO number (font size 7)
 *   23/11 - 30/11   ← dispatch day - appointment ("23/11 -" until there is an appointment)
 * The dispatch day is the one set by hand ("Dispatch Fixed"), else it comes from the appointment (appointment −
 * shipping days, on a dispatch day), else the day set for the RO (RO Log "Dispatch Date"). A line is left out while its value is not known yet.
 */
function roLabel_(roDate, roNo, appt, wh, dispatch, fixed) {
  let s = 'RO ' + Utilities.formatDate(roDate, tz_(), 'd MMM').toUpperCase();
  const no = String(roNo || '').replace(/\s+/g, '');
  if (no) s += '\n' + no;
  const ap = appt instanceof Date ? ymd_(appt) : '';
  const disp = dispatchDay_(wh, ap, dispatch instanceof Date ? ymd_(dispatch) : '', fixed);
  if (disp) s += '\n' + dm_(disp) + ' -' + (ap ? ' ' + dm_(ap) : '');
  return s;
}

/** The heading of an RO Log line's RO. */
function roLabelOf_(r) {
  return roLabel_(r.roDate instanceof Date ? r.roDate : new Date(), r.roNo, r.appt instanceof Date ? r.appt : null, r.wh, r.dispatch, r.dispatchFixed);
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
function dispatchDay_(wh, appt, dispatch, fixed) {
  if (fixed && dispatch) return dispatch; // set by hand: wins over the appointment
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
    const v = tabValues_(sh);
    byTab[t].forEach(x => {
      const ci = roCols_(sh).indexOf(x.c), b = blockFor_(v, x.r.wh, x.r.group);
      if (ci < 0 || !b) return;
      setTabLabel_(sh, b.headRow, FIRST_RO_COL - 1 + ci, roLabelOf_(x.r));
      n++;
    });
  });
  return n;
}

/** An RO heading cell: the text, centred across and down; the RO number line (2nd line, digits only) in font size 7. */
function writeLabel_(range, label) {
  range.setValue(label).setHorizontalAlignment('center').setVerticalAlignment('middle');
  const parts = String(label).split('\n');
  if (parts.length > 1 && /^\d{5,}$/.test(parts[1])) {
    const start = parts[0].length + 1;
    range.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(label)
      .setTextStyle(start, start + parts[1].length, SpreadsheetApp.newTextStyle().setFontSize(7).build()).build());
  }
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
    const log = ensureLog_(); // adds the "Dispatch Date" heading to an older RO Log
    const all = readLog_();
    // Rows to change, written run by run (a batch's lines sit on consecutive rows), not cell by cell.
    const rows = [], changed = [], fixedRows = [];
    all.forEach(r => {
      if (!Object.prototype.hasOwnProperty.call(dates, r.batch)) return;
      const d = dates[r.batch] ? parseDate_(dates[r.batch]) : null;
      if (dates[r.batch] && !d) throw new Error('Bad date: ' + dates[r.batch]);
      rows.push({ row: r.row, v: d || '' });
      r.dispatch = d || '';
      // With an appointment, a day given here is set by hand: it is kept instead of the one from the appointment.
      r.dispatchFixed = !!(d && r.appt instanceof Date);
      fixedRows.push({ row: r.row, v: r.dispatchFixed ? 'Yes' : '' });
      if (r.status !== 'Cancelled') changed.push(r);
    });
    // The month-tab headings show the dispatch day: rewrite those of the ROs that changed (tabs are read first,
    // then everything is written in one go).
    try { refreshHeadings_(changed); } catch (e) { /* the dates are saved either way */ }
    writeRuns_(log, rows, L['Dispatch Date']);
    writeRuns_(log, fixedRows, L['Dispatch Fixed']);
    return { lines: rows.length, openROs: openROsOf_(all) };
  } finally {
    lock.releaseLock();
  }
}

/** Writes one column for many rows ({ row, v }), one setValues per run of consecutive rows. */
function writeRuns_(sh, rows, colIdx) {
  rows.sort((a, b) => a.row - b.row);
  for (let i = 0; i < rows.length;) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].row === rows[j].row + 1) j++;
    sh.getRange(rows[i].row, colIdx + 1, j - i + 1, 1).setValues(rows.slice(i, j + 1).map(x => [x.v]));
    i = j + 1;
  }
}

/** ROs delivered in the last 45 days (calendar, Dashboard, and "Delivered, awaiting GRN" in the plan). */
function recentDeliveredOf_(all) {
  return all.filter(r => r.status === 'Delivered' && r.deliveredOn instanceof Date && r.deliveredOn.getTime() >= Date.now() - 45 * 864e5).map(publicRo_);
}

/** Open ROs (Planned / Created) for the page, from RO Log records already read. */
function openROsOf_(all) {
  return all.filter(r => OPEN_STATUSES.indexOf(r.status) >= 0).map(publicRo_);
}

/** Changes one line: qty, status or notes. The month tab follows (a cancelled line is taken out of it). */
function updateROLine(token, key, changes) {
  const u = auth_(token, 'Planner');
  changes = changes || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const all = readLog_();
    const r = all.filter(x => x.key === key)[0];
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
    r.qty = qty; r.status = status;
    // A short-shipped line shows what was shipped in the month tab: after a quantity change it is set again.
    if (changes.qty !== undefined && shortOf_(r) > 0 && !r.removedAt) { try { markShort_(r, shortOf_(r), r.shippedQty, r.qty); } catch (e) { /* the cell keeps the sum */ } }
    if (changes.notes !== undefined) r.notes = String(changes.notes);
    if (changes.shortNote !== undefined) {
      // Why the not-sent part was not sent: kept in the RO Log and shown in the red cell's note in the month tab.
      r.shortNote = String(changes.shortNote || '').trim().slice(0, 500);
      log.getRange(r.row, L['Short Note'] + 1).setValue(r.shortNote);
      const short = shortOf_(r);
      if (short > 0 && !r.removedAt) {
        try { markShort_(r, short, r.shippedQty, r.qty); } catch (e) { warnings.push('The note could not be added to the month tab: ' + e.message); }
      }
    }
    return { warnings: warnings, rows: [publicRo_(r)], openROs: openROsOf_(all) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Changes a whole RO: all lines of one batch, or of several (batch = an id or a list of ids — a merged RO is one
 * batch per group): status, appointment date, Blinkit RO number, dispatch day. The month tab follows, and the RO
 * heading is rewritten. One request does it all; the answer carries the changed lines and the open ROs, so the
 * page does not have to read everything again.
 */
function updateBatch(token, batch, changes) {
  const u = auth_(token, 'Planner');
  changes = changes || {};
  const ids = Array.isArray(batch) ? batch.map(String) : [String(batch)];
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const all = readLog_();
    const lines = all.filter(x => ids.indexOf(x.batch) >= 0);
    if (!lines.length) throw new Error('This RO was not found. Reload the RO Log.');
    const log = changes.status !== undefined || changes.dispatch !== undefined || changes.appt !== undefined ? ensureLog_() : sheet_(TAB.LOG);
    const warnings = [];
    const now = new Date();
    if (changes.status !== undefined && STATUSES.indexOf(changes.status) < 0) throw new Error('Unknown status.');
    const delivered = changes.status === 'Delivered' ? parseDate_(changes.deliveredOn) : null;
    if (changes.status === 'Delivered' && !delivered) throw new Error('Enter the delivery date.');
    const dispatch = changes.dispatch !== undefined ? (changes.dispatch ? parseDate_(changes.dispatch) : '') : undefined;
    if (changes.dispatch && !dispatch) throw new Error('Bad date: ' + changes.dispatch);
    // Marked Delivered: Blinkit shows the goods in its stock only after its GRN (2–3 days). Until then the plan counts
    // them as "Delivered": the quantity actually shipped (Shipment Manager) and, to see when Blinkit has them, the
    // item's stock on Blinkit now (Formula Sheet), its "GRN base".
    let grnBase = {}, shipped = {};
    if (changes.status === 'Delivered') {
      try { grnBase = invStockMap_(); } catch (e) { grnBase = {}; }
      try { shipped = shippedQtyMap_(lines.map(r => changes.roNo !== undefined ? String(changes.roNo) : r.roNo).filter(Boolean)); } catch (e) { warnings.push('Shipped quantities could not be read from the Shipment Manager (' + e.message + '); the RO quantities are used.'); }
    }
    const first = {}; // per batch: its first line (appointment / RO number when not changed)
    lines.forEach(r => { if (!first[r.batch]) first[r.batch] = r; });

    // 1. The month tab (read once per tab, written in one go).
    lines.forEach(r => {
      if (changes.status === undefined || changes.status === r.status) return;
      const oldEff = r.status === 'Cancelled' ? 0 : r.qty, newEff = changes.status === 'Cancelled' ? 0 : r.qty;
      if (newEff === oldEff) return;
      r.refs.forEach(ref => {
        const sh = SpreadsheetApp.getActive().getSheetByName(ref.t);
        const w = sh ? adjustCell_(sh, r.wh, r.group, r.item, r.sku, ref.c, newEff - oldEff) : 'Tab ' + ref.t + ' no longer exists.';
        if (w) warnings.push(w);
      });
    });

    // 2. The RO Log lines.
    lines.forEach(r => {
      const f = first[r.batch];
      const appt = changes.appt !== undefined ? parseDate_(changes.appt) : (f.appt instanceof Date ? f.appt : null);
      const roNo = changes.roNo !== undefined ? String(changes.roNo) : f.roNo;
      if (changes.status !== undefined && (changes.status === 'Delivered' || r.status === 'Delivered')) {
        // Delivered: keep the date (the quantities leave the month tab 2 days later); un-delivered: clear it.
        log.getRange(r.row, L['Delivered On'] + 1).setValue(changes.status === 'Delivered' ? delivered : '');
        const sq = changes.status === 'Delivered' ? shipped[String(changes.roNo !== undefined ? changes.roNo : r.roNo).trim() + '|' + r.item] : undefined;
        const gb = changes.status === 'Delivered' ? grnBase[whLoose_(r.wh) + '|' + r.item] : undefined;
        r.shippedQty = sq === undefined ? null : sq; r.grnBase = gb === undefined ? null : gb;
        log.getRange(r.row, L['Shipped Qty'] + 1, 1, 2).setValues([[r.shippedQty == null ? '' : r.shippedQty, r.grnBase == null ? '' : r.grnBase]]);
        if (changes.status !== 'Delivered' && r.removedAt) warnings.push('RO ' + (r.roNo || r.batch) + ' was already removed from the month tab; its quantities are not put back.');
        r.deliveredOn = changes.status === 'Delivered' ? delivered : '';
      }
      if (changes.status !== undefined && changes.status !== r.status) {
        log.getRange(r.row, L['Status'] + 1).setValue(changes.status);
        r.status = changes.status;
      }
      const apptChanged = changes.appt !== undefined && fmtDate_(appt) !== fmtDate_(r.appt);
      if (dispatch !== undefined) {
        // A dispatch day given for an RO with an appointment is set by hand (kept instead of the appointment's);
        // an empty one follows the appointment again.
        r.dispatch = dispatch; r.dispatchFixed = !!(dispatch && appt);
        log.getRange(r.row, L['Dispatch Date'] + 1).setValue(dispatch);
        log.getRange(r.row, L['Dispatch Fixed'] + 1).setValue(r.dispatchFixed ? 'Yes' : '');
      } else if (apptChanged && r.dispatchFixed) {
        // A new appointment: the dispatch day follows it again.
        r.dispatchFixed = false;
        log.getRange(r.row, L['Dispatch Fixed'] + 1).setValue('');
      }
      log.getRange(r.row, L['Appointment Date'] + 1, 1, 2).setValues([[appt || '', roNo]]);
      log.getRange(r.row, L['Updated At'] + 1, 1, 2).setValues([[now, u.name || u.id]]);
      r.appt = appt || ''; r.roNo = roNo;
    });

    // 3. The RO headings (RO number, dispatch day - appointment).
    if (changes.appt !== undefined || changes.roNo !== undefined || changes.dispatch !== undefined) {
      try { refreshHeadings_(lines.filter(r => r.status !== 'Cancelled')); } catch (e) { warnings.push('The RO heading in the month tab could not be updated: ' + e.message); }
    }
    return { warnings: warnings, rows: lines.map(publicRo_), openROs: openROsOf_(all) };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Month tabs ---------------- */

/** Month tabs such as "Oct 2026", "Sept 2026", "January 2026", newest first. */
let MONTH_TABS_ = null;
function monthTabs_() {
  if (MONTH_TABS_) return MONTH_TABS_;
  const out = [];
  SpreadsheetApp.getActive().getSheets().forEach(sh => {
    const m = sh.getName().trim().match(/^([A-Za-z]+)[\s-]*(\d{4})$/);
    if (!m) return;
    const word = m[1].slice(0, 3).toLowerCase();
    const mi = MONTHS.findIndex(n => n.slice(0, 3).toLowerCase() === word);
    if (mi < 0) return;
    out.push({ name: sh.getName(), sheet: sh, key: Number(m[2]) * 12 + mi });
  });
  MONTH_TABS_ = out.sort((a, b) => b.key - a.key);
  return MONTH_TABS_;
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
  let titleHasHeads = false;
  for (let c = FIRST_RO_COL - 1; c < values[start].length; c++) if (String(values[start][c] || '') !== '') titleHasHeads = true;
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
  return sh.getRange(1, 1, Math.max(1, sh.getLastRow()), FIRST_RO_COL - 1 + roColCount_(sh)).getValues();
}

/** Column letter of a 1-based column number (4 → D, 27 → AA). */
function colLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function colNumber_(letters) { let n = 0; String(letters).toUpperCase().split('').forEach(ch => { n = n * 26 + ch.charCodeAt(0) - 64; }); return n; }

/** How many RO columns a month tab has: D–H, plus every column the planner added (marked in row 1). */
let RO_N_ = {};
function roColCount_(sh) {
  const k = sh.getName();
  if (RO_N_[k]) return RO_N_[k];
  const width = Math.max(0, Math.min(80, sh.getMaxColumns() - FIRST_RO_COL + 1));
  const notes = width ? sh.getRange(1, FIRST_RO_COL, 1, width).getNotes()[0] : [];
  return (RO_N_[k] = BASE_RO_COLS + notes.filter(n => String(n || '').indexOf(RO_COL_NOTE) === 0).length);
}
/** The tab's RO column letters: D, E, F, G, H (+ added ones). */
function roCols_(sh) {
  const out = [];
  for (let i = 0; i < roColCount_(sh); i++) out.push(colLetter_(FIRST_RO_COL + i));
  return out;
}

/*
 * Tab references ({ t: tab, c: column letter }) of RO Log lines read or made in this request. When a column is
 * inserted, the ones at or right of it move one column right, in memory and in the RO Log.
 */
let REF_OBJS_ = [];
function mkRef_(t, c) { const r = { t: t, c: c }; REF_OBJS_.push(r); return r; }
function refsText_(refs) { return refs.map(x => x.t + ' (' + x.c + ')').join(', '); }

/**
 * Every RO column of the tab is used in a block: insert one more. It goes in just before the last RO column (so a
 * formula over D:H grows to take it in), formatted like it and marked in row 1; the RO in the old last column moves
 * one column right (the RO Log follows). Returns the new column's 0-based index among the RO columns.
 */
function addRoColumn_(sh) {
  const n = roColCount_(sh), last = FIRST_RO_COL + n - 1, name = sh.getName();
  const fromLetter = colLetter_(last);
  sh.insertColumnBefore(last);              // new empty column at `last`; the old last RO column moves to last + 1
  const rows = sh.getMaxRows();
  sh.getRange(1, last + 1, rows, 1).copyTo(sh.getRange(1, last, rows, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sh.setColumnWidth(last, sh.getColumnWidth(last + 1));
  sh.getRange(1, last).setNote(RO_COL_NOTE);
  RO_N_[name] = n + 1;
  delete TABV_[name];
  // The daily inventory updater (same project) remembers the columns of its last upload by letter for "Undo Last
  // Upload". Columns at or right of the insert moved one to the right: move its letters along.
  try {
    const dp = PropertiesService.getDocumentProperties(), raw = dp.getProperty('BLINKIT_UNDO_META');
    if (raw) {
      const um = JSON.parse(raw);
      if (um && um.mainSheetName === name) {
        ['sourceCol', 'targetCol'].forEach(k => { if (um[k] && colNumber_(um[k]) >= last) um[k] = colLetter_(colNumber_(um[k]) + 1); });
        dp.setProperty('BLINKIT_UNDO_META', JSON.stringify(um));
      }
    }
  } catch (e) { /* the RO column is added either way */ }
  // References to columns at or right of the insert move one column right:
  const log = sheet_(TAB.LOG), fresh = readLog_(); // (its references join REF_OBJS_)
  const moved = new Set();
  REF_OBJS_.forEach(ref => {                         // …everything read or made in this request…
    if (!moved.has(ref) && ref.t === name && colNumber_(ref.c) >= last) { ref.c = colLetter_(colNumber_(ref.c) + 1); moved.add(ref); }
  });
  fresh.forEach(r => {                               // …and the RO Log as saved.
    if (!r.refs.some(x => moved.has(x))) return;
    log.getRange(r.row, L['Month Tab'] + 1).setValue(refsText_(r.refs));
    log.getRange(r.row, L['Tab Refs'] + 1).setValue(JSON.stringify(r.refs));
  });
  return n - 1;
}

/*
 * Columns A–H of a month tab, read once per request and kept in step with what this request writes, so many RO
 * changes in one save cost one read of the tab (a read in between writes makes Sheets apply them one by one).
 */
let TABV_ = {};
function tabValues_(sh) {
  const k = sh.getName();
  return TABV_[k] || (TABV_[k] = readBlockValues_(sh));
}
/** Writes a value into the tab (row i, column c, both 0-based as in tabValues_) and into the copy. */
function setTabValue_(sh, i, c, v) {
  sh.getRange(i + 1, c + 1).setValue(v);
  const vals = TABV_[sh.getName()];
  if (vals && vals[i]) vals[i][c] = v;
}
/** An RO heading into the tab (centred, RO number small) and into the copy. */
function setTabLabel_(sh, i, c, label) {
  writeLabel_(sh.getRange(i + 1, c + 1), label);
  const vals = TABV_[sh.getName()];
  if (vals && vals[i]) vals[i][c] = label;
}

/**
 * Writes one RO (several items) into the next free RO column (D–H, plus added ones) of the warehouse block; when all
 * are used, a new RO column is added to the tab (addRoColumn_).
 * A column is free when no item row of the block has a quantity in it. A missing item gets its own row,
 * copied from the item row above so the formulas in columns I onwards keep working.
 */
function writeBatch_(sh, wh, group, lines, label) {
  const warnings = [];
  let v = tabValues_(sh);
  let b = blockFor_(v, wh, group);
  if (!b) return { col: '', warnings: ['No block "' + wh + '-' + group + '" in tab ' + sh.getName() + '. Saved in the RO Log only.'] };
  if (b.group !== group) warnings.push('No "' + wh + '-' + group + '" block in ' + sh.getName() + ', so it went into the ' + b.group + ' block.');

  const missing = lines.filter(l => b.items[l.item] === undefined);
  if (missing.length) {
    missing.forEach(l => { insertItemRow_(sh, b, l.item, l.sku); v = tabValues_(sh); b = blockFor_(v, wh, group); });
    warnings.push('Added a row for ' + missing.map(l => l.sku || l.item).join(', ') + ' (it was not in this block).');
  }

  let col = -1;
  const nCols = roColCount_(sh);
  for (let c = 0; c < nCols; c++) {
    const ci = FIRST_RO_COL - 1 + c;
    let used = false;
    for (let i = b.start + 1; i <= b.end; i++) {
      const a = v[i][0];
      if (typeof a === 'number' && a > 1000 && v[i][ci] !== '' && v[i][ci] !== null) { used = true; break; }
    }
    if (!used) { col = c; break; }
  }
  if (col < 0) {
    // Every RO column of this block is used: the tab gets one more (for every block), and the RO goes in it.
    col = addRoColumn_(sh);
    v = tabValues_(sh); b = blockFor_(v, wh, group);
    warnings.push('Columns ' + colLetter_(FIRST_RO_COL) + '–' + colLetter_(FIRST_RO_COL + col) + ' were full, so a new RO column ' +
      colLetter_(FIRST_RO_COL + col) + ' was added to ' + sh.getName() + ' (the RO that was in ' + colLetter_(FIRST_RO_COL + col) + ' is now in ' + colLetter_(FIRST_RO_COL + col + 1) + ').');
  }
  const ci = FIRST_RO_COL - 1 + col;
  lines.forEach(l => { setTabValue_(sh, b.items[l.item], ci, l.qty); });
  setTabLabel_(sh, b.headRow, ci, label);
  return { col: colLetter_(FIRST_RO_COL + col), warnings: warnings };
}

/** Clears RO columns just written by writeBatch_ (quantities and heading). Returns true when all were cleared. */
function undoTabWrites_(written) {
  let ok = true;
  written.forEach(w => {
    try {
      delete TABV_[w.sh.getName()];
      const ci = roCols_(w.sh).indexOf(w.col), b = blockFor_(tabValues_(w.sh), w.wh, w.group);
      if (ci < 0 || !b) { ok = false; return; }
      const c = FIRST_RO_COL - 1 + ci;
      w.lines.forEach(l => { if (b.items[l.item] !== undefined) setTabValue_(w.sh, b.items[l.item], c, ''); });
      setTabLabel_(w.sh, b.headRow, c, '');
    } catch (e) { ok = false; }
  });
  return ok;
}

function insertItemRow_(sh, b, item, sku) {
  delete TABV_[sh.getName()]; // rows move: read the tab again next time
  const after = (b.lastItem >= 0 ? b.lastItem : b.headRow) + 1; // 1-based row to insert after
  sh.insertRowAfter(after);
  if (b.lastItem >= 0) fillNewItemRow_(sh, after, after + 1);
  sh.getRange(after + 1, 1, 1, 2).setValues([[item, sku || '']]);
  const n = roColCount_(sh), ro = sh.getRange(after + 1, FIRST_RO_COL, 1, n);
  ro.clearContent(); ro.clearNote(); ro.setFontColor(null).setFontWeight(null);
}

// A day column's heading (rows above the first block): a date, or text such as "26/11", "26-11-2026", "26 Nov".
const DAY_HEAD_RE = /^\s*\d{1,2}\s*[\/\-. ]\s*(\d{1,2}|[A-Za-z]{3,})/;
/**
 * The columns right of the RO columns: which are day columns (their heading is a date) and which day column is the
 * current one (the rightmost day column the row `srcRow` has something in — where the daily updater's formula is).
 */
function dayLayout_(sh, srcRow) {
  const width = sh.getLastColumn(), roEnd = FIRST_RO_COL + roColCount_(sh) - 1; // 1-based last RO column
  const headRows = Math.max(1, Math.min(5, srcRow - 1));
  const head = sh.getRange(1, 1, headRows, width).getValues();
  const isDay = c => head.some(r => { const v = r[c - 1]; return v instanceof Date || DAY_HEAD_RE.test(String(v == null ? '' : v)); });
  const src = sh.getRange(srcRow, 1, 1, width), vals = src.getValues()[0], forms = src.getFormulas()[0];
  let current = 0, anyDay = false;
  for (let c = roEnd + 1; c <= width; c++) {
    if (!isDay(c)) continue;
    anyDay = true;
    if (forms[c - 1] || (vals[c - 1] !== '' && vals[c - 1] !== null)) current = c;
  }
  if (!anyDay) for (let c = width; c > roEnd; c--) if (forms[c - 1]) { current = c; break; } // no dated headings: the last formula
  return { width: width, roEnd: roEnd, isDay: isDay, anyDay: anyDay, current: current, forms: forms };
}

/**
 * A new item row (`row`, just inserted under `srcRow`, the item row above) gets the row above's layout: formats and
 * formulas copied like a normal copy-paste (so they keep working), then: every earlier day 0, the current day the
 * formula from the row above, later days empty; other columns keep only formulas (no copied numbers of the other
 * item). Anything still showing an error (except the current day) becomes 0.
 */
function fillNewItemRow_(sh, srcRow, row) {
  const L0 = dayLayout_(sh, srcRow), w = L0.width;
  sh.getRange(srcRow, 1, 1, w).copyTo(sh.getRange(row, 1, 1, w));
  const out = sh.getRange(row, 1, 1, w), vals = out.getValues()[0], forms = out.getFormulas()[0];
  const next = vals.map((v, i) => forms[i] ? null : v); // null = keep the copied formula
  for (let c = 3; c <= w; c++) {
    if (c >= FIRST_RO_COL && c <= L0.roEnd) { next[c - 1] = ''; continue; }        // RO columns: cleared
    const day = L0.anyDay ? L0.isDay(c) : (c > L0.roEnd && c < L0.current);
    if (day && L0.current && c < L0.current) next[c - 1] = 0;                        // earlier days: 0
    else if (day && c > L0.current) next[c - 1] = '';                                // later days: empty
    else if (c === L0.current) next[c - 1] = null;                                   // the current day: formula
    else if (!forms[c - 1]) next[c - 1] = '';                                        // other columns: no copied numbers
  }
  // One write: a kept formula is written back as its (already adjusted) formula text.
  out.setValues([next.map((v, i) => v === null ? forms[i] : v)]);
  SpreadsheetApp.flush();
  // Safety net: an error left in any column but the current day becomes 0.
  const shown = sh.getRange(row, 1, 1, w).getDisplayValues()[0];
  shown.forEach((s, i) => { if (i + 1 > L0.roEnd && i + 1 !== L0.current && /^#[A-Z0-9\/!?]+/.test(String(s))) sh.getRange(row, i + 1).setValue(0); });
}

/**
 * Once per month tab: item rows added earlier whose day columns show an error (#ERROR!, #N/A, #REF!…) — earlier days
 * become 0, and the current day (and a total-type column) with an error gets the formula of the item row above again.
 */
function repairItemRows_(sh) {
  const props = PropertiesService.getScriptProperties(), key = 'ROWFIX1_' + sh.getName();
  if (props.getProperty(key)) return 0;
  const last = sh.getLastRow(), w = sh.getLastColumn();
  if (last < 2) return 0;
  const vals = sh.getRange(1, 1, last, w).getValues(), shown = sh.getRange(1, 1, last, w).getDisplayValues();
  const isErr = s => /^#[A-Z0-9\/!?]+/.test(String(s));
  let fixed = 0, layout = null;
  for (let i = 1; i < last; i++) {
    if (!(typeof vals[i][0] === 'number' && vals[i][0] > 1000)) continue;
    if (!shown[i].some((s, c) => c >= FIRST_RO_COL && isErr(s))) continue;
    // The nearest item row above without errors gives the layout and the current day's formula.
    let src = -1;
    for (let k = i - 1; k >= 1; k--) if (typeof vals[k][0] === 'number' && vals[k][0] > 1000 && !shown[k].some(isErr)) { src = k; break; }
    if (src < 0) continue;
    layout = dayLayout_(sh, src + 1);
    for (let c = layout.roEnd + 1; c <= w; c++) {
      if (!isErr(shown[i][c - 1])) continue;
      // The current day, and a non-day column with a formula above (e.g. a total): that formula again; a day: 0.
      const dayCol = layout.anyDay ? layout.isDay(c) : c < layout.current;
      if (c === layout.current || (!dayCol && layout.forms[c - 1])) sh.getRange(src + 1, c).copyTo(sh.getRange(i + 1, c));
      else sh.getRange(i + 1, c).setValue(0);
    }
    fixed++;
  }
  props.setProperty(key, String(new Date().getTime()));
  return fixed;
}

/** Adds delta to an item's cell in an RO column (to change or cancel a line). Returns a warning or ''. */
function adjustCell_(sh, wh, group, item, sku, colLetter, delta) {
  const ci = roCols_(sh).indexOf(colLetter);
  if (ci < 0 || !delta) return '';
  let v = tabValues_(sh);
  let b = blockFor_(v, wh, group);
  if (!b) return 'Block ' + wh + '-' + group + ' not found in ' + sh.getName() + '.';
  if (b.items[item] === undefined) {
    if (delta < 0) return '';
    insertItemRow_(sh, b, item, sku);
    v = tabValues_(sh); b = blockFor_(v, wh, group);
  }
  const i = b.items[item], c = FIRST_RO_COL - 1 + ci;
  const next = (Number(v[i][c]) || 0) + delta;
  setTabValue_(sh, i, c, next > 0 ? next : '');
  if (!(next > 0)) { const cell = sh.getRange(i + 1, c + 1); cell.clearNote(); cell.clearFormat(); } // the RO left this cell: no mark or formatting left
  return '';
}

/**
 * The RO's cell for this item in its month tab(s) when the Shipment Manager has its shipment: not all sent → the
 * cell shows the quantity actually shipped (0 when nothing went), red and bold, with a note "Ordered Y — shipped X,
 * Z not sent" (+ "Why: …" when noted in the RO Log). All sent again → back to the ordered quantity, normal.
 */
function markShort_(r, short, shipped, ordered) {
  r.refs.forEach(ref => {
    const sh = SpreadsheetApp.getActive().getSheetByName(ref.t); if (!sh) return;
    const ci = roCols_(sh).indexOf(ref.c), v = tabValues_(sh), b = blockFor_(v, r.wh, r.group);
    if (ci < 0 || !b || b.items[r.item] === undefined) return;
    const i = b.items[r.item], c = FIRST_RO_COL - 1 + ci, cell = sh.getRange(i + 1, c + 1);
    if (short > 0) {
      setTabValue_(sh, i, c, Math.max(0, Number(shipped) || 0));
      cell.setFontColor('#d00000').setFontWeight('bold').setNote('Ordered ' + ordered + ' — shipped ' + (Number(shipped) || 0) + ', ' + short +
        ' not sent (Shipment Manager). The planner counts only what was shipped.' + (r.shortNote ? '\nWhy: ' + r.shortNote : ''));
    } else if (cell.getNote()) {
      // Was marked short before: the ordered quantity again.
      setTabValue_(sh, i, c, ordered > 0 ? ordered : '');
      cell.setFontColor(null).setFontWeight(null).setNote('');
    }
  });
}

/*
 * RO columns locked (Settings "Lock RO Columns", default Yes). For an installable trigger: Apps Script → Triggers →
 * add → function guardRoEdits, event source "From spreadsheet", event type "On edit". When someone types, pastes or
 * deletes a value in a month tab's RO columns (D up to the last RO column), it is put back at once; colours, borders
 * and other formatting stay as they made them (formatting does not fire "On edit"). The planner's own writes and the
 * daily updater's are not edits by a person, so they are never touched.
 *  - One cell: its value before the edit comes back (an RO heading with its small RO number).
 *  - Several cells (paste, fill, delete): each cell is rebuilt from the RO Log (quantity, or what was shipped when it
 *    was shipped short; the RO heading). A cell the RO Log knows nothing about is emptied.
 */
function guardRoEdits(e) {
  if (!e || !e.range) return;
  const rg = e.range, sh = rg.getSheet(), name = sh.getName();
  if (!/^[A-Za-z]+[\s-]*\d{4}$/.test(name.trim()) || !monthTabs_().some(x => x.name === name)) return;
  const first = FIRST_RO_COL, last = FIRST_RO_COL + roColCount_(sh) - 1;
  const c1 = Math.max(rg.getColumn(), first), c2 = Math.min(rg.getLastColumn(), last);
  if (c1 > c2) return;
  if (!getSettings_().lockRo) return;
  const r1 = rg.getRow(), r2 = rg.getLastRow();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let fixed = 0;
  try {
    if (rg.getNumRows() === 1 && rg.getNumColumns() === 1) {
      const cell = sh.getRange(r1, c1), old = e.oldValue;
      if (old === undefined || old === null || old === '') cell.clearContent();
      else if (/^RO \d{1,2} [A-Z]{3}/i.test(String(old))) writeLabel_(cell, String(old));
      else cell.setValue(old);
      fixed = 1;
    } else {
      const want = expectedRoCells_(sh);
      const cur = sh.getRange(r1, c1, r2 - r1 + 1, c2 - c1 + 1).getValues();
      for (let i = 0; i < cur.length; i++) {
        for (let j = 0; j < cur[i].length; j++) {
          const row = r1 + i, col = c1 + j, w = want[row + '|' + col], now = cur[i][j], cell = sh.getRange(row, col);
          if (w === undefined) { if (now !== '') { cell.clearContent(); fixed++; } continue; }
          if (w && w.label !== undefined) { if (String(now) !== w.label) { writeLabel_(cell, w.label); fixed++; } continue; }
          if (Number(now) !== w || now === '') { cell.setValue(w); fixed++; }
        }
      }
    }
  } finally { lock.releaseLock(); }
  if (fixed) {
    try {
      SpreadsheetApp.getActive().toast('The RO columns are locked, so that change was put back. Colours are fine. Change ROs in the Blinkit Planner.', '🔒 RO columns', 6);
    } catch (err) { /* the value is back either way */ }
  }
}

/** What the RO Log says the RO columns of a month tab hold: { 'row|col' (1-based): quantity, or { label } for a heading }. */
function expectedRoCells_(sh) {
  const name = sh.getName(), v = readBlockValues_(sh), cols = roCols_(sh), want = {};
  readLog_().forEach(r => {
    if (r.status === 'Cancelled' || r.removedAt instanceof Date || r.logOnly) return;
    r.refs.forEach(ref => {
      if (ref.t !== name) return;
      const ci = cols.indexOf(ref.c), b = ci < 0 ? null : blockFor_(v, r.wh, r.group);
      if (!b) return;
      const col = FIRST_RO_COL + ci;
      want[(b.headRow + 1) + '|' + col] = { label: roLabelOf_(r) };
      if (b.items[r.item] === undefined) return;
      const k = (b.items[r.item] + 1) + '|' + col, q = shortOf_(r) > 0 ? Math.max(0, Number(r.shippedQty) || 0) : r.qty;
      want[k] = (typeof want[k] === 'number' ? want[k] : 0) + q;
    });
  });
  return want;
}

/**
 * Once: cells marked short before the month tab showed the shipped quantity (they still show the ordered one) get
 * the shipped quantity now. Runs with the Shipment Manager sync; a Script Property remembers it was done.
 */
function refreshShortCells_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHORT_CELLS_V2')) return 0;
  let n = 0;
  readLog_().forEach(r => {
    const short = shortOf_(r);
    if (short > 0 && !r.removedAt && r.refs.length) { try { markShort_(r, short, r.shippedQty, r.qty); n++; } catch (e) { /* next time */ } }
  });
  props.setProperty('SHORT_CELLS_V2', String(new Date().getTime()));
  return n;
}

function setBatchLabel_(sh, wh, group, colLetter, label) {
  const ci = roCols_(sh).indexOf(colLetter);
  if (ci < 0) return;
  const b = blockFor_(tabValues_(sh), wh, group);
  if (b) setTabLabel_(sh, b.headRow, FIRST_RO_COL - 1 + ci, label);
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
      MONTH_TABS_ = null;
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
    if (v[i].slice(FIRST_RO_COL - 1).some(x => x !== '' && x !== null)) {
      sh.getRange(i + 1, FIRST_RO_COL, 1, roColCount_(sh)).clearContent();
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
      rs.map(r => ({ item: r.item, sku: r.sku, qty: r.qty })), roLabel_(r0.roDate, r0.roNo, appt, r0.wh, r0.dispatch, r0.dispatchFixed));
    w.warnings.forEach(x => warnings.push(r0.wh + ' ' + r0.group + ': ' + x));
    if (!w.col) return;
    rs.forEach(r => {
      const refs = r.refs.concat([mkRef_(tab.name, w.col)]);
      log.getRange(r.row, L['Month Tab'] + 1).setValue(refsText_(refs));
      log.getRange(r.row, L['Tab Refs'] + 1).setValue(JSON.stringify(refs));
      r.refs = refs;
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
    const byTab = {}, all = readLog_();
    all.forEach(r => {
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
    const heads = refreshHeadings_(all.filter(r => OPEN_STATUSES.indexOf(r.status) >= 0 && !r.logOnly));
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


/* ---------------- Blinkit sales for the Production App ---------------- */

/**
 * Blinkit's sales per item (all warehouses together) from the Inventory upload in the Formula Sheet: last 7 / 15 / 30
 * days, with the item's SKU and its Travalate Inventory name. Asked by the Production App's Projections with the
 * same shared secret as Travalate Inventory (Settings → Travalate Inventory); nothing else is given out.
 */
function productionSales_(secret) {
  const s = PropertiesService.getScriptProperties().getProperty('TI_SECRET');
  if (!s || String(secret || '') !== s) return { success: false, error: 'Unauthorized.' };
  const sh = SpreadsheetApp.getActive().getSheetByName(FORMULA_SHEET);
  if (!sh || sh.getLastRow() < 3) return { success: true, asOf: '', items: [] };
  const v = sh.getRange(1, FORMULA_FIRST_COL, sh.getLastRow(), FORMULA_COLS).getValues();
  let h = -1;
  for (let i = 0; i < Math.min(10, v.length); i++) if (v[i].indexOf('Item ID') >= 0 && v[i].indexOf('Last 30 days') >= 0) { h = i; break; }
  if (h < 0) return { success: true, asOf: '', items: [] };
  const col = n => v[h].indexOf(n), ci = col('Item ID'), cn = col('Item Name'), c7 = col('Last 7 days'), c15 = col('Last 15 days'), c30 = col('Last 30 days');
  const m = String(v[0][0] || '').match(/generated at\s+(.+)$/i), by = {};
  for (let i = h + 1; i < v.length; i++) {
    const it = Number(v[i][ci]); if (!it) continue;
    const x = by[it] = by[it] || { itemId: it, name: cn >= 0 ? String(v[i][cn] || '') : '', s7: 0, s15: 0, s30: 0 };
    x.s7 += Number(v[i][c7]) || 0; x.s15 += c15 >= 0 ? Number(v[i][c15]) || 0 : 0; x.s30 += Number(v[i][c30]) || 0;
  }
  const skus = {};
  getSkus_().forEach(k => { skus[k.item] = k; });
  return { success: true, asOf: m ? m[1].trim() : '', items: Object.keys(by).map(k => {
    const x = by[k], sk = skus[x.itemId] || {};
    return Object.assign(x, { sku: sk.sku || '', tiSku: sk.tiSku || '', name: x.name || sk.name || '' });
  }) };
}

/* ---------------- Delivered, awaiting GRN ---------------- */

/** Warehouse names compared loosely: "Pune P3 - Feeder Warehouse" = "Pune P3 Feeder" = "pune p3". */
function whLoose_(s) { return String(s || '').toLowerCase().replace(/feeder|warehouse/g, '').replace(/[^a-z0-9]/g, ''); }

/** Stock on Blinkit now ("Total sellable" of the Inventory in the Formula Sheet), per loose warehouse name | item. */
function invStockMap_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(FORMULA_SHEET);
  if (!sh || sh.getLastRow() < 3) return {};
  const v = sh.getRange(1, FORMULA_FIRST_COL, sh.getLastRow(), FORMULA_COLS).getValues();
  let h = -1;
  for (let i = 0; i < Math.min(10, v.length); i++) if (v[i].indexOf('Item ID') >= 0 && v[i].indexOf('Total sellable') >= 0) { h = i; break; }
  if (h < 0) return {};
  const ci = v[h].indexOf('Item ID'), cw = v[h].indexOf('Warehouse Facility Name'), cs = v[h].indexOf('Total sellable');
  const out = {};
  for (let i = h + 1; i < v.length; i++) {
    const it = Number(v[i][ci]); if (!it) continue;
    const k = whLoose_(v[i][cw]) + '|' + it;
    out[k] = (out[k] || 0) + (Number(v[i][cs]) || 0);
  }
  return out;
}

/**
 * Quantities actually shipped per Blinkit RO (PO) number | item, from the Shipment Manager's BLINKIT_PO tab
 * (PO_NUMBER, ITEM_CODE, …, SHIPPED_QTY). Empty when its link is not set in Settings.
 */
function shippedQtyMap_(roNos) {
  const m = poLinesMap_(roNos), out = {};
  Object.keys(m).forEach(k => { out[k] = m[k].shipped; });
  return out;
}
/** BLINKIT_PO lines per RO (PO) number | item: { ordered: PO_QTY, shipped: SHIPPED_QTY }. */
function poLinesMap_(roNos) {
  const id = PropertiesService.getScriptProperties().getProperty('SHIP_SHEET_ID');
  if (!id || !roNos.length) return {};
  const want = {}; roNos.forEach(n => { want[String(n).trim()] = 1; });
  const sh = SpreadsheetApp.openById(id).getSheetByName('BLINKIT_PO');
  if (!sh) throw new Error('no BLINKIT_PO tab in the Shipment Manager sheet');
  // A … N, and P SHORT_REASON (why a line was shipped short, asked on the Shipment Manager's Box Details / JPG).
  const v = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), Math.max(14, Math.min(16, sh.getLastColumn()))).getValues();
  const out = {};
  v.forEach(r => {
    const po = String(r[0] || '').trim(); if (!want[po]) return;
    if (String(r[13] || '').trim().toUpperCase() === 'CANCELLED') return;
    const k = po + '|' + Number(r[5]);
    const x = out[k] = out[k] || { ordered: 0, shipped: 0, reason: '' };
    x.ordered += parseInt(r[11], 10) || 0; x.shipped += parseInt(r[12], 10) || 0;
    const why = String(r[15] == null ? '' : r[15]).trim();
    if (why && x.reason.indexOf(why) < 0) x.reason = x.reason ? x.reason + '; ' + why : why;
  });
  return out;
}

/*
 * Shipment Manager → RO Log. Once a Blinkit shipment exists in the Shipment Manager for an RO (SHIPMENTS: PO_NUMBER =
 * the RO number, not deleted):
 *  - its dispatch day becomes the shipment's DATE (set as fixed: it is what really happened);
 *  - its quantities become the quantities actually shipped (BLINKIT_PO → SHIPPED_QTY); the month tab follows, and an
 *    item not shipped at all is cancelled;
 *  - and it is checked again on every run for 2 days after it was first found (edits / adjustments there), then no more.
 * Runs at most every 30 minutes (in the background when the planner is opened), from Settings → Sync now, or from
 * a time-driven trigger on syncFromShipmentManager.
 */
const SHIP_SYNC_DAYS = 2;
// Shipments entered in the Shipment Manager from this day on count as shipped only once their 🚚 Dispatch Date is set
// (and has come): that date is the shipped day. Older shipments keep their DATE as before.
const DISPATCH_DATE_FROM = '2026-11-26';
function syncShipments_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHIP_SHEET_ID');
  if (!id) return { skipped: 'Shipment Manager link not set (Settings).' };
  const now = new Date(), log = ensureLog_(), all = readLog_();
  const NOT_SHIPPED = 'Not shipped (Shipment Manager)';
  // Lines shipped short stay checked after the 2 days too: a reason given later in the Shipment Manager, or an edit
  // that sends the rest, still reaches the RO Log and the month tab.
  const due = all.filter(r => r.roNo && (r.status !== 'Cancelled' || String(r.notes).indexOf(NOT_SHIPPED) >= 0) && !r.logOnly &&
    (shortOf_(r) > 0 || !(r.shipSyncUntil instanceof Date && r.shipSyncUntil.getTime() < now.getTime())) &&
    r.roDate instanceof Date && r.roDate.getTime() >= now.getTime() - 60 * 864e5);
  if (!due.length) return { ros: 0, qty: 0, dates: 0 };
  const ss = SpreadsheetApp.openById(id);
  // Shipments by RO (PO) number: their date.
  const shSh = ss.getSheetByName('SHIPMENTS');
  if (!shSh) throw new Error('no SHIPMENTS tab in the Shipment Manager sheet');
  const want = {}; due.forEach(r => { want[String(r.roNo).trim()] = 1; });
  // A ID, B TIMESTAMP (entered), … E PLATFORM, F PO_NUMBER, … H DATE, … K DELETED, … N DISPATCH_DATE
  const width = Math.max(11, Math.min(14, shSh.getLastColumn()));
  const sv = shSh.getLastRow() > 1 ? shSh.getRange(2, 1, shSh.getLastRow() - 1, width).getValues() : [];
  const today = ymd_(now), shipDate = {}, waiting = {};
  sv.forEach(r => {
    const po = String(r[5] || '').trim(); if (!want[po]) return;
    if (!/blinkit/i.test(String(r[4] || ''))) return;
    if (r[10] === true || String(r[10]).toUpperCase() === 'TRUE') return;
    const entered = r[1] instanceof Date ? ymd_(r[1]) : String(r[1] || '').slice(0, 10);
    let d;
    if (entered && entered >= DISPATCH_DATE_FROM) {
      // Shipped on its Dispatch Date, once that day has come; until then the RO is not shipped yet.
      const dd = r[13] instanceof Date ? r[13] : (r[13] ? parseDate_(String(r[13]).slice(0, 10)) : null);
      d = dd && ymd_(dd) <= today ? dd : null;
      if (!d) { waiting[po] = 1; return; }
    } else {
      d = r[7] instanceof Date ? r[7] : parseDate_(String(r[7] || '').slice(0, 10));
    }
    if (d) shipDate[po] = d;
  });
  // ROs marked shipped from a shipment that has no dispatch date yet (e.g. by the DATE, before this change): not
  // shipped after all. Shipped On / Shipped Qty / the 2-day window are cleared and red "not sent" marks undone; the
  // dispatch day then moves on each day (rollOverdueDispatch_) until the Dispatch Date is set.
  const out = { ros: 0, qty: 0, dates: 0, short: 0, reverted: 0, waiting: Object.keys(waiting).filter(po => !shipDate[po]).length, warnings: [] };
  const changedRos = [], seenRo = {};
  due.forEach(r => {
    const po = String(r.roNo).trim();
    if (!waiting[po] || shipDate[po] || !(r.shippedOn instanceof Date)) return;
    r.shippedOn = ''; r.shipSyncUntil = '';
    log.getRange(r.row, L['Shipped On'] + 1).setValue('');
    log.getRange(r.row, L['Ship Sync Until'] + 1).setValue('');
    if (r.shippedQty != null) {
      r.shippedQty = null;
      log.getRange(r.row, L['Shipped Qty'] + 1).setValue('');
      if (!r.removedAt) { try { markShort_(r, 0, 0, r.qty); } catch (e) { /* the RO Log is cleared either way */ } }
    }
    log.getRange(r.row, L['Updated At'] + 1, 1, 2).setValues([[now, 'Shipment Manager']]);
    out.reverted++; changedRos.push(r);
  });
  const found = Object.keys(shipDate);
  if (!found.length) {
    try { refreshHeadings_(changedRos); } catch (e) { /* the RO Log is updated either way */ }
    return out;
  }
  const poLines = poLinesMap_(found);
  due.forEach(r => {
    const po = String(r.roNo).trim(), d = shipDate[po]; if (!d) return;
    if (!seenRo[po]) { seenRo[po] = 1; out.ros++; }
    // First time found: the 2-day re-check window starts.
    const firstFound = !(r.shipSyncUntil instanceof Date);
    if (firstFound) {
      r.shipSyncUntil = new Date(now.getTime() + SHIP_SYNC_DAYS * 864e5);
      log.getRange(r.row, L['Ship Sync Until'] + 1).setValue(r.shipSyncUntil);
    }
    // Dispatch day = the shipment's date.
    if (fmtDate_(r.shippedOn) !== fmtDate_(d) || fmtDate_(r.dispatch) !== fmtDate_(d) || !r.dispatchFixed) {
      r.shippedOn = d; r.dispatch = d; r.dispatchFixed = true;
      log.getRange(r.row, L['Dispatch Date'] + 1).setValue(d);
      log.getRange(r.row, L['Dispatch Fixed'] + 1).setValue('Yes');
      log.getRange(r.row, L['Shipped On'] + 1).setValue(d);
      out.dates++; changedRos.push(r);
    }
    // Quantities: the RO keeps its RO quantity (BLINKIT_PO → PO_QTY) and gets the quantity actually shipped
    // (SHIPPED_QTY). What was not sent stays in the month tab, in red with a note, and the planner leaves it out
    // (Blinkit still lists it as incoming until the RO closes). Lines an earlier version lowered or cancelled as
    // "Not shipped" get their RO quantity back.
    const pl = poLines[po + '|' + r.item];
    if (!pl) return;
    const sq = pl.shipped, ordered = pl.ordered > 0 ? pl.ordered : r.qty, revive = r.status === 'Cancelled';
    let touched = false;
    if (r.shippedQty !== sq) { r.shippedQty = sq; log.getRange(r.row, L['Shipped Qty'] + 1).setValue(sq); touched = true; }
    if (revive || ordered !== r.qty) {
      const delta = ordered - (revive ? 0 : r.qty);
      if (delta && !r.removedAt) { // (a delivered RO already taken out of the month tab is left there)
        r.refs.forEach(ref => {
          const tsh = SpreadsheetApp.getActive().getSheetByName(ref.t);
          const w = tsh ? adjustCell_(tsh, r.wh, r.group, r.item, r.sku, ref.c, delta) : '';
          if (w) out.warnings.push(w);
        });
      }
      log.getRange(r.row, L['Qty'] + 1).setValue(ordered);
      r.qty = ordered; out.qty++;
      if (revive) {
        r.status = 'Created'; r.notes = String(r.notes).split('; ').filter(x => x !== NOT_SHIPPED).join('; ');
        log.getRange(r.row, L['Status'] + 1).setValue('Created');
        log.getRange(r.row, L['Notes'] + 1).setValue(r.notes);
      }
      touched = true;
    }
    // Why it was shipped short: the reason given in the Shipment Manager (Box Details / JPG popup) becomes the RO
    // Log's Short Note and the month-tab cell's note; a reason typed in the planner stays when the Shipment Manager
    // has none. Shipped in full (e.g. after an edit): the note goes.
    const shortNow = Math.max(0, ordered - sq), why = shortNow > 0 ? String(pl.reason || '') : '';
    if (shortNow > 0 ? (why && why !== r.shortNote) : !!r.shortNote) {
      r.shortNote = why.slice(0, 500);
      log.getRange(r.row, L['Short Note'] + 1).setValue(r.shortNote);
      touched = true;
    }
    if (!touched && !firstFound) return;
    if (!r.removedAt) markShort_(r, Math.max(0, ordered - sq), sq, ordered);
    if (sq < ordered) out.short = (out.short || 0) + 1;
    log.getRange(r.row, L['Updated At'] + 1, 1, 2).setValues([[now, 'Shipment Manager']]);
    changedRos.push(r);
  });
  try { refreshHeadings_(changedRos.filter(r => r.status !== 'Cancelled')); } catch (e) { /* the RO Log is updated either way */ }
  return out;
}

/** For a time-driven trigger (Apps Script → Triggers → syncFromShipmentManager, e.g. every 3 hours). */
function syncFromShipmentManager() {
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const res = syncShipments_();
    if (!res.skipped) res.moved = rollOverdueDispatch_();
    return res;
  } finally { lock.releaseLock(); }
}

/**
 * From the page: in the background after opening (at most every 3 hours; force = Settings → Sync now). Answers with
 * what changed and, when something did, the open ROs.
 */
function syncShipments(token, force) {
  auth_(token, force ? 'Admin' : undefined);
  const cache = CacheService.getScriptCache();
  if (!force && cache.get('ship_sync')) return { skipped: 'recent' };
  cache.put('ship_sync', '1', 30 * 60); // at most every 30 minutes
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    const res = syncShipments_();
    try { res.cells = refreshShortCells_(); } catch (e) { /* tried again next sync */ }
    if (!res.skipped) { try { res.moved = rollOverdueDispatch_(); } catch (e) { /* tried again next sync */ } }
    if (res.dates || res.qty || res.short || res.moved || res.reverted) {
      const all = readLog_();
      res.openROs = openROsOf_(all); res.delivered = recentDeliveredOf_(all);
    }
    return res;
  } finally { lock.releaseLock(); }
}

/**
 * Open ROs (Draft / Planned) whose dispatch day has passed but that the Shipment Manager has no shipment for: they
 * were not sent, so their dispatch day moves to today (or the next dispatch day, Settings → Dispatch) and the
 * month-tab heading follows. Runs right after a successful Shipment Manager sync, so an RO shipped late is picked up
 * there first (its real shipment date then replaces the moved day). Returns how many ROs moved.
 */
function rollOverdueDispatch_() {
  if (!PropertiesService.getScriptProperties().getProperty('SHIP_SHEET_ID')) return 0; // without it "Shipped" = dispatch day passed
  const today = ymd_(new Date());
  let target = today;
  for (let i = 0; i < 14 && !isDispatchDay_(target); i++) target = addDaysYmd_(target, 1);
  const all = readLog_(), rows = [], fixedRows = [], changed = [], batches = {};
  all.forEach(r => {
    if (OPEN_STATUSES.indexOf(r.status) < 0 || r.logOnly || r.shippedOn instanceof Date) return;
    const appt = r.appt instanceof Date ? ymd_(r.appt) : '', cur = dispatchDay_(r.wh, appt, r.dispatch instanceof Date ? ymd_(r.dispatch) : '', r.dispatchFixed);
    if (!cur || cur >= today) return;
    const d = parseDate_(target);
    r.dispatch = d; r.dispatchFixed = !!appt; // with an appointment the moved day is kept instead of the appointment's
    rows.push({ row: r.row, v: d }); fixedRows.push({ row: r.row, v: r.dispatchFixed ? 'Yes' : '' });
    changed.push(r); batches[r.batch] = 1;
  });
  if (!rows.length) return 0;
  const log = ensureLog_();
  writeRuns_(log, rows, L['Dispatch Date']);
  writeRuns_(log, fixedRows, L['Dispatch Fixed']);
  try { refreshHeadings_(changed); } catch (e) { /* the dates are saved either way */ }
  return Object.keys(batches).length;
}

function getShipLink(token) {
  auth_(token, 'Admin');
  const id = PropertiesService.getScriptProperties().getProperty('SHIP_SHEET_ID');
  return { url: id ? 'https://docs.google.com/spreadsheets/d/' + id + '/edit' : '' };
}

/**
 * Saves the Shipment Manager sheet link after checking it can be read, and fills in the shipped quantities of ROs
 * delivered in the last 10 days that do not have them yet.
 */
function saveShipLink(token, url) {
  auth_(token, 'Admin');
  const m = String(url || '').match(/\/d\/([\w-]{20,})/) || String(url || '').match(/^([\w-]{20,})$/);
  if (!m) throw new Error('Paste the Shipment Manager Google Sheet link.');
  let tab;
  try { tab = SpreadsheetApp.openById(m[1]).getSheetByName('BLINKIT_PO'); }
  catch (e) { throw new Error('The planner cannot open that sheet: ' + e.message + ' (the Google account the planner runs as needs access to it).'); }
  if (!tab) throw new Error('That sheet has no BLINKIT_PO tab.');
  const p = PropertiesService.getScriptProperties();
  p.setProperty('SHIP_SHEET_ID', m[1]);
  // Back-fill: recently delivered ROs without a shipped quantity.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const log = ensureLog_(), all = readLog_();
    const due = all.filter(r => r.status === 'Delivered' && r.roNo && r.shippedQty == null && r.deliveredOn instanceof Date && r.deliveredOn.getTime() >= Date.now() - 10 * 864e5);
    const sm = shippedQtyMap_(due.map(r => r.roNo));
    let n = 0;
    due.forEach(r => { const q = sm[String(r.roNo).trim() + '|' + r.item]; if (q === undefined) return; log.getRange(r.row, L['Shipped Qty'] + 1).setValue(q); n++; });
    return { ok: true, filled: n, pos: tab.getLastRow() - 1 };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- Dummy RO Invoice (made by the Shipment Manager) ---------------- */

// The Shipment Manager's web-app link (/exec) and the key it expects from the Planner (its Script Property
// PLANNER_API_SECRET) are kept only in this script's Script Properties: SM_WEBAPP_URL, SM_API_SECRET.
const SM_URL_RE_ = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]{20,}\/exec$/;

function getSmApi(token) {
  auth_(token, 'Admin');
  const p = PropertiesService.getScriptProperties();
  return { url: p.getProperty('SM_WEBAPP_URL') || '', hasKey: !!p.getProperty('SM_API_SECRET') };
}

/** Saves the link (and key, when given) and checks the Shipment Manager answers with that key. */
function saveSmApi(token, url, key) {
  auth_(token, 'Admin');
  url = String(url || '').trim();
  if (!SM_URL_RE_.test(url)) throw new Error('Paste the Shipment Manager web-app link: https://script.google.com/macros/s/…/exec');
  const p = PropertiesService.getScriptProperties();
  p.setProperty('SM_WEBAPP_URL', url);
  if (key) p.setProperty('SM_API_SECRET', String(key).trim());
  if (!p.getProperty('SM_API_SECRET')) throw new Error('Enter the Planner key too.');
  // A test with no RO: a working setup answers "could not read the RO PDF".
  const r = smCall_({ rawText: '' });
  if (/did not accept/i.test(r.message || '')) throw new Error(r.message);
  if (r.notHooked) throw new Error(r.message);
  return { ok: true };
}

function smCall_(extra) {
  const p = PropertiesService.getScriptProperties(), url = p.getProperty('SM_WEBAPP_URL'), key = p.getProperty('SM_API_SECRET');
  if (!url || !key) return { success: false, message: 'Set the Shipment Manager web-app link and the Planner key in Settings → Shipment Manager first.' };
  const resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'text/plain', muteHttpExceptions: true, followRedirects: true,
    payload: JSON.stringify(Object.assign({ action: 'plannerDummyRoInvoice', secret: key }, extra || {})),
  });
  let res;
  try { res = JSON.parse(resp.getContentText()); } catch (e) {
    return { success: false, notHooked: true, message: 'The Shipment Manager did not answer (HTTP ' + resp.getResponseCode() + '). Check its web-app link.' };
  }
  // An answer without our fields: the Shipment Manager's doPost does not pass this request on yet.
  if (!res || res.from !== 'plannerDummyRo') return { success: false, notHooked: true, message: 'The Shipment Manager does not know this request yet: its automatic deploy has not run yet (GitHub → Actions → Deploy Shipment Manager).' };
  return res;
}

/** RO PDF text → the Shipment Manager makes a Dummy RO Invoice (SI/2026-27/D001…) and returns it for the PDF. */
function dummyRoInvoice(token, rawText) {
  auth_(token, 'Planner');
  if (!String(rawText || '').trim()) throw new Error('The RO PDF had no text.');
  const r = smCall_({ rawText: String(rawText) });
  if (!r.success) throw new Error(r.message || 'The Shipment Manager could not make the invoice.');
  return { invoice: r.invoice, warehouse: r.warehouse || '', boxCount: r.boxCount || 0, leftOut: r.leftOut || [], aiUsed: !!r.aiUsed };
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
