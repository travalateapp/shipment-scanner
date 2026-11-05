/* =====================================================================
 *  KARIGAR PRODUCTION APP — Google Apps Script
 *
 *  Karigars make goods (inventory SKUs and parts such as straps / belts).
 *  Raw material is issued to them (2 people), finished goods are counted
 *  (2 people, blind, with a photo), counted batches are locked and the
 *  inventory SKUs are added to the Travalate Inventory App. The second count is final. Karigars are
 *  paid for counted good pieces at their own rate per item, for the pay
 *  period 5th to 4th, minus advance instalments (full or partial).
 *  1 person approves each payment.
 *
 *  Setup: see production-app/README.md.
 * ===================================================================== */

const SERVER_VERSION = 1;

const SHEET = {
  SETTINGS: 'Settings',
  KARIGARS: 'Karigars',
  STAFF: 'Staff',
  ITEMS: 'Items',
  RATES: 'Rates',
  MATERIALS: 'Materials',
  BOM: 'BOM',
  ORDERS: 'Work Orders',
  MOVES: 'Material Moves',
  BATCHES: 'Batches',
  LINES: 'Batch Lines',
  ADVANCES: 'Advances',
  ADV_PERIODS: 'Advance Periods',
  PAY: 'Payroll',
  LOG: 'Change Log',
};

const HEADERS = {};
HEADERS[SHEET.SETTINGS] = ['Setting', 'Value', 'Notes'];
HEADERS[SHEET.KARIGARS] = ['ID', 'Name', 'Phone', 'PIN', 'Active', 'Joined', 'Note'];
HEADERS[SHEET.STAFF] = ['ID', 'Name', 'Phone', 'PIN', 'Role', 'Permissions', 'Active'];
HEADERS[SHEET.ITEMS] = ['Code', 'Name', 'Type', 'Active'];
// Karigar ID * = the STANDARD rate (all karigars). A karigar ID = that karigar's own rate for future lots; Rate STD = back to standard.
HEADERS[SHEET.RATES] = ['Karigar ID', 'Item Code', 'Rate', 'From Date', 'Set By', 'Set At', 'Note'];
HEADERS[SHEET.MATERIALS] = ['Code', 'Name', 'Unit', 'Active'];
HEADERS[SHEET.BOM] = ['Item Code', 'Material Code', 'Qty Per Piece'];
HEADERS[SHEET.ORDERS] = ['ID', 'Date', 'Karigar ID', 'Item Code', 'Qty', 'Status', 'Note', 'By', 'At', 'Rate', 'Rate Source'];
HEADERS[SHEET.MOVES] = ['ID', 'Date', 'Type', 'Karigar ID', 'Material Code', 'Qty', 'Note', 'Entered By', 'Entered At',
  'Status', 'Confirmed By', 'Confirmed At'];
HEADERS[SHEET.BATCHES] = ['ID', 'Karigar ID', 'Status', 'Created At', 'Claim', 'Count 1 By', 'Count 1 At', 'Count 1', 'Photo',
  'Count 2 By', 'Count 2 At', 'Count 2', 'Final Date', 'Inventory', 'Inventory Note', 'Earlier Counts', 'Note'];
HEADERS[SHEET.LINES] = ['Batch ID', 'Karigar ID', 'Karigar', 'Final Date', 'Item Code', 'Type', 'Good', 'Rejected', 'Work Order'];
HEADERS[SHEET.ADVANCES] = ['ID', 'Karigar ID', 'Name', 'Date Given', 'Amount', 'Per Period', 'Start Period', 'Status', 'Note',
  'By', 'At', 'Top-ups'];
HEADERS[SHEET.ADV_PERIODS] = ['Advance ID', 'Karigar ID', 'Period', 'Amount', 'Note', 'By', 'At'];
HEADERS[SHEET.PAY] = ['Period', 'Karigar ID', 'Name', 'Earned', 'Advance', 'Net', 'Status', 'Approved By', 'Approved At',
  'Paid Date', 'Paid By', 'Details'];
HEADERS[SHEET.LOG] = ['At', 'By', 'Action', 'Ref', 'Details'];

const DEFAULT_SETTINGS = [
  ['Company', 'Travalate', 'Shown on the login screen and payslips'],
  ['Currency', '₹', ''],
  ['Pay Period Start Day', 5, 'Work counted from this day of the month to the day before it next month (5 → 5th to 4th)'],
  ['Inventory App URL', '', 'The Travalate Inventory web app /exec link'],
  ['Inventory Secret', '', 'Same as SHARED_SECRET in the Inventory App'],
  ['Stay Logged In (days)', 60, ''],
  ['Photo Folder ID', '', 'Filled in by setup'],
  ['Inventory Last Sync', '', 'Filled in by the app'],
];

/* Permissions a super admin can give to staff. */
const PERMS = {
  count: 'Count received goods (count 1 / count 2)',
  issue: 'Enter material issues and returns',
  confirm: 'Confirm material issues and returns',
  orders: 'Work orders',
  approve: 'Approve and pay karigars',
  advances: 'Give advances and set deductions',
  masters: 'Karigars, items, materials, rates',
  reports: 'Dashboard, batches, material balance, payroll (view)',
};

/* ------------------------------------------------------------------ */
/* Web app                                                             */
/* ------------------------------------------------------------------ */

function doGet(e) {
  if (e && e.parameter && e.parameter.ping) {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'production' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(getSettings_().company + ' – Production')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

const API_FUNCTIONS = {
  publicInfo, login, logout, changePin, getHome,
  myWork, myPayslip, submitHandover,
  adminDashboard, countQueue, startBatch, saveCount, batchList, batchDetail, batchPhoto, retryInventory,
  correctBatch, moveList, saveMove, decideMove, materialBalance, orderList, saveOrder, setOrderStatus,
  payroll, payslip, setPayAdvance, approvePay, unapprovePay, markPaid, advances, saveAdvance, topUpAdvance, setAdvancePeriod,
  setAdvanceStatus, karigarList, saveKarigar, resetPin, rateList, saveRate, saveStandardRate, setOrderRate, itemList, saveItem, inventorySkus,
  saveMaterial, saveBom, staffList, saveStaff, changeLog,
};

function doPost(e) {
  let json, rid = '';
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    rid = /^[\w-]{8,64}$/.test(String(req.rid || '')) ? 'rid_' + req.rid : '';
    const done = rid ? CacheService.getScriptCache().get(rid) : null;
    if (done) return ContentService.createTextOutput(done).setMimeType(ContentService.MimeType.JSON);
    const fn = Object.prototype.hasOwnProperty.call(API_FUNCTIONS, req.fn) ? API_FUNCTIONS[req.fn] : null;
    if (!fn) throw new Error('Unknown action.');
    const result = fn.apply(null, Array.isArray(req.args) ? req.args : []);
    json = JSON.stringify({ ok: true, result: result === undefined ? null : result, sv: SERVER_VERSION });
  } catch (err) {
    json = JSON.stringify({ ok: false, error: String((err && err.message) || err) });
  }
  if (rid && json.length < 95000) {
    try { CacheService.getScriptCache().put(rid, json, 600); } catch (err) { /* ignore */ }
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/** google.script.run entry (page opened from the /exec link): same functions, same answer shape. */
function api(fnName, args) {
  const r = doPost({ postData: { contents: JSON.stringify({ fn: fnName, args: args || [] }) } });
  return r.getContent();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Production App')
    .addItem('Run setup / repair sheets', 'setup')
    .addItem('Send stock to the Inventory App now', 'syncInventory')
    .addToUi();
}

/** Creates the tabs, headers and default settings, the photo folder and the daily trigger. Safe to run again. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach(name => {
    const sh = sheetOrCreate_(name);
    ensureHeaders_(sh, HEADERS[name]);
  });
  const set = ss.getSheetByName(SHEET.SETTINGS);
  const have = set.getLastRow() > 1 ? set.getRange(2, 1, set.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  DEFAULT_SETTINGS.forEach(r => { if (have.indexOf(r[0]) < 0) set.appendRow(r); });
  forget_('settings');
  const s = getSettings_();
  if (!s.photoFolder) {
    const f = DriveApp.createFolder(s.company + ' – Production batch photos');
    setSetting_('Photo Folder ID', f.getId());
  }
  // A first super admin so someone can log in (PIN 1234: change it after the first login).
  if (readStaff_().length === 0) {
    sheet_(SHEET.STAFF).appendRow(['S001', 'Owner', '', '1234', 'SUPER', '', true]);
    forget_('staff');
  }
  ['Karigars', 'Staff'].forEach(n => { try { ss.getSheetByName(n).getRange('D:D').setNumberFormat('@'); } catch (e) { /* ignore */ } });
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'syncInventory')) {
    ScriptApp.newTrigger('syncInventory').timeBased().everyHours(1).create();
  }
  return 'Setup done';
}

/* ------------------------------------------------------------------ */
/* Login & sessions                                                    */
/* ------------------------------------------------------------------ */

function publicInfo() {
  const s = getSettings_();
  return { company: s.company, sv: SERVER_VERSION };
}

/** Karigars and staff log in with their ID + PIN. IDs are unique across both lists. */
function login(id, pin) {
  id = String(id || '').trim().toUpperCase();
  pin = String(pin || '').trim();
  if (!id || !pin) throw new Error('Enter your ID and PIN.');
  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + id;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) throw new Error('Too many wrong attempts. Try again after 15 minutes.');
  const user = findUser_(id);
  if (!user || !user.active || !verifyPin_(user.pin, pin)) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error('Wrong ID or PIN.');
  }
  cache.remove(failKey);
  if (!isHashed_(user.pin)) writePin_(user, pin);
  const token = Utilities.getUuid();
  saveSession_(token, user.kind + ':' + user.id);
  return { token: token, profile: profile_(user) };
}

function logout(token) {
  if (token) {
    CacheService.getScriptCache().remove('tok_' + token);
    try { PropertiesService.getScriptProperties().deleteProperty('tok_' + token); } catch (e) { /* ignore */ }
  }
  return true;
}

function changePin(token, oldPin, newPin) {
  const user = auth_(token);
  if (!verifyPin_(user.pin, String(oldPin || ''))) throw new Error('The current PIN is wrong.');
  if (!/^\d{4,8}$/.test(String(newPin || ''))) throw new Error('The new PIN must be 4 to 8 digits.');
  writePin_(user, String(newPin));
  log_(user, 'CHANGE_PIN', user.id, 'Changed own PIN');
  return true;
}

function profile_(u) {
  return {
    id: u.id, name: u.name, kind: u.kind, role: u.role || '', perms: u.kind === 'S' ? permsOf_(u) : [],
    company: getSettings_().company, currency: getSettings_().currency, permNames: PERMS,
  };
}

function saveSession_(token, who) {
  CacheService.getScriptCache().put('tok_' + token, who, 21600);
  const days = Number(getSettings_().sessionDays) || 0;
  if (days > 0) {
    try {
      PropertiesService.getScriptProperties().setProperty('tok_' + token, JSON.stringify({ w: who, x: Date.now() + days * 86400000 }));
    } catch (e) { /* the session still lasts 6 hours */ }
  }
}

function sessionWho_(token) {
  if (!token) return null;
  const c = CacheService.getScriptCache().get('tok_' + token);
  if (c) return c;
  let v = null;
  try { v = JSON.parse(PropertiesService.getScriptProperties().getProperty('tok_' + token) || 'null'); } catch (e) { v = null; }
  if (!v || !v.w || !(v.x > Date.now())) return null;
  CacheService.getScriptCache().put('tok_' + token, v.w, 21600);
  return v.w;
}

/** The logged-in karigar or staff member, or an error asking to log in again. */
function auth_(token) {
  const who = sessionWho_(token);
  if (!who) throw new Error('SESSION_EXPIRED');
  const kind = who.slice(0, 1), id = who.slice(2);
  const u = kind === 'K' ? readKarigars_().filter(k => k.id === id)[0] : readStaff_().filter(s => s.id === id)[0];
  if (!u || !u.active) throw new Error('SESSION_EXPIRED');
  return u;
}

function authKarigar_(token) {
  const u = auth_(token);
  if (u.kind !== 'K') throw new Error('Only for karigars.');
  return u;
}

/** Staff with the permission (any of several, separated by |). Super admins have every permission. */
function authStaff_(token, perm) {
  const u = auth_(token);
  if (u.kind !== 'S') throw new Error('Not allowed.');
  if (!perm || u.role === 'SUPER') return u;
  const mine = permsOf_(u);
  if (!String(perm).split('|').some(p => mine.indexOf(p) >= 0)) throw new Error('You do not have permission for this.');
  return u;
}

function permsOf_(u) {
  if (u.role === 'SUPER') return Object.keys(PERMS).concat(['super']);
  return String(u.permissions || '').split(',').map(x => x.trim()).filter(x => PERMS[x]);
}

function can_(u, perm) {
  return u.kind === 'S' && (u.role === 'SUPER' || permsOf_(u).indexOf(perm) >= 0);
}

function findUser_(id) {
  return readKarigars_().filter(k => k.id === id)[0] || readStaff_().filter(s => s.id === id)[0] || null;
}

function isHashed_(stored) { return /^sha256\$/.test(String(stored)); }

function hashPin_(pin, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8);
  return 'sha256$' + salt + '$' + bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function verifyPin_(stored, pin) {
  stored = String(stored || '');
  if (!isHashed_(stored)) return stored !== '' && stored === pin;
  return hashPin_(pin, stored.split('$')[1]) === stored;
}

function writePin_(u, pin) {
  const name = u.kind === 'K' ? SHEET.KARIGARS : SHEET.STAFF;
  sheet_(name).getRange(u.row, 4).setValue(hashPin_(pin));
  forget_(u.kind === 'K' ? 'karigars' : 'staff');
}

/* ------------------------------------------------------------------ */
/* Karigar screens                                                     */
/* ------------------------------------------------------------------ */

/** Home for anyone: karigars get their period so far; staff get the dashboard. */
function getHome(token) {
  const u = auth_(token);
  if (u.kind === 'S') return { profile: profile_(u) };
  const per = periodOf_(todayStr_());
  const pay = payFor_(u, per);
  const balances = materialBalances_().filter(b => b.karigarId === u.id && Math.abs(b.balance) > 1e-9);
  const orders = ordersWithProgress_().filter(o => o.karigarId === u.id && o.open);
  const batches = readBatches_().filter(b => b.karigarId === u.id).slice(-8).reverse().map(b => batchSummary_(b, u));
  return { profile: profile_(u), period: periodInfo_(per), pay: pay, balances: balances, orders: orders, batches: batches,
    items: activeItems_().filter(i => orders.some(o => o.item === i.code) || rateOn_(u.id, i.code, todayStr_()) !== null) };
}

/** My work: every locked batch line in a period. */
function myWork(token, period) {
  const u = authKarigar_(token);
  period = validPeriod_(period);
  return { period: periodInfo_(period), pay: payFor_(u, period), batches: readBatches_().filter(b => b.karigarId === u.id &&
    (b.status !== 'LOCKED' || periodOf_(b.finalDate) === period)).reverse().map(b => batchSummary_(b, u)) };
}

function myPayslip(token, period) {
  const u = authKarigar_(token);
  return payslipData_(u, validPeriod_(period));
}

/**
 * A karigar hands over finished goods: { lines: [{ item, qty }], note }. This is only their claim; pay always
 * uses the 2-person count.
 */
function submitHandover(token, data) {
  const u = authKarigar_(token);
  const lines = cleanLines_((data && data.lines) || [], true);
  if (!lines.length) throw new Error('Add at least one item with its quantity.');
  const id = withLock_(() => {
    const id = nextId_(SHEET.BATCHES, 'P-');
    sheet_(SHEET.BATCHES).appendRow([id, u.id, 'COUNT1', nowStr_(), JSON.stringify(lines.map(l => ({ item: l.item, qty: l.good }))),
      '', '', '', '', '', '', '', '', '', '', '', String((data && data.note) || '').slice(0, 200)]);
    forget_('batches');
    return id;
  });
  log_(u, 'HANDOVER', id, lines.map(l => l.item + ' ' + l.good).join(', '));
  return { id: id };
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

function adminDashboard(token) {
  const u = authStaff_(token, 'reports');
  const batches = readBatches_();
  const per = periodOf_(todayStr_());
  const kar = readKarigars_().filter(k => k.active);
  let earned = 0, adv = 0, missingRates = 0;
  kar.forEach(k => {
    const p = payFor_(k, per);
    earned += p.earned; adv += p.advance; missingRates += p.missingRates;
  });
  const flags = materialBalances_().filter(b => b.flag);
  const today = todayStr_();
  const todayLines = readLines_().filter(l => l.finalDate === today);
  return {
    period: periodInfo_(per),
    waitCount1: batches.filter(b => b.status === 'COUNT1').length,
    waitCount2: batches.filter(b => b.status === 'COUNT2').length,
    differed: batches.filter(b => b.status === 'LOCKED' && periodOf_(b.finalDate) === per && b.count1.length && !sameCount_(b.count1, b.count2)).length,
    inventoryPending: batches.filter(b => b.inventory === 'PENDING').length,
    movesPending: readMoves_().filter(m => m.status === 'PENDING').length,
    receivedToday: todayLines.reduce((n, l) => n + l.good, 0),
    rejectedToday: todayLines.reduce((n, l) => n + l.rejected, 0),
    earned: round2_(earned), advance: round2_(adv), net: round2_(earned - adv), missingRates: missingRates,
    inProduction: inProductionList_(),
    flags: flags.slice(0, 20),
    karigars: kar.length,
    inventorySync: getSettings_().inventoryLastSync,
    canCount: can_(u, 'count'),
  };
}

/* ------------------------------------------------------------------ */
/* Counting received goods (2 people, blind, photo, lock)              */
/* ------------------------------------------------------------------ */

/** What is waiting to be counted. Count 1 numbers are never sent to anyone doing count 2. */
function countQueue(token) {
  const u = authStaff_(token, 'count|reports');
  const names = karigarNames_();
  const list = readBatches_().filter(b => ['COUNT1', 'COUNT2'].indexOf(b.status) >= 0).map(b => ({
    id: b.id, karigarId: b.karigarId, karigar: names[b.karigarId] || b.karigarId, status: b.status, createdAt: b.createdAt,
    claim: b.claim, count1By: b.count1By ? staffName_(b.count1By) : '', count1At: b.count1At,
    items: b.status === 'COUNT2' ? b.count1.map(l => l.item) : [],
    mine: b.count1By === u.id,
  }));
  return { list: list, karigars: readKarigars_().filter(k => k.active).map(k => ({ id: k.id, name: k.name })),
    items: activeItems_(), canCount: can_(u, 'count'), me: u.id };
}

/** Count 1 without a karigar hand-over: creates the batch for a karigar. */
function startBatch(token, karigarId) {
  const u = authStaff_(token, 'count');
  const k = readKarigars_().filter(x => x.id === String(karigarId || '').toUpperCase() && x.active)[0];
  if (!k) throw new Error('Choose the karigar.');
  const id = withLock_(() => {
    const id = nextId_(SHEET.BATCHES, 'P-');
    sheet_(SHEET.BATCHES).appendRow([id, k.id, 'COUNT1', nowStr_(), '', '', '', '', '', '', '', '', '', '', '', '', '']);
    forget_('batches');
    return id;
  });
  log_(u, 'NEW_BATCH', id, 'For ' + k.id + ' ' + k.name);
  return { id: id };
}

/**
 * Saves count 1 (with the photo, required) or count 2 (a different person, who does not see count 1).
 * Count 2 is FINAL: the batch is locked with count 2's numbers, lines are written, work orders are filled and
 * inventory SKUs go to the Inventory App. If count 1 was different, that is kept and flagged (not blocked).
 * data = { lines: [{ item, good, rejected }], photo: 'data:image/jpeg;base64,…' (count 1) }
 */
function saveCount(token, batchId, data) {
  const u = authStaff_(token, 'count');
  data = data || {};
  const lines = cleanLines_(data.lines || [], false);
  if (!lines.length) throw new Error('Add at least one item with its count.');
  const res = withLock_(() => {
    const b = readBatches_().filter(x => x.id === batchId)[0];
    if (!b) throw new Error('Batch not found.');
    const sh = sheet_(SHEET.BATCHES);
    if (b.status === 'COUNT1') {
      if (!data.photo) throw new Error('Take a photo of the received goods.');
      const photoId = savePhoto_(b.id + ' ' + (karigarNames_()[b.karigarId] || b.karigarId), data.photo);
      sh.getRange(b.row, 3).setValue('COUNT2');
      sh.getRange(b.row, 6, 1, 4).setValues([[u.id, nowStr_(), JSON.stringify(lines), photoId]]);
      forget_('batches');
      log_(u, 'COUNT_1', b.id, linesText_(lines));
      return { status: 'COUNT2' };
    }
    if (b.status !== 'COUNT2') throw new Error('This batch is not waiting for a count.');
    if (b.count1By === u.id) throw new Error('Count 2 must be done by a different person.');
    sh.getRange(b.row, 10, 1, 3).setValues([[u.id, nowStr_(), JSON.stringify(lines)]]);
    const differs = mismatchItems_(Object.assign({}, b, { count2: lines }));
    const today = todayStr_();
    sh.getRange(b.row, 3).setValue('LOCKED');
    sh.getRange(b.row, 13).setValue("'" + today);
    forget_('batches');
    writeLines_(Object.assign({}, b, { finalDate: today }), lines);
    log_(u, 'COUNT_2_FINAL', b.id, linesText_(lines) + (differs.length ? ' | count 1 was different on: ' + differs.join(', ') + ' (count 1: ' + linesText_(b.count1) + ')' : ''));
    return { status: 'LOCKED', differs: differs };
  });
  if (res.status === 'LOCKED') {
    const b = readBatches_().filter(x => x.id === batchId)[0];
    res.inventory = pushBatch_(b, u.name);
    pushInProduction_();
  }
  return res;
}

/**
 * Super admin only: changes a locked batch. reason is required. The Inventory App gets only the difference
 * (its ledger is per batch, so this can be done any number of times).
 */
function correctBatch(token, batchId, data) {
  const u = authStaff_(token, 'super');
  if (u.role !== 'SUPER') throw new Error('Only a super admin can change a locked batch.');
  const reason = String((data && data.reason) || '').trim();
  if (reason.length < 5) throw new Error('Write the reason for the change.');
  const lines = cleanLines_((data && data.lines) || [], false);
  const b = readBatches_().filter(x => x.id === batchId)[0];
  if (!b || b.status !== 'LOCKED') throw new Error('Only locked batches can be corrected.');
  const per = periodOf_(b.finalDate);
  const pay = readPay_().filter(p => p.period === per && p.karigarId === b.karigarId)[0];
  if (pay) throw new Error('Pay for ' + periodInfo_(per).label + ' is already approved for this karigar. Undo the approval first.');
  const before = linesText_(b.lines);
  withLock_(() => {
    deleteRowsWhere_(SHEET.LINES, r => String(r[0]) === b.id);
    forget_('lines');
    writeLines_(b, lines);
    sheet_(SHEET.BATCHES).getRange(b.row, 17).setValue((b.note ? b.note + '\n' : '') + nowStr_() + ' changed by ' + u.name + ': ' + reason);
    forget_('batches');
  });
  log_(u, 'CORRECT_BATCH', b.id, before + ' → ' + linesText_(lines) + ' | ' + reason);
  const nb = readBatches_().filter(x => x.id === batchId)[0];
  const inv = pushBatch_(nb, u.name);
  pushInProduction_();
  return { inventory: inv };
}

/** Batch lines: good pieces are given to the karigar's oldest open work orders for that item. */
function writeLines_(b, lines) {
  const k = readKarigars_().filter(x => x.id === b.karigarId)[0] || { name: b.karigarId };
  const items = itemMap_();
  const orders = ordersWithProgress_().filter(o => o.karigarId === b.karigarId && o.open);
  const rows = [];
  lines.forEach(l => {
    let left = l.good, rej = l.rejected;
    orders.filter(o => o.item === l.item && o.remaining > 0).forEach(o => {
      if (left <= 0) return;
      const take = Math.min(left, o.remaining);
      o.remaining -= take;
      left -= take;
      rows.push([b.id, b.karigarId, k.name, "'" + b.finalDate, l.item, (items[l.item] || {}).type || '', take, rej, o.id]);
      rej = 0;
    });
    if (left > 0 || rej > 0 || l.good === 0) rows.push([b.id, b.karigarId, k.name, "'" + b.finalDate, l.item, (items[l.item] || {}).type || '', left, rej, '']);
  });
  if (rows.length) {
    const sh = sheet_(SHEET.LINES);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  forget_('lines');
}

function cleanLines_(lines, claim) {
  const items = itemMap_();
  const by = {};
  lines.forEach(l => {
    const item = String(l.item || '').trim();
    if (!item) return;
    if (!items[item]) throw new Error('Unknown item: ' + item);
    const good = Number(claim ? l.qty : l.good) || 0, rej = claim ? 0 : Number(l.rejected) || 0;
    if (good < 0 || rej < 0 || good % 1 || rej % 1) throw new Error('Counts must be whole numbers.');
    if (!good && !rej) return;
    by[item] = by[item] || { item: item, good: 0, rejected: 0 };
    by[item].good += good;
    by[item].rejected += rej;
  });
  return Object.keys(by).sort().map(k => by[k]);
}

function sameCount_(a, b) {
  const key = x => x.map(l => l.item + '=' + l.good + '/' + l.rejected).sort().join(';');
  return key(a) === key(b);
}

function mismatchItems_(b) {
  const m = {};
  (b.count1 || []).forEach(l => { m[l.item] = (l.good + '/' + l.rejected); });
  const out = [];
  (b.count2 || []).forEach(l => { if (m[l.item] !== l.good + '/' + l.rejected) out.push(l.item); delete m[l.item]; });
  return out.concat(Object.keys(m));
}

function linesText_(lines) {
  return lines.map(l => l.item + ' ' + l.good + (l.rejected ? ' (+' + l.rejected + ' rejected)' : '')).join(', ');
}

function savePhoto_(name, dataUrl) {
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(String(dataUrl));
  if (!m) throw new Error('The photo could not be read. Take it again.');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name + '.jpg');
  const folderId = getSettings_().photoFolder;
  const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder();
  return folder.createFile(blob).getId();
}

/** The batch photo as a data URL (the Drive file stays private). */
function batchPhoto(token, batchId) {
  const u = auth_(token);
  const b = readBatches_().filter(x => x.id === batchId)[0];
  if (!b || !b.photo) throw new Error('No photo.');
  if (u.kind === 'K' && b.karigarId !== u.id) throw new Error('Not allowed.');
  if (u.kind === 'S' && !can_(u, 'reports') && !can_(u, 'count')) throw new Error('Not allowed.');
  const blob = DriveApp.getFileById(b.photo).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

/* ------------------------------------------------------------------ */
/* Batches list                                                        */
/* ------------------------------------------------------------------ */

function batchList(token, period, karigarId) {
  const u = authStaff_(token, 'reports|count');
  period = validPeriod_(period);
  karigarId = String(karigarId || '').toUpperCase();
  const list = readBatches_().filter(b => (!karigarId || b.karigarId === karigarId) &&
    (b.status === 'LOCKED' ? periodOf_(b.finalDate) === period : true)).reverse().map(b => batchSummary_(b, u));
  return { period: periodInfo_(period), periods: recentPeriods_(), list: list,
    karigars: readKarigars_().map(k => ({ id: k.id, name: k.name })) };
}

function batchDetail(token, batchId) {
  const u = auth_(token);
  const b = readBatches_().filter(x => x.id === batchId)[0];
  if (!b) throw new Error('Batch not found.');
  if (u.kind === 'K' && b.karigarId !== u.id) throw new Error('Not allowed.');
  if (u.kind === 'S' && !can_(u, 'reports') && !can_(u, 'count')) throw new Error('Not allowed.');
  const out = batchSummary_(b, u);
  out.items = activeItems_();
  out.log = u.kind === 'S' ? readLog_().filter(l => l.ref === b.id).reverse() : [];
  return out;
}

function batchSummary_(b, u) {
  const names = karigarNames_();
  const lines = b.status === 'LOCKED' ? groupByRate_(b.rawLines) : [];
  const super_ = u.kind === 'S' && u.role === 'SUPER';
  const showCounts = b.status === 'LOCKED' || super_;
  return {
    id: b.id, karigarId: b.karigarId, karigar: names[b.karigarId] || b.karigarId, status: b.status, createdAt: b.createdAt,
    claim: b.claim, finalDate: b.finalDate, period: b.finalDate ? periodInfo_(periodOf_(b.finalDate)).label : '',
    count1By: b.count1By ? staffName_(b.count1By) : '', count1At: b.count1At,
    count2By: b.count2By ? staffName_(b.count2By) : '', count2At: b.count2At,
    count1: showCounts ? b.count1 : null, count2: showCounts ? b.count2 : null, earlier: super_ ? b.earlier : [],
    lines: lines, good: lines.reduce((n, l) => n + l.good, 0), rejected: lines.reduce((n, l) => n + l.rejected, 0),
    amount: round2_(lines.reduce((n, l) => n + (l.amount || 0), 0)), missingRate: lines.some(l => l.rate === null),
    hasPhoto: !!b.photo, inventory: b.inventory, inventoryNote: u.kind === 'S' ? b.inventoryNote : '', note: b.note,
    canCorrect: super_ && b.status === 'LOCKED',
    differs: u.kind === 'S' && b.status === 'LOCKED' && b.count1.length ? mismatchItems_(b) : [],
  };
}

/* ------------------------------------------------------------------ */
/* Travalate Inventory App link                                        */
/* ------------------------------------------------------------------ */

function inventoryCall_(body) {
  const s = getSettings_();
  if (!s.inventoryUrl || !s.inventorySecret) throw new Error('The Inventory App link is not set up (Settings tab).');
  const res = UrlFetchApp.fetch(s.inventoryUrl, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
    payload: JSON.stringify(Object.assign({ secret: s.inventorySecret }, body)),
  });
  let out;
  try { out = JSON.parse(res.getContentText()); } catch (e) { throw new Error('The Inventory App did not answer (HTTP ' + res.getResponseCode() + ').'); }
  if (!out || !out.success) throw new Error((out && out.error) || 'The Inventory App refused the request.');
  return out;
}

/**
 * Adds a locked batch's good inventory-SKU pieces to the Inventory App. The note there reads like
 *   05-Nov 14:20 | Harshit | +40 (In) | Received From Ramesh (P-0012)
 * The Inventory App keeps a ledger per batch, so sending a batch again only applies the difference.
 */
function pushBatch_(b, employee) {
  const items = itemMap_();
  const qty = {};
  b.lines.forEach(l => { if ((items[l.item] || {}).type === 'SKU') qty[l.item] = (qty[l.item] || 0) + l.good; });
  const hadPush = b.inventory === 'DONE' || b.inventory === 'PENDING';
  if (!Object.keys(qty).length && !hadPush) { setInventory_(b, 'NONE', 'Only parts: nothing for the inventory'); return 'NONE'; }
  const name = karigarNames_()[b.karigarId] || b.karigarId;
  try {
    const out = inventoryCall_({ action: 'productionIn', batchId: b.id, date: todayStr_(), employee: employee || 'Production',
      comment: 'Received From ' + name + ' (' + b.id + ')', items: qty });
    const skipped = (out.skipped || []).length ? ' | Not in Master_SKU: ' + out.skipped.join(', ') : '';
    setInventory_(b, skipped ? 'PENDING' : 'DONE', nowStr_() + ' added' + skipped);
    return skipped ? 'PENDING' : 'DONE';
  } catch (e) {
    setInventory_(b, 'PENDING', nowStr_() + ' ' + e.message);
    return 'PENDING';
  }
}

function setInventory_(b, status, note) {
  sheet_(SHEET.BATCHES).getRange(b.row, 14, 1, 2).setValues([[status, note]]);
  forget_('batches');
}

function retryInventory(token, batchId) {
  const u = authStaff_(token, 'count|reports');
  const b = readBatches_().filter(x => x.id === batchId)[0];
  if (!b || b.status !== 'LOCKED') throw new Error('Batch not found.');
  const r = pushBatch_(b, u.name);
  return { inventory: r, note: readBatches_().filter(x => x.id === batchId)[0].inventoryNote };
}

/**
 * Sends the "in production" quantity of every inventory SKU (open work orders not yet received) to the
 * Inventory App, which shows it small and grey in the corner of today's cell in the Inventory Snapshot.
 */
function pushInProduction_() {
  try {
    const items = {};
    inProductionList_().forEach(x => { items[x.item] = x.qty; });
    inventoryCall_({ action: 'setInProduction', items: items });
    setSetting_('Inventory Last Sync', nowStr_() + ' OK');
    return true;
  } catch (e) {
    try { setSetting_('Inventory Last Sync', nowStr_() + ' ' + e.message); } catch (x) { /* ignore */ }
    return false;
  }
}

function inProductionList_() {
  const items = itemMap_();
  const by = {};
  ordersWithProgress_().filter(o => o.open && o.remaining > 0 && (items[o.item] || {}).type === 'SKU')
    .forEach(o => { by[o.item] = (by[o.item] || 0) + o.remaining; });
  return Object.keys(by).sort().map(k => ({ item: k, qty: by[k] }));
}

/** Hourly trigger: retries batches the Inventory App did not take yet, and refreshes "in production". */
function syncInventory() {
  readBatches_().filter(b => b.status === 'LOCKED' && b.inventory === 'PENDING').forEach(b => pushBatch_(b, 'Production (retry)'));
  pushInProduction_();
}

/** Inventory SKUs for the Items screen (cached 10 minutes). */
function inventorySkus(token) {
  authStaff_(token, 'masters');
  const c = CacheService.getScriptCache();
  const hit = c.get('inv_skus');
  if (hit) return JSON.parse(hit);
  const out = inventoryCall_({ action: 'getSkuList' });
  const skus = out.skus || [];
  try { c.put('inv_skus', JSON.stringify(skus), 600); } catch (e) { /* ignore */ }
  return skus;
}

/* ------------------------------------------------------------------ */
/* Material issue / return (2 people) and balance                      */
/* ------------------------------------------------------------------ */

function moveList(token) {
  const u = authStaff_(token, 'issue|confirm|reports');
  const names = karigarNames_(), mats = materialMap_();
  const list = readMoves_().slice(-300).reverse().map(m => Object.assign({}, m, {
    karigar: names[m.karigarId] || m.karigarId, material: (mats[m.materialCode] || {}).name || m.materialCode,
    unit: (mats[m.materialCode] || {}).unit || '', enteredByName: staffName_(m.enteredBy), confirmedByName: m.confirmedBy ? staffName_(m.confirmedBy) : '',
    canDecide: m.status === 'PENDING' && can_(u, 'confirm') && m.enteredBy !== u.id,
  }));
  return { list: list, karigars: readKarigars_().filter(k => k.active).map(k => ({ id: k.id, name: k.name })),
    materials: readMaterials_().filter(m => m.active), canIssue: can_(u, 'issue') };
}

/** data = { type: ISSUE|RETURN, karigarId, lines: [{ material, qty }], note } — one row per material, all PENDING. */
function saveMove(token, data) {
  const u = authStaff_(token, 'issue');
  data = data || {};
  const type = data.type === 'RETURN' ? 'RETURN' : 'ISSUE';
  const k = readKarigars_().filter(x => x.id === String(data.karigarId || '').toUpperCase() && x.active)[0];
  if (!k) throw new Error('Choose the karigar.');
  const mats = materialMap_();
  const lines = (data.lines || []).filter(l => l.material && Number(l.qty) > 0);
  if (!lines.length) throw new Error('Add at least one material with its quantity.');
  lines.forEach(l => { if (!mats[l.material]) throw new Error('Unknown material: ' + l.material); });
  const note = String(data.note || '').slice(0, 200);
  const ids = withLock_(() => {
    const sh = sheet_(SHEET.MOVES);
    let n = sh.getLastRow();
    const rows = lines.map(l => ['M-' + ('000' + (n++)).slice(-4), "'" + todayStr_(), type, k.id, l.material, Number(l.qty), note,
      u.id, nowStr_(), 'PENDING', '', '']);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    forget_('moves');
    return rows.map(r => r[0]);
  });
  log_(u, type, ids.join(','), k.id + ' ' + k.name + ': ' + lines.map(l => l.material + ' ' + l.qty).join(', '));
  return moveList(token);
}

/** The second person confirms (or rejects) a material issue / return. */
function decideMove(token, id, ok) {
  const u = authStaff_(token, 'confirm');
  withLock_(() => {
    const m = readMoves_().filter(x => x.id === id)[0];
    if (!m || m.status !== 'PENDING') throw new Error('Already decided.');
    if (m.enteredBy === u.id) throw new Error('A different person must confirm.');
    sheet_(SHEET.MOVES).getRange(m.row, 10, 1, 3).setValues([[ok ? 'CONFIRMED' : 'REJECTED', u.id, nowStr_()]]);
    forget_('moves');
  });
  log_(u, ok ? 'CONFIRM_MOVE' : 'REJECT_MOVE', id, '');
  return moveList(token);
}

/**
 * Per karigar and material: confirmed issues − confirmed returns − used (good + rejected pieces × BOM).
 * There is no wastage allowance, so anything negative is flagged; so is material still with a karigar who
 * has no open work order.
 */
function materialBalances_() {
  return memo_('balances', () => {
    const bom = bomMap_(), mats = materialMap_(), names = karigarNames_();
    const by = {};
    const get = (kid, mat) => {
      const key = kid + '|' + mat;
      return by[key] = by[key] || { karigarId: kid, karigar: names[kid] || kid, material: mat,
        materialName: (mats[mat] || {}).name || mat, unit: (mats[mat] || {}).unit || '', issued: 0, returned: 0, used: 0, pending: 0, needed: 0 };
    };
    readMoves_().forEach(m => {
      const r = get(m.karigarId, m.materialCode);
      if (m.status === 'CONFIRMED') r[m.type === 'RETURN' ? 'returned' : 'issued'] += m.qty;
      else if (m.status === 'PENDING') r.pending += m.type === 'RETURN' ? -m.qty : m.qty;
    });
    readLines_().forEach(l => {
      (bom[l.item] || []).forEach(x => { get(l.karigarId, x.material).used += (l.good + l.rejected) * x.qty; });
    });
    const openBy = {};
    ordersWithProgress_().filter(o => o.open && o.remaining > 0).forEach(o => {
      openBy[o.karigarId] = true;
      (bom[o.item] || []).forEach(x => { get(o.karigarId, x.material).needed += o.remaining * x.qty; });
    });
    return Object.keys(by).map(k => {
      const r = by[k];
      ['issued', 'returned', 'used', 'pending', 'needed'].forEach(f => { r[f] = round3_(r[f]); });
      r.balance = round3_(r.issued - r.returned - r.used);
      r.toIssue = round3_(Math.max(0, r.needed - Math.max(0, r.balance)));
      r.flag = r.balance < -0.0005 ? 'Used more than was given: check the BOM and the issues'
        : (r.balance > 0.0005 && !openBy[r.karigarId] ? 'Material still with the karigar: no open work order' : '');
      return r;
    }).sort((a, b) => (a.karigar + a.material < b.karigar + b.material ? -1 : 1));
  });
}

function materialBalance(token) {
  authStaff_(token, 'reports|issue|confirm');
  return { list: materialBalances_() };
}

/* ------------------------------------------------------------------ */
/* Work orders (what is "in production")                               */
/* ------------------------------------------------------------------ */

function ordersWithProgress_() {
  return memo_('orderprog', () => {
    const got = {};
    readLines_().forEach(l => { if (l.workOrder) got[l.workOrder] = (got[l.workOrder] || 0) + l.good; });
    return readOrders_().map(o => {
      const received = got[o.id] || 0;
      const remaining = Math.max(0, o.qty - received);
      return Object.assign({}, o, { received: received, remaining: remaining, open: o.status === 'OPEN' && remaining > 0,
        done: received >= o.qty });
    });
  });
}

function orderList(token, all) {
  const u = authStaff_(token, 'orders|reports|issue');
  const names = karigarNames_(), items = itemMap_(), bom = bomMap_(), mats = materialMap_();
  const list = ordersWithProgress_().filter(o => all || o.open).reverse().map(o => Object.assign({}, o, {
    karigar: names[o.karigarId] || o.karigarId, itemName: (items[o.item] || {}).name || '', type: (items[o.item] || {}).type || '',
    rateNow: o.rate !== null ? o.rate : rateOn_(o.karigarId, o.item, todayStr_()), standard: standardRateOn_(o.item, todayStr_()),
    material: (bom[o.item] || []).map(x => ({ material: (mats[x.material] || {}).name || x.material, unit: (mats[x.material] || {}).unit || '',
      qty: round3_(x.qty * o.qty) })),
  }));
  return { list: list, karigars: readKarigars_().filter(k => k.active).map(k => ({ id: k.id, name: k.name })),
    items: activeItems_(), canEdit: can_(u, 'orders'), canRate: can_(u, 'masters'), inProduction: inProductionList_() };
}

/**
 * data = { karigarId, item, qty, note, lotRate (optional special rate for this lot), futureToo (also for this
 * karigar's future lots of the item) }. The lot's rate is fixed when the lot is made: the special rate, else the
 * karigar's own rate, else the standard rate. A later standard rate change asks which running lots it applies to.
 */
function saveOrder(token, data) {
  const u = authStaff_(token, 'orders');
  data = data || {};
  const k = readKarigars_().filter(x => x.id === String(data.karigarId || '').toUpperCase() && x.active)[0];
  if (!k) throw new Error('Choose the karigar.');
  if (!itemMap_()[data.item]) throw new Error('Choose the item.');
  const qty = Number(data.qty);
  if (!(qty > 0) || qty % 1) throw new Error('Enter the quantity.');
  const special = data.lotRate !== '' && data.lotRate !== null && data.lotRate !== undefined;
  if (special && !can_(u, 'masters')) throw new Error('Only staff with the "masters" permission can set a special rate.');
  if (special && !(Number(data.lotRate) >= 0)) throw new Error('Enter a valid special rate.');
  const today = todayStr_();
  const kr = karigarRateOn_(k.id, data.item, today), sr = standardRateOn_(data.item, today);
  const rate = special ? Number(data.lotRate) : kr !== null ? kr : sr;
  const source = special ? 'LOT' : kr !== null ? 'KARIGAR' : sr !== null ? 'STANDARD' : '';
  const id = withLock_(() => {
    const id = nextId_(SHEET.ORDERS, 'W-');
    sheet_(SHEET.ORDERS).appendRow([id, "'" + today, k.id, data.item, qty, 'OPEN', String(data.note || '').slice(0, 200), u.id, nowStr_(),
      rate === null ? '' : rate, source]);
    forget_('orders');
    return id;
  });
  if (special && data.futureToo) addKarigarRate_(u, k, data.item, Number(data.lotRate), today, 'From lot ' + id);
  log_(u, 'NEW_ORDER', id, k.id + ' ' + k.name + ': ' + data.item + ' × ' + qty + ' at ' + (rate === null ? 'no rate' : rate) +
    (source ? ' (' + source.toLowerCase() + ')' : '') + (special && data.futureToo ? ', also for future lots' : ''));
  pushInProduction_();
  return orderList(token);
}

/**
 * Changes the rate of ONE lot (work order) for that karigar. futureToo = also use it for this karigar's future
 * lots of the item (otherwise the next lot gets the standard rate again). Pieces of the lot already paid in an
 * approved period keep their approved amount.
 */
function setOrderRate(token, id, rate, futureToo, note) {
  const u = authStaff_(token, 'masters');
  const o = readOrders_().filter(x => x.id === id)[0];
  if (!o) throw new Error('Work order not found.');
  if (rate === '' || rate === null || !(Number(rate) >= 0)) throw new Error('Enter the rate.');
  rate = Number(rate);
  const k = readKarigars_().filter(x => x.id === o.karigarId)[0] || { id: o.karigarId, name: o.karigarId };
  sheet_(SHEET.ORDERS).getRange(o.row, 10, 1, 2).setValues([[rate, 'LOT']]);
  forget_('orders');
  if (futureToo) addKarigarRate_(u, k, o.item, rate, todayStr_(), 'From lot ' + o.id + (note ? ' | ' + note : ''));
  log_(u, 'LOT_RATE', id, k.id + ' ' + o.item + ': ' + (o.rate === null ? 'none' : o.rate) + ' → ' + rate + (futureToo ? ', also for future lots' : ', this lot only') +
    (note ? ' | ' + String(note).slice(0, 200) : ''));
  return orderList(token, true);
}

/**
 * New STANDARD rate of an item (all karigars). apply = 'new' (only lots made from now on), 'all' (also every
 * running lot that is on the standard rate) or 'selected' (also the running lots in orderIds).
 * data = { item, rate, apply, orderIds: [], note }
 */
function saveStandardRate(token, data) {
  const u = authStaff_(token, 'masters');
  data = data || {};
  if (!itemMap_()[data.item]) throw new Error('Item not found.');
  if (data.rate === '' || data.rate === null || !(Number(data.rate) >= 0)) throw new Error('Enter the rate.');
  const rate = Number(data.rate), today = todayStr_();
  const old = standardRateOn_(data.item, today);
  sheet_(SHEET.RATES).appendRow(['*', data.item, rate, "'" + today, u.id + ' ' + u.name, nowStr_(), String(data.note || '').slice(0, 200)]);
  forget_('rates');
  const running = ordersWithProgress_().filter(o => o.open && o.item === data.item);
  let targets = [];
  if (data.apply === 'all') targets = running.filter(o => o.rateSource === 'STANDARD' || o.rateSource === '');
  else if (data.apply === 'selected') targets = running.filter(o => (data.orderIds || []).indexOf(o.id) >= 0);
  targets.forEach(o => sheet_(SHEET.ORDERS).getRange(o.row, 10, 1, 2).setValues([[rate, 'STANDARD']]));
  forget_('orders');
  log_(u, 'STANDARD_RATE', data.item, (old === null ? 'none' : old) + ' → ' + rate + ' | ' +
    (data.apply === 'all' ? 'all running lots on the standard rate' : data.apply === 'selected' ? 'selected lots' : 'new lots only') +
    (targets.length ? ': ' + targets.map(o => o.id).join(', ') : '') + (data.note ? ' | ' + data.note : ''));
  return itemList(token);
}

function addKarigarRate_(u, k, item, rate, from, note) {
  sheet_(SHEET.RATES).appendRow([k.id, item, rate, "'" + from, u.id + ' ' + u.name, nowStr_(), String(note || '').slice(0, 200)]);
  forget_('rates');
  log_(u, 'KARIGAR_RATE', k.id, item + ': ' + (rate === 'STD' ? 'back to the standard rate' : rate) + ' for future lots from ' + from);
}

/** status OPEN or CLOSED (closing stops the rest being "in production"). */
function setOrderStatus(token, id, status) {
  const u = authStaff_(token, 'orders');
  status = status === 'OPEN' ? 'OPEN' : 'CLOSED';
  const o = readOrders_().filter(x => x.id === id)[0];
  if (!o) throw new Error('Work order not found.');
  sheet_(SHEET.ORDERS).getRange(o.row, 6).setValue(status);
  forget_('orders');
  log_(u, 'ORDER_' + status, id, o.status + ' → ' + status);
  pushInProduction_();
  return orderList(token);
}

/* ------------------------------------------------------------------ */
/* Pay periods, payroll, payslips                                      */
/* ------------------------------------------------------------------ */

/**
 * Pay for one karigar and period. An approved period comes from its saved figures (nothing changes it
 * afterwards); an open one is worked out now.
 */
function payFor_(k, period) {
  const saved = readPay_().filter(p => p.period === period && p.karigarId === k.id)[0];
  if (saved) return Object.assign({}, saved.details, { status: saved.status, approvedBy: saved.approvedBy, approvedAt: saved.approvedAt,
    paidDate: saved.paidDate, paidBy: saved.paidBy });
  const r = periodRange_(period);
  const lines = groupByRate_(readLines_().filter(l => l.karigarId === k.id && l.finalDate >= r.from && l.finalDate <= r.to));
  const missing = lines.filter(l => l.rate === null).length;
  const earned = round2_(lines.reduce((n, l) => n + (l.amount || 0), 0));
  let room = earned;
  const advs = [];
  readAdvances_().filter(a => a.karigarId === k.id && a.startPeriod <= period).forEach(a => {
    const st = advanceState_(a, period);
    if (st.balanceBefore <= 0 && st.thisPeriod <= 0) return;
    const take = round2_(Math.min(st.thisPeriod, Math.max(0, room)));
    room -= take;
    advs.push({ id: a.id, amount: a.amount, perPeriod: a.perPeriod, note: a.note, balanceBefore: st.balanceBefore, wanted: st.thisPeriod,
      deducted: take, balanceAfter: round2_(st.balanceBefore - take), changed: st.changed, status: a.status });
  });
  const advance = round2_(advs.reduce((n, a) => n + a.deducted, 0));
  return { period: period, label: periodInfo_(period).label, karigarId: k.id, name: k.name, lines: lines, earned: earned,
    good: lines.reduce((n, l) => n + l.good, 0), rejected: lines.reduce((n, l) => n + l.rejected, 0),
    advances: advs, advance: advance, net: round2_(earned - advance), missingRates: missing, status: 'OPEN',
    short: advs.some(a => a.deducted < a.wanted) };
}

function payroll(token, period) {
  const u = authStaff_(token, 'approve|reports');
  period = validPeriod_(period || prevPeriod_(periodOf_(todayStr_())));
  const info = periodInfo_(period);
  const ids = {};
  readLines_().forEach(l => { if (periodOf_(l.finalDate) === period) ids[l.karigarId] = true; });
  readPay_().forEach(p => { if (p.period === period) ids[p.karigarId] = true; });
  const list = readKarigars_().filter(k => k.active || ids[k.id]).map(k => payFor_(k, period))
    .filter(p => p.earned || p.advance || p.status !== 'OPEN' || p.advances.length);
  const tot = f => round2_(list.reduce((n, p) => n + p[f], 0));
  return { period: info, periods: recentPeriods_(), list: list, earned: tot('earned'), advance: tot('advance'), net: tot('net'),
    canApprove: can_(u, 'approve') && info.ended, canAdvance: can_(u, 'approve') || can_(u, 'advances'), ended: info.ended, isSuper: u.role === 'SUPER', currency: getSettings_().currency };
}

/** Approves one karigar's pay for a finished period: the figures are saved and no longer change. */
function approvePay(token, period, karigarId) {
  const u = authStaff_(token, 'approve');
  period = validPeriod_(period);
  if (!periodInfo_(period).ended) throw new Error('This pay period has not ended yet.');
  const k = readKarigars_().filter(x => x.id === karigarId)[0];
  if (!k) throw new Error('Karigar not found.');
  withLock_(() => {
    if (readPay_().some(p => p.period === period && p.karigarId === k.id)) throw new Error('Already approved.');
    // Goods still being counted go into the period in which their count is finished.
    const p = payFor_(k, period);
    if (p.missingRates) throw new Error(k.name + ' has items without a rate. Set the rates first.');
    sheet_(SHEET.PAY).appendRow(["'" + period, k.id, k.name, p.earned, p.advance, p.net, 'APPROVED', u.id + ' ' + u.name, nowStr_(), '', '',
      JSON.stringify(p)]);
    forget_('pay');
    log_(u, 'APPROVE_PAY', period + ' ' + k.id, 'Earned ' + p.earned + ', advance ' + p.advance + ', net ' + p.net);
  });
  return payroll(token, period);
}

/**
 * At payroll: the advance cut of one karigar for the period (raise, lower or 0). cuts = [{ id, amount }]
 * (amount '' = back to the normal cut). Only before the pay is approved.
 */
function setPayAdvance(token, period, karigarId, cuts, note) {
  const u = authStaff_(token, 'approve|advances');
  period = validPeriod_(period);
  if (readPay_().some(p => p.period === period && p.karigarId === karigarId)) throw new Error('Already approved. Undo the approval first.');
  (cuts || []).forEach(c => {
    const a = readAdvances_().filter(x => x.id === c.id && x.karigarId === karigarId)[0];
    if (!a) throw new Error('Advance not found.');
    setAdvancePeriod(token, a.id, period, c.amount, note || 'Changed at payroll');
    forget_('advperiods');
  });
  log_(u, 'PAYROLL_ADVANCE', period + ' ' + karigarId, (cuts || []).map(c => c.id + ' → ' + (c.amount === '' ? 'normal' : c.amount)).join(', '));
  return payroll(token, period);
}

function unapprovePay(token, period, karigarId) {
  const u = authStaff_(token, 'super');
  if (u.role !== 'SUPER') throw new Error('Only a super admin can undo an approval.');
  const p = readPay_().filter(x => x.period === period && x.karigarId === karigarId)[0];
  if (!p) throw new Error('Not approved.');
  if (p.status === 'PAID') throw new Error('Already paid: it cannot be undone.');
  sheet_(SHEET.PAY).deleteRow(p.row);
  forget_('pay');
  log_(u, 'UNDO_APPROVAL', period + ' ' + karigarId, 'Was net ' + p.net);
  return payroll(token, period);
}

function markPaid(token, period, karigarId, date) {
  const u = authStaff_(token, 'approve');
  const p = readPay_().filter(x => x.period === period && x.karigarId === karigarId)[0];
  if (!p) throw new Error('Approve the pay first.');
  if (p.status === 'PAID') throw new Error('Already marked as paid.');
  const d = toDateStr_(date) || todayStr_();
  sheet_(SHEET.PAY).getRange(p.row, 7, 1, 5).setValues([['PAID', p.approvedBy, p.approvedAt, "'" + d, u.id + ' ' + u.name]]);
  forget_('pay');
  log_(u, 'PAID', period + ' ' + karigarId, 'Net ' + p.net + ' paid on ' + d);
  return payroll(token, period);
}

function payslip(token, period, karigarId) {
  authStaff_(token, 'approve|reports');
  const k = readKarigars_().filter(x => x.id === karigarId)[0];
  if (!k) throw new Error('Karigar not found.');
  return payslipData_(k, validPeriod_(period));
}

function payslipData_(k, period) {
  const s = getSettings_();
  return { company: s.company, currency: s.currency, karigar: { id: k.id, name: k.name, phone: k.phone },
    period: periodInfo_(period), pay: payFor_(k, period), periods: recentPeriods_() };
}

/* ------------------------------------------------------------------ */
/* Advances (same logic as the attendance app, per pay period)         */
/* ------------------------------------------------------------------ */

function advances(token) {
  const u = authStaff_(token, 'advances|approve');
  const per = periodOf_(todayStr_());
  const names = karigarNames_();
  const changes = readAdvPeriods_();
  const list = readAdvances_().map(a => {
    const st = advanceState_(a, per);
    return Object.assign({}, a, { name: names[a.karigarId] || a.name, thisPeriod: st.thisPeriod, balanceBefore: st.balanceBefore,
      balanceAfter: st.balanceAfter, deductedBefore: st.deductedBefore, changed: st.changed,
      changes: Object.keys(changes).filter(x => x.indexOf(a.id + '|') === 0).map(x => ({ period: x.split('|')[1],
        label: periodInfo_(x.split('|')[1]).label, amount: changes[x].amount, note: changes[x].note })) });
  }).reverse();
  return { period: periodInfo_(per), periods: nextPeriods_(per, 6), list: list, canEdit: can_(u, 'advances'),
    karigars: readKarigars_().filter(k => k.active).map(k => ({ id: k.id, name: k.name, owed: round2_(list.filter(a => a.karigarId === k.id &&
      a.status !== 'CLOSED').reduce((n, a) => n + a.balanceBefore, 0)) })) };
}

/** data = { karigarId, amount, perPeriod, startPeriod, dateGiven, note } */
function saveAdvance(token, data) {
  const u = authStaff_(token, 'advances');
  data = data || {};
  const k = readKarigars_().filter(x => x.id === String(data.karigarId || '').toUpperCase())[0];
  if (!k) throw new Error('Choose the karigar.');
  const amount = Number(data.amount), per = Number(data.perPeriod);
  if (!(amount > 0)) throw new Error('Enter the advance amount.');
  if (!(per > 0)) throw new Error('Enter the deduction per pay period.');
  const start = /^\d{4}-\d{2}$/.test(String(data.startPeriod)) ? data.startPeriod : periodOf_(todayStr_());
  if (readPay_().some(p => p.period === start && p.karigarId === k.id)) throw new Error('Pay for ' + periodInfo_(start).label + ' is already approved. Start later.');
  const id = 'A' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  sheet_(SHEET.ADVANCES).appendRow([id, k.id, k.name, "'" + (toDateStr_(data.dateGiven) || todayStr_()), amount, per, "'" + start, 'ACTIVE',
    String(data.note || '').slice(0, 200), u.id + ' ' + u.name, nowStr_(), '']);
  forget_('advances');
  log_(u, 'ADD_ADVANCE', k.id, id + ': amount ' + amount + ', per period ' + per + ', from ' + start);
  return advances(token);
}

function topUpAdvance(token, id, data) {
  const u = authStaff_(token, 'advances');
  const a = readAdvances_().filter(x => x.id === id)[0];
  if (!a) throw new Error('Advance not found.');
  const add = Number((data || {}).add);
  if (!(add > 0)) throw new Error('Enter the extra amount given.');
  const date = toDateStr_((data || {}).dateGiven) || todayStr_();
  const line = date + ' +' + add + ((data || {}).note ? ' (' + String(data.note).slice(0, 100) + ')' : '') + ' by ' + u.name;
  const sh = sheet_(SHEET.ADVANCES);
  sh.getRange(a.row, 5).setValue(a.amount + add);
  if (a.status === 'CLOSED') sh.getRange(a.row, 8).setValue('ACTIVE');
  sh.getRange(a.row, 12).setValue(a.topUps.concat([line]).join('\n'));
  forget_('advances');
  log_(u, 'TOPUP_ADVANCE', a.karigarId, a.id + ': ' + a.amount + ' + ' + add);
  return advances(token);
}

/**
 * The deduction of one advance in one pay period: amount = 'full' (the whole balance), a number (partial; 0 skips
 * the period) or '' to go back to the normal per-period instalment.
 */
function setAdvancePeriod(token, id, period, amount, note) {
  const u = authStaff_(token, 'advances|approve');
  const a = readAdvances_().filter(x => x.id === id)[0];
  if (!a) throw new Error('Advance not found.');
  period = validPeriod_(period);
  if (period < a.startPeriod) throw new Error('This advance starts in ' + periodInfo_(a.startPeriod).label + '.');
  if (readPay_().some(p => p.period === period && p.karigarId === a.karigarId)) throw new Error('Pay for this period is already approved.');
  let value = null;
  if (amount === 'full') value = advanceState_(a, period).balanceBefore;
  else if (amount !== '' && amount !== null && amount !== undefined) {
    value = Number(amount);
    if (!isFinite(value) || value < 0) throw new Error('Enter a valid amount (0 skips this period).');
  }
  const sh = sheet_(SHEET.ADV_PERIODS);
  const ex = readAdvPeriods_()[a.id + '|' + period];
  if (value === null) { if (ex) sh.deleteRow(ex.row); }
  else {
    const row = [a.id, a.karigarId, "'" + period, value, String(note || '').slice(0, 200), u.id + ' ' + u.name, nowStr_()];
    if (ex) sh.getRange(ex.row, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  }
  forget_('advperiods');
  log_(u, 'ADVANCE_PERIOD', a.karigarId, a.id + ' ' + period + ': ' + (value === null ? 'normal' : value));
  return advances(token);
}

function setAdvanceStatus(token, id, status) {
  const u = authStaff_(token, 'advances');
  status = String(status).toUpperCase();
  if (['ACTIVE', 'PAUSED', 'CLOSED'].indexOf(status) < 0) throw new Error('Invalid status.');
  const a = readAdvances_().filter(x => x.id === id)[0];
  if (!a) throw new Error('Advance not found.');
  sheet_(SHEET.ADVANCES).getRange(a.row, 8).setValue(status);
  forget_('advances');
  log_(u, 'ADVANCE_' + status, a.karigarId, a.id);
  return advances(token);
}

function advanceState_(a, period) {
  let remaining = a.amount, before = 0;
  for (let p = a.startPeriod; p < period && remaining > 0; p = nextYm_(p)) {
    const d = advanceDeduction_(a, p, remaining);
    remaining -= d;
    before += d;
  }
  const thisPeriod = period >= a.startPeriod && remaining > 0 ? advanceDeduction_(a, period, remaining) : 0;
  const change = readAdvPeriods_()[a.id + '|' + period];
  return { deductedBefore: round2_(before), thisPeriod: round2_(thisPeriod), changed: !!change,
    balanceBefore: round2_(Math.max(0, remaining)), balanceAfter: round2_(Math.max(0, remaining - thisPeriod)) };
}

/** Approved period → what was actually deducted; CLOSED → 0; a change for the period → that; else the instalment. */
function advanceDeduction_(a, period, remaining) {
  const saved = readPay_().filter(p => p.period === period && p.karigarId === a.karigarId)[0];
  if (saved) {
    const x = (saved.details.advances || []).filter(y => y.id === a.id)[0];
    return x ? Number(x.deducted) || 0 : 0;
  }
  if (a.status === 'CLOSED') return 0;
  const ch = readAdvPeriods_()[a.id + '|' + period];
  if (ch) return Math.min(ch.amount, remaining);
  return a.status === 'ACTIVE' ? Math.min(a.perPeriod, remaining) : 0;
}

/* ------------------------------------------------------------------ */
/* Masters: karigars, rates, items, materials, BOM, staff              */
/* ------------------------------------------------------------------ */

function karigarList(token) {
  const u = authStaff_(token, 'masters|reports|advances|approve');
  return { list: readKarigars_().map(k => ({ id: k.id, name: k.name, phone: k.phone, active: k.active, joined: k.joined, note: k.note })),
    canEdit: can_(u, 'masters') };
}

/** data = { id (edit) | new, name, phone, active, note, pin (new only) } */
function saveKarigar(token, data) {
  const u = authStaff_(token, 'masters');
  data = data || {};
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Enter the name.');
  const existing = data.id ? readKarigars_().filter(k => k.id === data.id)[0] : null;
  if (existing) {
    sheet_(SHEET.KARIGARS).getRange(existing.row, 2, 1, 2).setValues([[name, String(data.phone || '')]]);
    sheet_(SHEET.KARIGARS).getRange(existing.row, 5).setValue(data.active !== false);
    sheet_(SHEET.KARIGARS).getRange(existing.row, 7).setValue(String(data.note || ''));
    log_(u, 'EDIT_KARIGAR', existing.id, name + (data.active === false ? ' (inactive)' : ''));
  } else {
    const id = String(data.newId || '').trim().toUpperCase() || nextKarigarId_();
    if (!/^[A-Z0-9-]{2,12}$/.test(id)) throw new Error('The ID can have letters, digits and - (2 to 12).');
    if (findUser_(id)) throw new Error('The ID ' + id + ' is already used.');
    const pin = String(data.pin || '').trim();
    if (!/^\d{4,8}$/.test(pin)) throw new Error('The PIN must be 4 to 8 digits.');
    sheet_(SHEET.KARIGARS).appendRow([id, name, String(data.phone || ''), hashPin_(pin), true, "'" + todayStr_(), String(data.note || '')]);
    log_(u, 'ADD_KARIGAR', id, name);
  }
  forget_('karigars');
  return karigarList(token);
}

function nextKarigarId_() {
  let n = readKarigars_().length + 1;
  while (findUser_('K' + ('00' + n).slice(-3))) n++;
  return 'K' + ('00' + n).slice(-3);
}

function resetPin(token, id, pin) {
  const u = authStaff_(token, 'masters');
  const target = findUser_(String(id || '').toUpperCase());
  if (!target) throw new Error('Not found.');
  if (target.kind === 'S' && u.role !== 'SUPER') throw new Error('Only a super admin can reset a staff PIN.');
  if (!/^\d{4,8}$/.test(String(pin || ''))) throw new Error('The PIN must be 4 to 8 digits.');
  writePin_(target, String(pin));
  log_(u, 'RESET_PIN', target.id, '');
  return true;
}

/** Rates of one karigar: standard rate, the karigar's own rate for future lots (if any) and the history. */
function rateList(token, karigarId) {
  const u = authStaff_(token, 'masters|reports');
  const today = todayStr_();
  const items = activeItems_();
  const hist = readRates_().filter(r => r.karigarId === karigarId)
    .sort((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : a.from < b.from ? 1 : -1));
  return { karigarId: karigarId, items: items.map(i => ({ code: i.code, name: i.name, type: i.type, standard: standardRateOn_(i.code, today),
    own: karigarRateOn_(karigarId, i.code, today) })), history: hist, canEdit: can_(u, 'masters') };
}

/** The karigar's own rate for FUTURE lots of an item (rate 'STD' = back to the standard rate). data = { karigarId, item, rate, from, note } */
function saveRate(token, data) {
  const u = authStaff_(token, 'masters');
  data = data || {};
  const k = readKarigars_().filter(x => x.id === data.karigarId)[0];
  if (!k) throw new Error('Karigar not found.');
  if (!itemMap_()[data.item]) throw new Error('Choose the item.');
  const std = String(data.rate).toUpperCase() === 'STD';
  const rate = std ? 'STD' : Number(data.rate);
  if (!std && (!(rate >= 0) || data.rate === '' || data.rate === null)) throw new Error('Enter the rate.');
  const from = toDateStr_(data.from) || todayStr_();
  addKarigarRate_(u, k, data.item, rate, from, data.note);
  return rateList(token, k.id);
}

function itemList(token) {
  const u = authStaff_(token, 'masters|reports|orders|count');
  const bom = bomMap_(), today = todayStr_(), names = karigarNames_();
  const running = ordersWithProgress_().filter(o => o.open);
  return { list: readItems_().map(i => Object.assign({}, i, { bom: bom[i.code] || [], rate: standardRateOn_(i.code, today),
    rateHistory: readRates_().filter(r => r.karigarId === '*' && r.item === i.code).sort((a, b) => (a.from < b.from ? 1 : -1)),
    karigarRates: readKarigars_().map(k => ({ id: k.id, name: k.name, rate: karigarRateOn_(k.id, i.code, today) })).filter(x => x.rate !== null),
    running: running.filter(o => o.item === i.code).map(o => ({ id: o.id, karigar: names[o.karigarId] || o.karigarId, qty: o.qty, remaining: o.remaining,
      rate: o.rate, rateSource: o.rateSource })) })), materials: readMaterials_(), canEdit: can_(u, 'masters') };
}

/** data = { code, name, type: SKU|PART, active }. SKU codes must exist in the Inventory App's Master_SKU. */
function saveItem(token, data) {
  const u = authStaff_(token, 'masters');
  data = data || {};
  const code = String(data.code || '').trim();
  if (!code) throw new Error('Enter the item code.');
  const type = data.type === 'PART' ? 'PART' : 'SKU';
  if (type === 'SKU' && data.checkInventory !== false) {
    let skus = null;
    try { skus = inventorySkus(token); } catch (e) { skus = null; }
    if (skus && !skus.some(s => s.toUpperCase() === code.toUpperCase())) throw new Error(code + ' is not in the Inventory App. Choose it from the list, or make it a part.');
  }
  const ex = readItems_().filter(i => i.code.toUpperCase() === code.toUpperCase())[0];
  const hasRate = data.rate !== '' && data.rate !== null && data.rate !== undefined;
  if (!ex && !hasRate) throw new Error('Enter the standard rate (paid per piece to every karigar).');
  if (hasRate && !(Number(data.rate) >= 0)) throw new Error('Enter a valid standard rate.');
  if (!ex) {
    sheet_(SHEET.RATES).appendRow(['*', code, Number(data.rate), "'" + todayStr_(), u.id + ' ' + u.name, nowStr_(), 'New item']);
    forget_('rates');
  }
  const row = [ex ? ex.code : code, String(data.name || ''), type, data.active !== false];
  if (ex) sheet_(SHEET.ITEMS).getRange(ex.row, 1, 1, 4).setValues([row]); else sheet_(SHEET.ITEMS).appendRow(row);
  forget_('items');
  log_(u, ex ? 'EDIT_ITEM' : 'ADD_ITEM', code, type + (data.active === false ? ' inactive' : ''));
  return itemList(token);
}

function saveMaterial(token, data) {
  const u = authStaff_(token, 'masters');
  data = data || {};
  const code = String(data.code || '').trim().toUpperCase();
  if (!code || !String(data.name || '').trim()) throw new Error('Enter the code and name.');
  const ex = readMaterials_().filter(m => m.code === code)[0];
  const row = [code, String(data.name).trim(), String(data.unit || 'pcs').trim(), data.active !== false];
  if (ex) sheet_(SHEET.MATERIALS).getRange(ex.row, 1, 1, 4).setValues([row]); else sheet_(SHEET.MATERIALS).appendRow(row);
  forget_('materials');
  log_(u, ex ? 'EDIT_MATERIAL' : 'ADD_MATERIAL', code, row.join(' | '));
  return itemList(token);
}

/** Replaces the bill of materials of one item. lines = [{ material, qty }] (per piece). */
function saveBom(token, item, lines) {
  const u = authStaff_(token, 'masters');
  if (!itemMap_()[item]) throw new Error('Item not found.');
  const mats = materialMap_();
  const clean = (lines || []).filter(l => l.material && Number(l.qty) > 0);
  clean.forEach(l => { if (!mats[l.material]) throw new Error('Unknown material: ' + l.material); });
  const before = (bomMap_()[item] || []).map(x => x.material + ' ' + x.qty).join(', ');
  deleteRowsWhere_(SHEET.BOM, r => String(r[0]) === item);
  clean.forEach(l => sheet_(SHEET.BOM).appendRow([item, l.material, Number(l.qty)]));
  forget_('bom');
  log_(u, 'BOM', item, (before || 'none') + ' → ' + (clean.map(l => l.material + ' ' + l.qty).join(', ') || 'none'));
  return itemList(token);
}

function staffList(token) {
  const u = authStaff_(token, 'super');
  if (u.role !== 'SUPER') throw new Error('Only for super admins.');
  return { list: readStaff_().map(s => ({ id: s.id, name: s.name, phone: s.phone, role: s.role, perms: permsOf_(s), active: s.active })), perms: PERMS };
}

/** data = { id (edit) | newId, name, phone, role, perms: [], active, pin (new) } */
function saveStaff(token, data) {
  const u = authStaff_(token, 'super');
  if (u.role !== 'SUPER') throw new Error('Only for super admins.');
  data = data || {};
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Enter the name.');
  const role = data.role === 'SUPER' ? 'SUPER' : 'ADMIN';
  const perms = (data.perms || []).filter(p => PERMS[p]).join(',');
  const ex = data.id ? readStaff_().filter(s => s.id === data.id)[0] : null;
  if (ex) {
    if (ex.id === u.id && (role !== 'SUPER' || data.active === false)) throw new Error('You cannot remove your own super admin access.');
    sheet_(SHEET.STAFF).getRange(ex.row, 2, 1, 2).setValues([[name, String(data.phone || '')]]);
    sheet_(SHEET.STAFF).getRange(ex.row, 5, 1, 3).setValues([[role, perms, data.active !== false]]);
    log_(u, 'EDIT_STAFF', ex.id, role + ' ' + perms + (data.active === false ? ' inactive' : ''));
  } else {
    const id = String(data.newId || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{2,12}$/.test(id)) throw new Error('Enter an ID (letters, digits and -, 2 to 12).');
    if (findUser_(id)) throw new Error('The ID ' + id + ' is already used.');
    if (!/^\d{4,8}$/.test(String(data.pin || ''))) throw new Error('The PIN must be 4 to 8 digits.');
    sheet_(SHEET.STAFF).appendRow([id, name, String(data.phone || ''), hashPin_(String(data.pin)), role, perms, true]);
    log_(u, 'ADD_STAFF', id, name + ' ' + role + ' ' + perms);
  }
  forget_('staff');
  return staffList(token);
}

function changeLog(token, ref) {
  const u = authStaff_(token, 'super');
  if (u.role !== 'SUPER') throw new Error('Only for super admins.');
  return readLog_().filter(l => !ref || l.ref.indexOf(ref) >= 0 || l.details.indexOf(ref) >= 0).slice(-500).reverse();
}

/* ------------------------------------------------------------------ */
/* Readers                                                             */
/* ------------------------------------------------------------------ */

function rows_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS[name].length).getValues();
}

function bool_(v) { return !(v === false || /^(false|no|0)$/i.test(String(v).trim())); }

function readKarigars_() {
  return memo_('karigars', () => rows_(SHEET.KARIGARS).map((r, i) => ({ row: i + 2, kind: 'K', id: String(r[0]).trim().toUpperCase(),
    name: String(r[1]).trim(), phone: String(r[2]), pin: String(r[3]), active: bool_(r[4]), joined: toDateStr_(r[5]), note: String(r[6] || '') }))
    .filter(k => k.id));
}

function readStaff_() {
  return memo_('staff', () => rows_(SHEET.STAFF).map((r, i) => ({ row: i + 2, kind: 'S', id: String(r[0]).trim().toUpperCase(),
    name: String(r[1]).trim(), phone: String(r[2]), pin: String(r[3]), role: String(r[4]).trim().toUpperCase() === 'SUPER' ? 'SUPER' : 'ADMIN',
    permissions: String(r[5] || ''), active: bool_(r[6]) })).filter(s => s.id));
}

function readItems_() {
  return memo_('items', () => rows_(SHEET.ITEMS).map((r, i) => ({ row: i + 2, code: String(r[0]).trim(), name: String(r[1] || ''),
    type: String(r[2]).trim().toUpperCase() === 'PART' ? 'PART' : 'SKU', active: bool_(r[3]) })).filter(x => x.code));
}

function itemMap_() {
  return memo_('itemmap', () => { const m = {}; readItems_().forEach(i => { m[i.code] = i; }); return m; });
}

function activeItems_() {
  return readItems_().filter(i => i.active).map(i => ({ code: i.code, name: i.name, type: i.type }));
}

function readMaterials_() {
  return memo_('materials', () => rows_(SHEET.MATERIALS).map((r, i) => ({ row: i + 2, code: String(r[0]).trim().toUpperCase(),
    name: String(r[1] || ''), unit: String(r[2] || ''), active: bool_(r[3]) })).filter(x => x.code));
}

function materialMap_() {
  const m = {};
  readMaterials_().forEach(x => { m[x.code] = x; });
  return m;
}

function bomMap_() {
  return memo_('bom', () => {
    const m = {};
    rows_(SHEET.BOM).forEach(r => {
      const item = String(r[0]).trim(), mat = String(r[1]).trim().toUpperCase(), q = Number(r[2]) || 0;
      if (item && mat && q > 0) (m[item] = m[item] || []).push({ material: mat, qty: q });
    });
    return m;
  });
}

function readRates_() {
  return memo_('rates', () => rows_(SHEET.RATES).map((r, i) => ({ row: i + 2, karigarId: String(r[0]).trim().toUpperCase(),
    item: String(r[1]).trim(), rate: String(r[2]).trim().toUpperCase() === 'STD' ? null : Number(r[2]), from: toDateStr_(r[3]),
    setBy: String(r[4] || ''), setAt: String(r[5] || ''), note: String(r[6] || '') }))
    .filter(x => x.karigarId && x.item && x.from && String(x.rate) !== '' && (x.rate === null || isFinite(x.rate))));
}

/** Latest rate row for (who, item) starting on or before the date ('*' = standard). Later rows win on the same date. */
function latestRate_(who, item, date) {
  let best = null;
  readRates_().forEach(r => {
    if (r.karigarId === who && r.item === item && r.from <= date && (!best || r.from >= best.from)) best = r;
  });
  return best;
}
function standardRateOn_(item, date) { const r = latestRate_('*', item, date); return r ? r.rate : null; }
/** The karigar's own rate for future lots (null = none, or set back to the standard rate). */
function karigarRateOn_(karigarId, item, date) { const r = latestRate_(karigarId, item, date); return r ? r.rate : null; }
/** Rate for goods without a lot: the karigar's own rate, else the standard rate (null = no rate). */
function rateOn_(karigarId, item, date) {
  const k = karigarRateOn_(karigarId, item, date);
  return k !== null ? k : standardRateOn_(item, date);
}

/** Rate of a counted line: its lot's rate, else (no lot, or a lot without a rate) the karigar / standard rate. */
function lineRate_(l) {
  const o = l.workOrder ? orderMap_()[l.workOrder] : null;
  if (o && o.rate !== null) return o.rate;
  return rateOn_(l.karigarId, l.item, l.finalDate);
}

/** Batch lines grouped per item and rate: [{ item, type, good, rejected, rate, amount, lots }]. */
function groupByRate_(lines) {
  const group = {};
  lines.forEach(l => {
    const rate = lineRate_(l);
    const key = l.item + '|' + rate;
    const g = group[key] = group[key] || { item: l.item, type: l.type, good: 0, rejected: 0, rate: rate, amount: 0, lots: [] };
    g.good += l.good;
    g.rejected += l.rejected;
    g.amount = rate === null ? null : round2_(g.good * rate);
    if (l.workOrder && g.lots.indexOf(l.workOrder) < 0) g.lots.push(l.workOrder);
  });
  return Object.keys(group).sort().map(x => group[x]);
}

function orderMap_() {
  return memo_('ordermap', () => { const m = {}; readOrders_().forEach(o => { m[o.id] = o; }); return m; });
}

function readOrders_() {
  return memo_('orders', () => rows_(SHEET.ORDERS).map((r, i) => ({ row: i + 2, id: String(r[0]), date: toDateStr_(r[1]),
    karigarId: String(r[2]).trim().toUpperCase(), item: String(r[3]).trim(), qty: Number(r[4]) || 0,
    status: String(r[5]).trim().toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPEN', note: String(r[6] || ''), by: String(r[7] || ''),
    rate: r[9] === '' || r[9] === null || !isFinite(Number(r[9])) ? null : Number(r[9]), rateSource: String(r[10] || '').trim().toUpperCase() })).filter(o => o.id));
}

function readMoves_() {
  return memo_('moves', () => rows_(SHEET.MOVES).map((r, i) => ({ row: i + 2, id: String(r[0]), date: toDateStr_(r[1]),
    type: String(r[2]).trim().toUpperCase() === 'RETURN' ? 'RETURN' : 'ISSUE', karigarId: String(r[3]).trim().toUpperCase(),
    materialCode: String(r[4]).trim().toUpperCase(), qty: Number(r[5]) || 0, note: String(r[6] || ''), enteredBy: String(r[7] || ''),
    enteredAt: String(r[8] || ''), status: String(r[9] || 'PENDING').trim().toUpperCase(), confirmedBy: String(r[10] || ''),
    confirmedAt: String(r[11] || '') })).filter(m => m.id));
}

function parseJson_(v, dflt) {
  try { const x = JSON.parse(String(v || '')); return x === null || x === undefined ? dflt : x; } catch (e) { return dflt; }
}

function readBatches_() {
  return memo_('batches', () => {
    const lines = {};
    readLines_().forEach(l => { (lines[l.batchId] = lines[l.batchId] || []).push(l); });
    return rows_(SHEET.BATCHES).map((r, i) => {
      const id = String(r[0]);
      // Batch lines split across work orders are joined again per item for display.
      const per = {};
      (lines[id] || []).forEach(l => {
        const x = per[l.item] = per[l.item] || { item: l.item, type: l.type, good: 0, rejected: 0 };
        x.good += l.good; x.rejected += l.rejected;
      });
      return { row: i + 2, id: id, karigarId: String(r[1]).trim().toUpperCase(), status: String(r[2]).trim().toUpperCase(),
        createdAt: String(r[3] || ''), claim: parseJson_(r[4], []), count1By: String(r[5] || ''), count1At: String(r[6] || ''),
        count1: parseJson_(r[7], []), photo: String(r[8] || ''), count2By: String(r[9] || ''), count2At: String(r[10] || ''),
        count2: parseJson_(r[11], []), finalDate: toDateStr_(r[12]), inventory: String(r[13] || ''), inventoryNote: String(r[14] || ''),
        earlier: parseJson_(r[15], []), note: String(r[16] || ''), lines: Object.keys(per).sort().map(k => per[k]), rawLines: lines[id] || [] };
    }).filter(b => b.id);
  });
}

function readLines_() {
  return memo_('lines', () => rows_(SHEET.LINES).map(r => ({ batchId: String(r[0]), karigarId: String(r[1]).trim().toUpperCase(),
    finalDate: toDateStr_(r[3]), item: String(r[4]).trim(), type: String(r[5] || ''), good: Number(r[6]) || 0, rejected: Number(r[7]) || 0,
    workOrder: String(r[8] || '') })).filter(l => l.batchId && l.finalDate));
}

function readAdvances_() {
  return memo_('advances', () => rows_(SHEET.ADVANCES).map((r, i) => ({ row: i + 2, id: String(r[0]), karigarId: String(r[1]).trim().toUpperCase(),
    name: String(r[2]), dateGiven: toDateStr_(r[3]), amount: Number(r[4]) || 0, perPeriod: Number(r[5]) || 0, startPeriod: toYm_(r[6]),
    status: String(r[7] || 'ACTIVE').trim().toUpperCase(), note: String(r[8] || ''), by: String(r[9] || ''),
    topUps: String(r[11] || '').split('\n').map(x => x.trim()).filter(String) })).filter(a => a.id && a.karigarId && a.startPeriod));
}

function readAdvPeriods_() {
  return memo_('advperiods', () => {
    const m = {};
    rows_(SHEET.ADV_PERIODS).forEach((r, i) => {
      const p = toYm_(r[2]);
      if (String(r[0]) && p && r[3] !== '') m[String(r[0]) + '|' + p] = { amount: Math.max(0, Number(r[3]) || 0), note: String(r[4] || ''), row: i + 2 };
    });
    return m;
  });
}

function readPay_() {
  return memo_('pay', () => rows_(SHEET.PAY).map((r, i) => ({ row: i + 2, period: toYm_(r[0]), karigarId: String(r[1]).trim().toUpperCase(),
    name: String(r[2]), earned: Number(r[3]) || 0, advance: Number(r[4]) || 0, net: Number(r[5]) || 0, status: String(r[6]).trim().toUpperCase(),
    approvedBy: String(r[7] || ''), approvedAt: String(r[8] || ''), paidDate: toDateStr_(r[9]), paidBy: String(r[10] || ''),
    details: parseJson_(r[11], {}) })).filter(p => p.period && p.karigarId));
}

function readLog_() {
  return rows_(SHEET.LOG).map(r => ({ at: String(r[0]), by: String(r[1]), action: String(r[2]), ref: String(r[3]), details: String(r[4]) }));
}

function karigarNames_() {
  const m = {};
  readKarigars_().forEach(k => { m[k.id] = k.name; });
  return m;
}

function staffName_(id) {
  const s = readStaff_().filter(x => x.id === id)[0];
  return s ? s.name : id;
}

/* ------------------------------------------------------------------ */
/* Change log, settings, helpers                                       */
/* ------------------------------------------------------------------ */

function log_(u, action, ref, details) {
  sheet_(SHEET.LOG).appendRow([nowStr_(), u ? (u.id + ' ' + u.name) : 'system', action, String(ref || ''), String(details || '')]);
}

function getSettings_() {
  return memo_('settings', () => {
    const m = {};
    rows_(SHEET.SETTINGS).forEach(r => { m[String(r[0]).trim()] = r[1]; });
    return {
      company: String(m['Company'] || 'Travalate'), currency: String(m['Currency'] || '₹'),
      payDay: Math.min(28, Math.max(1, Number(m['Pay Period Start Day']) || 5)),
      inventoryUrl: String(m['Inventory App URL'] || '').trim(), inventorySecret: String(m['Inventory Secret'] || '').trim(),
      sessionDays: Number(m['Stay Logged In (days)']) || 0, photoFolder: String(m['Photo Folder ID'] || '').trim(),
      inventoryLastSync: String(m['Inventory Last Sync'] || ''),
    };
  });
}

function setSetting_(name, value) {
  const sh = sheetOrCreate_(SHEET.SETTINGS);
  const vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === name) { sh.getRange(i + 2, 2).setValue(value); forget_('settings'); return; }
  }
  sh.appendRow([name, value, '']);
  forget_('settings');
}

const MEMO = {};
function memo_(key, fn) {
  if (!Object.prototype.hasOwnProperty.call(MEMO, key)) MEMO[key] = fn();
  return MEMO[key];
}
/** Forgets cached tabs after a write (and everything worked out from them). */
function forget_() {
  for (let i = 0; i < arguments.length; i++) {
    delete MEMO[arguments[i]];
    if (arguments[i] === 'lines') delete MEMO.batches; // batches carry their lines
  }
  ['itemmap', 'orderprog', 'balances', 'ordermap'].forEach(k => { delete MEMO[k]; });
}

function sheet_(name) {
  return sheetOrCreate_(name);
}

function sheetOrCreate_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold').setBackground('#e8eefc');
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureHeaders_(sh, headers) {
  const have = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  headers.forEach((h, i) => { if (have[i] !== h && have.indexOf(h) < 0) sh.getRange(1, i + 1).setValue(h).setFontWeight('bold').setBackground('#e8eefc'); });
}

function deleteRowsWhere_(name, fn) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (let i = vals.length - 1; i >= 0; i--) if (fn(vals[i])) sh.deleteRow(i + 2);
}

/** Next ID like P-0012 (from the last row of the tab). */
function nextId_(name, prefix) {
  const sh = sheet_(name);
  let n = 0;
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(r => {
      const m = new RegExp('^' + prefix + '(\\d+)$').exec(String(r[0]));
      if (m) n = Math.max(n, Number(m[1]));
    });
  }
  return prefix + ('000' + (n + 1)).slice(-4);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('The app is busy. Try again in a moment.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function tz_() {
  return memo_('tz', () => SpreadsheetApp.getActive().getSpreadsheetTimeZone() || Session.getScriptTimeZone());
}
function todayStr_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function nowStr_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'); }

function toDateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  const s = String(v || '').trim().replace(/^'/, '');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s);
  return m ? m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]) : '';
}

function toYm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM');
  const m = /^(\d{4})-(\d{1,2})/.exec(String(v || '').trim().replace(/^'/, ''));
  return m ? m[1] + '-' + pad2_(m[2]) : '';
}

function nextYm_(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return m === 12 ? (y + 1) + '-01' : y + '-' + pad2_(m + 1);
}

function prevYm_(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return m === 1 ? (y - 1) + '-12' : y + '-' + pad2_(m - 1);
}
function prevPeriod_(p) { return prevYm_(p); }

/*
 * Pay periods are named by the month they start in: '2026-11' = 5 Nov 2026 to 4 Dec 2026 (with the start day 5).
 */
function periodOf_(dateStr) {
  const day = Number(dateStr.slice(8, 10));
  const ym = dateStr.slice(0, 7);
  return day >= getSettings_().payDay ? ym : prevYm_(ym);
}

function periodRange_(p) {
  const d = getSettings_().payDay;
  const from = p + '-' + pad2_(d);
  const n = nextYm_(p);
  const to = d === 1 ? lastDay_(p) : n + '-' + pad2_(d - 1);
  return { from: from, to: to };
}

function lastDay_(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return ym + '-' + pad2_(new Date(y, m, 0).getDate());
}

const MON_ = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayLabel_(ds) { return Number(ds.slice(8, 10)) + ' ' + MON_[Number(ds.slice(5, 7)) - 1]; }

function periodInfo_(p) {
  const r = periodRange_(p);
  return { key: p, from: r.from, to: r.to, label: dayLabel_(r.from) + ' – ' + dayLabel_(r.to) + ' ' + r.to.slice(0, 4),
    ended: todayStr_() > r.to, current: periodOf_(todayStr_()) === p };
}

function validPeriod_(p) {
  return /^\d{4}-\d{2}$/.test(String(p || '')) ? String(p) : periodOf_(todayStr_());
}

function recentPeriods_() {
  const out = [];
  let p = periodOf_(todayStr_());
  for (let i = 0; i < 13; i++) { out.push(periodInfo_(p)); p = prevYm_(p); }
  return out;
}

function nextPeriods_(p, n) {
  const out = [];
  for (let i = 0; i < n; i++) { out.push(periodInfo_(p)); p = nextYm_(p); }
  return out;
}

function pad2_(n) { return ('0' + n).slice(-2); }
function round2_(n) { return Math.round(n * 100) / 100; }
function round3_(n) { return Math.round(n * 1000) / 1000; }
