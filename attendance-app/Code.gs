/**
 * Employee Attendance & Salary App — Google Apps Script
 *
 * 1. Create a Google Sheet → Extensions → Apps Script.
 * 2. Paste this file as Code.gs and Index.html as an HTML file named "Index".
 * 3. Run setup() once (authorise when asked), fill the Settings + Employees tabs.
 * 4. Deploy → New deployment → Web app
 *      Execute as: Me      Who has access: Anyone
 *    Share the web app URL with employees.
 */

const SHEET = {
  SETTINGS: 'Settings',
  EMPLOYEES: 'Employees',
  ATTENDANCE: 'Attendance',
  HOLIDAYS: 'Holidays',
  PERMISSIONS: 'Admin Permissions',
  AUDIT: 'Audit Log',
  REQUESTS: 'Requests',
  ADVANCES: 'Advances',
  ADV_MONTHS: 'Advance Month Changes',
  LOCKS: 'Payroll Locks',
  SNAPSHOTS: 'Payroll Snapshots',
  ARREARS: 'Arrears',
  EMPLOYMENT: 'Employment History',
  INCREMENTS: 'Salary Increments',
  FACES: 'Faces',
  CELEBRATIONS: 'Celebrations',
};
// Festival animations on the app (Admin → Holidays → Celebrations).
const CELEB_HEADERS = ['From', 'To', 'Animation', 'Seconds', 'Message', 'By', 'At', 'Music'];
const ANIMATIONS = ['fireworks', 'confetti', 'diyas', 'petals', 'snow', 'balloons', 'sparkles', 'dussehra'];
// Tunes the page plays itself (no music files): 'none' = silent.
const MUSIC = ['none', 'diwali', 'aarti', 'garba', 'dhol', 'holi', 'chime', 'fanfare', 'birthday', 'jinglebells', 'auldlangsyne'];
// Registered faces: a 128-number "face fingerprint" per employee (no photo is needed to recognise them).
const FACE_HEADERS = ['Emp ID', 'Name', 'Descriptor (do not edit)', 'Photo', 'Registered By', 'Registered At'];
const EMPLOYMENT_HEADERS = ['Emp ID', 'From', 'To', 'Note', 'By', 'At'];
const INCREMENT_HEADERS = ['Emp ID', 'Effective Month', 'Increment', 'New Salary', 'Note', 'By', 'At'];

const ROLES = ['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN', 'GUARD'];

// Raised with every change to this file. The page compares it with the version it needs and tells the
// super admin to deploy the new Code.gs when Apps Script still runs an older copy.
const SERVER_VERSION = 20261051;

/** What a super admin can allow each admin to do. */
const PERMISSIONS = [
  { key: 'viewToday', label: 'View Today', help: "Today's live attendance, selfies and flags" },
  { key: 'viewPayroll', label: 'View Payroll', help: 'Monthly salary, OT, PF, payslips' },
  { key: 'viewSummary', label: 'View Monthly Summary', help: 'Totals for all employees: payment, presents/absents, OT, PF' },
  { key: 'editAttendance', label: 'Edit Attendance', help: 'Add / change / delete entries, including back-dated ones' },
  { key: 'approveRequests', label: 'Approve Requests', help: 'Approve leave, corrections and OT' },
  { key: 'editPf', label: 'Edit PF', help: 'Turn PF on/off and change PF amounts' },
  { key: 'manageEmployees', label: 'Manage Employees', help: 'Add employees, change salary/details, reset PINs' },
  { key: 'manageAdvances', label: 'Manage Advances', help: 'Give advances and set monthly deductions' },
  { key: 'viewSplit', label: 'View Bank / Cash Split', help: 'See In Bank and In Cash amounts (others only see Total Salary)' },
  { key: 'exportPayroll', label: 'Export Payroll', help: 'Download the monthly payroll as an Excel file' },
  { key: 'lockPayroll', label: 'Lock Payroll', help: 'Lock a finished month so nothing can change it' },
  { key: 'markOthers', label: 'Mark Attendance for Others', help: 'Check employees in/out from this phone (no smartphone / forgot phone). Location is checked and a photo of the employee is required at check-in' },
  { key: 'manageHolidays', label: 'Manage Holidays', help: 'Add or remove national / festival holidays (no absent is marked on them)' },
  { key: 'seeMenLeaders', label: "Men's Leaders Card", help: "Home screen shows the men's top hours (both unticked = only the card of their own gender)" },
  { key: 'seeWomenLeaders', label: "Women's Leaders Card", help: "Home screen shows the women's top hours (both unticked = only the card of their own gender)" },
  { key: 'editOwn', label: 'Edit Own Entries', help: 'Change their own attendance / PF / salary (normally off)' },
];
const PERM_HEADERS = ['Emp ID', 'Name'].concat(PERMISSIONS.map(p => p.label))
  .concat(['Allowed Employees', 'Updated By', 'Updated At']);
const AUDIT_HEADERS = ['Time', 'By', 'Action', 'Emp ID', 'Date', 'Details'];

const EMP_HEADERS = ['Emp ID', 'Name', 'PIN', 'Monthly Salary', 'Role', 'Active', 'Join Date', 'Phone',
  'PF Active', 'PF Bank Salary', 'PF Employee', 'PF Employer', 'Mark From Anywhere', 'Shift Start', 'Shift End', 'Hourly OT', 'Morning OT', 'Gender', 'In Leaderboard', 'Late Cut', 'Birth Date'];
const HOLIDAY_HEADERS = ['Date', 'Holiday Name', 'Type', 'Close At'];
// Type 'Short Day' + Close At (e.g. 16:30): a working day on which the office closes early (see shortenDay_).
const SHORT_DAY = 'Short Day';
const HOLIDAY_TYPES = ['National', 'Festival', 'Company'];

const ATT_HEADERS = ['Date', 'Emp ID', 'Name', 'Check In', 'Check Out', 'Worked Hrs', 'Status', 'Late',
  'OT Hrs', 'In Lat', 'In Lng', 'In Distance (m)', 'In Accuracy (m)', 'Out Lat', 'Out Lng',
  'Out Distance (m)', 'Selfie', 'Override Status', 'Admin Note', 'Out Accuracy (m)', 'OT Approved', 'Flags', 'Review', 'Breaks', 'Out Photo'];

const COL = {
  DATE: 0, EMP: 1, NAME: 2, IN: 3, OUT: 4, WORKED: 5, STATUS: 6, LATE: 7, OT: 8,
  IN_LAT: 9, IN_LNG: 10, IN_DIST: 11, IN_ACC: 12, OUT_LAT: 13, OUT_LNG: 14, OUT_DIST: 15,
  SELFIE: 16, OVERRIDE: 17, NOTE: 18, OUT_ACC: 19, OT_APPROVED: 20, FLAGS: 21, REVIEW: 22,
  OUT_PHOTO: 24, // proof photo of a face check-out
  BREAKS: 23, // time away between a check-out and checking in again, e.g. '13:00-15:30;17:00-17:20'
};

const REQ_HEADERS = ['ID', 'Created', 'Emp ID', 'Name', 'Type', 'From', 'To', 'In', 'Out', 'Leave Type',
  'Reason', 'Status', 'Decided By', 'Decided At', 'Remark', 'Amount', 'Monthly'];
const ADV_HEADERS = ['ID', 'Emp ID', 'Name', 'Date Given', 'Amount', 'Monthly Deduction', 'Start Month',
  'Status', 'Note', 'Created By', 'Created At', 'Top-ups'];
const ADV_MONTH_HEADERS = ['Advance ID', 'Emp ID', 'Month', 'Deduct', 'Note', 'By', 'At'];
const LOCK_HEADERS = ['Month', 'Locked By', 'Locked At'];
const SNAP_HEADERS = ['Month', 'Emp ID', 'Name', 'Data (do not edit)'];
// Arrears: money still owed to an employee from earlier months, paid with the salary of "Pay Month".
const ARREAR_HEADERS = ['ID', 'Emp ID', 'Name', 'Date Added', 'Amount', 'Reason', 'Pay Month', 'Note', 'Auto', 'By', 'At'];

const OVERRIDE_VALUES = ['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE'];
/** Flags that count as "suspicious" on the admin Today screen (PROXY = marked by an admin or guard is not). */
const SUSPICIOUS_FLAGS = ['WEAK_GPS', 'WEAK_GPS_OUT', 'REPEAT_GPS', 'SHARED_GPS', 'NO_SELFIE'];
// OUTSIDE / OUTSIDE_OUT = marked away from the office by an employee allowed to ("Mark From Anywhere"); not suspicious.

const DEFAULT_SETTINGS = [
  ['Company Name', 'My Company', 'Shown at the top of the app and on payslips'],
  ['Office Latitude', '', 'Google Maps → right-click your office → click the coordinates to copy them'],
  ['Office Longitude', '', 'Paste the second number here'],
  ['Allowed Radius (m)', 30, 'Employee must be within this distance of the office'],
  ['Max GPS Accuracy (m)', 50, 'Readings less accurate than this are rejected (higher = more lenient)'],
  ['Flag GPS Accuracy Above (m)', 35, 'Check-ins less accurate than this are flagged for the admin'],
  ['Check Location On Check-Out', 'Yes', 'Yes / No'],
  ['Selfie Required', 'Yes', 'Yes / No (selfie is taken at check-in)'],
  ['Live Camera Only', 'No', 'Yes = selfie must come from the live camera (no gallery photos). Test on your phones first'],
  ['Shift Start', '09:30', '24-hour time, HH:mm'],
  ['Late Grace (min)', 10, 'Check-in after Shift Start + grace = Late'],
  ['Standard Hours', 9, 'Hours per day. Time worked beyond this is OT. Shift end = Shift Start + this'],
  ['Full Day Min Hours', 8, 'Worked hours needed for a full day'],
  ['Half Day Min Hours', 4, 'At least this (but below Full Day) = Half Day. Less = Absent'],
  ['No Check-Out Counts As', 'HALF_DAY', 'PRESENT / HALF_DAY / ABSENT — a day auto-checked-out at midnight, until an admin fixes it'],
  ['Allow Overnight Shift', 'No', 'Yes = check-out after midnight closes the previous day\'s entry'],
  ['Max Shift Hours', 16, 'With overnight shifts, an open entry older than this cannot be checked out'],
  ['Salary Days Basis', 30, 'Per day = Monthly Salary ÷ this. Per hour = per day ÷ Standard Hours. (0 = days in that month)'],
  ['OT Multiplier', 1.5, 'OT pay = net OT minutes × per-minute rate × this'],
  ['OT Block (min)', 0, 'Daily OT counted only in complete blocks of this many minutes (0 = every minute)'],
  ['Max OT Per Day (min)', 0, 'Cap on OT counted per day (0 = no cap)'],
  ['OT Needs Approval', 'No', 'Yes = OT counts only after an admin approves it'],
  ['Late Minutes Reduce OT', 'Yes', 'Monthly OT minutes − total late minutes (minutes after Shift Start on late days)'],
  ['Early Leaving Reduces OT', 'Yes', 'Monthly OT minutes − minutes left before shift end (on present days)'],
  ['Weekly Off', 'Sunday', 'Comma separated, e.g. Sunday  or  Saturday,Sunday'],
  ['Off-Day Work Is OT', 'Yes', 'Holidays (and weekly offs when "Week-Off Full Day Hours" is 0): all hours worked count as OT'],
  ['Week-Off Shift Start', '09:30', 'Working on the weekly off (e.g. Sunday): day hours start (24-hour HH:mm)'],
  ['Week-Off Shift End', '17:00', 'Working on the weekly off: day hours end. Time before the start or after the end is OT'],
  ['Week-Off Half Day Hours', 3, 'Hours inside the week-off shift that earn half a day\'s extra pay'],
  ['Week-Off Full Day Hours', 6, 'Hours inside the week-off shift that earn a full day\'s extra pay (0 = old rule: all hours are OT)'],
  ['Lates Per Half-Day Cut', 0, 'Every N late marks in a month deduct half a day (0 = no deduction)'],
  ['Phone Time Tolerance (min)', 3, 'Check-in is blocked if the phone clock differs from real time by more than this'],
  ['Default PF Bank Salary %', 90, 'Used when an employee\'s "PF Bank Salary" is blank (e.g. 90% of 15000 = 13500)'],
  ['Default PF Employee %', 12, 'Used when "PF Employee" is blank — % of PF Bank Salary'],
  ['Default PF Employer %', 13, 'Used when "PF Employer" is blank — % of PF Bank Salary'],
  ['OT & Deductions Paid In', 'CASH', 'CASH / BANK — for PF employees, which part absorbs OT, leave and advance deductions'],
  ['Round To Rupee', 'Yes', 'Round salary amounts to whole rupees'],
  ['Admin Back-Date Limit (days)', 45, 'Admins can add/change entries up to this many days back (super admin: no limit; 0 = no limit)'],
  ['Request Back-Date Limit (days)', 7, 'Employees can request corrections / leave up to this many days back'],
  ['Currency', '₹', ''],
  ['Stay Logged In (days)', 30, 'People stay logged in this many days after they last used the app (then they enter the PIN again)'],
  ['Birthday Animation', 'balloons', 'Shown to everyone on an employee\'s birthday: ' + ANIMATIONS.join(', ') + ' (blank = none)'],
  ['Birthday Music', 'birthday', 'Tune on birthdays: ' + MUSIC.join(', ')],
  ['Birthday Seconds', 10, 'How long the birthday animation runs (2–60)'],
  ['Birthday Wishes From', '09:00', 'Birthday wishes and animation start at this time (HH:mm)'],
  ['Birthday Wishes Till', '15:00', 'Birthday wishes and animation end at this time (HH:mm)'],
  ['Late GIF', 'https://giphy.com/stickers/maskoai-cute-masko-dumple-WPZ4x9TSQO16YeC9ix', 'Shown on the employee\'s own phone when they check in late (a GIPHY link or a .gif link; blank = off)'],
  ['Early Leaving GIF', 'https://giphy.com/stickers/solarbearshockey-shades-polar-bear-solar-DUcyNsf3oPmVNZYBh8', 'Shown on the employee\'s own phone when they check out before the shift ends (blank = off)'],
  ['Face Match Max Distance', 0.42, 'Face recognition strictness: lower = stricter. Same person ≈ 0.1–0.35, different people from ≈ 0.48. Keep 0.38–0.45'],
  ['Min Android App Version', 0, 'Android app versions below this must update before they can be used (0 = none). The app shows its version at the bottom of the home screen as "App 1.N": enter N'],
  ['Android App Link', 'https://github.com/travalateapp/shipment-scanner/releases/latest/download/Attendance.apk', 'Where the "Update now" button downloads the newest Android app'],
  ['Selfie Folder ID', '', 'Filled automatically'],
  ['Keep Selfies (days)', 60, 'Check-in photos older than this are moved to the Drive trash once a day (0 = keep all)'],
];

/** Per-execution cache so each request reads every tab at most once. */
const MEMO = {};
function memo_(key, fn) {
  if (!Object.prototype.hasOwnProperty.call(MEMO, key)) MEMO[key] = fn();
  return MEMO[key];
}
function forget_() {
  for (let i = 0; i < arguments.length; i++) {
    delete MEMO[arguments[i]];
    if (arguments[i] === 'att') newAttVersion_();
    else if (CACHED_SHEETS[arguments[i]]) newLeaderVersion_(); // employees, settings, holidays … change the OT ranking
    if (arguments[i] === 'employees') delete MEMO.periods; // periods depend on Join Date / Active
    if (CACHED_SHEETS[arguments[i]]) dropSheetCache_(CACHED_SHEETS[arguments[i]]);
  }
}

/*
 * Tabs that rarely change are kept in Google's script cache (shared by all users for up to 6 hours), so
 * most requests don't have to open them. The cache is cleared whenever the app writes to them, and by
 * onEdit() when someone edits them by hand in the Sheet.
 */
const CACHED_SHEETS = {
  settings: 'Settings', employees: 'Employees', holidays: 'Holidays', perms: 'Admin Permissions', locks: 'Payroll Locks',
  employment: 'Employment History', increments: 'Salary Increments', faces: 'Faces', celebrations: 'Celebrations',
  arrears: 'Arrears',
};

/** All values of a tab (dates as 'yyyy-MM-dd', times as 'HH:mm'); null when the tab does not exist. */
function sheetValues_(name) {
  const key = 'sv2_' + name;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) return null;
  const tz = tz_();
  const values = sh.getDataRange().getValues().map(r => r.map(v => (v instanceof Date
    ? Utilities.formatDate(v, tz, v.getFullYear() < 1900 ? 'HH:mm' : 'yyyy-MM-dd') : v)));
  try {
    const json = JSON.stringify(values);
    if (json.length < 95000) cache.put(key, json, 21600);
  } catch (e) { /* too big or cache unavailable: just don't cache */ }
  return values;
}

function dropSheetCache_(name) {
  try { CacheService.getScriptCache().remove('sv2_' + name); } catch (e) { /* ignore */ }
}

/** Simple trigger: clears the cache of a tab when it is edited by hand. */
function onEdit(e) {
  try {
    const name = e.range.getSheet().getName();
    if (name === SHEET.ATTENDANCE) newAttVersion_(); else dropSheetCache_(name);
  } catch (err) { /* ignore */ }
}

/*
 * The Attendance tab is read by almost every screen and grows every day, so a parsed copy is kept in the
 * script cache (split into pieces of < 100 KB). Every write calls forget_('att'), which starts a new
 * "version": copies made before it are never used again. A copy is also ignored when the number of rows
 * in the tab changed (rows added or deleted by hand).
 */
const ATT_CACHE_PIECE = 90000;

function newAttVersion_() {
  try {
    SpreadsheetApp.flush(); // writes are in the tab before anyone can cache it again
    CacheService.getScriptCache().put('attv', Utilities.getUuid().slice(0, 8), 21600);
  } catch (e) { /* ignore */ }
}

function cachedAttendance_(lastRow) {
  try {
    const cache = CacheService.getScriptCache();
    const v = cache.get('attv');
    if (!v) return { version: null };
    const meta = JSON.parse(cache.get('attm_' + v) || 'null');
    if (!meta || meta.lastRow !== lastRow) return { version: v };
    const keys = [];
    for (let i = 0; i < meta.pieces; i++) keys.push('attp_' + v + '_' + i);
    const got = cache.getAll(keys);
    let json = '';
    for (let i = 0; i < keys.length; i++) {
      if (got[keys[i]] == null) return { version: v };
      json += got[keys[i]];
    }
    return { version: v, rows: JSON.parse(json) };
  } catch (e) {
    return { version: null };
  }
}

function storeAttendance_(version, lastRow, rows) {
  try {
    const cache = CacheService.getScriptCache();
    if (!version) {
      version = Utilities.getUuid().slice(0, 8);
      cache.put('attv', version, 21600);
    }
    const json = JSON.stringify(rows);
    const pieces = {};
    let n = 0;
    for (let i = 0; i < json.length; i += ATT_CACHE_PIECE) pieces['attp_' + version + '_' + (n++)] = json.slice(i, i + ATT_CACHE_PIECE);
    if (n > 200) return; // very large tab: just read it each time
    cache.putAll(pieces, 21600);
    cache.put('attm_' + version, JSON.stringify({ lastRow: lastRow, pieces: n }), 21600);
  } catch (e) { /* cache full or unavailable: read the tab next time */ }
}

/* ------------------------------------------------------------------ */
/* Web app entry + sheet menu                                          */
/* ------------------------------------------------------------------ */

function doGet(e) {
  // Health check used by the hosted page to tell "deployment not public" from "no internet".
  if (e && e.parameter && e.parameter.ping) {
    return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'attendance' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // Speed check: how long recent requests took on the server (function names and times only, no data).
  if (e && e.parameter && e.parameter.perf) {
    return ContentService.createTextOutput(JSON.stringify(perfSummary_(), null, 1)).setMimeType(ContentService.MimeType.JSON);
  }
  const t = HtmlService.createTemplateFromFile('Index');
  t.company = getSettings_().company;
  return t.evaluate()
    .setTitle(t.company + ' – Attendance')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * JSON API used when the page is hosted outside Google (e.g. GitHub Pages). This avoids Google's
 * "unable to open the file" error in browsers signed into several Google accounts.
 * Request body (sent as text/plain): { "fn": "getHome", "args": [token, ...] }
 */
const API_FUNCTIONS = {
  publicInfo, login, logout, changePin, getHome, checkIn, checkOut, getMyMonth, getPayslip,
  submitRequest, myRequests, cancelRequest,
  proxyList, proxyCheckIn, proxyCheckOut,
  adminToday, adminSummary, adminMonth, adminEmployeeMonth, adminEntryOptions, adminGetEntry, adminSaveEntry,
  adminDeleteEntry, adminBulkEntry, adminRequests, adminDecideRequest, adminDecideOt, adminClearMissed,
  adminStaff, adminSaveStaff, adminResetPin, adminEmployees, adminSavePf, adminAdvances, adminSaveAdvance, adminSaveArrear, adminDeleteArrear,
  adminAttendanceRegister,
  adminHolidays, adminSaveHoliday, adminDeleteHoliday, adminAddIncrement, adminDeleteIncrement,
  adminSetAdvanceStatus, adminSetAdvanceMonth, adminTopUpAdvance, adminLockMonth, superUnlockMonth, adminGetSelfie, adminExportPayroll,
  superListAdmins, superSavePermissions, superSetRole, superAuditLog, superSetLeaderboard, superRefreshApps,
  adminSaveFace, adminDeleteFace, proxyFaces, adminCelebrations, adminSaveCelebration, adminDeleteCelebration, adminSaveBirthdaySettings,
};

function doPost(e) {
  const t0 = Date.now();
  let json;
  let rid = '';
  let fnName = '';
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    // The page retries when a reply is lost or Google answers with an error page. A retried request
    // carries the same id, so it gets the first answer instead of running the action twice.
    rid = /^[\w-]{8,64}$/.test(String(req.rid || '')) ? 'rid_' + req.rid : '';
    const done = rid ? CacheService.getScriptCache().get(rid) : null;
    if (done) return ContentService.createTextOutput(done).setMimeType(ContentService.MimeType.JSON);
    const fn = Object.prototype.hasOwnProperty.call(API_FUNCTIONS, req.fn) ? API_FUNCTIONS[req.fn] : null;
    if (!fn) throw new Error('Unknown action.');
    fnName = req.fn;
    // "Refresh everyone's app" (super admin): pages sent with their version (pv) reload themselves; older
    // pages, which cannot, are asked to close and reopen the app.
    if (refreshAppsAt_() && !req.pv) throw new Error(OLD_PAGE_MSG);
    const result = fn.apply(null, Array.isArray(req.args) ? req.args : []);
    json = JSON.stringify({ ok: true, result: result === undefined ? null : result, refreshAt: refreshAppsAt_(), ms: Date.now() - t0 });
  } catch (err) {
    json = JSON.stringify({ ok: false, error: String((err && err.message) || err), ms: Date.now() - t0 });
  }
  perfLog_(fnName || '?', Date.now() - t0, json.indexOf('{"ok":true') === 0);
  if (rid && json.length < 95000) {
    try { CacheService.getScriptCache().put(rid, json, 600); } catch (err) { /* ignore */ }
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

const OLD_PAGE_MSG = 'A new version of the app is ready. Please close the app (swipe it away from recent apps) and open it again. ' +
  'In a browser, reload the page. / ऐप का नया वर्ज़न आ गया है। कृपया ऐप बंद करें (हाल के ऐप्स से हटाएँ) और फिर से खोलें।';

/** Remembers the last 300 request times (CacheService, 6 h) for the speed check (?perf=1). */
function perfLog_(fn, ms, ok) {
  try {
    const c = CacheService.getScriptCache(), list = JSON.parse(c.get('perf_log') || '[]');
    list.push([Date.now(), fn, ms, ok ? 1 : 0]);
    c.put('perf_log', JSON.stringify(list.slice(-300)), 21600);
  } catch (e) { /* never let the speed check break a request */ }
}

/** Per function: count, median, slowest (ms) over the remembered requests, plus the last 40. */
function perfSummary_() {
  const list = JSON.parse(CacheService.getScriptCache().get('perf_log') || '[]');
  const by = {};
  list.forEach(x => { (by[x[1]] = by[x[1]] || []).push(x[2]); });
  const fns = Object.keys(by).map(fn => {
    const a = by[fn].slice().sort((p, q) => p - q);
    return { fn: fn, n: a.length, medianMs: a[Math.floor(a.length / 2)], p90Ms: a[Math.floor(a.length * 0.9)], maxMs: a[a.length - 1] };
  }).sort((p, q) => q.medianMs - p.medianMs);
  return { serverVersion: SERVER_VERSION, requests: list.length, byFunction: fns,
    last: list.slice(-40).reverse().map(x => [Utilities.formatDate(new Date(x[0]), tz_(), 'HH:mm:ss'), x[1], x[2], x[3] ? 'ok' : 'error']) };
}

/** When a super admin last pressed "Refresh everyone's app" (ms since 1970), 0 = never. */
function refreshAppsAt_() {
  try { return Number(getSettings_().refreshAppsAt) || 0; } catch (e) { return 0; }
}

/** Every phone reloads the app the next time it talks to the server (old versions are asked to reopen it). */
function superRefreshApps(token) {
  const ctx = authAdmin_(token, 'superAdmin');
  const at = Date.now();
  setSetting_('Refresh Apps At', String(at));
  audit_(ctx.emp, 'REFRESH_APPS', '', '', 'Asked every phone to reload the app');
  return { refreshAt: at };
}

/** Company name for the login screen (no login needed). */
function publicInfo() {
  const s = getSettings_();
  return { company: s.company, minAppVersion: s.minAppVersion, appLink: s.appLink };
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Attendance App')
    .addItem('Run setup / repair sheets', 'setup')
    .addToUi();
}

/** Creates the tabs, headers, formats and defaults. Safe to run again. */
function setup() {
  const ss = SpreadsheetApp.getActive();

  // Settings
  let sh = getOrCreate_(ss, SHEET.SETTINGS, ['Setting', 'Value', 'Notes']);
  sh.getRange('B:B').setNumberFormat('@');
  const existing = sh.getDataRange().getValues().map(r => String(r[0]).trim());
  DEFAULT_SETTINGS.forEach(row => {
    if (existing.indexOf(row[0]) < 0) sh.appendRow([row[0], String(row[1]), row[2]]);
  });
  sh.setColumnWidth(1, 220).setColumnWidth(2, 160).setColumnWidth(3, 520);

  // Employees
  sh = getOrCreate_(ss, SHEET.EMPLOYEES, EMP_HEADERS);
  ensureHeaders_(sh, EMP_HEADERS);
  sh.getRange('A:A').setNumberFormat('@');
  sh.getRange('C:C').setNumberFormat('@');
  roleValidation_(sh);
  const yesNo = SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).build();
  sh.getRange('F2:F').setDataValidation(yesNo);
  const pfCol = headerIndex_(sh)['PF Active'] + 1;
  sh.getRange(2, pfCol, sh.getMaxRows() - 1, 1).setDataValidation(yesNo);
  if (sh.getLastRow() < 2) {
    sh.appendRow(['E001', 'Owner', '1234', 30000, 'SUPER_ADMIN', 'Yes', todayStr_(), '', 'No', '', '', '']);
    sh.appendRow(['E002', 'Sample Employee', '1111', 15000, 'EMPLOYEE', 'Yes', todayStr_(), '', 'Yes', 13500, 1721, 1755]);
  }

  // Attendance
  sh = getOrCreate_(ss, SHEET.ATTENDANCE, ATT_HEADERS);
  ensureHeaders_(sh, ATT_HEADERS);
  ['A:A', 'D:D', 'E:E'].forEach(a => sh.getRange(a).setNumberFormat('@'));
  sh.getRange(2, COL.OVERRIDE + 1, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(OVERRIDE_VALUES, true)
      .setAllowInvalid(false).build());
  sh.getRange(2, COL.OT_APPROVED + 1, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['YES', 'NO'], true).build());

  // Holidays
  sh = getOrCreate_(ss, SHEET.HOLIDAYS, HOLIDAY_HEADERS);
  ensureHeaders_(sh, HOLIDAY_HEADERS);
  sh.getRange('A:A').setNumberFormat('@');

  // Admin permissions, audit log, requests, advances, payroll locks
  sh = getOrCreate_(ss, SHEET.PERMISSIONS, PERM_HEADERS);
  ensureHeaders_(sh, PERM_HEADERS);
  sh.getRange('A:A').setNumberFormat('@');
  getOrCreate_(ss, SHEET.AUDIT, AUDIT_HEADERS);
  sh = getOrCreate_(ss, SHEET.REQUESTS, REQ_HEADERS);
  ensureHeaders_(sh, REQ_HEADERS);
  ['F:F', 'G:G', 'H:H', 'I:I'].forEach(a => sh.getRange(a).setNumberFormat('@'));
  sh = getOrCreate_(ss, SHEET.ADVANCES, ADV_HEADERS);
  ensureHeaders_(sh, ADV_HEADERS);
  ['D:D', 'G:G'].forEach(a => sh.getRange(a).setNumberFormat('@'));
  sh = getOrCreate_(ss, SHEET.ADV_MONTHS, ADV_MONTH_HEADERS);
  sh.getRange('C:C').setNumberFormat('@');
  sh = getOrCreate_(ss, SHEET.LOCKS, LOCK_HEADERS);
  sh.getRange('A:A').setNumberFormat('@');
  sh = getOrCreate_(ss, SHEET.SNAPSHOTS, SNAP_HEADERS);
  sh.getRange('A:A').setNumberFormat('@');

  forget_('settings', 'employees', 'holidays', 'perms', 'locks');
  getSelfieFolder_(getSettings_());
  installAutoCheckoutTrigger_();

  try {
    SpreadsheetApp.getUi().alert('Setup complete.\n\n1. Fill Office Latitude / Longitude in Settings.\n' +
      '2. Add employees (Emp ID, Name, PIN, Salary).\n3. Deploy → New deployment → Web app.');
  } catch (e) { /* run from editor without UI */ }
}

/* ------------------------------------------------------------------ */
/* Login & PIN                                                         */
/* ------------------------------------------------------------------ */

function login(empId, pin) {
  empId = String(empId || '').trim().toUpperCase();
  pin = String(pin || '').trim();
  if (!empId || !pin) throw new Error('Enter Employee ID and PIN.');

  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + empId;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) throw new Error('Too many wrong attempts. Try again after 15 minutes.');

  const emp = findEmployee_(empId);
  if (!emp || !emp.active || !verifyPin_(emp.pin, pin)) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error('Invalid Employee ID or PIN.');
  }
  cache.remove(failKey);
  if (!isHashed_(emp.pin)) writePin_(emp, pin); // PINs typed into the sheet are hashed on first login
  const token = Utilities.getUuid();
  saveSession_(token, emp.id);
  if (Math.random() < 0.05) cleanSessions_();
  const out = { token: token, profile: profile_(emp) };
  try { out.home = getHome(token); } catch (e) { /* the page will load it separately */ }
  return out;
}

function logout(token) {
  if (token) {
    CacheService.getScriptCache().remove('tok_' + token);
    try { PropertiesService.getScriptProperties().deleteProperty('tok_' + token); } catch (e) { /* ignore */ }
  }
  return true;
}

/*
 * Sessions: kept in the script properties for "Stay Logged In (days)" after the last use (the cache only
 * keeps them 6 hours), with the cache in front so most calls don't read the properties.
 */
function saveSession_(token, empId) {
  CacheService.getScriptCache().put('tok_' + token, empId, 21600); // 6 hours (CacheService maximum)
  const days = getSettings_().sessionDays;
  if (!(days > 0)) return;
  try {
    PropertiesService.getScriptProperties().setProperty('tok_' + token,
      JSON.stringify({ e: empId, x: Date.now() + days * 86400000 }));
  } catch (e) { /* properties full: the session still lasts 6 hours */ }
}

function sessionEmpId_(token) {
  if (!token) return null;
  const cached = CacheService.getScriptCache().get('tok_' + token);
  if (cached) return cached;
  let v = null;
  try { v = JSON.parse(PropertiesService.getScriptProperties().getProperty('tok_' + token) || 'null'); } catch (e) { v = null; }
  if (!v || !v.e) return null;
  if (!(v.x > Date.now())) {
    try { PropertiesService.getScriptProperties().deleteProperty('tok_' + token); } catch (e) { /* ignore */ }
    return null;
  }
  saveSession_(token, v.e); // used again: the days start over
  return v.e;
}

/** Removes expired sessions, or all sessions of one employee (PIN reset by an admin). */
function cleanSessions_(empId) {
  try {
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties(), now = Date.now(), cache = CacheService.getScriptCache();
    Object.keys(all).forEach(k => {
      if (k.indexOf('tok_') !== 0) return;
      let v = null;
      try { v = JSON.parse(all[k]); } catch (e) { v = null; }
      if (!v || !(v.x > now) || (empId && v.e === empId)) {
        props.deleteProperty(k);
        if (empId) cache.remove(k);
      }
    });
  } catch (e) { /* ignore */ }
}

function changePin(token, oldPin, newPin) {
  const emp = auth_(token, true);
  if (!verifyPin_(emp.pin, String(oldPin || '').trim())) throw new Error('Current PIN is wrong.');
  newPin = validPin_(newPin);
  writePin_(emp, newPin);
  audit_(emp, 'CHANGE_PIN', emp.id, '', 'Changed own PIN');
  return true;
}

function validPin_(pin) {
  pin = String(pin || '').trim();
  if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN must be 4 to 6 digits.');
  return pin;
}

function isHashed_(stored) {
  return /^sha256\$/.test(String(stored));
}

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

function writePin_(emp, pin) {
  sheet_(SHEET.EMPLOYEES).getRange(empRow_(emp), 3).setValue(hashPin_(pin));
  forget_('employees');
}

/* ------------------------------------------------------------------ */
/* Employee: attendance                                                */
/* ------------------------------------------------------------------ */

function getHome(token) {
  const emp = auth_(token, true);
  if (emp.role === 'GUARD') {
    // No attendance of their own: the app opens straight on Mark Attendance.
    return { profile: profile_(emp), company: getSettings_().company, guard: true, pendingRequests: 0, adminMissed: 0, celebration: celebrationOn_(todayStr_()), birthday: birthdayOn_(todayStr_(), emp) };
  }
  sweepOpenEntries_();
  const s = getSettings_();
  const today = todayStr_();
  const holidays = getHolidays_();
  const rec = byDate_(readAttendance_(), emp.id)[today];
  const offType = offType_(today, s, holidays);
  const day = rec ? evaluateDay_(rec, s, offType, true) : { status: offType || 'NOT_MARKED' };
  const open = openOvernight_(emp, s);
  return {
    profile: profile_(emp),
    company: s.company,
    today: today,
    todayLabel: Utilities.formatDate(new Date(), tz_(), 'EEEE, dd MMM yyyy'),
    offType: offType,
    record: rec ? { in: rec.in, out: rec.out, override: rec.override } : null,
    openPrevious: open ? { date: open.date, in: open.in } : null,
    day: day,
    office: {
      lat: isFinite(s.officeLat) ? s.officeLat : null, lng: isFinite(s.officeLng) ? s.officeLng : null,
      radius: s.radius, maxAccuracy: s.maxAccuracy,
    },
    selfieRequired: s.selfieRequired,
    liveCameraOnly: s.liveCameraOnly,
    checkoutLocation: s.checkoutLocation,
    anywhere: !!emp.anywhere,
    shiftStart: minutesToStr_(empSettings_(emp, s).shiftStartMin),
    closeEarly: shortDays_()[today] || null, // office closes early today
    react: reactRules_(emp, s, today, offType), // late / early-leaving GIF, shown the moment Save is tapped
    celebration: celebrationOn_(today),
    birthday: birthdayOn_(today, emp),
    standardHours: empSettings_(emp, s).standardHours,
    upcomingHolidays: upcomingHolidays_(today, 45, 3),
    face: readFaces_()[emp.id] ? readFaces_()[emp.id].d : null, // registered face: check in / out by face
    faceDistance: s.faceDistance,
    leaders: homeLeaders_(emp, today),
    server: serverClock_(),
    clockTolerance: s.clockTolerance,
    pendingRequests: readRequests_().filter(r => r.empId === emp.id && r.status === 'PENDING').length,
    missedCheckouts: readAttendance_().filter(r => r.empId === emp.id && r.review === 'PENDING')
      .map(r => ({ date: r.date, in: r.in })),
    adminMissed: adminMissedCount_(emp),
    serverVersion: SERVER_VERSION,
    minAppVersion: s.minAppVersion, appLink: s.appLink,
  };
}

/** 'M', 'F' or '' from a Gender cell / form value. */
function parseGender_(v) {
  const g = String(v || '').trim().toLowerCase();
  return /^(m|male|man|boy|पुरुष)$/.test(g) ? 'M' : /^(f|female|woman|girl|महिला)$/.test(g) ? 'F' : '';
}

/**
 * OT leaderboard for one gender in a month: employees (not guards) employed that month and kept in the
 * leaderboard by the super admin, ranked by the month's net OT: time worked beyond the shift on full days,
 * with late coming and early leaving already taken off, plus weekly-off / holiday OT. OT from days the
 * employee left early (half days, absent days) is not counted here, though the salary pays it.
 * Kept in the script cache for up to 15 minutes.
 */
function otLeaders_(gender, ym) {
  const cache = CacheService.getScriptCache();
  let key = null;
  try {
    // Refreshed every 15 minutes (not on every check-in, so the morning rush stays fast), and at once when
    // employees / settings / the leaderboard choice change.
    key = 'ldr_' + Math.floor(Date.now() / 900000) + '_' + (cache.get('ldrv') || '-') + '_' + gender + '_' + ym;
    const hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch (e) { key = null; }
  const s = getSettings_(), holidays = getHolidays_();
  const locked = !!getLocks_()[ym];
  const att = locked ? null : readAttendance_().filter(r => r.date.indexOf(ym) === 0);
  const list = getEmployees_().filter(e => e.gender === gender && e.leaderboard !== false && employedInMonth_(e, ym)).map(e => {
    let min = 0;
    if (locked) {
      const snap = getSnapshot_(ym, e.id);
      min = snap && snap.totals ? leaderOtMin_(snap.totals) : 0;
    } else {
      const emp = Object.assign({}, e, { salary: salaryFor_(e, ym), baseSalary: baseSalary_(e) });
      min = leaderOtMin_(monthSummary_(emp, ym, s, byDate_(att, e.id), holidays, 0).totals);
    }
    return { id: e.id, name: e.name, min: Math.round(min) };
  }).filter(x => x.min > 0)
    .sort((x, y) => y.min - x.min || x.name.localeCompare(y.name, 'en', { sensitivity: 'base' }));
  if (key) { try { cache.put(key, JSON.stringify(list), 21600); } catch (e) { /* ignore */ } }
  return list;
}

/**
 * OT that counts for the leaderboard: the month's OT without the time worked on days the employee left early
 * — the part beyond half the shift on half days, and the hours of days counted Absent. (The salary still
 * pays that time as OT; only the ranking leaves it out.)
 */
function leaderOtMin_(t) {
  return Math.max(0, (t.otMin || 0) - (t.earlyExitOtMin || 0));
}

function newLeaderVersion_() {
  try { CacheService.getScriptCache().put('ldrv', Utilities.getUuid().slice(0, 8), 21600); } catch (e) { /* ignore */ }
}

/** Super admin: which employees take part in the OT leaderboard (ids = the ones kept in it). */
function superSetLeaderboard(token, ids) {
  const ctx = authAdmin_(token, 'superAdmin');
  const keep = {};
  (ids || []).forEach(id => { keep[String(id).trim().toUpperCase()] = true; });
  const sh = sheet_(SHEET.EMPLOYEES);
  ensureHeaders_(sh, EMP_HEADERS);
  const col = headerIndex_(sh)['In Leaderboard'] + 1;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const last = sh.getLastRow();
    if (last < 2) return adminStaff(token);
    const idsCol = sh.getRange(2, 1, last - 1, 1).getValues();
    const cur = sh.getRange(2, col, last - 1, 1).getValues();
    const out = idsCol.map((r, i) => {
      const id = String(r[0]).trim().toUpperCase();
      return [id ? (keep[id] ? 'Yes' : 'No') : cur[i][0]];
    });
    sh.getRange(2, col, out.length, 1).setValues(out);
    forget_('employees');
    const off = getEmployees_().filter(e => !e.leaderboard).map(e => e.id);
    audit_(ctx.emp, 'SET_LEADERBOARD', '', '', 'Not in leaderboard: ' + (off.join(', ') || 'none'));
  } finally {
    lock.releaseLock();
  }
  return adminStaff(token);
}

/**
 * Leaders cards on the home screen: men see the men's board, women the women's (nothing without a Gender).
 * Admins see the boards the super admin ticked for them (Men's / Women's Leaders Card); with none ticked,
 * only the one of their own gender. Super admins see both.
 * Days 1–5 of a month show only last month's winner (with fireworks on the page); after that the top 3 so far.
 */
function homeLeaders_(emp, today) {
  const p = permsFor_(emp);
  let genders = [];
  if (p.seeMenLeaders) genders.push('M');
  if (p.seeWomenLeaders) genders.push('F');
  if (!genders.length && emp.gender) genders = [emp.gender];
  if (emp.gender === 'F' && genders.length === 2) genders.reverse(); // own board first
  const ym = today.slice(0, 7);
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const prev = m === 1 ? (y - 1) + '-12' : y + '-' + pad2_(m - 1);
  const early = Number(today.slice(8, 10)) <= 5;
  return genders.map(g => {
    if (early) {
      const w = otLeaders_(g, prev)[0];
      return { gender: g, winner: w ? { name: w.name, me: w.id === emp.id } : null, month: prev, monthLabel: ymLabel_(prev) };
    }
    return {
      gender: g, month: ym, monthLabel: ymLabel_(ym),
      top: otLeaders_(g, ym).slice(0, 3).map(x => ({ name: x.name, min: x.min, me: x.id === emp.id })),
    };
  });
}

/** face = { dist } when the check-in was made by face recognition (selfieDataUrl is then the proof photo). */
function checkIn(token, lat, lng, accuracy, selfieDataUrl, phoneClock, face) {
  const emp = auth_(token);
  const s = getSettings_();
  checkPhoneClock_(s, phoneClock);
  const loc = checkLocation_(s, lat, lng, accuracy, emp.anywhere);
  const r = checkInCore_(emp, s, loc, selfieDataUrl, null, face);
  if (r.late && s.lateGif) r.gif = s.lateGif; // a little "you're late" reaction on the employee's own phone only
  r.home = homeAfterMark_(token);
  return r;
}

/**
 * What the phone needs to show the late / early-leaving GIF as soon as Save is tapped, without waiting for the
 * server: shift start, grace and end (on a short day, the closing time) in minutes, and the GIF links.
 * null on a weekly off / holiday or when both GIFs are off.
 */
function reactRules_(emp, s, today, offType) {
  if (offType || (!s.lateGif && !s.earlyGif)) return null;
  const es = shortenDay_(empSettings_(emp, s), today);
  return { startMin: es.shiftStartMin, graceMin: es.lateGrace, endMin: es.shiftStartMin + Math.round(es.standardHours * 60),
    lateGif: s.lateGif, earlyGif: s.earlyGif };
}

/**
 * The fresh home screen, sent back with an employee's own check-in / check-out so the phone needs no second
 * request (each request to Apps Script costs 1–5 s on Google's side). null if it fails: the phone then asks.
 */
function homeAfterMark_(token) {
  try { return getHome(token); } catch (e) { return null; }
}

/**
 * Check-in for emp. byEmp = the person marking it for them (admin / guard), or null when the employee
 * marks it on their own phone. Marked-for-others check-ins carry the marker's photo of the employee and are flagged PROXY.
 */
function checkInCore_(emp, s, loc, selfieDataUrl, byEmp, face) {
  const who = byEmp ? emp.name + ' has' : 'You have';
  const today = todayStr_();
  assertUnlocked_(today);
  const existing = () => byDate_(readAttendance_(), emp.id)[today];
  const first = existing();
  if (first && first.in && first.out) {
    // Back after going out: only a guard / admin can check someone in again (Mark Attendance).
    if (!byEmp) throw new Error('You have already checked out today. To check in again, ask the guard or an admin to mark it (Mark Attendance).');
    return checkInAgain_(emp, s, loc, byEmp, who);
  }
  if (first && first.in) throw new Error(who + ' already checked in today.');

  // The selfie is saved before taking the lock so that a morning rush does not queue up on Drive uploads.
  const now = Utilities.formatDate(new Date(), tz_(), 'HH:mm');
  let selfieUrl = '';
  if ((s.selfieRequired && !byEmp) || selfieDataUrl) {
    selfieUrl = saveSelfie_(selfieDataUrl, today + '_' + emp.id + '_' + now.replace(':', '') + '.jpg', s);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    forget_('att');
    const rec = existing();
    if (rec && rec.in) throw new Error(who + ' already checked in today.');
    const offType = offType_(today, s, getHolidays_());
    const es = empSettings_(emp, s);
    const late = !offType && toMinutes_(now) > es.shiftStartMin + es.lateGrace;
    // One phone marks many people from the same spot, so the "same GPS" checks don't apply to proxy marks.
    const flags = byEmp ? ['PROXY'].concat(isFinite(loc.acc) && loc.acc > s.flagAccuracy ? ['WEAK_GPS'] : [])
      : loc.outside ? ['OUTSIDE'] : gpsFlags_(emp.id, today, loc, s);
    if (validFace_(face)) flags.push('FACE');
    const byNote = byEmp ? 'Check-in marked by ' + byEmp.name + ' (' + byEmp.id + ')' : '';
    const sh = sheet_(SHEET.ATTENDANCE);

    if (rec) {
      // An admin had already put a status (e.g. Leave / Absent) on today: the check-in replaces it.
      const note = [rec.note, 'Status ' + rec.override + ' replaced by check-in', byNote].filter(String).join(' · ');
      sh.getRange(rec.row, COL.IN + 1, 1, 6).setValues([["'" + now, '', '', 'WORKING', late ? 'Yes' : '', '']]);
      sh.getRange(rec.row, COL.IN_LAT + 1, 1, 4).setValues([[loc.lat, loc.lng, loc.dist, loc.acc]]);
      sh.getRange(rec.row, COL.SELFIE + 1, 1, 3).setValues([[selfieUrl, '', note]]);
      sh.getRange(rec.row, COL.FLAGS + 1).setValue(flags.join(' '));
    } else {
      const row = new Array(ATT_HEADERS.length).fill('');
      row[COL.DATE] = "'" + today;
      row[COL.EMP] = emp.id;
      row[COL.NAME] = emp.name;
      row[COL.IN] = "'" + now;
      row[COL.STATUS] = 'WORKING';
      row[COL.LATE] = late ? 'Yes' : '';
      row[COL.IN_LAT] = loc.lat;
      row[COL.IN_LNG] = loc.lng;
      row[COL.IN_DIST] = loc.dist;
      row[COL.IN_ACC] = loc.acc;
      row[COL.SELFIE] = selfieUrl;
      row[COL.NOTE] = byNote;
      row[COL.FLAGS] = flags.join(' ');
      sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    }
    SpreadsheetApp.flush();
    forget_('att');
    if (byEmp) audit_(byEmp, 'MARK_CHECKIN', emp.id, today, now + ' · ' + loc.dist + ' m from office');
    return { time: now, late: late, lateMin: late ? toMinutes_(now) - es.shiftStartMin : 0, distance: loc.dist };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Checking in again after a check-out the same day: the time away (last check-out → now) becomes a break,
 * the check-out is cleared and the day is "Working" again. The first check-in (late mark, selfie) stays.
 */
function checkInAgain_(emp, s, loc, byEmp, who) {
  const today = todayStr_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    forget_('att');
    const rec = byDate_(readAttendance_(), emp.id)[today];
    if (!rec || !rec.in) throw new Error(who + ' not checked in today.');
    if (!rec.out) throw new Error(who + ' already checked in today.');
    const now = Utilities.formatDate(new Date(), tz_(), 'HH:mm');
    const outMin = toMinutes_(rec.out), nowMin = toMinutes_(now);
    if (outMin <= toMinutes_(rec.in)) throw new Error('The check-out was after midnight. Ask an admin to change the entry.');
    if (nowMin <= outMin) throw new Error(who + ' just checked out. Try again in a minute.');
    const breaks = cleanBreaks_([rec.breaks, rec.out + '-' + now].filter(String).join(';'));
    const sh = sheet_(SHEET.ATTENDANCE);
    sh.getRange(rec.row, breaksCol_(sh)).setValue(breaks);
    sh.getRange(rec.row, COL.OUT + 1, 1, 2).setValues([['', '']]); // check-out and worked hours
    sh.getRange(rec.row, COL.STATUS + 1).setValue('WORKING');
    sh.getRange(rec.row, COL.OT + 1).setValue('');
    sh.getRange(rec.row, COL.OUT_LAT + 1, 1, 3).setValues([['', '', '']]);
    sh.getRange(rec.row, COL.OUT_ACC + 1).setValue('');
    const flags = rec.flags.split(/\s+/).filter(f => f && f !== 'PROXY_OUT' && f !== 'OUTSIDE_OUT' && f !== 'WEAK_GPS_OUT');
    if (loc && loc.outside && flags.indexOf('OUTSIDE') < 0) flags.push('OUTSIDE');
    sh.getRange(rec.row, COL.FLAGS + 1).setValue(flags.join(' '));
    const line = 'Back in at ' + now + (byEmp ? ' (marked by ' + byEmp.name + ' (' + byEmp.id + '))' : '') +
      (loc && isFinite(loc.dist) ? ' · ' + loc.dist + ' m from office' : '');
    sh.getRange(rec.row, COL.NOTE + 1).setValue([rec.note, line].filter(String).join(' · '));
    SpreadsheetApp.flush();
    forget_('att');
    if (byEmp) audit_(byEmp, 'MARK_CHECKIN_AGAIN', emp.id, today, rec.out + '–' + now + ' away');
    return { time: now, again: true, away: rec.out + '–' + now, distance: loc ? loc.dist : '' };
  } finally {
    lock.releaseLock();
  }
}

function checkOut(token, lat, lng, accuracy, phoneClock, photo, face) {
  const emp = auth_(token);
  const s = getSettings_();
  checkPhoneClock_(s, phoneClock);
  const loc = s.checkoutLocation || emp.anywhere ? checkLocation_(s, lat, lng, accuracy, emp.anywhere) : null;
  const r = checkOutCore_(emp, s, loc, null, photo, face);
  // Leaving before the shift ends (on a short day: before closing) on a working day → a reaction on their own phone.
  if (r.date === todayStr_() && !offType_(r.date, s, getHolidays_())) {
    const es = shortenDay_(empSettings_(emp, s), r.date), end = es.shiftStartMin + Math.round(es.standardHours * 60);
    const out = toMinutes_(r.time);
    r.earlyMin = out > es.shiftStartMin && out < end ? end - out : 0;
    if (r.earlyMin && s.earlyGif) r.gif = s.earlyGif;
  }
  r.home = homeAfterMark_(token);
  return r;
}

/**
 * A GIF link from Settings: a direct image link, or a GIPHY page link (giphy.com/gifs/… or /stickers/…-ID),
 * turned into the GIF itself. '' = off.
 */
function gifUrl_(v) {
  const str = String(v || '').trim();
  if (!/^https:\/\//i.test(str)) return '';
  const m = /giphy\.com\/(?:gifs|stickers|embed)\/(?:[\w-]*-)?([A-Za-z0-9]{8,})(?:[\/?#]|$)/.exec(str);
  return m && !/media\d*\.giphy\.com|i\.giphy\.com/.test(str) ? 'https://media.giphy.com/media/' + m[1] + '/giphy.gif' : str;
}

function validFace_(face) {
  return !!face && typeof face === 'object' && isFinite(Number(face.dist)) && Number(face.dist) >= 0 && Number(face.dist) < 1;
}

/** photo / face: proof photo and match of a face check-out (kept in "Out Photo", flag FACE_OUT). */
function checkOutCore_(emp, s, loc, byEmp, photo, face) {
  const who = byEmp ? emp.name + ' has' : 'You have';
  let photoUrl = '';
  if (photo) {
    try {
      photoUrl = saveSelfie_(photo, todayStr_() + '_' + emp.id + '_out_' + Utilities.formatDate(new Date(), tz_(), 'HHmm') + '.jpg', s);
    } catch (e) { photoUrl = ''; } // the check-out matters more than its photo
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    forget_('att');
    const today = todayStr_();
    let rec = byDate_(readAttendance_(), emp.id)[today];
    if (!rec || !rec.in) rec = openOvernight_(emp, s); // night shift: close yesterday's entry
    if (!rec || !rec.in) throw new Error(who + ' not checked in today.');
    if (rec.out) throw new Error(who + ' already checked out today (at ' + rec.out + ').');
    assertUnlocked_(rec.date);

    const now = Utilities.formatDate(new Date(), tz_(), 'HH:mm');
    rec.out = now;
    const d = evaluateDay_(rec, s, offType_(rec.date, s, getHolidays_()), false);

    const sh = sheet_(SHEET.ATTENDANCE);
    sh.getRange(rec.row, COL.OUT + 1, 1, 5).setValues([["'" + now, d.worked, d.status, d.late ? 'Yes' : '', d.ot]]);
    if (loc) {
      sh.getRange(rec.row, COL.OUT_LAT + 1, 1, 3).setValues([[loc.lat, loc.lng, loc.dist]]);
      sh.getRange(rec.row, COL.OUT_ACC + 1).setValue(loc.acc);
    }
    const flags = rec.flags.split(/\s+/).filter(String);
    if (loc && isFinite(loc.acc) && loc.acc > s.flagAccuracy && flags.indexOf('WEAK_GPS_OUT') < 0) flags.push('WEAK_GPS_OUT');
    if (byEmp && flags.indexOf('PROXY_OUT') < 0) flags.push('PROXY_OUT');
    if (loc && loc.outside && flags.indexOf('OUTSIDE_OUT') < 0) flags.push('OUTSIDE_OUT');
    if (validFace_(face) && flags.indexOf('FACE_OUT') < 0) flags.push('FACE_OUT');
    if (photoUrl) sh.getRange(rec.row, COL.OUT_PHOTO + 1).setValue(photoUrl);
    if (flags.join(' ') !== rec.flags) sh.getRange(rec.row, COL.FLAGS + 1).setValue(flags.join(' '));
    if (byEmp) {
      sh.getRange(rec.row, COL.NOTE + 1).setValue([rec.note, 'Check-out marked by ' + byEmp.name + ' (' + byEmp.id + ')'].filter(String).join(' · '));
    }
    SpreadsheetApp.flush();
    forget_('att');
    if (byEmp) audit_(byEmp, 'MARK_CHECKOUT', emp.id, rec.date, now + (loc ? ' · ' + loc.dist + ' m from office' : ''));
    return { time: now, worked: d.worked, ot: d.ot, status: d.status, date: rec.date };
  } finally {
    lock.releaseLock();
  }
}

/** Yesterday's entry that is still open, when overnight shifts are allowed and it is not too old. */
function openOvernight_(emp, s) {
  if (!s.overnight) return null;
  const today = todayStr_();
  const y = addDays_(today, -1);
  const rec = byDate_(readAttendance_(), emp.id)[y];
  if (!rec || !rec.in || rec.out || rec.review) return null;
  const nowMin = toMinutes_(Utilities.formatDate(new Date(), tz_(), 'HH:mm'));
  return nowMin + 1440 - toMinutes_(rec.in) <= s.maxShiftHours * 60 ? rec : null;
}

/** Suspicious-GPS markers shown to admins: weak accuracy, identical coordinates to earlier days or other people. */
function gpsFlags_(empId, date, loc, s) {
  const flags = [];
  if (isFinite(loc.acc) && loc.acc > s.flagAccuracy) flags.push('WEAK_GPS');
  const key = coordKey_(loc.lat, loc.lng);
  const since = addDays_(date, -60);
  const att = readAttendance_();
  if (att.some(r => r.empId === empId && r.date !== date && r.date >= since && coordKey_(r.inLat, r.inLng) === key)) {
    flags.push('REPEAT_GPS');
  }
  if (att.some(r => r.empId !== empId && r.date === date && coordKey_(r.inLat, r.inLng) === key)) {
    flags.push('SHARED_GPS');
  }
  return flags;
}

function coordKey_(lat, lng) {
  if (lat === '' || lng === '' || !isFinite(Number(lat)) || !isFinite(Number(lng))) return 'none';
  return Number(lat).toFixed(6) + ',' + Number(lng).toFixed(6);
}

/** Monthly attendance, OT and salary for the logged-in employee. ym = 'yyyy-MM'. */
function getMyMonth(token, ym) {
  const emp = auth_(token);
  return hideSplit_(buildMonth_(emp, validYm_(ym)), permsFor_(emp).viewSplit);
}

/**
 * The In Bank / In Cash split is only for admins with the "View Bank / Cash Split" permission.
 * Everyone else gets only the total (net) salary.
 */
function hideSplit_(m, canSee) {
  const pay = m && (m.pay || m);
  if (pay && !canSee) { delete pay.bank; delete pay.cash; }
  if (m && m.pay) m.showSplit = !!canSee;
  return m;
}

/** Payslip as HTML (and optionally PDF). Employees get their own; admins with View Payroll anyone they manage. */
function getPayslip(token, ym, empId, asPdf) {
  const me = auth_(token);
  let emp = me;
  if (empId && String(empId).toUpperCase() !== me.id) {
    const ctx = authAdmin_(token, 'viewPayroll');
    emp = managedEmployee_(ctx, empId);
  }
  const m = hideSplit_(buildMonth_(emp, validYm_(ym)), permsFor_(me).viewSplit);
  const html = payslipHtml_(emp, m);
  const out = { html: html, fileName: 'Payslip_' + emp.id + '_' + m.ym + '.pdf' };
  if (asPdf) {
    const pdf = Utilities.newBlob(html, 'text/html', 'payslip.html').getAs('application/pdf');
    out.pdf = Utilities.base64Encode(pdf.getBytes());
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Employee: requests (leave / correction)                             */
/* ------------------------------------------------------------------ */

/** req = { type: 'LEAVE', from, to, reason } or { type: 'CORRECTION', from, in, out, reason } */
function submitRequest(token, req) {
  const emp = auth_(token);
  const s = getSettings_();
  req = req || {};
  const type = String(req.type || '').toUpperCase();
  const today = todayStr_();
  if (type === 'ADVANCE') return submitAdvanceRequest_(emp, req, token);
  const minDate = s.requestBackDays > 0 ? addDays_(today, -s.requestBackDays) : '2000-01-01';
  const from = toDateStr_(req.from);
  const to = type === 'LEAVE' ? toDateStr_(req.to || req.from) : from;
  const reason = String(req.reason || '').trim().slice(0, 300);
  if (!from || !to) throw new Error('Choose the date.');
  if (from < minDate) throw new Error('You can only request for dates from ' + minDate + ' onwards.');
  if (!reason) throw new Error('Please write a reason.');

  let inT = '', outT = '', leaveType = '';
  if (type === 'LEAVE') {
    if (to < from) throw new Error('"To" date must be on or after "From" date.');
    if (to > addDays_(today, 90)) throw new Error('Leave can be requested at most 90 days ahead.');
    // Paid or unpaid is decided by the admin when approving.
  } else if (type === 'CORRECTION') {
    if (from > today) throw new Error('Corrections are only for past days or today.');
    inT = toTimeStr_(req.in);
    outT = toTimeStr_(req.out);
    if (!inT && !outT) throw new Error('Enter the correct check-in and/or check-out time.');
  } else {
    throw new Error('Unknown request type.');
  }
  for (let d = from; d <= to; d = addDays_(d, 1)) assertUnlocked_(d);
  if (readRequests_().some(r => r.empId === emp.id && r.status === 'PENDING' && r.type === type && r.from === from)) {
    throw new Error('You already have a pending request for this date.');
  }

  const id = 'R' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  const row = [id, Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), emp.id, emp.name, type,
    "'" + from, "'" + to, inT ? "'" + inT : '', outT ? "'" + outT : '', leaveType, reason, 'PENDING', '', '', ''];
  const sh = sheetOrCreate_(SHEET.REQUESTS, REQ_HEADERS);
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  forget_('requests');
  return myRequests(token);
}

/** Salary advance request: { type: 'ADVANCE', amount, monthly (suggested deduction), reason } */
function submitAdvanceRequest_(emp, req, token) {
  const amount = Number(req.amount);
  const monthly = req.monthly === '' || req.monthly === undefined ? 0 : Number(req.monthly);
  const reason = String(req.reason || '').trim().slice(0, 300);
  if (!(amount > 0)) throw new Error('Enter the advance amount you need.');
  if (!isFinite(monthly) || monthly < 0) throw new Error('Enter a valid monthly deduction (or leave it empty).');
  if (!reason) throw new Error('Please write a reason.');
  if (readRequests_().some(r => r.empId === emp.id && r.status === 'PENDING' && r.type === 'ADVANCE')) {
    throw new Error('You already have a pending advance request.');
  }
  const today = todayStr_();
  const id = 'R' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  const row = [id, Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), emp.id, emp.name, 'ADVANCE',
    "'" + today, "'" + today, '', '', '', reason, 'PENDING', '', '', '', amount, monthly || ''];
  const sh = sheetOrCreate_(SHEET.REQUESTS, REQ_HEADERS);
  ensureHeaders_(sh, REQ_HEADERS);
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  forget_('requests');
  return myRequests(token);
}

function myRequests(token) {
  const emp = auth_(token);
  return readRequests_().filter(r => r.empId === emp.id).reverse().slice(0, 30);
}

function cancelRequest(token, id) {
  const emp = auth_(token);
  const r = readRequests_().filter(x => x.id === id && x.empId === emp.id)[0];
  if (!r || r.status !== 'PENDING') throw new Error('Only pending requests can be cancelled.');
  sheet_(SHEET.REQUESTS).getRange(r.row, 12).setValue('CANCELLED');
  forget_('requests');
  return myRequests(token);
}

/* ---------------------------- Admin ------------------------------- */
/*
 * Every admin call checks a permission (see PERMISSIONS) and the list of employees the admin may
 * manage. SUPER_ADMIN has every permission for every employee and sets the permissions of ADMINs
 * from the app (Admin → Admins). They are stored in the "Admin Permissions" tab.
 */

/* ---------------- Marking attendance for others (no phone) ---------------- */

/** Employees this admin / guard may check in or out today, with their status. */
function proxyList(token) {
  const ctx = authAdmin_(token, 'markOthers');
  const s = getSettings_();
  const today = todayStr_();
  const offType = offType_(today, s, getHolidays_());
  const att = readAttendance_();
  return {
    date: today, offType: offType,
    office: { radius: s.radius, maxAccuracy: s.maxAccuracy,
      lat: isFinite(s.officeLat) ? s.officeLat : null, lng: isFinite(s.officeLng) ? s.officeLng : null },
    server: serverClock_(), clockTolerance: s.clockTolerance,
    list: getEmployees_().filter(e => e.active && employedOn_(e, today) && e.id !== ctx.emp.id && canEditEmployee_(ctx, e.id)).map(e => {
      const recs = byDate_(att, e.id);
      let r = recs[today];
      const open = (!r || !r.in) ? openOvernight_(e, s) : null;
      if (open) r = open;
      return {
        id: e.id, name: e.name, in: r ? r.in : '', out: r ? r.out : '', date: r ? r.date : today,
        status: r ? evaluateDay_(r, s, offType, r.date === today).status : (offType || 'NOT_MARKED'),
        byOther: !!(r && /PROXY/.test(r.flags)), markedBy: markedBy_(r), breaks: r ? r.breaks || '' : '',
      };
    }).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Check-in for an employee without a phone. The marker's phone must be at the office, and a photo of the
 * employee (taken on the marker's phone) is always required.
 */
function proxyCheckIn(token, empId, lat, lng, accuracy, phoneClock, photoDataUrl, face) {
  const ctx = authAdmin_(token, 'markOthers');
  const emp = proxyTarget_(ctx, empId);
  const s = getSettings_();
  checkPhoneClock_(s, phoneClock);
  const cur = byDate_(readAttendance_(), emp.id)[todayStr_()];
  const again = cur && cur.in && cur.out; // back after going out: the first check-in already has the photo
  if (!again && !/^data:image\//.test(String(photoDataUrl || ''))) throw new Error('Take a photo of ' + emp.name + ' to check them in.');
  const r = checkInCore_(emp, s, checkLocation_(s, lat, lng, accuracy), photoDataUrl, ctx.emp, face);
  return Object.assign(r, { list: proxyList(token).list });
}

function proxyCheckOut(token, empId, lat, lng, accuracy, phoneClock, photo, face) {
  const ctx = authAdmin_(token, 'markOthers');
  const emp = proxyTarget_(ctx, empId);
  const s = getSettings_();
  checkPhoneClock_(s, phoneClock);
  // Location is always required when marking for someone else.
  const r = checkOutCore_(emp, s, checkLocation_(s, lat, lng, accuracy), ctx.emp, photo, face);
  return Object.assign(r, { list: proxyList(token).list });
}

/**
 * Who checked this record in / out for the employee, from the note written at the time
 * ("Check-in marked by <name> (<id>)"). Guards show as "Guard (<name>)", everyone else by name.
 */
function markedBy_(rec) {
  const out = {};
  if (!rec || !/PROXY/.test(rec.flags)) return out;
  const re = /Check-(in|out) marked by (.+?) \(([^)]+)\)/g;
  let m;
  while ((m = re.exec(String(rec.note || '')))) {
    const p = findEmployee_(m[3]);
    const name = p ? p.name : m[2];
    out[m[1]] = p && p.role === 'GUARD' ? 'Guard (' + name + ')' : name;
  }
  return out;
}

/* ------------------------------ Faces ------------------------------ */

/** { empId: { d: [128 numbers], at, by } } */
function readFaces_() {
  return memo_('faces', () => {
    const values = sheetValues_(SHEET.FACES);
    const map = {};
    (values || []).slice(1).forEach(r => {
      const id = String(r[0]).trim().toUpperCase();
      let d = null;
      try { d = JSON.parse(String(r[2] || '')); } catch (e) { d = null; }
      if (id && Array.isArray(d) && d.length === 128) map[id] = { d: d, photo: String(r[3] || ''), by: String(r[4] || ''), at: String(r[5] || '') };
    });
    return map;
  });
}

function faceDistance_(a, b) {
  let sum = 0;
  for (let i = 0; i < 128; i++) { const x = a[i] - b[i]; sum += x * x; }
  return Math.sqrt(sum);
}

/** Admins register an employee's face: descriptor = average of a few scans; photo = a small picture for reference. */
function adminSaveFace(token, empId, descriptor, photo) {
  const ctx = authAdmin_(token, 'manageEmployees');
  const emp = managedEmployee_(ctx, empId, true);
  if (emp.role === 'GUARD') throw new Error('Guards do not mark their own attendance.');
  const d = (Array.isArray(descriptor) ? descriptor : []).map(Number);
  if (d.length !== 128 || d.some(x => !isFinite(x))) throw new Error('The face scan did not work. Please try again.');
  const s = getSettings_();
  // The same face must not belong to two employees.
  const faces = readFaces_();
  const other = Object.keys(faces).filter(id => id !== emp.id)
    .map(id => ({ id: id, dist: faceDistance_(d, faces[id].d) })).sort((a, b) => a.dist - b.dist)[0];
  if (other && other.dist < s.faceDistance) {
    const o = findEmployee_(other.id);
    throw new Error('This face is already registered for ' + (o ? o.name : other.id) + ' (' + other.id + '). Remove that one first if it was a mistake.');
  }
  let photoUrl = '';
  if (photo) { try { photoUrl = saveSelfie_(photo, 'face_' + emp.id + '.jpg', s); } catch (e) { photoUrl = ''; } }
  const sh = sheetOrCreate_(SHEET.FACES, FACE_HEADERS);
  const row = [emp.id, emp.name, JSON.stringify(d.map(x => Math.round(x * 10000) / 10000)), photoUrl,
    ctx.emp.id + ' ' + ctx.emp.name, Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm')];
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]).trim().toUpperCase()) : [];
    const i = ids.indexOf(emp.id);
    sh.getRange(i >= 0 ? i + 2 : last + 1, 1, 1, row.length).setValues([row]);
    forget_('faces');
    audit_(ctx.emp, i >= 0 ? 'FACE_REREGISTERED' : 'FACE_REGISTERED', emp.id, '', 'Face registered');
  } finally {
    lock.releaseLock();
  }
  return adminStaff(token);
}

function adminDeleteFace(token, empId) {
  const ctx = authAdmin_(token, 'manageEmployees');
  const emp = managedEmployee_(ctx, empId, true);
  const sh = sheetOrCreate_(SHEET.FACES, FACE_HEADERS);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]).trim().toUpperCase()) : [];
    const i = ids.indexOf(emp.id);
    if (i >= 0) sh.deleteRow(i + 2);
    forget_('faces');
    audit_(ctx.emp, 'FACE_REMOVED', emp.id, '', 'Face removed');
  } finally {
    lock.releaseLock();
  }
  return adminStaff(token);
}

/** The registered faces of everyone this guard / admin may mark, for the "Scan faces" screen. */
function proxyFaces(token) {
  const ctx = authAdmin_(token, 'markOthers');
  const faces = readFaces_();
  return {
    distance: getSettings_().faceDistance,
    list: getEmployees_().filter(e => e.active && faces[e.id] && e.id !== ctx.emp.id && canEditEmployee_(ctx, e.id))
      .map(e => ({ id: e.id, name: e.name, d: faces[e.id].d })),
    // The person scanning can't mark themselves here; their face is sent so the scan can say "that's you".
    me: faces[ctx.emp.id] ? { id: ctx.emp.id, name: ctx.emp.name, d: faces[ctx.emp.id].d, self: true } : null,
  };
}

function proxyTarget_(ctx, empId) {
  if (String(empId || '').trim().toUpperCase() === ctx.emp.id) {
    throw new Error(ctx.emp.role === 'GUARD' ? 'Guards cannot mark their own attendance.' : 'Use your own Attendance screen to mark your own attendance.');
  }
  const emp = managedEmployee_(ctx, empId, true);
  if (!emp.active) throw new Error(emp.name + ' is not active.');
  return emp;
}

/** The day's attendance of every employee this admin manages. date = 'yyyy-MM-dd' (default today, never future). */
function adminToday(token, date) {
  const ctx = authAdmin_(token, 'viewToday');
  sweepOpenEntries_();
  const s = getSettings_();
  const today = todayStr_();
  let day = toDateStr_(date) || today;
  if (day > today) day = today;
  const isToday = day === today;
  const offType = offType_(day, s, getHolidays_());
  const recs = {};
  readAttendance_().forEach(r => { if (r.date === day && !recs[r.empId]) recs[r.empId] = r; });

  const counts = { total: 0, in: 0, late: 0, out: 0, notMarked: 0, flagged: 0 };
  const list = getEmployees_().filter(e => employedOn_(e, day) && canManage_(ctx, e.id)).map(e => {
    const r = recs[e.id];
    const d = r ? evaluateDay_(r, s, offType, isToday) : { status: offType || (isToday ? 'NOT_MARKED' : 'ABSENT') };
    const flags = r && r.flags ? r.flags.split(/\s+/).filter(String) : [];
    if (r && r.in && s.selfieRequired && !r.selfie && !/PROXY/.test(r.flags) && !/replaced|Entered by|marked by/i.test(String(r.note))) flags.push('NO_SELFIE');
    counts.total++;
    if (r && r.in) counts.in++;
    if (d.late) counts.late++;
    if (r && r.out) counts.out++;
    if (!r || !r.in) counts.notMarked++;
    if (flags.some(f => SUSPICIOUS_FLAGS.indexOf(f) >= 0)) counts.flagged++;
    return {
      id: e.id, name: e.name, in: r ? r.in : '', out: r ? r.out : '', status: d.status,
      late: !!d.late, worked: d.worked || 0, distance: r ? r.inDist : '', accuracy: r ? r.inAcc : '',
      row: r ? r.row : 0, hasSelfie: !!(r && r.selfie), hasOutPhoto: !!(r && r.outPhoto), flags: flags, markedBy: markedBy_(r),
    };
  });
  list.sort((a, b) => (b.flags.length ? 1 : 0) - (a.flags.length ? 1 : 0) ||
    (a.in ? 0 : 1) - (b.in ? 0 : 1) || a.name.localeCompare(b.name));
  return {
    date: day, today: today, isToday: isToday, offType: offType, counts: counts, list: list,
    missed: missedFor_(ctx), canClear: !!(ctx.perms.editAttendance || ctx.perms.approveRequests),
  };
}

function adminMonth(token, ym) {
  const ctx = authAdmin_(token, 'viewPayroll');
  return payrollRows_(ctx, validYm_(ym));
}

function payrollRows_(ctx, ym) {
  const s = getSettings_();
  const att = readAttendance_().filter(r => r.date.indexOf(ym) === 0);
  const withRecords = {};
  att.forEach(r => { withRecords[r.empId] = true; });
  const lock = getLocks_()[ym];

  const rows = getEmployees_().filter(e => (employedInMonth_(e, ym) || withRecords[e.id]) && canManage_(ctx, e.id)).map(e => {
    const m = buildMonth_(e, ym);
    return hideSplit_(Object.assign({ id: e.id, name: e.name, advances: m.advances || [], arrearItems: m.arrearItems || [] }, m.totals, m.pay), ctx.perms.viewSplit);
  });
  return {
    ym: ym, label: ymLabel_(ym), currency: s.currency, rows: rows,
    locked: lock ? { by: lock.by, at: lock.at } : null,
    canLock: !lock && ym < todayStr_().slice(0, 7) && !!ctx.perms.lockPayroll,
    canUnlock: !!lock && ctx.perms.superAdmin,
  };
}

/**
 * Monthly totals for every employee this admin manages: payment (bank / cash with the split permission),
 * attendance, OT and PF, plus one line per employee.
 */
function adminSummary(token, ym) {
  const ctx = authAdmin_(token, 'viewSummary');
  ym = validYm_(ym);
  const data = payrollRows_(ctx, ym);
  const split = !!ctx.perms.viewSplit;
  const sum = (rows, k) => round2_(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0));
  const rows = data.rows;
  const pfRows = rows.filter(r => r.pf);
  const totals = {
    employees: rows.length, pfEmployees: pfRows.length,
    monthlySalary: sum(rows, 'salary'), earned: sum(rows, 'earned'), prorated: rows.some(r => r.prorated), otPay: sum(rows, 'otPay'),
    offDayPay: sum(rows, 'offDayPay'), arrears: sum(rows, 'arrears'), offWorkCredit: sum(rows, 'offWorkCredit'), leaveDed: sum(rows, 'leaveDed'),
    halfDayDed: sum(rows, 'halfDayDed'), lateCutDed: sum(rows, 'lateCutDed'), shortCutDed: sum(rows, 'shortCutDed'), advance: sum(rows, 'advance'),
    total: sum(rows, 'net'),
    present: sum(rows, 'present'), absent: rows.reduce((a, r) => a + r.absent + r.notJoined, 0), halfDay: sum(rows, 'halfDay'),
    leave: sum(rows, 'leave'), late: sum(rows, 'late'), lateMin: sum(rows, 'lateMin'), earlyMin: sum(rows, 'earlyMin'),
    otMin: sum(rows, 'otMin'), otPendingMin: sum(rows, 'otPendingMin'), missedCheckouts: sum(rows, 'missedCheckouts'),
    pfBasic: sum(pfRows, 'pfBankSalary'), pfEmployee: sum(pfRows, 'pfEmployee'), pfEmployer: sum(pfRows, 'pfEmployer'),
  };
  totals.pfTotal = round2_(totals.pfEmployee + totals.pfEmployer);
  if (split) {
    // Bank / cash is defined for PF employees; non-PF salaries are shown as their own line.
    totals.bank = sum(pfRows, 'bank');
    totals.cash = sum(pfRows, 'cash');
    totals.nonPfTotal = sum(rows.filter(r => !r.pf), 'net');
  }
  return {
    ym: ym, label: data.label, currency: data.currency, locked: data.locked, showSplit: split,
    totals: totals,
    rows: rows.map(r => ({
      id: r.id, name: r.name, present: r.present, absent: r.absent + r.notJoined, halfDay: r.halfDay, leave: r.leave,
      late: r.late, otMin: r.otMin, pf: r.pf, pfEmployee: r.pfEmployee, pfEmployer: r.pfEmployer, advance: r.advance,
      bank: split ? r.bank : undefined, cash: split ? r.cash : undefined, net: r.net, missed: r.missedCheckouts,
      advances: (r.advances || []).map(a => ({ id: a.id, note: a.note, amount: a.amount, monthly: a.monthly,
        startMonth: a.startMonth, wanted: a.wanted, deducted: a.deducted, balanceBefore: a.balanceBefore,
        balanceAfter: a.balanceAfter, changed: a.changed, changeNote: a.changeNote })),
      canEditAdvance: !!ctx.perms.manageAdvances && !data.locked && canEditEmployee_(ctx, r.id),
    })),
  };
}

/** One employee's calendar. Salary is hidden unless the admin has "View Payroll". */
function adminEmployeeMonth(token, empId, ym) {
  const ctx = authAdmin_(token, ['viewPayroll', 'viewSummary', 'editAttendance', 'approveRequests']);
  const emp = managedEmployee_(ctx, empId);
  const m = buildMonth_(emp, validYm_(ym));
  if (!ctx.perms.viewPayroll) delete m.pay;
  m.canEdit = !!ctx.perms.editAttendance && canEditEmployee_(ctx, emp.id) && !m.locked;
  m.canApproveOt = !!ctx.perms.approveRequests && canEditEmployee_(ctx, emp.id) && !m.locked;
  m.canPayslip = !!ctx.perms.viewPayroll;
  m.canManageAdvance = !!ctx.perms.manageAdvances && canEditEmployee_(ctx, emp.id) && !m.locked;
  hideSplit_(m, ctx.perms.viewSplit);
  m.minDate = ctx.minDate;
  // For the employee picker on the calendar: everyone this admin may see who worked in this month.
  m.employeeList = getEmployees_().filter(e => canManage_(ctx, e.id) && (e.id === emp.id || employedInMonth_(e, m.ym)))
    .map(e => ({ id: e.id, name: e.name }));
  return m;
}

/* ----------------------- Entries (back-dated) ---------------------- */

/** Employees this admin may pick in the "Entries" screen, plus the allowed date range. */
function adminEntryOptions(token) {
  const ctx = authAdmin_(token, 'editAttendance');
  return {
    employees: getEmployees_().filter(e => employedBetween_(e, ctx.minDate, todayStr_()) && canEditEmployee_(ctx, e.id))
      .map(e => ({ id: e.id, name: e.name + (e.active ? '' : ' (inactive)') })),
    minDate: ctx.minDate,
    maxDate: todayStr_(),
    bulkMaxDate: addDays_(todayStr_(), -1),
    overrides: OVERRIDE_VALUES,
  };
}

/** The attendance entry (if any) for one employee on one date. */
function adminGetEntry(token, empId, date) {
  const ctx = authAdmin_(token, 'editAttendance');
  const emp = managedEmployee_(ctx, empId, true);
  date = checkEntryDate_(ctx, date);
  const s = getSettings_();
  const off = offType_(date, s, getHolidays_());
  const rec = byDate_(readAttendance_(), emp.id)[date];
  return {
    empId: emp.id, name: emp.name, date: date, offType: off,
    exists: !!rec,
    in: rec ? rec.in : '', out: rec ? rec.out : '', override: rec ? rec.override : '', breaks: rec ? rec.breaks || '' : '',
    note: rec ? String(rec.note || '') : '', hasSelfie: !!(rec && rec.selfie),
    otApproved: rec ? rec.otApproved : '', otNeedsApproval: s.otApproval,
    flags: rec ? rec.flags : '', markedBy: markedBy_(rec),
    day: rec ? evaluateDay_(rec, s, off, date === todayStr_()) : null,
  };
}

/**
 * Adds or updates a (back-dated) entry.
 * entry = { empId, date, in: 'HH:mm', out: 'HH:mm', override: '' | PRESENT | HALF_DAY | ABSENT | LEAVE, note, otApproved }
 * With ym (the calendar's month) the answer is { entry, month }, so the page needs no second call.
 */
function adminSaveEntry(token, entry, ym) {
  const ctx = authAdmin_(token, 'editAttendance');
  const emp = managedEmployee_(ctx, entry && entry.empId, true);
  const date = checkEntryDate_(ctx, entry.date);
  const e = cleanEntry_(entry);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const data = entryContext_();
    const result = upsertEntry_(data, emp, date, e, ctx.emp, true);
    flushNewRows_(data);
    audit_(ctx.emp, result.created ? 'ADD_ENTRY' : 'EDIT_ENTRY', emp.id, date, result.before + ' → ' + entryText_(e));
  } finally {
    lock.releaseLock();
  }
  const en = adminGetEntry(token, emp.id, date);
  return ym ? { entry: en, month: adminEmployeeMonth(token, emp.id, ym) } : en;
}

function adminDeleteEntry(token, empId, date, ym) {
  const ctx = authAdmin_(token, 'editAttendance');
  const emp = managedEmployee_(ctx, empId, true);
  date = checkEntryDate_(ctx, date);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    forget_('att');
    const rec = byDate_(readAttendance_(), emp.id)[date];
    if (!rec) throw new Error('No entry for this date.');
    sheet_(SHEET.ATTENDANCE).deleteRow(rec.row);
    forget_('att');
    audit_(ctx.emp, 'DELETE_ENTRY', emp.id, date, entryText_(rec));
  } finally {
    lock.releaseLock();
  }
  return ym ? { entry: adminGetEntry(token, emp.id, date), month: adminEmployeeMonth(token, emp.id, ym) } : true;
}

/**
 * Fills many days at once (e.g. the days before the app went live). Only up to yesterday, so it can
 * never block a real check-in today.
 * opts = { empIds: [...], from, to, in, out, override, note, skipOff: true, overwrite: false }
 */
function adminBulkEntry(token, opts) {
  const ctx = authAdmin_(token, 'editAttendance');
  opts = opts || {};
  const from = checkEntryDate_(ctx, opts.from);
  const to = checkEntryDate_(ctx, opts.to);
  if (to < from) throw new Error('"To" date must be on or after "From" date.');
  if (to >= todayStr_()) throw new Error('Bulk fill goes up to yesterday only. Use "One day" for today.');
  const ids = (opts.empIds || []).map(x => String(x).toUpperCase()).filter((x, i, arr) => arr.indexOf(x) === i);
  if (!ids.length) throw new Error('Select at least one employee.');
  const emps = ids.map(id => managedEmployee_(ctx, id, true));
  const e = cleanEntry_(opts);
  const s = getSettings_();
  const holidays = getHolidays_();

  const dates = [];
  for (let d = from; d <= to; d = addDays_(d, 1)) {
    if (opts.skipOff !== false && offType_(d, s, holidays)) continue;
    dates.push(d);
    if (dates.length > 62) throw new Error('Please fill at most 62 days at a time.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let added = 0, updated = 0, skipped = 0;
    const data = entryContext_();
    emps.forEach(emp => dates.forEach(date => {
      if (!employedOn_(emp, date)) { skipped++; return; }
      const r = upsertEntry_(data, emp, date, e, ctx.emp, !!opts.overwrite);
      if (r.skipped) skipped++; else if (r.created) added++; else updated++;
    }));
    flushNewRows_(data);
    audit_(ctx.emp, 'BULK_ENTRY', ids.join(','), from + ' to ' + to,
      entryText_(e) + ' | added ' + added + ', updated ' + updated + ', skipped ' + skipped);
    return { added: added, updated: updated, skipped: skipped, days: dates.length };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------ Requests & OT approval ------------------- */

function adminRequests(token) {
  const ctx = authAdmin_(token, ['approveRequests', 'manageAdvances']);
  const s = getSettings_();
  // Leave / corrections need "Approve Requests"; advance requests need "Manage Advances".
  const allowed = r => (r.type === 'ADVANCE' ? ctx.perms.manageAdvances : ctx.perms.approveRequests);
  const reqs = readRequests_().filter(r => allowed(r) && canEditEmployee_(ctx, r.empId));
  const ym = todayStr_().slice(0, 7);
  const out = {
    pending: reqs.filter(r => r.status === 'PENDING').map(r => {
      if (r.type === 'LEAVE') {
        // Days in the leave on which the employee already checked in (they stay as worked).
        const mine = byDate_(readAttendance_(), r.empId), worked = [];
        for (let d = r.from; d <= r.to && worked.length < 31; d = addDays_(d, 1)) if (mine[d] && mine[d].in) worked.push(d);
        return Object.assign({}, r, { worked: worked });
      }
      if (r.type !== 'ADVANCE') return r;
      // Running advances of this employee, so the admin can add the new amount to one of them.
      const running = readAdvances_().filter(a => a.empId === r.empId && a.status !== 'CLOSED').map(a => {
        const st = advanceState_(a, ym);
        return { id: a.id, note: a.note, monthly: a.monthly, balance: st.balanceBefore };
      }).filter(a => a.balance > 0);
      return Object.assign({}, r, { running: running });
    }),
    recent: reqs.filter(r => r.status !== 'PENDING').reverse().slice(0, 20),
    otApproval: s.otApproval && !!ctx.perms.approveRequests,
    currentMonth: ym,
    currency: s.currency,
    ot: [],
  };
  if (out.otApproval) {
    const holidays = getHolidays_();
    const emps = {};
    getEmployees_().forEach(e => { emps[e.id] = e; });
    const since = ctx.minDate > addDays_(todayStr_(), -62) ? ctx.minDate : addDays_(todayStr_(), -62);
    readAttendance_().forEach(r => {
      if (r.date < since || r.otApproved || !r.out || !emps[r.empId] || !canEditEmployee_(ctx, r.empId)) return;
      if (isLocked_(r.date.slice(0, 7))) return;
      const d = evaluateDay_(r, s, offType_(r.date, s, holidays), false);
      if (d.otPending > 0) {
        out.ot.push({ empId: r.empId, name: emps[r.empId].name, date: r.date, in: r.in, out: r.out, otMin: d.otPending });
      }
    });
    out.ot.sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  return out;
}

/**
 * approve: true/false. leaveType overrides the employee's choice for leave requests (PAID / UNPAID).
 * For advance requests, adv = { amount, monthly, startMonth, mode: 'NEW' | 'ADD', advanceId }.
 */
function adminDecideRequest(token, id, approve, remark, leaveType, adv) {
  const ctx = authAdmin_(token, ['approveRequests', 'manageAdvances']);
  const r = readRequests_().filter(x => x.id === id)[0];
  if (!r) throw new Error('Request not found.');
  if (r.status !== 'PENDING') throw new Error('This request was already ' + r.status.toLowerCase() + '.');
  if (!(r.type === 'ADVANCE' ? ctx.perms.manageAdvances : ctx.perms.approveRequests)) {
    throw new Error('You do not have permission for this. Ask the super admin.');
  }
  const emp = managedEmployee_(ctx, r.empId, true);
  remark = String(remark || '').trim().slice(0, 300);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let summary = '';
    if (approve && r.type === 'ADVANCE') {
      adv = adv || {};
      const amount = Number(adv.amount || r.amount);
      const monthly = Number(adv.monthly || r.monthly);
      if (!(amount > 0)) throw new Error('Enter the advance amount.');
      if (!(monthly > 0)) throw new Error('Enter the monthly deduction.');
      const note = 'Request: ' + r.reason;
      if (adv.mode === 'ADD') {
        const a = readAdvances_().filter(x => x.id === adv.advanceId && x.empId === emp.id)[0];
        if (!a) throw new Error('Choose the running advance to add to.');
        topUpAdvance_(ctx, a, { add: amount, monthly: monthly, dateGiven: todayStr_(), note: note.slice(0, 100) });
        summary = 'added ' + amount + ' to advance ' + a.id + ', monthly ' + monthly;
      } else {
        const newId = createAdvance_(ctx, emp, { amount: amount, monthly: monthly, startMonth: adv.startMonth, dateGiven: todayStr_(), note: note });
        summary = 'new advance ' + newId + ': ' + amount + ', monthly ' + monthly;
      }
    } else if (approve) {
      const data = entryContext_();
      const s = data.s;
      if (r.type === 'LEAVE') {
        const lt = String(leaveType || r.leaveType || '').toUpperCase();
        if (lt !== 'PAID' && lt !== 'UNPAID') throw new Error('Choose Paid or Unpaid leave.');
        const paid = lt === 'PAID';
        let n = 0;
        const worked = [];
        for (let d = r.from; d <= r.to; d = addDays_(d, 1)) {
          assertUnlocked_(d);
          if (offType_(d, s, data.holidays)) continue;
          const rec = data.map[emp.id + '|' + d];
          // A day the employee already checked in on is kept as worked, never turned into leave.
          if (rec && rec.in) { worked.push(d); continue; }
          upsertEntry_(data, emp, d, {
            in: rec && rec.in ? rec.in : '', out: rec && rec.out ? rec.out : '',
            override: paid ? 'LEAVE' : 'ABSENT', note: (paid ? 'Paid' : 'Unpaid') + ' leave: ' + r.reason,
          }, ctx.emp, true);
          n++;
        }
        summary = (paid ? 'Paid' : 'Unpaid') + ' leave, ' + n + ' working day(s)' +
          (worked.length ? ', kept as worked: ' + worked.join(', ') : '');
        sheet_(SHEET.REQUESTS).getRange(r.row, 10).setValue(lt);
      } else {
        checkEntryDate_(ctx, r.from);
        const rec = data.map[emp.id + '|' + r.from];
        const e = cleanEntry_({
          in: r.in || (rec ? rec.in : ''), out: r.out || (rec ? rec.out : ''),
          note: 'Correction: ' + r.reason,
        });
        upsertEntry_(data, emp, r.from, e, ctx.emp, true);
        summary = entryText_(e);
      }
      flushNewRows_(data);
    }
    sheet_(SHEET.REQUESTS).getRange(r.row, 12, 1, 4).setValues([[approve ? 'APPROVED' : 'REJECTED', ctx.emp.id + ' ' + ctx.emp.name,
      Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), remark]]);
    forget_('requests');
    audit_(ctx.emp, approve ? 'APPROVE_REQUEST' : 'REJECT_REQUEST', emp.id, r.from + (r.to !== r.from ? ' to ' + r.to : ''),
      r.type + (summary ? ' | ' + summary : '') + (remark ? ' | ' + remark : ''));
  } finally {
    lock.releaseLock();
  }
  return adminRequests(token);
}

function adminDecideOt(token, empId, date, approve) {
  const ctx = authAdmin_(token, 'approveRequests');
  const emp = managedEmployee_(ctx, empId, true);
  date = toDateStr_(date);
  assertUnlocked_(date);
  forget_('att'); // the row number must come from the tab itself
  const rec = byDate_(readAttendance_(), emp.id)[date];
  if (!rec) throw new Error('Entry not found.');
  sheet_(SHEET.ATTENDANCE).getRange(rec.row, COL.OT_APPROVED + 1).setValue(approve ? 'YES' : 'NO');
  forget_('att');
  audit_(ctx.emp, approve ? 'APPROVE_OT' : 'REJECT_OT', emp.id, date, rec.in + '–' + rec.out);
  return true;
}

/* --------------------------- Employees ----------------------------- */

function adminStaff(token) {
  const ctx = authAdmin_(token, 'manageEmployees');
  return {
    canSetRole: ctx.perms.superAdmin,
    list: getPeople_().filter(e => canEditEmployee_(ctx, e.id)).map(e => ({
      id: e.id, name: e.name, salary: salaryFor_(e, todayStr_().slice(0, 7)), baseSalary: e.salary, role: e.role, active: e.active,
      joinDate: e.joinDate, phone: e.phone, anywhere: e.anywhere, periods: periods_(e), increments: incrementsOf_(e), shiftStart: e.shiftStart, shiftEnd: e.shiftEnd, hourlyOt: e.hourlyOt, morningOt: e.morningOt, gender: e.gender, leaderboard: e.leaderboard, lateCut: e.lateCut, birthDate: e.birthDate,
      face: readFaces_()[e.id] ? readFaces_()[e.id].at || 'yes' : '',
    })),
  };
}

/**
 * data = { isNew, id, name, pin (new only), salary (new only; later changes are increments), joinDate, phone,
 *          active + leftOn (when deactivating) / activeFrom (when activating again), anywhere,
 *          shiftStart, shiftEnd (blank = company shift), hourlyOt, gender ('M' / 'F' / ''), birthDate ('MM-DD', no year; blank clears), role (super admin only) }
 */
function adminSaveStaff(token, data) {
  const ctx = authAdmin_(token, 'manageEmployees');
  data = data || {};
  const name = String(data.name || '').trim();
  const salary = Number(data.salary);
  const joinDate = toDateStr_(data.joinDate) || todayStr_();
  const phone = String(data.phone || '').trim();
  if (!name) throw new Error('Enter the name.');
  if (data.isNew && (!isFinite(salary) || salary < 0)) throw new Error('Enter a valid monthly salary.');
  let role = String(data.role || 'EMPLOYEE').toUpperCase();
  if (!ctx.perms.superAdmin || ['EMPLOYEE', 'ADMIN', 'GUARD'].indexOf(role) < 0) role = null;
  if (role) roleValidation_(); // sheets set up before Guard existed still have the old Role dropdown

  const anywhere = data.anywhere === undefined ? null : !!data.anywhere;
  const timing = data.shiftStart === undefined ? null : shiftFields_(data);
  const gender = data.gender === undefined ? null : parseGender_(data.gender);
  const lateCut = data.lateCut === undefined ? null : data.lateCut !== false;
  const birthDate = data.birthDate === undefined ? null : toMonthDay_(data.birthDate);
  if (data.birthDate && !birthDate) throw new Error('Choose both the day and the month of the birthday.');
  const genderCell = g => (g === 'M' ? 'Male' : g === 'F' ? 'Female' : '');
  const sh = sheet_(SHEET.EMPLOYEES);
  ensureHeaders_(sh, EMP_HEADERS);
  const anyCol = headerIndex_(sh)['Mark From Anywhere'] + 1;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    forget_('employees');
    if (data.isNew) {
      const id = String(data.id || '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,20}$/.test(id)) throw new Error('Employee ID can use letters, numbers, - and _ only.');
      if (findEmployee_(id)) throw new Error('Employee ID ' + id + ' already exists.');
      const pin = validPin_(data.pin);
      const h = headerIndex_(sh);
      const row = new Array(Math.max(sh.getLastColumn(), EMP_HEADERS.length)).fill('');
      row[0] = id; row[1] = name; row[2] = hashPin_(pin); row[3] = salary; row[4] = role || 'EMPLOYEE';
      row[5] = 'Yes'; row[6] = "'" + joinDate; row[7] = phone;
      if (h['PF Active'] !== undefined) row[h['PF Active']] = 'No';
      row[anyCol - 1] = anywhere ? 'Yes' : 'No';
      if (timing) { const hh = headerIndex_(sh); row[hh['Shift Start']] = timing[0]; row[hh['Shift End']] = timing[1]; row[hh['Hourly OT']] = timing[2]; row[hh['Morning OT']] = timing[3]; }
      if (gender !== null) row[h['Gender']] = genderCell(gender);
      if (lateCut !== null) row[h['Late Cut']] = lateCut ? 'Yes' : 'No';
      if (birthDate) row[h['Birth Date']] = "'" + monthDayCell_(birthDate);
      sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
      forget_('employees');
      audit_(ctx.emp, 'ADD_EMPLOYEE', id, joinDate, name + ', salary ' + salary);
    } else {
      const emp = managedEmployee_(ctx, data.id, true);
      const active = data.active !== false;
      if (active !== emp.active) changeEmployment_(ctx, emp, active, active ? data.activeFrom : data.leftOn);
      if (toDateStr_(data.joinDate) && toDateStr_(data.joinDate) !== emp.joinDate) setFirstJoin_(emp, toDateStr_(data.joinDate));
      const row = empRow_(emp);
      const before = [emp.name, emp.salary, emp.joinDate, emp.phone, emp.active ? 'Active' : 'Inactive', emp.role].join(' / ');
      sh.getRange(row, 2).setValue(name); // the salary itself only changes through increments
      if (role && emp.role !== 'SUPER_ADMIN') sh.getRange(row, 5).setValue(role);
      sh.getRange(row, 6, 1, 3).setValues([[active ? 'Yes' : 'No', "'" + joinDate, phone]]);
      if (anywhere !== null) sh.getRange(row, anyCol).setValue(anywhere ? 'Yes' : 'No');
      if (lateCut !== null && lateCut !== emp.lateCut) {
        sh.getRange(row, headerIndex_(sh)['Late Cut'] + 1).setValue(lateCut ? 'Yes' : 'No');
        audit_(ctx.emp, 'EDIT_LATE_CUT', emp.id, '', 'Cut late / early from salary (no hourly OT): ' + (lateCut ? 'Yes' : 'No'));
      }
      if (birthDate !== null && birthDate !== emp.birthDate) {
        sh.getRange(row, headerIndex_(sh)['Birth Date'] + 1).setValue(birthDate ? "'" + monthDayCell_(birthDate) : '');
        audit_(ctx.emp, 'EDIT_BIRTH_DATE', emp.id, '', (emp.birthDate ? monthDayCell_(emp.birthDate) : '-') + ' → ' + (birthDate ? monthDayCell_(birthDate) : '-'));
      }
      if (gender !== null && gender !== emp.gender) {
        sh.getRange(row, headerIndex_(sh)['Gender'] + 1).setValue(genderCell(gender));
        audit_(ctx.emp, 'EDIT_GENDER', emp.id, '', (genderCell(emp.gender) || '-') + ' → ' + (genderCell(gender) || '-'));
      }
      if (timing) {
        const hh = headerIndex_(sh);
        sh.getRange(row, hh['Shift Start'] + 1).setValue(timing[0]);
        sh.getRange(row, hh['Shift End'] + 1).setValue(timing[1]);
        sh.getRange(row, hh['Hourly OT'] + 1).setValue(timing[2]);
        sh.getRange(row, hh['Morning OT'] + 1).setValue(timing[3]);
        if ((emp.shiftStart || '') + '-' + (emp.shiftEnd || '') + '-' + emp.hourlyOt + '-' + emp.morningOt !==
          String(timing[0]).replace("'", '') + '-' + String(timing[1]).replace("'", '') + '-' + (timing[2] === 'Yes') + '-' + (timing[3] === 'Yes')) {
          audit_(ctx.emp, 'EDIT_TIMING', emp.id, '', (timing[0] ? String(timing[0]).replace("'", '') + '–' + String(timing[1]).replace("'", '') : 'company shift') +
            ', hourly OT ' + timing[2] + ', morning OT ' + timing[3]);
        }
      }
      forget_('employees');
      audit_(ctx.emp, 'EDIT_EMPLOYEE', emp.id, '', before + (emp.anywhere ? ' / anywhere' : '') + ' → ' +
        [name, emp.salary, joinDate, phone, active ? 'Active' : 'Inactive', role || emp.role].join(' / ') +
        ((anywhere === null ? emp.anywhere : anywhere) ? ' / anywhere' : ''));
    }
  } finally {
    lock.releaseLock();
  }
  return adminStaff(token);
}

function adminResetPin(token, empId, newPin) {
  const ctx = authAdmin_(token, 'manageEmployees');
  const emp = managedEmployee_(ctx, empId, true);
  writePin_(emp, validPin_(newPin));
  cleanSessions_(emp.id); // logged out on their phones: they log in with the new PIN
  audit_(ctx.emp, 'RESET_PIN', emp.id, '', 'PIN reset');
  return true;
}

/* ------------------------------ PF -------------------------------- */

/** Employee list with PF settings for the admin "PF Setup" screen. */
function adminEmployees(token) {
  const ctx = authAdmin_(token, 'editPf');
  const s = getSettings_();
  return {
    currency: s.currency,
    showSplit: !!ctx.perms.viewSplit,
    defaults: { bank: s.pfBankPct, employee: s.pfEmployeePct, employer: s.pfEmployerPct },
    list: getEmployees_().filter(e => e.active && canEditEmployee_(ctx, e.id)).map(e => {
      // Current salary (with increments); percentage defaults rounded like the payroll.
      const now = Object.assign({}, e, { salary: salaryFor_(e, todayStr_().slice(0, 7)), baseSalary: baseSalary_(e) });
      const pf = pfAmounts_(now, s);
      const R = s.roundRupee ? Math.round : round2_;
      return {
        id: e.id, name: e.name, salary: now.salary, pfActive: e.pf.active,
        bankSalaryRaw: String(e.pf.bankSalary), employeeRaw: String(e.pf.employee), employerRaw: String(e.pf.employer),
        bankSalary: R(pf.bankSalary), employee: R(pf.employee), employer: R(pf.employer),
      };
    }),
  };
}

/** Turns PF on/off and sets the amounts for one employee. Blank = use % defaults from Settings. */
function adminSavePf(token, empId, data) {
  const ctx = authAdmin_(token, 'editPf');
  const emp = managedEmployee_(ctx, empId, true);
  const clean = v => {
    const str = String(v === undefined || v === null ? '' : v).trim();
    if (!str) return '';
    if (/^\d+(\.\d+)?%$/.test(str)) return str;
    if (isNaN(Number(str)) || Number(str) < 0) throw new Error('Invalid amount: ' + str);
    return Number(str);
  };
  const vals = [data && data.active ? 'Yes' : 'No', clean(data && data.bankSalary),
    clean(data && data.employee), clean(data && data.employer)];
  const sh = sheet_(SHEET.EMPLOYEES);
  ensureHeaders_(sh, EMP_HEADERS);
  const h = headerIndex_(sh);
  const row = empRow_(emp);
  ['PF Active', 'PF Bank Salary', 'PF Employee', 'PF Employer'].forEach((name, i) => {
    sh.getRange(row, h[name] + 1).setValue(vals[i]);
  });
  SpreadsheetApp.flush();
  forget_('employees');
  audit_(ctx.emp, 'EDIT_PF', emp.id, '', 'PF ' + vals[0] + ', bank ' + vals[1] + ', employee ' + vals[2] +
    ', employer ' + vals[3]);
  return adminEmployees(token);
}

/* ---------------------------- Advances ----------------------------- */

/* ---------------------------- Arrears ------------------------------ */

/** [{ id, empId, name, date, amount, reason, payMonth, note, auto, row }] */
function readArrears_() {
  return memo_('arrears', () => (sheetValues_(SHEET.ARREARS) || []).slice(1).map((r, i) => ({
    id: String(r[0]).trim(), empId: String(r[1]).trim().toUpperCase(), name: String(r[2] || ''), date: toDateStr_(r[3]),
    amount: round2_(Number(r[4]) || 0), reason: String(r[5] || '').trim(), payMonth: toYm_(r[6]), note: String(r[7] || ''),
    auto: /^(y|yes|true|1)$/i.test(String(r[8]).trim()), row: i + 2,
  })).filter(a => a.id && a.empId && a.amount > 0 && a.payMonth));
}

/** Arrears paid with emp's salary of ym. */
function arrearsFor_(empId, ym) {
  return readArrears_().filter(a => a.empId === empId && a.payMonth === ym);
}

/** Adds an arrears row. Callers hold the script lock. */
function createArrear_(byEmp, emp, amount, reason, payMonth, note, auto) {
  const id = 'R' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  sheetOrCreate_(SHEET.ARREARS, ARREAR_HEADERS).appendRow([id, emp.id, emp.name, "'" + todayStr_(), round2_(amount), reason.slice(0, 120),
    "'" + payMonth, String(note || '').slice(0, 200), auto ? 'Yes' : '', byEmp.id + ' ' + byEmp.name, Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm')]);
  forget_('arrears');
  audit_(byEmp, auto ? 'ADD_ARREARS_AUTO' : 'ADD_ARREARS', emp.id, payMonth + '-01', amount + ' · ' + reason);
  return id;
}

/** a = { id (edit) | empId (new), amount, reason, payMonth ('yyyy-MM'), note } */
function adminSaveArrear(token, a) {
  const ctx = authAdmin_(token, 'manageAdvances');
  a = a || {};
  const amount = round2_(Number(a.amount));
  const reason = String(a.reason || '').trim();
  const payMonth = toYm_(a.payMonth);
  if (!(amount > 0)) throw new Error('Enter the amount.');
  if (!reason) throw new Error('Enter the reason.');
  if (!payMonth) throw new Error('Choose the month whose salary pays it.');
  if (isLocked_(payMonth)) throw new Error('Payroll for ' + ymLabel_(payMonth) + ' is locked. Choose a later month.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    forget_('arrears');
    if (a.id) {
      const old = readArrears_().filter(x => x.id === a.id)[0];
      if (!old) throw new Error('Arrears not found. Reload and try again.');
      managedEmployee_(ctx, old.empId, true);
      if (isLocked_(old.payMonth)) throw new Error('Already paid with the ' + ymLabel_(old.payMonth) + ' salary (locked).');
      sheet_(SHEET.ARREARS).getRange(old.row, 5, 1, 4).setValues([[amount, reason.slice(0, 120), "'" + payMonth, String(a.note || '').slice(0, 200)]]);
      forget_('arrears');
      audit_(ctx.emp, 'EDIT_ARREARS', old.empId, payMonth + '-01', old.amount + ' → ' + amount + ' · ' + reason);
    } else {
      createArrear_(ctx.emp, managedEmployee_(ctx, a.empId, true), amount, reason, payMonth, a.note, false);
    }
  } finally {
    lock.releaseLock();
  }
  return adminAdvances(token);
}

function adminDeleteArrear(token, id) {
  const ctx = authAdmin_(token, 'manageAdvances');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    forget_('arrears');
    const old = readArrears_().filter(x => x.id === id)[0];
    if (!old) throw new Error('Arrears not found. Reload and try again.');
    managedEmployee_(ctx, old.empId, true);
    if (isLocked_(old.payMonth)) throw new Error('Already paid with the ' + ymLabel_(old.payMonth) + ' salary (locked).');
    sheet_(SHEET.ARREARS).deleteRow(old.row);
    forget_('arrears');
    audit_(ctx.emp, 'DELETE_ARREARS', old.empId, old.payMonth + '-01', old.amount + ' · ' + old.reason);
  } finally {
    lock.releaseLock();
  }
  return adminAdvances(token);
}

/** Unlocking a month: remember what each employee was paid (the locked gross), for correctionArrears_. */
function rememberLockedPay_(ym) {
  const props = PropertiesService.getScriptProperties(), key = 'paidBefore_' + ym;
  if (props.getProperty(key)) return; // unlocked before and not locked again since: keep the first (paid) amounts
  const paid = {}, extra = JSON.parse(props.getProperty('extraPaid_' + ym) || '{}');
  // Locked pay, plus increment back-pay already given as arrears for this month (else a re-lock pays it twice).
  getEmployees_().forEach(e => { const sn = getSnapshot_(ym, e.id); if (sn && sn.pay) paid[e.id] = round2_(sn.pay.gross + (extra[e.id] || 0)); });
  props.setProperty(key, JSON.stringify(paid));
}

/**
 * Locking a month again after it was unlocked and changed: when someone now gets more than was paid before, the
 * difference becomes arrears (marked auto) with the current month's salary. Less is not taken back.
 */
function correctionArrears_(ctx, ym, lockedNow) {
  const props = PropertiesService.getScriptProperties(), key = 'paidBefore_' + ym;
  const raw = props.getProperty(key);
  props.deleteProperty('extraPaid_' + ym); // the new locked pay includes any back-pay given for this month
  if (!raw) return;
  props.deleteProperty(key);
  const paid = JSON.parse(raw), payMonth = todayStr_().slice(0, 7), R = getSettings_().roundRupee ? Math.round : round2_;
  Object.keys(lockedNow).forEach(id => {
    if (paid[id] === undefined) return;
    const diff = R(lockedNow[id] - paid[id]);
    if (diff >= 1) createArrear_(ctx.emp, findEmployee_(id), diff, 'Correction – ' + ymLabel_(ym), payMonth,
      'Paid ' + paid[id] + ' before ' + ymLabel_(ym) + ' was unlocked; ' + lockedNow[id] + ' after the change', true);
  });
}

/**
 * A raise starting in a month that is already locked (paid): for each locked month from then on, what the salary
 * would have been with the raise (salary, OT and deductions at the new rate) minus what was paid → one arrears row.
 */
function incrementArrears_(ctx, emp, fromYm, amount) {
  const R = getSettings_().roundRupee ? Math.round : round2_;
  const months = Object.keys(getLocks_()).filter(k => k >= fromYm).sort();
  let total = 0;
  const props = PropertiesService.getScriptProperties();
  months.forEach(ym => {
    const sn = getSnapshot_(ym, emp.id);
    if (!sn || !sn.pay) return;
    const diff = round2_(Math.max(0, computeMonth_(findEmployee_(emp.id), ym).pay.gross - sn.pay.gross));
    total += diff;
    // Remember it as paid for that month (see rememberLockedPay_).
    const extra = JSON.parse(props.getProperty('extraPaid_' + ym) || '{}');
    extra[emp.id] = round2_((extra[emp.id] || 0) + diff);
    props.setProperty('extraPaid_' + ym, JSON.stringify(extra));
  });
  total = R(total);
  if (total >= 1) {
    createArrear_(ctx.emp, emp, total, 'Increment back-pay (' + ymLabel_(months[0]) + (months.length > 1 ? ' – ' + ymLabel_(months[months.length - 1]) : '') + ')',
      todayStr_().slice(0, 7), 'Increment of ' + amount + ' from ' + ymLabel_(fromYm) + '; these months were already paid', true);
  }
}

function adminAdvances(token) {
  const ctx = authAdmin_(token, 'manageAdvances');
  const s = getSettings_();
  const ym = todayStr_().slice(0, 7);
  const emps = getEmployees_().filter(e => canEditEmployee_(ctx, e.id));
  const names = {};
  emps.forEach(e => { names[e.id] = e.name; });
  const adv = readAdvMonths_();
  const list = readAdvances_().filter(a => names[a.empId]).map(a => {
    const st = advanceState_(a, ym);
    const changes = Object.keys(adv).filter(k => k.indexOf(a.id + '|') === 0)
      .map(k => ({ month: k.split('|')[1], amount: adv[k].amount, note: adv[k].note, locked: isLocked_(k.split('|')[1]) }))
      .filter(c => c.month >= ym || !c.locked)
      .sort((x, y) => (x.month < y.month ? -1 : 1));
    return Object.assign({}, a, {
      name: names[a.empId], deductedBefore: st.deductedBefore, thisMonth: st.thisMonth, thisMonthChanged: st.changed,
      balanceAfter: st.balanceAfter, repaid: st.balanceAfter <= 0 && !changes.some(c => c.month > ym), changes: changes,
    });
  }).reverse();
  const ongoing = {};
  list.forEach(a => {
    if (a.status !== 'CLOSED' && !a.repaid) ongoing[a.empId] = round2_((ongoing[a.empId] || 0) + a.balanceAfter + a.thisMonth);
  });
  // Arrears: pending ones, and paid ones from the last 6 months.
  const since = (() => { let k = ym; for (let i = 0; i < 6; i++) k = prevYm_(k); return k; })();
  const arrears = readArrears_().filter(a => names[a.empId] && (a.payMonth >= since || !isLocked_(a.payMonth)))
    .map(a => Object.assign({}, a, { name: names[a.empId], paid: isLocked_(a.payMonth) }))
    .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.row - x.row)); // newest first
  return {
    currency: s.currency, currentMonth: ym, list: list, arrears: arrears,
    employees: emps.filter(e => e.active).map(e => ({ id: e.id, name: e.name, ongoing: ongoing[e.id] || 0 })),
  };
}

/** data = { id (edit) | empId (new), amount, monthly, startMonth, dateGiven, note } */
function adminSaveAdvance(token, data) {
  const ctx = authAdmin_(token, 'manageAdvances');
  data = data || {};
  const monthly = Number(data.monthly);
  if (!(monthly > 0)) throw new Error('Enter the monthly deduction amount.');
  const note = String(data.note || '').trim().slice(0, 200);
  const sh = sheetOrCreate_(SHEET.ADVANCES, ADV_HEADERS);
  if (data.id) {
    const a = readAdvances_().filter(x => x.id === data.id)[0];
    if (!a) throw new Error('Advance not found.');
    managedEmployee_(ctx, a.empId, true);
    sh.getRange(a.row, 6).setValue(monthly);
    sh.getRange(a.row, 9).setValue(note);
    forget_('advances');
    audit_(ctx.emp, 'EDIT_ADVANCE', a.empId, a.id, 'monthly ' + a.monthly + ' → ' + monthly);
  } else {
    createAdvance_(ctx, managedEmployee_(ctx, data.empId, true), Object.assign({}, data, { monthly: monthly, note: note }));
  }
  return adminAdvances(token);
}

/** Creates a new advance; returns its id. data = { amount, monthly, startMonth, dateGiven, note } */
function createAdvance_(ctx, emp, data) {
  const amount = Number(data.amount);
  const monthly = Number(data.monthly);
  if (!(amount > 0)) throw new Error('Enter the advance amount.');
  if (!(monthly > 0)) throw new Error('Enter the monthly deduction amount.');
  const note = String(data.note || '').trim().slice(0, 200);
  const start = /^\d{4}-\d{2}$/.test(String(data.startMonth)) ? data.startMonth : todayStr_().slice(0, 7);
  if (isLocked_(start)) throw new Error('Payroll for ' + ymLabel_(start) + ' is locked. Start from a later month.');
  const id = 'A' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  sheetOrCreate_(SHEET.ADVANCES, ADV_HEADERS).appendRow([id, emp.id, emp.name, "'" + (toDateStr_(data.dateGiven) || todayStr_()),
    amount, monthly, "'" + start, 'ACTIVE', note, ctx.emp.id + ' ' + ctx.emp.name,
    Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm')]);
  forget_('advances');
  audit_(ctx.emp, 'ADD_ADVANCE', emp.id, start, id + ': amount ' + amount + ', monthly ' + monthly + (note ? ', ' + note : ''));
  return id;
}

/**
 * Adds more money to an advance that is already running (or re-opens a repaid / closed one).
 * data = { add, dateGiven, monthly (optional new instalment), note }
 */
function adminTopUpAdvance(token, id, data) {
  const ctx = authAdmin_(token, 'manageAdvances');
  const a = readAdvances_().filter(x => x.id === id)[0];
  if (!a) throw new Error('Advance not found.');
  managedEmployee_(ctx, a.empId, true);
  topUpAdvance_(ctx, a, data || {});
  return adminAdvances(token);
}

function topUpAdvance_(ctx, a, data) {
  const add = Number(data.add);
  if (!(add > 0)) throw new Error('Enter the extra amount given.');
  const monthly = data.monthly === '' || data.monthly === undefined || data.monthly === null ? a.monthly : Number(data.monthly);
  if (!(monthly > 0)) throw new Error('Enter a valid monthly deduction.');
  const date = toDateStr_(data.dateGiven) || todayStr_();
  const note = String(data.note || '').trim().slice(0, 100);

  const sh = sheet_(SHEET.ADVANCES);
  ensureHeaders_(sh, ADV_HEADERS);
  const line = date + ' +' + add + (note ? ' (' + note + ')' : '') + ' by ' + ctx.emp.name;
  sh.getRange(a.row, 5, 1, 2).setValues([[a.amount + add, monthly]]);
  if (a.status === 'CLOSED') sh.getRange(a.row, 8).setValue('ACTIVE');
  sh.getRange(a.row, 12).setValue(a.topUps.concat([line]).join('\n'));
  forget_('advances');
  audit_(ctx.emp, 'TOPUP_ADVANCE', a.empId, date, a.id + ': ' + a.amount + ' + ' + add + ' = ' + (a.amount + add) +
    (monthly !== a.monthly ? ', monthly ' + a.monthly + ' → ' + monthly : '') + (note ? ' | ' + note : ''));
}

/**
 * Changes the deduction of one advance for one month: amount 0 = skip that month, any other amount = deduct
 * that instead of the monthly instalment. amount '' (or null) removes the change (back to the normal instalment).
 */
function adminSetAdvanceMonth(token, id, ym, amount, note) {
  const ctx = authAdmin_(token, 'manageAdvances');
  const a = readAdvances_().filter(x => x.id === id)[0];
  if (!a) throw new Error('Advance not found.');
  managedEmployee_(ctx, a.empId, true);
  if (!/^\d{4}-\d{2}$/.test(String(ym))) throw new Error('Choose the month.');
  if (ym < a.startMonth) throw new Error('This advance starts in ' + ymLabel_(a.startMonth) + '.');
  if (isLocked_(ym)) throw new Error('Payroll for ' + ymLabel_(ym) + ' is locked.');
  const clear = amount === '' || amount === null || amount === undefined;
  const value = clear ? null : Number(amount);
  if (!clear && (!isFinite(value) || value < 0)) throw new Error('Enter a valid amount (0 to skip the month).');
  note = String(note || '').trim().slice(0, 200);

  const sh = sheetOrCreate_(SHEET.ADV_MONTHS, ADV_MONTH_HEADERS);
  const existing = readAdvMonths_()[a.id + '|' + ym];
  const before = existing ? existing.amount : 'normal (' + a.monthly + ')';
  if (clear) {
    if (existing) sh.deleteRow(existing.row);
  } else {
    const row = [a.id, a.empId, "'" + ym, value, note, ctx.emp.id + ' ' + ctx.emp.name,
      Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm')];
    if (existing) sh.getRange(existing.row, 1, 1, row.length).setValues([row]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  }
  forget_('advmonths');
  audit_(ctx.emp, 'ADVANCE_MONTH', a.empId, ym, a.id + ': ' + before + ' → ' + (clear ? 'normal (' + a.monthly + ')' : value === 0 ? 'skip' : value) + (note ? ' | ' + note : ''));
  return adminAdvances(token);
}

/** status: ACTIVE (resume) / PAUSED (skip deductions until resumed) / CLOSED (stop for good, e.g. repaid in cash). */
function adminSetAdvanceStatus(token, id, status) {
  const ctx = authAdmin_(token, 'manageAdvances');
  status = String(status).toUpperCase();
  if (['ACTIVE', 'PAUSED', 'CLOSED'].indexOf(status) < 0) throw new Error('Invalid status.');
  const a = readAdvances_().filter(x => x.id === id)[0];
  if (!a) throw new Error('Advance not found.');
  managedEmployee_(ctx, a.empId, true);
  sheet_(SHEET.ADVANCES).getRange(a.row, 8).setValue(status);
  forget_('advances');
  audit_(ctx.emp, 'ADVANCE_' + status, a.empId, a.id, a.status + ' → ' + status);
  return adminAdvances(token);
}

/* ------------------- Missed check-outs (auto at midnight) ---------- */

/**
 * Time-driven trigger (installed by setup, runs every hour). After midnight it closes every entry that
 * was checked in but never checked out, marks it for review and flags it. Only an admin can clear it.
 */
function autoCheckout() {
  sweepOpenEntries_(true);
  try { cleanupSelfies_(); } catch (e) { Logger.log('Selfie clean-up: ' + e); }
}

/**
 * Once a day (from the hourly trigger): check-in photos older than "Keep Selfies (days)" (default 60) are
 * moved to the Drive trash, where Google keeps them 30 more days before deleting them. Attendance records
 * are not touched; only the photo is gone.
 */
function cleanupSelfies_() {
  const s = getSettings_();
  if (!(s.keepSelfieDays > 0) || !s.selfieFolderId) return 0;
  const props = PropertiesService.getScriptProperties();
  const today = todayStr_();
  if (props.getProperty('selfieCleanupDay') === today) return 0;
  props.setProperty('selfieCleanupDay', today);
  let folder;
  try { folder = DriveApp.getFolderById(s.selfieFolderId); } catch (e) { return 0; }
  const cutoff = Date.now() - s.keepSelfieDays * 86400000;
  const started = Date.now();
  const files = folder.getFiles();
  let n = 0;
  while (files.hasNext() && Date.now() - started < 240000) { // stay well inside the 6-minute limit; the rest goes tomorrow
    const f = files.next();
    if (f.getDateCreated().getTime() < cutoff) { f.setTrashed(true); n++; }
  }
  if (n) audit_({ id: 'AUTO', name: 'Clean-up' }, 'DELETE_OLD_SELFIES', '', today, n + ' photo(s) older than ' + s.keepSelfieDays + ' days moved to the Drive trash');
  return n;
}

/** Closes forgotten check-outs. Also called when the app is opened, in case the trigger is missing. */
function sweepOpenEntries_(waitForLock) {
  const s = getSettings_();
  const today = todayStr_();
  const nowMin = toMinutes_(Utilities.formatDate(new Date(), tz_(), 'HH:mm'));
  const yesterday = addDays_(today, -1);
  const stillOpen = r => {
    if (!r.in || r.out || r.review || r.date >= today) return false;
    // Night shift still running: give it until Max Shift Hours before auto-closing.
    if (s.overnight && r.date === yesterday && nowMin + 1440 - toMinutes_(r.in) <= s.maxShiftHours * 60) return false;
    return true;
  };
  if (!readAttendance_().some(stillOpen)) return 0;

  const lock = LockService.getScriptLock();
  if (waitForLock) lock.waitLock(30000);
  else if (!lock.tryLock(200)) return 0; // busy (morning rush): the hourly trigger will do it
  try {
    forget_('att');
    const holidays = getHolidays_();
    const sh = sheet_(SHEET.ATTENDANCE);
    let n = 0;
    readAttendance_().filter(stillOpen).forEach(r => {
      if (isLocked_(r.date.slice(0, 7))) return;
      const d = evaluateDay_(r, s, offType_(r.date, s, holidays), false);
      sh.getRange(r.row, COL.STATUS + 1).setValue(d.status);
      sh.getRange(r.row, COL.FLAGS + 1).setValue((r.flags + ' NO_CHECKOUT').trim());
      sh.getRange(r.row, COL.REVIEW + 1).setValue('AUTO_CHECKOUT');
      n++;
    });
    if (n) {
      SpreadsheetApp.flush();
      forget_('att');
      audit_({ id: 'SYSTEM', name: 'Auto check-out' }, 'AUTO_CHECKOUT', '', today, n + ' entr' + (n === 1 ? 'y' : 'ies') + ' closed at midnight');
    }
    return n;
  } finally {
    lock.releaseLock();
  }
}

/** Missed check-outs waiting for an admin, for the employees this admin manages (oldest first). */
function missedFor_(ctx) {
  const names = {};
  getEmployees_().forEach(e => { names[e.id] = e.name; });
  return readAttendance_().filter(r => r.review === 'PENDING' && canManage_(ctx, r.empId))
    .map(r => ({ empId: r.empId, name: names[r.empId] || r.empId, date: r.date, in: r.in,
      canEdit: canEditEmployee_(ctx, r.empId) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
}

function adminMissedCount_(emp) {
  const perms = permsFor_(emp);
  if (!perms.viewToday) return 0;
  return missedFor_({ emp: emp, perms: perms }).length;
}

/**
 * Clears a missed check-out. With outTime the real check-out time is saved (hours, OT etc. recalculated);
 * without it the day stays as auto-closed (counted per "No Check-Out Counts As").
 */
function adminClearMissed(token, empId, date, outTime, note) {
  const ctx = authAdmin_(token, ['editAttendance', 'approveRequests']);
  const emp = managedEmployee_(ctx, empId, true);
  date = checkEntryDate_(ctx, date);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    forget_('att');
    const rec = byDate_(readAttendance_(), emp.id)[date];
    if (!rec || rec.review !== 'PENDING') throw new Error('Nothing to clear for this day.');
    const sh = sheet_(SHEET.ATTENDANCE);
    const out = toTimeStr_(outTime);
    let detail = 'kept as ' + getSettings_().noCheckoutStatus;
    if (out) {
      const e = cleanEntry_({ in: rec.in, out: out, override: rec.override });
      const s = getSettings_();
      const d = evaluateDay_({ empId: emp.id, date: date, in: e.in, out: e.out, override: e.override, breaks: rec.breaks, otApproved: rec.otApproved }, s,
        offType_(date, s, getHolidays_()), false);
      sh.getRange(rec.row, COL.OUT + 1, 1, 5).setValues([["'" + out, d.worked, d.status, d.late ? 'Yes' : '', d.ot]]);
      detail = 'check-out set to ' + out + ' → ' + d.status;
    }
    note = String(note || '').trim();
    if (note) sh.getRange(rec.row, COL.NOTE + 1).setValue([rec.note, note].filter(String).join(' · '));
    sh.getRange(rec.row, COL.REVIEW + 1).setValue(clearedText_(ctx.emp));
    SpreadsheetApp.flush();
    forget_('att');
    audit_(ctx.emp, 'CLEAR_MISSED_CHECKOUT', emp.id, date, 'in ' + rec.in + ', ' + detail + (note ? ' | ' + note : ''));
  } finally {
    lock.releaseLock();
  }
  return adminToday(token);
}

function reviewState_(v) {
  const str = String(v || '').trim().toUpperCase();
  if (str === 'AUTO_CHECKOUT') return 'PENDING';
  return str.indexOf('CLEARED') === 0 ? 'CLEARED' : '';
}

function clearedText_(byEmp) {
  return 'CLEARED by ' + byEmp.id + ' ' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');
}

/** Installable trigger: rows/tabs added or removed by hand → clear all cached tabs. */
function onSheetChange() {
  Object.keys(CACHED_SHEETS).forEach(k => dropSheetCache_(CACHED_SHEETS[k]));
}

/** (Re)creates the hourly trigger that runs autoCheckout() and the sheet-change trigger. */
function installAutoCheckoutTrigger_() {
  try {
    ScriptApp.getProjectTriggers().forEach(t => {
      const fn = t.getHandlerFunction();
      if (fn === 'autoCheckout' || fn === 'onSheetChange') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('autoCheckout').timeBased().everyHours(1).create();
    ScriptApp.newTrigger('onSheetChange').forSpreadsheet(SpreadsheetApp.getActive()).onChange().create();
  } catch (e) {
    Logger.log('Could not install the auto check-out trigger: ' + e);
  }
}

/* -------------------------- Payroll lock --------------------------- */

/** Freezes a finished month: salary, attendance and advance deductions are saved and can no longer change. */
function adminLockMonth(token, ym) {
  const ctx = authAdmin_(token, 'lockPayroll');
  ym = validYm_(ym);
  if (ym >= todayStr_().slice(0, 7)) throw new Error('Only finished months can be locked.');
  if (isLocked_(ym)) throw new Error(ymLabel_(ym) + ' is already locked.');
  const missed = readAttendance_().filter(r => r.review === 'PENDING' && r.date.indexOf(ym) === 0);
  if (missed.length) {
    throw new Error(missed.length + ' missed check-out(s) in ' + ymLabel_(ym) + ' still need an admin to clear them (Admin → Today).');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const att = readAttendance_().filter(r => r.date.indexOf(ym) === 0);
    const withRecords = {};
    att.forEach(r => { withRecords[r.empId] = true; });
    const lockedNow = {};
    const rows = getEmployees_().filter(e => employedInMonth_(e, ym) || withRecords[e.id]).map(e => {
      const m = computeMonth_(e, ym);
      lockedNow[e.id] = m.pay.gross;
      return ["'" + ym, e.id, e.name, JSON.stringify({ totals: m.totals, pay: m.pay, days: m.days, advances: m.advances, arrearItems: m.arrearItems })];
    });
    const snap = sheetOrCreate_(SHEET.SNAPSHOTS, SNAP_HEADERS);
    if (rows.length) snap.getRange(snap.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    sheetOrCreate_(SHEET.LOCKS, LOCK_HEADERS).appendRow(["'" + ym, ctx.emp.id + ' ' + ctx.emp.name,
      Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm')]);
    forget_('locks', 'snapshots');
    audit_(ctx.emp, 'LOCK_MONTH', '', ym, rows.length + ' employees');
    correctionArrears_(ctx, ym, lockedNow);
  } finally {
    lock.releaseLock();
  }
  return adminMonth(token, ym);
}

function superUnlockMonth(token, ym) {
  const ctx = authAdmin_(token, 'superAdmin');
  ym = validYm_(ym);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    rememberLockedPay_(ym);
    deleteRowsWhere_(SHEET.LOCKS, r => toYm_(r[0]) === ym);
    deleteRowsWhere_(SHEET.SNAPSHOTS, r => toYm_(r[0]) === ym);
    forget_('locks', 'snapshots');
    audit_(ctx.emp, 'UNLOCK_MONTH', '', ym, '');
  } finally {
    lock.releaseLock();
  }
  return adminMonth(token, ym);
}

/* ---------------------------- Misc admin --------------------------- */

/** Returns the check-in selfie as a data URL so admins can view it inside the app. */
/** which = 'out' for the check-out proof photo (face check-outs); otherwise the check-in selfie / photo. */
function adminGetSelfie(token, row, which) {
  const ctx = authAdmin_(token, ['viewToday', 'editAttendance']);
  const sh = sheet_(SHEET.ATTENDANCE);
  const vals = sh.getRange(Number(row), 1, 1, Math.min(ATT_HEADERS.length, sh.getMaxColumns())).getValues()[0];
  if (!canManage_(ctx, String(vals[COL.EMP]).trim().toUpperCase())) throw new Error('Not allowed.');
  const url = String((which === 'out' ? vals[COL.OUT_PHOTO] : vals[COL.SELFIE]) || '');
  const m = /\/d\/([\w-]+)/.exec(url) || /id=([\w-]+)/.exec(url);
  if (!m) throw new Error('No selfie for this entry.');
  const keep = getSettings_().keepSelfieDays;
  const gone = 'This photo was deleted automatically' + (keep > 0 ? ' (photos are kept for ' + keep + ' days)' : '') + '.';
  let file;
  try { file = DriveApp.getFileById(m[1]); } catch (e) { throw new Error(gone); }
  if (file.isTrashed()) throw new Error(gone);
  const blob = file.getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

/**
 * Attendance register (muster roll) for a month: two rows per employee (In time, Out time), one column per
 * day, then the totals. Days without times show a code (A, WO, H, L …). The page turns it into an Excel
 * file and merges the two rows where they hold the same thing. Locked months use the frozen snapshot.
 */
function adminAttendanceRegister(token, ym) {
  const ctx = authAdmin_(token, ['exportPayroll', 'viewPayroll', 'viewSummary']);
  ym = validYm_(ym);
  const s = getSettings_();
  const withRecords = {};
  readAttendance_().forEach(r => { if (r.date.indexOf(ym) === 0) withRecords[r.empId] = true; });
  const y = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7)), dim = new Date(y, mo, 0).getDate();
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  // Used when a day has no check-in time (Present / Half Day only when an admin set it without times).
  const CODE = { PRESENT: 'P', WORKING: 'P', HALF_DAY: 'HD', ABSENT: 'A', LEAVE: 'L', WEEK_OFF: 'WO', HOLIDAY: 'H',
    OFF_WORK: 'WO', NOT_JOINED: '-', INACTIVE: '-', NOT_MARKED: '', UPCOMING: '' };
  const hm = n => { n = Math.round(n || 0); return Math.floor(n / 60) + 'h ' + pad2_(n % 60) + 'm'; };
  const days = [];
  for (let d = 1; d <= dim; d++) days.push(d + ' ' + DOW[new Date(y, mo - 1, d).getDay()]);
  const header = ['Emp ID', 'Name', ''].concat(days).concat(['Present', 'Half Days', 'Absent', 'Paid Leave', 'Week Off',
    'OT (h m)', 'Late (h m)']);
  const rows = [];
  getEmployees_().filter(e => (employedInMonth_(e, ym) || withRecords[e.id]) && canManage_(ctx, e.id)).forEach(e => {
    const m = buildMonth_(e, ym), t = m.totals;
    const ins = [], outs = [];
    (m.days || []).forEach(d => {
      const code = d.planned && d.status !== 'LEAVE' ? '' : (CODE[d.status] !== undefined ? CODE[d.status] : d.status);
      const cleared = d.status === 'ABSENT' || d.status === 'LEAVE' || d.status === 'NOT_JOINED' || d.status === 'INACTIVE';
      if (d.in && !cleared) { ins.push(d.in); outs.push(d.out || (d.autoOut ? 'No out' : '')); }
      else { ins.push(code); outs.push(code); }
    });
    const tot = [t.present, t.halfDay, t.absent + (t.notJoined || 0), t.leave, t.weekOff + t.holiday + t.offWork,
      hm(t.otMin), hm(t.lateMin)];
    rows.push([e.id, e.name, 'In'].concat(ins).concat(tot));
    rows.push([e.id, e.name, 'Out'].concat(outs).concat(tot));
  });
  return {
    fileName: 'Attendance_Register_' + ym + '.xlsx',
    title: s.company + ' – Attendance register – ' + ymLabel_(ym),
    legend: 'Times = check-in (In row) and check-out (Out row). A = absent, L = paid leave, WO = weekly off, H = holiday, ' +
      'P / HD = present / half day set by an admin without times, - = not employed, blank = not yet. ' +
      'Week Off counts weekly offs and holidays. OT = time worked on full days − (full days × shift hours), plus weekly-off / holiday OT.',
    status: isLocked_(ym) ? 'Final (locked)' : (ym === todayStr_().slice(0, 7) ? 'Month in progress (up to today)' : 'Not locked'),
    header: header, rows: rows, rowsPerEmployee: 2, totalCols: 7,
  };
}

/**
 * Payroll table for a month. The page turns it into an Excel (.xlsx) file the admin downloads;
 * nothing is written to the Google Sheet.
 */
function adminExportPayroll(token, ym) {
  const ctx = authAdmin_(token, 'exportPayroll');
  const data = payrollRows_(ctx, validYm_(ym));
  const split = !!ctx.perms.viewSplit;
  const header = ['Emp ID', 'Name', 'Monthly Salary', 'Days Counted', 'Salary Earned', 'Present', 'Half Days',
    'Absent (Leaves)', 'Paid Leave', 'Week Off', 'Holidays', 'Worked on Off-Day', 'Late Marks', 'Late Mins',
    'Early Leaving Mins', 'OT Mins (gross)', 'OT Taken for Late/Early (mins)', 'OT Mins (net)', 'OT Hrs (net)', 'Per Day', 'Per Hour', 'Per Min',
    'OT Pay', 'Week-Off Work Days', 'Week-Off Work Pay', 'Arrears', 'Arrears Reason', 'Leave Deduction', 'Half Day Deduction', 'Late Cut Deduction', 'Late/Early Cut (no OT)', 'Advance Deduction', 'Gross Payable',
    'PF', 'Basic Salary (PF)', 'PF Employee', 'PF Employer']
    .concat(split ? ['In Bank', 'In Cash'] : []).concat(['Total Salary']);
  const rows = data.rows.map(r => [r.id, r.name, r.salary,
    (r.elapsedDays === undefined ? r.daysInMonth : r.elapsedDays) + ' / ' + r.daysInMonth,
    r.earned === undefined ? r.salary : r.earned, r.present, r.halfDay, r.absent + r.notJoined, r.leave,
    r.weekOff, r.holiday, r.offWork, r.late, r.lateMin, r.earlyMin || 0, otGross_(r), otGross_(r) - r.otMin, r.otMin, r.otHours, r.perDay,
    r.hourly, r.perMin, r.otPay, r.offWorkCredit || 0, r.offDayPay || 0, r.arrears || 0,
    (r.arrearItems || []).map(a => a.reason + ' ' + a.amount).join('; '), r.leaveDed, r.halfDayDed, r.lateCutDed, r.shortCutDed || 0, r.advance || 0, r.gross,
    r.pf ? 'Yes' : 'No', r.pf ? r.pfBankSalary : '', r.pf ? r.pfEmployee : '', r.pf ? r.pfEmployer : '',
  ].concat(split ? [r.pf ? r.bank : '', r.pf ? r.cash : ''] : []).concat([r.net]));
  const status = data.locked ? 'Final (locked by ' + data.locked.by + ' on ' + data.locked.at + ')'
    : data.ym === todayStr_().slice(0, 7) ? 'Provisional – month in progress (salary up to today)' : 'Provisional – not locked';
  audit_(ctx.emp, 'EXPORT_PAYROLL', '', data.ym, rows.length + ' employees (Excel)');
  return {
    fileName: 'Payroll_' + data.ym + '.xlsx',
    title: getSettings_().company + ' – Payroll ' + data.label,
    status: status,
    generated: Utilities.formatDate(new Date(), tz_(), 'dd MMM yyyy HH:mm') + ' by ' + ctx.emp.name,
    currency: data.currency,
    header: header,
    rows: rows,
    formulas: data.rows.map(r => payrollFormulas_(r, split)), // per row: { column: '=… [Other Column] …' }
    textCols: ['Emp ID', 'Name', 'Days Counted', 'PF', 'Arrears Reason'],
  };
}

/** Gross OT of a payroll row (months locked before it existed have only the net). */
function otGross_(r) { return r.otMinGross === undefined ? r.otMin : r.otMinGross; }

/**
 * Excel formulas for one payroll row, written with [Column Name] references (the page turns them into cells).
 * Each formula is the same calculation as calcPay_ and is included only when it gives exactly the number in the
 * row, so a month locked under older settings keeps plain numbers where they would differ.
 */
function payrollFormulas_(r, split) {
  const s = getSettings_(), emp = findEmployee_(r.id);
  if (!emp) return {};
  const es = empSettings_(emp, s);
  const R = s.roundRupee ? Math.round : round2_;
  const RF = x => 'ROUND(' + x + ',' + (s.roundRupee ? 0 : 2) + ')';
  const near = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.011;
  const dim = r.daysInMonth, basis = s.salaryDays > 0 ? s.salaryDays : dim;
  const perDay = r.salary / basis, perHour = es.standardHours > 0 ? perDay / es.standardHours : 0, perMin = perHour / 60;
  if (!near(round2_(perDay), r.perDay) || !near(round2_(perHour), r.hourly)) return {}; // rates changed since it was locked
  const f = { 'Per Day': '[Monthly Salary]/' + basis, 'Per Hour': es.standardHours > 0 ? '[Per Day]/' + es.standardHours : '0', 'Per Min': '[Per Hour]/60' };
  const add = (col, formula, value, actual) => { if (near(value, actual)) f[col] = formula; };
  const elapsed = r.elapsedDays === undefined ? dim : r.elapsedDays, full = elapsed >= dim || !(r.salary > 0);
  add('Salary Earned', full ? RF('[Monthly Salary]') : RF('MIN([Monthly Salary],' + elapsed + '*[Per Day])'), full ? R(r.salary) : R(Math.min(r.salary, elapsed * perDay)), r.earned);
  f['OT Mins (net)'] = '[OT Mins (gross)]-[OT Taken for Late/Early (mins)]';
  add('OT Hrs (net)', 'ROUND([OT Mins (net)]/60,2)', round2_(r.otMin / 60), r.otHours);
  add('OT Pay', RF('[OT Mins (net)]*[Per Min]*' + s.otMultiplier), R(r.otMin * perMin * s.otMultiplier), r.otPay);
  add('Week-Off Work Pay', RF('[Week-Off Work Days]*[Per Day]'), R((r.offWorkCredit || 0) * perDay), r.offDayPay || 0);
  add('Leave Deduction', RF('[Absent (Leaves)]*[Per Day]'), R((r.absent + r.notJoined) * perDay), r.leaveDed);
  add('Half Day Deduction', RF('[Half Days]*0.5*[Per Day]'), R(r.halfDay * 0.5 * perDay), r.halfDayDed);
  if (s.latesPerHalfDay > 0) {
    add('Late Cut Deduction', RF('FLOOR([Late Marks]/' + s.latesPerHalfDay + ',1)*0.5*[Per Day]'),
      R(Math.floor(r.late / s.latesPerHalfDay) * 0.5 * perDay), r.lateCutDed);
  }
  // Short minutes on full days of employees without hourly OT (not a column of its own).
  add('Late/Early Cut (no OT)', RF((r.shortMin || 0) + '*[Per Min]'), R((r.shortMin || 0) * perMin), r.shortCutDed || 0);
  add('Gross Payable', 'ROUND([Salary Earned]-MIN([Salary Earned],[Leave Deduction]+[Half Day Deduction]+[Late Cut Deduction]+[Late/Early Cut (no OT)])+[OT Pay]+[Week-Off Work Pay]+[Arrears],2)',
    round2_(r.earned - Math.min(r.earned, r.leaveDed + r.halfDayDed + r.lateCutDed + (r.shortCutDed || 0)) + r.otPay + (r.offDayPay || 0) + (r.arrears || 0)), r.gross);
  if (!r.pf) {
    add('Total Salary', 'ROUND([Gross Payable]-[Advance Deduction],2)', round2_(r.gross - (r.advance || 0)), r.net);
    return f;
  }
  // PF: bank / cash as in calcPay_ (a part that goes below zero is taken from the other part).
  const bank = s.adjustIn === 'BANK';
  const c1 = bank ? '([Salary Earned]-[Basic Salary (PF)])' : '([Gross Payable]-[Basic Salary (PF)]-[Advance Deduction])';
  const b1 = bank ? '([Gross Payable]-' + c1 + '-[PF Employee]-[Advance Deduction])' : '([Basic Salary (PF)]-[PF Employee])';
  const cv = bank ? r.earned - r.pfBankSalary : r.gross - r.pfBankSalary - (r.advance || 0);
  const bv = bank ? r.gross - cv - r.pfEmployee - (r.advance || 0) : r.pfBankSalary - r.pfEmployee;
  if (split) {
    add('In Bank', 'ROUND(MAX(0,' + b1 + '+MIN(0,' + c1 + ')),2)', round2_(Math.max(0, bv + Math.min(0, cv))), r.bank);
    add('In Cash', 'ROUND(MAX(0,MAX(0,' + c1 + ')+MIN(0,' + b1 + '+MIN(0,' + c1 + '))),2)', round2_(Math.max(0, Math.max(0, cv) + Math.min(0, bv + Math.min(0, cv)))), r.cash);
    add('Total Salary', 'ROUND([In Bank]+[In Cash],2)', round2_((r.bank || 0) + (r.cash || 0)), r.net);
  } else {
    add('Total Salary', 'ROUND(MAX(0,[Gross Payable]-[PF Employee]-[Advance Deduction]),2)', round2_(Math.max(0, r.gross - r.pfEmployee - (r.advance || 0))), r.net);
  }
  return f;
}

/* ------------------------- Super admin ----------------------------- */

/** All employees with their role and, for admins, their permissions. */
function superListAdmins(token) {
  authAdmin_(token, 'superAdmin');
  const saved = readPermissions_();
  const emps = getEmployees_().filter(e => e.active);
  return {
    permissions: PERMISSIONS,
    employees: emps.map(e => ({ id: e.id, name: e.name, role: e.role })),
    admins: emps.filter(e => e.role === 'ADMIN').map(e => ({
      id: e.id, name: e.name, perms: permsFor_(e, saved), configured: !!saved[e.id],
    })),
  };
}

/** perms = { viewToday: true, ..., employees: 'ALL' | ['E002', ...] } */
function superSavePermissions(token, empId, perms) {
  const ctx = authAdmin_(token, 'superAdmin');
  const emp = findEmployee_(String(empId).toUpperCase());
  if (!emp || emp.role !== 'ADMIN') throw new Error('This employee is not an admin.');
  perms = perms || {};
  const list = perms.employees === 'ALL' ? 'ALL'
    : (perms.employees || []).map(x => String(x).trim().toUpperCase()).filter(String).join(',');

  const sh = permSheet_();
  ensureHeaders_(sh, PERM_HEADERS);
  const h = headerIndex_(sh);
  const row = new Array(sh.getLastColumn()).fill('');
  row[h['Emp ID']] = emp.id;
  row[h['Name']] = emp.name;
  PERMISSIONS.forEach(p => { row[h[p.label]] = perms[p.key] ? 'Yes' : 'No'; });
  row[h['Allowed Employees']] = list || 'NONE';
  row[h['Updated By']] = ctx.emp.id;
  row[h['Updated At']] = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');

  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim().toUpperCase()) : [];
  const i = ids.indexOf(emp.id);
  const at = i >= 0 ? i + 2 : sh.getLastRow() + 1;
  sh.getRange(at, 1, 1, row.length).setValues([row]);
  forget_('perms');
  audit_(ctx.emp, 'SET_PERMISSIONS', emp.id, '',
    PERMISSIONS.filter(p => perms[p.key]).map(p => p.label).join(', ') + ' | employees: ' + (list || 'NONE'));
  return superListAdmins(token);
}

/** Makes an employee an ADMIN or turns an admin back into an EMPLOYEE. */
function superSetRole(token, empId, role) {
  const ctx = authAdmin_(token, 'superAdmin');
  role = String(role).toUpperCase();
  if (['ADMIN', 'EMPLOYEE'].indexOf(role) < 0) throw new Error('Invalid role.');
  const emp = findEmployee_(String(empId).toUpperCase());
  if (!emp) throw new Error('Employee not found.');
  if (emp.role === 'SUPER_ADMIN') throw new Error('Super admins can only be changed in the Employees sheet.');
  sheet_(SHEET.EMPLOYEES).getRange(empRow_(emp), 5).setValue(role);
  forget_('employees');
  audit_(ctx.emp, 'SET_ROLE', emp.id, '', emp.role + ' → ' + role);
  return superListAdmins(token);
}

/** Last 100 audit-log lines (newest first). */
function superAuditLog(token) {
  authAdmin_(token, 'superAdmin');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.AUDIT);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = Math.min(100, sh.getLastRow() - 1);
  return sh.getRange(sh.getLastRow() - n + 1, 1, n, AUDIT_HEADERS.length).getDisplayValues().reverse()
    .map(r => ({ at: r[0], by: r[1], action: r[2], emp: r[3], date: r[4], details: r[5] }));
}

/* ----------------------- Permission helpers ------------------------ */

function authAdmin_(token, need) {
  const emp = auth_(token, true);
  const perms = permsFor_(emp);
  const needs = [].concat(need);
  if (!needs.some(k => perms[k])) {
    throw new Error(emp.role === 'EMPLOYEE' ? 'Admin access only.' : 'You do not have permission for this. Ask the super admin.');
  }
  const s = getSettings_();
  return {
    emp: emp,
    perms: perms,
    minDate: perms.superAdmin || !(s.backDateDays > 0) ? '2000-01-01' : addDays_(todayStr_(), -s.backDateDays),
  };
}

/** Effective permissions of an employee. */
function permsFor_(emp, saved) {
  const none = { superAdmin: false, employees: [] };
  PERMISSIONS.forEach(p => { none[p.key] = false; });
  if (emp.role === 'SUPER_ADMIN') {
    const all = { superAdmin: true, employees: 'ALL' };
    PERMISSIONS.forEach(p => { all[p.key] = true; });
    return all;
  }
  if (emp.role === 'GUARD') return Object.assign(none, { markOthers: true, employees: 'ALL' });
  if (emp.role !== 'ADMIN') return none;

  saved = saved || readPermissions_();
  const row = saved[emp.id];
  if (!row) {
    // No super admin set up yet → admins keep full access (as before this feature).
    if (!getEmployees_().some(e => e.role === 'SUPER_ADMIN' && e.active)) {
      const legacy = { superAdmin: false, employees: 'ALL' };
      PERMISSIONS.forEach(p => { legacy[p.key] = p.key !== 'editOwn' && !/Leaders$/.test(p.key); });
      return legacy;
    }
    return Object.assign(none, { viewToday: true, employees: 'ALL' }); // safe default
  }
  return Object.assign({}, row);
}

function readPermissions_() {
  return memo_('perms', () => {
    const values = sheetValues_(SHEET.PERMISSIONS);
    const map = {};
    if (!values || values.length < 2) return map;
    const h = headerIndex_(null, values[0]);
    values.slice(1).forEach(r => {
      const id = String(r[0]).trim().toUpperCase();
      if (!id) return;
      const p = { superAdmin: false };
      PERMISSIONS.forEach(x => { p[x.key] = h[x.label] !== undefined && /^(y|yes|true|1)$/i.test(String(r[h[x.label]]).trim()); });
      const list = String(r[h['Allowed Employees']] || '').trim().toUpperCase();
      p.employees = list === 'ALL' ? 'ALL' : list.split(/[,\s]+/).filter(x => x && x !== 'NONE');
      map[id] = p;
    });
    return map;
  });
}

function permSheet_() {
  return sheetOrCreate_(SHEET.PERMISSIONS, PERM_HEADERS);
}

/** May this admin see / work with this employee at all? Admins never manage super admins. */
function canManage_(ctx, empId) {
  if (ctx.perms.superAdmin) return true;
  if (empId === ctx.emp.id) return true; // everyone can see their own data
  const target = findEmployee_(empId);
  if (target && (target.role === 'SUPER_ADMIN' || target.role === 'GUARD')) return false;
  const list = ctx.perms.employees;
  return list === 'ALL' || (list || []).indexOf(empId) >= 0;
}

/** May this admin change data of this employee? Own data needs the "Edit Own Entries" permission. */
/**
 * May this admin change data of this employee?
 * - Super admins: anyone.
 * - Admins: never another admin or a super admin, even with "All employees"; their own data only with
 *   the "Edit Own Entries" permission; everyone else within their employee scope.
 */
function canEditEmployee_(ctx, empId) {
  if (ctx.perms.superAdmin) return true;
  if (empId === ctx.emp.id) return !!ctx.perms.editOwn;
  const target = findEmployee_(empId);
  if (target && target.role !== 'EMPLOYEE') return false;
  return canManage_(ctx, empId);
}

function managedEmployee_(ctx, empId, forEdit) {
  const emp = findEmployee_(String(empId || '').trim().toUpperCase());
  if (!emp) throw new Error('Employee not found.');
  const ok = forEdit ? canEditEmployee_(ctx, emp.id) : canManage_(ctx, emp.id);
  if (!ok) {
    const why = forEdit && emp.id !== ctx.emp.id && emp.role !== 'EMPLOYEE' ? ' Only a super admin can change ' + (emp.role === 'GUARD' ? 'a guard' : 'an admin') + '\'s data.' : '';
    throw new Error('You are not allowed to ' + (forEdit ? 'change' : 'view') + ' ' + emp.name + '.' + why);
  }
  return emp;
}

function checkEntryDate_(ctx, date) {
  const d = toDateStr_(date);
  if (!d) throw new Error('Choose a valid date.');
  if (d > todayStr_()) throw new Error('Entries cannot be added for future dates.');
  if (d < ctx.minDate) throw new Error('You can only change entries from ' + ctx.minDate + ' onwards.');
  assertUnlocked_(d);
  return d;
}

function cleanEntry_(e) {
  const s = getSettings_();
  const out = {
    in: toTimeStr_(e.in), out: toTimeStr_(e.out),
    override: OVERRIDE_VALUES.indexOf(String(e.override || '').toUpperCase()) >= 0 ? String(e.override).toUpperCase() : '',
    note: String(e.note || '').trim().slice(0, 300),
  };
  if (e.breaks !== undefined) {
    out.breaks = cleanBreaks_(e.breaks);
    if (String(e.breaks || '').trim() && !out.breaks) throw new Error('Write the time away like 13:00-15:30 (several with ;).');
  }
  if (e.otApproved !== undefined) {
    const v = String(e.otApproved || '').toUpperCase();
    out.otApproved = v === 'YES' || v === 'NO' ? v : '';
  }
  if (out.out && !out.in) throw new Error('Enter the check-in time as well.');
  if (out.in && out.out && toMinutes_(out.out) <= toMinutes_(out.in)) {
    if (!s.overnight) throw new Error('Check-out must be after check-in.');
    if (toMinutes_(out.out) + 1440 - toMinutes_(out.in) > s.maxShiftHours * 60) {
      throw new Error('That shift is longer than ' + s.maxShiftHours + ' hours.');
    }
  }
  if (!out.in && !out.override) throw new Error('Enter a check-in time or choose a status (Present / Half Day / Absent / Leave).');
  return out;
}

/** Reads attendance once so many entries can be written quickly. */
function entryContext_() {
  forget_('att');
  const map = {};
  readAttendance_().forEach(r => { if (!map[r.empId + '|' + r.date]) map[r.empId + '|' + r.date] = r; });
  return { map: map, newRows: [], s: getSettings_(), holidays: getHolidays_(), sh: sheet_(SHEET.ATTENDANCE) };
}

function flushNewRows_(data) {
  if (data.newRows.length) {
    data.sh.getRange(data.sh.getLastRow() + 1, 1, data.newRows.length, ATT_HEADERS.length).setValues(data.newRows);
    data.newRows = [];
  }
  SpreadsheetApp.flush();
  forget_('att');
}

/** Creates or updates the row for emp + date. Location/selfie of an existing row are kept. */
function upsertEntry_(data, emp, date, e, byEmp, overwrite) {
  const rec = data.map[emp.id + '|' + date];
  if (rec && !overwrite) return { skipped: true };
  assertUnlocked_(date);

  const breaks = e.breaks !== undefined ? e.breaks : (rec ? rec.breaks || '' : '');
  const calc = evaluateDay_({ empId: emp.id, date: date, in: e.in, out: e.out, override: e.override, breaks: breaks, otApproved: e.otApproved || (rec ? rec.otApproved : '') },
    data.s, offType_(date, data.s, data.holidays), date === todayStr_());
  const note = e.note || ('Entered by ' + byEmp.name);
  const status = [e.in ? "'" + e.in : '', e.out ? "'" + e.out : '', calc.worked, calc.status, calc.late ? 'Yes' : '', calc.ot];

  if (rec && rec.row > 0) {
    data.sh.getRange(rec.row, COL.IN + 1, 1, status.length).setValues([status]);
    data.sh.getRange(rec.row, COL.OVERRIDE + 1, 1, 2).setValues([[e.override, note]]);
    if (e.otApproved !== undefined) data.sh.getRange(rec.row, COL.OT_APPROVED + 1).setValue(e.otApproved);
    if (e.breaks !== undefined && e.breaks !== (rec.breaks || '')) data.sh.getRange(rec.row, breaksCol_(data.sh)).setValue(e.breaks);
    if (rec.review === 'PENDING') data.sh.getRange(rec.row, COL.REVIEW + 1).setValue(clearedText_(byEmp));
    return { created: false, before: entryText_(rec) + (rec.review === 'PENDING' ? ' (missed check-out)' : '') };
  }
  if (rec) return { skipped: true }; // created earlier in this same batch
  const row = new Array(ATT_HEADERS.length).fill('');
  row[COL.DATE] = "'" + date;
  row[COL.EMP] = emp.id;
  row[COL.NAME] = emp.name;
  status.forEach((v, i) => { row[COL.IN + i] = v; });
  row[COL.OVERRIDE] = e.override;
  row[COL.NOTE] = note;
  row[COL.OT_APPROVED] = e.otApproved || '';
  if (e.breaks) { row[COL.BREAKS] = e.breaks; breaksCol_(data.sh); }
  data.newRows.push(row);
  data.map[emp.id + '|' + date] = { row: -1 };
  return { created: true, before: '(none)' };
}

function entryText_(e) {
  return [e.in ? 'in ' + e.in : '', e.out ? 'out ' + e.out : '', e.breaks ? 'away ' + e.breaks : '', e.override || ''].filter(String).join(' ') || '(empty)';
}

function audit_(byEmp, action, empId, date, details) {
  const sh = sheetOrCreate_(SHEET.AUDIT, AUDIT_HEADERS);
  sh.appendRow([Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm:ss'), byEmp.id + ' ' + byEmp.name,
    action, empId, date, details]);
}

/* ------------------------------------------------------------------ */
/* Attendance / salary calculation                                     */
/* ------------------------------------------------------------------ */

/** Month view: the frozen snapshot for locked months, a live calculation otherwise. */
function buildMonth_(emp, ym) {
  const s = getSettings_();
  const es = empSettings_(emp, s);
  const lock = getLocks_()[ym];
  const snap = lock ? getSnapshot_(ym, emp.id) : null;
  const m = snap || computeMonth_(emp, ym);
  m.employee = { id: emp.id, name: emp.name };
  m.ym = ym;
  m.label = ymLabel_(ym);
  m.currency = s.currency;
  m.locked = lock ? { by: lock.by, at: lock.at } : null;
  m.inProgress = ym === todayStr_().slice(0, 7);
  m.rules = {
    shiftStart: minutesToStr_(es.shiftStartMin), shiftEnd: minutesToStr_((es.shiftStartMin + Math.round(es.standardHours * 60)) % 1440),
    lateGrace: s.lateGrace, standardHours: es.standardHours, fullDayHours: es.fullDayHours, halfDayHours: es.halfDayHours,
    hourlyOt: es.hourlyOt !== false, morningOt: es.morningOt !== false, monthlyOt: true,
    otMultiplier: s.otMultiplier, latesPerHalfDay: s.latesPerHalfDay, salaryDays: s.salaryDays,
    lateReducesOt: s.lateReducesOt, earlyReducesOt: s.earlyReducesOt, adjustIn: s.adjustIn, otApproval: s.otApproval,
    noCheckoutStatus: s.noCheckoutStatus,
    weekOff: s.woFullHours > 0 ? { start: minutesToStr_(s.woStartMin), end: minutesToStr_(s.woEndMin), half: s.woHalfHours, full: s.woFullHours } : null,
  };
  return m;
}

function computeMonth_(emp, ym) {
  const s = getSettings_();
  const att = readAttendance_().filter(r => r.date.indexOf(ym) === 0);
  const adv = advancesForMonth_(emp.id, ym);
  emp = Object.assign({}, emp, { salary: salaryFor_(emp, ym), baseSalary: baseSalary_(emp) }); // increments in effect that month
  const arr = arrearsFor_(emp.id, ym);
  const m = monthSummary_(emp, ym, s, byDate_(att, emp.id), getHolidays_(), adv.total, arr.reduce((n, a) => n + a.amount, 0));
  m.arrearItems = arr.map(a => ({ id: a.id, amount: a.amount, reason: a.reason, auto: a.auto }));
  // The salary may not cover every instalment: recover what it can, in order.
  let left = m.pay.advance;
  adv.items.forEach(a => {
    a.deducted = round2_(Math.min(a.wanted, left));
    left -= a.deducted;
    a.balanceAfter = round2_(Math.max(0, a.balanceBefore - a.deducted));
  });
  m.advances = adv.items;
  return m;
}

/**
 * Minutes worked on a working day for the monthly OT. An admin status without times counts as the full
 * (Present) or half (Half Day) shift. "Morning OT" off: time before the shift start does not count.
 */
/** Minutes of one day worked inside the shift hours (start → start + Standard Hours), without time away. */
function dayInsideMin_(rec, es) {
  const shift = Math.round(es.standardHours * 60);
  const inMin = toMinutes_(rec.in);
  let outMin = toMinutes_(rec.out);
  if (inMin == null || outMin == null) return dayWorkedMin_(rec, es); // Present / Half Day set without times
  if (outMin <= inMin && es.overnight) outMin += 1440;
  const a = Math.max(inMin, es.shiftStartMin), b = Math.min(outMin, es.shiftStartMin + shift);
  return b > a ? Math.max(0, b - a - breakOverlap_(rec.breaks, a, b)) : 0;
}

function dayWorkedMin_(rec, es) {
  const inMin = toMinutes_(rec.in);
  let outMin = toMinutes_(rec.out);
  const shift = Math.round(es.standardHours * 60);
  if (rec.override === 'ABSENT' || rec.override === 'LEAVE') return 0;
  if (inMin == null || outMin == null) {
    if (rec.override === 'PRESENT') return shift;
    if (rec.override === 'HALF_DAY') return Math.round(shift / 2);
    return 0;
  }
  if (outMin <= inMin && es.overnight) outMin += 1440;
  const from = es.morningOt === false ? Math.max(inMin, es.shiftStartMin) : inMin;
  return Math.max(0, outMin - from - breakOverlap_(rec.breaks, from, outMin));
}

/**
 * Status of one attendance record.
 * offType: '' for a working day, 'WEEK_OFF' or 'HOLIDAY' otherwise.
 */
function evaluateDay_(rec, s, offType, isToday) {
  if (rec.empId) s = empSettings_(findEmployee_(rec.empId), s); // own shift timing / no hourly OT
  if (rec.date) s = shortenDay_(s, rec.date); // office closing early that day
  const inMin = toMinutes_(rec.in);
  let outMin = toMinutes_(rec.out);
  if (inMin != null && outMin != null && outMin <= inMin && s.overnight) outMin += 1440; // next-day check-out
  const workedMin = inMin != null && outMin != null && outMin > inMin ? outMin - inMin - breakOverlap_(rec.breaks, inMin, outMin) : 0;
  const d = {
    in: rec.in || '', out: rec.out || '', worked: round2_(workedMin / 60), ot: 0, otMin: 0, otPending: 0,
    late: false, lateMin: 0, earlyMin: 0, status: '', overnight: outMin != null && outMin >= 1440,
  };
  if (rec.breaks) { d.breaks = rec.breaks; d.breakMin = breakTotal_(rec.breaks); }

  if (rec.override) d.status = rec.override;
  else if (offType) d.status = inMin != null ? 'OFF_WORK' : offType;
  else if (inMin == null) d.status = 'ABSENT';
  else if (outMin == null) d.status = isToday ? 'WORKING' : s.noCheckoutStatus;
  else if (d.worked >= s.fullDayHours) d.status = 'PRESENT';
  else if (d.worked >= s.halfDayHours) d.status = 'HALF_DAY';
  else d.status = 'ABSENT';

  // Leave / Absent set by an admin clear the late & early marks; Present / Half Day keep them.
  if (rec.review === 'PENDING') d.autoOut = true; // forgot to check out; auto-closed at midnight
  const cleared = rec.override === 'LEAVE' || rec.override === 'ABSENT';
  d.late = !cleared && !offType && inMin != null && inMin > s.shiftStartMin + s.lateGrace;
  d.lateMin = d.late ? inMin - s.shiftStartMin : 0;
  const shiftEnd = s.shiftStartMin + s.standardHours * 60;
  if (!cleared && !offType && d.status === 'PRESENT' && outMin != null && outMin < shiftEnd) d.earlyMin = shiftEnd - outMin;

  let otMin = 0;
  if (offType === 'WEEK_OFF' && s.woFullHours > 0 && !rec.override) {
    // Working on the weekly off: hours inside the week-off shift earn a half / full day's extra pay,
    // time before its start or after its end is OT. Nothing is counted until the check-out.
    if (workedMin > 0) {
      const wa = Math.max(inMin, s.woStartMin), wb = Math.min(outMin, s.woEndMin);
      const inside = Math.max(0, wb - wa - (wb > wa ? breakOverlap_(rec.breaks, wa, wb) : 0));
      d.offInsideMin = inside;
      d.offCredit = inside >= s.woFullHours * 60 ? 1 : (inside >= s.woHalfHours * 60 ? 0.5 : 0);
      otMin = workedMin - inside;
    }
  } else if (d.status !== 'ABSENT' && d.status !== 'LEAVE') {
    otMin = offType ? (s.offDayOt ? workedMin : 0)
      : s.hourlyOt === false ? 0
      : s.morningOt === false ? Math.max(0, outMin - shiftEnd - breakOverlap_(rec.breaks, shiftEnd, outMin)) // evening OT only
      : Math.max(0, workedMin - s.standardHours * 60);
  }
  if (s.otBlock > 0) otMin = Math.floor(otMin / s.otBlock) * s.otBlock;
  if (s.maxOtPerDay > 0) otMin = Math.min(otMin, s.maxOtPerDay);
  if (otMin > 0 && s.otApproval && rec.otApproved !== 'YES') {
    d.otPending = rec.otApproved === 'NO' ? 0 : otMin;
    d.otRejected = rec.otApproved === 'NO';
    otMin = 0;
  }
  d.otMin = otMin;
  d.ot = round2_(otMin / 60);
  return d;
}

function monthSummary_(emp, ym, s, attByDate, holidays, advanceTotal, arrearsTotal) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const dim = new Date(y, m, 0).getDate();
  const today = todayStr_();
  const t = {
    daysInMonth: dim, present: 0, halfDay: 0, absent: 0, leave: 0, weekOff: 0, holiday: 0, offWork: 0, offWorkCredit: 0,
    notJoined: 0, late: 0, lateMin: 0, earlyMin: 0, workedHours: 0, otMinGross: 0, otMin: 0, otHours: 0,
    otExtraMin: 0, otShortMin: 0, otPendingMin: 0, missedCheckouts: 0, deductDays: 0, lateCutDays: 0, payableDays: 0,
    workDays: 0, targetMin: 0, workedMin: 0, offDayOtMin: 0, halfDayExtraMin: 0, absentWorkMin: 0, shortMin: 0,
  };
  const days = [];
  const es = empSettings_(emp, s); // own shift length / hourly OT / morning OT
  const per = periods_(emp);
  const firstJoin = (per[0] || {}).from || '';
  for (let day = 1; day <= dim; day++) {
    const ds = ym + '-' + pad2_(day);
    const off = offType_(ds, s, holidays);
    const rec = attByDate[ds];
    let d;
    if (!employedOn_(emp, ds, per)) d = { status: ds < firstJoin ? 'NOT_JOINED' : 'INACTIVE', planned: ds >= today }; // today+ not counted yet
    else if (ds > today) d = rec && rec.override === 'LEAVE' ? { status: 'LEAVE', planned: true } : { status: off || 'UPCOMING' };
    else if (rec) d = evaluateDay_(rec, s, off, ds === today);
    else if (off) d = { status: off };
    else d = { status: ds === today ? 'NOT_MARKED' : 'ABSENT' };

    d.date = ds;
    d.day = day;
    d.dow = new Date(y, m - 1, day).getDay();
    if (off === 'HOLIDAY') d.holidayName = holidays[ds];
    if (rec && rec.note) d.note = String(rec.note);
    if (rec && rec.flags) d.flags = rec.flags;
    if (rec && /PROXY/.test(rec.flags)) d.markedBy = markedBy_(rec);
    if (d.autoOut) t.missedCheckouts++;
    days.push(d);
    if (d.planned) continue; // future leave is shown but not counted yet

    switch (d.status) {
      case 'PRESENT': case 'WORKING': t.present++; break;
      case 'HALF_DAY': t.halfDay++; t.deductDays += 0.5; break;
      case 'ABSENT': t.absent++; t.deductDays += 1; break;
      case 'LEAVE': t.leave++; break;
      case 'WEEK_OFF': t.weekOff++; break;
      case 'HOLIDAY': t.holiday++; break;
      case 'OFF_WORK': t.offWork++; t.offWorkCredit += d.offCredit || 0; break;
      case 'NOT_JOINED': case 'INACTIVE': t.notJoined++; t.deductDays += 1; break;
    }
    if (d.late) { t.late++; t.lateMin += d.lateMin || 0; }
    t.earlyMin += d.earlyMin || 0;
    t.workedHours += d.worked || 0;

    // Monthly OT (see below): each full working day counts Standard Hours; today only once checked out.
    // Absent days are left out: their salary is already cut, so they must not cut OT as well. A half day is
    // paid for half the shift: time beyond that adds to OT, time short of it cuts nothing. A day that is
    // Absent because too few hours were worked: those hours are paid as OT (the day's salary is still cut).
    // An Absent / Leave set by an admin counts no hours.
    // Paid leave and days without a check-out (until an admin fixes them) are left out too.
    // Weekly offs / holidays have their own rule.
    // d.dayOtMin = what this day adds to (or, when short, takes from) the month's OT, for the day pop-up.
    const hourly = es.hourlyOt !== false;
    const esD = shortenDay_(es, ds); // short day: the shift ends when the office closes
    if (esD.shortDay) d.closeAt = esD.shortDay.closeAt;
    if (off) { t.offDayOtMin += d.otMin || 0; t.otPendingMin += d.otPending || 0; d.dayOtMin = d.otMin || 0; }
    else if (!d.autoOut && rec && (ds < today || rec.out)) {
      const shift = Math.round(esD.standardHours * 60);
      if (d.status === 'PRESENT' || d.status === 'WORKING') {
        const w = dayWorkedMin_(rec, esD);
        const inside = Math.min(w, dayInsideMin_(rec, esD));
        t.otExtraMin += w - inside; // worked before / after the shift
        t.otShortMin += shift - inside; // shift time not worked: late coming, early leaving, time away
        t.workDays++;
        t.targetMin += shift;
        t.workedMin += w;
        d.dayOtMin = hourly ? w - shift : 0;
        // No hourly OT: there is no OT to take short time from, so late coming / early leaving on a full day
        // is cut from the salary by the minute (unless "Late Cut" is off for this employee).
        if (!hourly && es.lateCut !== false && w < shift) { t.shortMin += shift - w; d.shortCutMin = shift - w; }
      } else if (d.status === 'HALF_DAY') {
        const w = dayWorkedMin_(rec, esD);
        t.halfDayExtraMin += Math.max(0, w - Math.round(shift / 2));
        d.dayOtMin = hourly ? Math.max(0, w - Math.round(shift / 2)) : 0;
      } else if (d.status === 'ABSENT') {
        const w = dayWorkedMin_(rec, esD);
        t.absentWorkMin += w;
        d.dayOtMin = hourly ? w : 0;
      }
    }
  }

  // OT for the month = total minutes worked on full days − (full days × Standard Hours × 60), plus time
  // beyond half the shift on half days, plus the hours of days counted Absent (too few hours), plus OT
  // from weekly-off / holiday work. Coming late or leaving early is already inside the worked minutes.
  // No hourly OT for this employee → only the weekly-off / holiday part.
  const weekdayOt = es.hourlyOt === false ? 0 : Math.max(0, t.workedMin - t.targetMin);
  t.earlyExitOtMin = es.hourlyOt === false ? 0 : t.halfDayExtraMin + t.absentWorkMin; // left out of the leaderboard
  // Gross = all OT earned before late coming / early leaving is taken off; net = what is paid.
  // (weekdayOt = extra − short, never below zero, so gross − net = the late / early minutes taken from OT.)
  t.otMin = weekdayOt + t.earlyExitOtMin + t.offDayOtMin;
  t.otMinGross = (es.hourlyOt === false ? 0 : t.otExtraMin) + t.earlyExitOtMin + t.offDayOtMin;
  t.otCutMin = t.otMinGross - t.otMin;
  t.otHours = round2_(t.otMin / 60);
  t.workedHours = round2_(t.workedHours);
  t.lateCutDays = s.latesPerHalfDay > 0 ? Math.floor(t.late / s.latesPerHalfDay) * 0.5 : 0;
  t.deductDays += t.lateCutDays;
  t.payableDays = Math.max(0, dim - t.deductDays);

  // Days of the month that have passed: the whole month for past months; for the current month the days
  // up to yesterday, plus today once the employee has checked in. Salary is earned only for these days.
  const thisYm = today.slice(0, 7);
  if (ym < thisYm) t.elapsedDays = dim;
  else if (ym > thisYm) t.elapsedDays = 0;
  else {
    const todayRec = attByDate[today];
    t.elapsedDays = Number(today.slice(8, 10)) - 1 + (todayRec && todayRec.in ? 1 : 0);
  }
  t.elapsedUntil = t.elapsedDays ? ym + '-' + pad2_(t.elapsedDays) : '';

  return { totals: t, pay: calcPay_(emp, s, t, dim, advanceTotal || 0, arrearsTotal || 0), days: days };
}

/**
 * Salary for the month.
 *   Per day = salary ÷ Salary Days Basis (30), per hour = per day ÷ Standard Hours, per minute = per hour ÷ 60.
 *   Earned  = salary × days passed ÷ days in month (the full salary once the month is over).
 *   Gross   = earned + OT pay + week-off work pay − leave − half-day − late-cut deductions.
 *   Net     = Gross − advance instalment (− PF employee for PF employees).
 * PF employees: Bank = PF Bank Salary − PF Employee, Cash = Salary − PF Bank Salary, and OT/deductions/advance
 * are applied to Cash (or Bank, per the "OT & Deductions Paid In" setting).
 */
function calcPay_(emp, s, t, dim, advanceWanted, arrears) {
  s = empSettings_(emp, s);
  const R = s.roundRupee ? Math.round : round2_;
  const basis = s.salaryDays > 0 ? s.salaryDays : dim;
  const perDay = emp.salary / basis;
  const perHour = s.standardHours > 0 ? perDay / s.standardHours : 0;
  const perMin = perHour / 60;

  // Month in progress: days passed × the day rate (salary ÷ Salary Days Basis), so 11 days of ₹90,000 = ₹33,000
  // in any month. A finished month is always the full salary (no extra pay in 31-day months, nothing missing in
  // February). PF / Basic Salary use the same share.
  const elapsed = t.elapsedDays === undefined ? dim : t.elapsedDays;
  const ratio = elapsed >= dim || !(emp.salary > 0) ? 1 : Math.min(1, elapsed * perDay / emp.salary);
  const earned = R(emp.salary * ratio);

  const leaveDed = R((t.absent + t.notJoined) * perDay);
  const halfDayDed = R(t.halfDay * 0.5 * perDay);
  const lateCutDed = R(t.lateCutDays * perDay);
  const shortCutDed = R((t.shortMin || 0) * perMin); // late / early on full days, employees without hourly OT
  const deduction = Math.min(earned, leaveDed + halfDayDed + lateCutDed + shortCutDed);
  const otPay = R(t.otMin * perMin * s.otMultiplier);
  const offDayPay = R((t.offWorkCredit || 0) * perDay); // extra pay for working on the weekly off
  arrears = round2_(arrears || 0); // money owed from earlier months, paid with this salary
  const gross = round2_(earned - deduction + otPay + offDayPay + arrears);

  const pay = {
    salary: round2_(emp.salary), earned: earned, prorated: ratio < 1, elapsedDays: t.elapsedDays, daysInMonth: dim,
    perDay: round2_(perDay), hourly: round2_(perHour), perMin: round2_(perMin),
    leaveDed: leaveDed, halfDayDed: halfDayDed, lateCutDed: lateCutDed, shortCutDed: shortCutDed, deduction: round2_(deduction),
    otPay: otPay, offDayPay: offDayPay, arrears: arrears, gross: gross, advance: 0,
    pf: false, pfBankSalary: 0, pfEmployee: 0, pfEmployer: 0, bank: 0, cash: 0, net: gross,
  };

  if (!emp.pf.active) {
    pay.advance = round2_(Math.min(advanceWanted, Math.max(0, gross)));
    pay.net = round2_(gross - pay.advance);
    return pay;
  }

  const pf = pfAmounts_(emp, s);
  // PF and Basic Salary are counted for the same days as the salary.
  const bankSalary = R(pf.bankSalary * ratio), pfEmp = R(pf.employee * ratio), pfEr = R(pf.employer * ratio);
  pay.advance = round2_(Math.min(advanceWanted, Math.max(0, gross - pfEmp)));
  let bank, cash;
  if (s.adjustIn === 'BANK') {
    cash = earned - bankSalary;
    bank = gross - cash - pfEmp - pay.advance;
  } else {
    bank = bankSalary - pfEmp;
    cash = gross - bankSalary - pay.advance;
  }
  // If deductions are bigger than one part, take the rest from the other part.
  if (cash < 0) { bank += cash; cash = 0; }
  if (bank < 0) { cash += bank; bank = 0; }
  cash = Math.max(0, cash);

  return Object.assign(pay, {
    pf: true, pfBankSalary: bankSalary, pfEmployee: pfEmp, pfEmployer: pfEr,
    bank: round2_(bank), cash: round2_(cash), net: round2_(bank + cash),
  });
}

/** PF amounts for an employee. Blank cells fall back to the % defaults in Settings; "12%" style is also accepted. */
function pfAmounts_(emp, s) {
  const amt = (v, pct, base) => {
    const str = String(v === undefined || v === null ? '' : v).trim();
    if (!str) return base * pct / 100;
    if (/%$/.test(str)) return base * (Number(str.replace('%', '')) || 0) / 100;
    return Number(str) || 0;
  };
  const bankSalary = Math.min(emp.salary, amt(emp.pf.bankSalary, s.pfBankPct, emp.salary));
  return {
    bankSalary: bankSalary,
    employee: amt(emp.pf.employee, s.pfEmployeePct, bankSalary),
    employer: amt(emp.pf.employer, s.pfEmployerPct, bankSalary),
  };
}

/* ----------------------------- Advances ---------------------------- */

/**
 * How much of one advance is recovered up to and in month ym.
 * Locked months use what was actually deducted (from the payroll snapshot); other months use the
 * monthly instalment while the advance is ACTIVE.
 */
function advanceState_(a, ym) {
  let remaining = a.amount;
  let deductedBefore = 0;
  for (let m = a.startMonth; m < ym && remaining > 0; m = nextYm_(m)) {
    const d = advanceDeduction_(a, m, remaining);
    remaining -= d;
    deductedBefore += d;
  }
  let thisMonth = 0;
  if (ym >= a.startMonth && remaining > 0) thisMonth = advanceDeduction_(a, ym, remaining);
  const change = readAdvMonths_()[a.id + '|' + ym];
  return {
    deductedBefore: round2_(deductedBefore), thisMonth: round2_(thisMonth), changed: !!change,
    changeNote: change ? change.note : '',
    balanceBefore: round2_(Math.max(0, remaining)), balanceAfter: round2_(Math.max(0, remaining - thisMonth)),
  };
}

/**
 * Deduction of one advance in one month:
 *   locked month → what was actually deducted; CLOSED → 0;
 *   a change set for that month → that amount (0 = skip), even while paused;
 *   otherwise the monthly instalment while ACTIVE, 0 while PAUSED. Never more than the balance.
 */
function advanceDeduction_(a, ym, remaining) {
  const locked = lockedAdvance_(ym, a.empId, a.id);
  if (locked !== null) return locked;
  if (a.status === 'CLOSED') return 0;
  const change = readAdvMonths_()[a.id + '|' + ym];
  if (change) return Math.min(change.amount, remaining);
  return a.status === 'ACTIVE' ? Math.min(a.monthly, remaining) : 0;
}

/** { 'advanceId|yyyy-MM': { amount, note, row } } */
function readAdvMonths_() {
  return memo_('advmonths', () => {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.ADV_MONTHS);
    const map = {};
    if (!sh || sh.getLastRow() < 2) return map;
    sh.getRange(2, 1, sh.getLastRow() - 1, ADV_MONTH_HEADERS.length).getValues().forEach((r, i) => {
      const ym = toYm_(r[2]);
      if (String(r[0]).trim() && ym && r[3] !== '') {
        map[String(r[0]).trim() + '|' + ym] = { amount: Math.max(0, Number(r[3]) || 0), note: String(r[4] || ''), row: i + 2 };
      }
    });
    return map;
  });
}

function advancesForMonth_(empId, ym) {
  const items = [];
  let total = 0;
  readAdvances_().filter(a => a.empId === empId && a.startMonth <= ym).forEach(a => {
    const st = advanceState_(a, ym);
    if (st.thisMonth > 0 || st.balanceBefore > 0) {
      items.push({ id: a.id, amount: a.amount, monthly: a.monthly, note: a.note, status: a.status, given: a.given,
        wanted: st.thisMonth, balanceBefore: st.balanceBefore, changed: st.changed, changeNote: st.changeNote,
        startMonth: a.startMonth });
      total += st.thisMonth;
    }
  });
  return { total: round2_(total), items: items };
}

/** The amount actually deducted for an advance in a locked month, or null when the month is not locked. */
function lockedAdvance_(ym, empId, advId) {
  if (!getLocks_()[ym]) return null;
  const snap = getSnapshot_(ym, empId);
  if (!snap) return 0;
  const item = (snap.advances || []).filter(x => x.id === advId)[0];
  return item ? Number(item.deducted || 0) : 0;
}

function readAdvances_() {
  return memo_('advances', () => {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.ADVANCES);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, ADV_HEADERS.length).getValues().map((r, i) => ({
      row: i + 2, id: String(r[0]), empId: String(r[1]).trim().toUpperCase(), name: String(r[2]),
      dateGiven: toDateStr_(r[3]), amount: Number(r[4]) || 0, monthly: Number(r[5]) || 0,
      startMonth: toYm_(r[6]), status: String(r[7] || 'ACTIVE').trim().toUpperCase(), note: String(r[8] || ''),
      createdBy: String(r[9] || ''),
      topUps: String(r[11] || '').split('\n').map(x => x.trim()).filter(String),
    })).filter(a => a.id && a.empId && a.startMonth).map(a => Object.assign(a, { given: advanceGiven_(a) }));
  });
}

/**
 * Each payment of an advance as its own line: the first amount (date given) and every "Add more"
 * ({ date, amount, note, by }), oldest first. The sheet keeps the total in Amount and the extra
 * payments as lines like '2026-10-19 +5000 (Rent) by Owner' in Top-ups.
 */
function advanceGiven_(a) {
  const extra = a.topUps.map(line => {
    const m = line.match(/^(\d{4}-\d{2}-\d{2}) \+(-?[\d.]+)(?: \((.*)\))? by (.*)$/);
    return m ? { date: m[1], amount: Number(m[2]), note: m[3] || '', by: m[4] } : null;
  }).filter(Boolean);
  const first = { date: a.dateGiven, amount: round2_(a.amount - extra.reduce((n, x) => n + x.amount, 0)), note: a.note, by: a.createdBy };
  return [first].concat(extra).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/* ------------------------- Locks & snapshots ----------------------- */

function getLocks_() {
  return memo_('locks', () => {
    const values = sheetValues_(SHEET.LOCKS);
    const map = {};
    (values || []).slice(1).forEach(r => {
      const ym = toYm_(r[0]);
      if (ym) map[ym] = { by: String(r[1]), at: String(r[2]) };
    });
    return map;
  });
}

function isLocked_(ym) {
  return !!getLocks_()[ym];
}

function assertUnlocked_(date) {
  const ym = String(date).slice(0, 7);
  if (isLocked_(ym)) throw new Error('Payroll for ' + ymLabel_(ym) + ' is locked. Ask the super admin to unlock it first.');
}

/** Snapshot { totals, pay, days, advances } saved when the month was locked. Advance deductions are taken from pay. */
function getSnapshot_(ym, empId) {
  const raw = memo_('snapshots', () => {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.SNAPSHOTS);
    const map = {};
    if (!sh || sh.getLastRow() < 2) return map;
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(r => {
      map[toYm_(r[0]) + '|' + String(r[1]).trim().toUpperCase()] = r[3];
    });
    return map;
  })[ym + '|' + empId];
  if (!raw) return null;
  const snap = JSON.parse(raw);
  // Spread the advance actually deducted over the advances, in order.
  return snap;
}

/* ------------------------------------------------------------------ */
/* Payslip                                                             */
/* ------------------------------------------------------------------ */

function payslipHtml_(emp, m) {
  const s = getSettings_();
  const t = m.totals, p = m.pay, c = s.currency;
  const money = n => c + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: s.roundRupee ? 0 : 2, maximumFractionDigits: 2 });
  const mins = n => { n = Math.round(n || 0); return Math.floor(n / 60) + 'h ' + pad2_(n % 60) + 'm'; };
  const e = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const row = (a, b) => '<tr><td>' + a + '</td><td class="r">' + b + '</td></tr>';

  let earn = row('Monthly Salary', money(p.salary)) +
    (p.prorated ? row('Salary earned (' + p.elapsedDays + ' of ' + p.daysInMonth + ' days)', money(p.earned)) : '') +
    row('OT (' + mins(t.otMin) + ')', money(p.otPay)) +
    (p.offDayPay ? row('Week-off work (' + t.offWorkCredit + ' day' + (t.offWorkCredit === 1 ? '' : 's') + ')', money(p.offDayPay)) : '') +
    (m.arrearItems || []).map(a => row('Arrears – ' + e(a.reason), money(a.amount))).join('') +
    (p.arrears && !(m.arrearItems || []).length ? row('Arrears', money(p.arrears)) : '');
  let ded = row('Leaves (' + (t.absent + t.notJoined) + ' days)', money(p.leaveDed)) +
    row('Half Days (' + t.halfDay + ')', money(p.halfDayDed));
  if (p.lateCutDed) ded += row('Late marks', money(p.lateCutDed));
  if (p.shortCutDed) ded += row('Late coming / early leaving (' + mins(t.shortMin) + ')', money(p.shortCutDed));
  if (p.advance) ded += row('Advance recovery', money(p.advance));
  if (p.pf) ded += row('PF Employee (Basic Salary ' + money(p.pfBankSalary) + ')', money(p.pfEmployee));
  const totalDed = p.deduction + (p.advance || 0) + (p.pf ? p.pfEmployee : 0);

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;color:#1b2333;margin:24px;font-size:13px}' +
    'h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px;color:#2f5fe3}' +
    'table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-bottom:1px solid #e3e7ef}.r{text-align:right}' +
    '.box{display:inline-block;border:1px solid #e3e7ef;border-radius:8px;padding:8px 12px;margin:4px 8px 4px 0}' +
    '.tot td{font-weight:bold;border-top:2px solid #1b2333}.muted{color:#6b7486}.stamp{color:#c27c0e;font-weight:bold}' +
    '</style></head><body>' +
    '<h1>' + e(s.company) + '</h1><div class="muted">Salary slip — ' + e(m.label) + '</div>' +
    (m.locked ? '' : '<div class="stamp">PROVISIONAL — ' + (p.prorated ? 'salary up to ' + e(t.elapsedUntil || 'start of month') : 'month not locked yet') + '</div>') +
    '<h2>Employee</h2><table>' + row('Name', e(emp.name)) + row('Employee ID', e(emp.id)) +
    (emp.joinDate ? row('Joining date', e(emp.joinDate)) : '') + '</table>' +
    '<h2>Attendance</h2><div>' +
    ['Present ' + t.present, 'Half days ' + t.halfDay, 'Absent ' + (t.absent + t.notJoined), 'Paid leave ' + t.leave,
      'Week off ' + t.weekOff, 'Holidays ' + t.holiday, 'Late ' + t.late + ' (' + mins(t.lateMin) + ')',
      'OT ' + mins(t.otMin)].map(x => '<span class="box">' + x + '</span>').join('') + '</div>' +
    '<h2>Earnings</h2><table>' + earn + '</table>' +
    '<h2>Deductions</h2><table>' + ded + '<tr class="tot"><td>Total deductions</td><td class="r">' + money(totalDed) + '</td></tr></table>' +
    (p.pf ? '<h2>PF</h2><table>' + row('PF Employer contribution (paid by company)', money(p.pfEmployer)) + '</table>' : '') +
    (p.pf && p.bank !== undefined ? '<h2>Payment split</h2><table>' + row('In Bank', money(p.bank)) + row('In Cash', money(p.cash)) + '</table>' : '') +
    '<table style="margin-top:14px"><tr class="tot"><td>Total Salary</td><td class="r">' + money(p.net) + '</td></tr></table>' +
    ((m.advances || []).length ? '<p class="muted">Advance balance after this month: ' +
      money((m.advances || []).reduce((sum, a) => sum + (a.balanceAfter || 0), 0)) + '</p>' : '') +
    '<p class="muted">Generated ' + Utilities.formatDate(new Date(), tz_(), 'dd MMM yyyy HH:mm') + '. This is a computer-generated slip.</p>' +
    '</body></html>';
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** The logged-in person. Guards are refused unless allowGuard (they only use Mark Attendance and their PIN). */
function auth_(token, allowGuard) {
  const empId = sessionEmpId_(token);
  if (!empId) throw new Error('SESSION_EXPIRED');
  const emp = findEmployee_(empId);
  if (!emp || !emp.active) throw new Error('SESSION_EXPIRED');
  if (emp.role === 'GUARD' && !allowGuard) throw new Error('Guards can only mark attendance for others.');
  return emp;
}

function profile_(emp) {
  const p = permsFor_(emp);
  delete p.employees;
  return { id: emp.id, name: emp.name, role: emp.role, perms: p };
}

function serverClock_() {
  const now = new Date();
  return { epoch: now.getTime(), local: Utilities.formatDate(now, tz_(), 'yyyy-MM-dd HH:mm:ss') };
}

/**
 * Rejects check-in/out when the phone's clock or time zone is wrong — the usual sign that
 * "Automatic date & time" is switched off. phoneClock = { epoch: Date.now(), local: 'yyyy-MM-dd HH:mm:ss' }.
 * (Recorded times always come from the server; this check just enforces the policy.)
 */
function checkPhoneClock_(s, phoneClock) {
  const msg = 'Your phone time is not correct. Open phone Settings → Date & time → turn ON ' +
    '"Automatic date & time" and "Automatic time zone", then reopen the app.';
  if (!phoneClock || !phoneClock.epoch || !phoneClock.local) throw new Error('Please reload the app and try again.');
  const tol = Math.max(1, s.clockTolerance) * 60000;
  const server = serverClock_();
  if (!(Math.abs(Number(phoneClock.epoch) - server.epoch) <= tol)) throw new Error(msg);
  if (!(Math.abs(wallMs_(phoneClock.local) - wallMs_(server.local)) <= tol)) throw new Error(msg);
}

/** 'yyyy-MM-dd HH:mm:ss' wall-clock text → comparable milliseconds. */
function wallMs_(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(str));
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/**
 * GPS check for check-in / check-out. anywhere = the employee may mark away from the office (outstation):
 * a location is still required and recorded, but distance and accuracy limits don't apply.
 */
function checkLocation_(s, lat, lng, acc, anywhere) {
  if (anywhere) {
    lat = Number(lat); lng = Number(lng); acc = Number(acc);
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
      throw new Error('Location not received. Turn on GPS and allow location access.');
    }
    const officeSet = isFinite(s.officeLat) && isFinite(s.officeLng);
    const d = officeSet ? Math.round(distanceM_(lat, lng, s.officeLat, s.officeLng)) : '';
    return { lat: lat, lng: lng, acc: isFinite(acc) ? Math.round(acc) : '', dist: d,
      outside: !officeSet || d > s.radius || (isFinite(acc) && acc > s.maxAccuracy) };
  }
  if (!isFinite(s.officeLat) || !isFinite(s.officeLng)) {
    throw new Error('Office location is not set. Ask the admin to fill Office Latitude/Longitude in Settings.');
  }
  lat = Number(lat); lng = Number(lng); acc = Number(acc);
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) {
    throw new Error('Location not received. Turn on GPS and allow location access.');
  }
  if (isFinite(acc) && acc > s.maxAccuracy) {
    throw new Error('GPS signal is weak (±' + Math.round(acc) + ' m). Move near a window or open area and try again.');
  }
  const dist = distanceM_(lat, lng, s.officeLat, s.officeLng);
  if (dist > s.radius) {
    throw new Error('You are ' + Math.round(dist) + ' m from the office. You must be within ' + s.radius +
      ' m to mark attendance.');
  }
  return { lat: lat, lng: lng, acc: isFinite(acc) ? Math.round(acc) : '', dist: Math.round(dist) };
}

/** Haversine distance in metres. */
function distanceM_(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function saveSelfie_(dataUrl, fileName, s) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Selfie missing. Please take a selfie to check in.');
  if (m[2].length > 4000000) throw new Error('Selfie is too large. Please try again.');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), 'image/' + m[1], fileName);
  return getSelfieFolder_(s).createFile(blob).getUrl();
}

function getSelfieFolder_(s) {
  if (s.selfieFolderId) {
    try { return DriveApp.getFolderById(s.selfieFolderId); } catch (e) { /* recreate below */ }
  }
  const folder = DriveApp.createFolder(s.company + ' – Attendance Selfies');
  setSetting_('Selfie Folder ID', folder.getId());
  return folder;
}

function getSettings_() {
  return memo_('settings', () => {
    const raw = {};
    const values = sheetValues_(SHEET.SETTINGS);
    if (!values) sheet_(SHEET.SETTINGS); // throws the "run setup()" message
    values.slice(1).forEach(r => {
      if (String(r[0]).trim()) raw[String(r[0]).trim()] = r[1];
    });
    const blank = k => raw[k] === undefined || raw[k] === null || String(raw[k]).trim() === '';
    const num = (k, def) => (blank(k) || isNaN(Number(raw[k])) ? def : Number(raw[k]));
    const yes = (k, def) => (blank(k) ? def : /^(y|yes|true|1)$/i.test(String(raw[k]).trim()));
    const str = (k, def) => (blank(k) ? def : String(raw[k]).trim());

    const dayIdx = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const weeklyOff = str('Weekly Off', 'Sunday').split(/[,;\s]+/)
      .map(x => dayIdx[x.trim().slice(0, 3).toLowerCase()])
      .filter(x => x !== undefined);
    const noCheckout = str('No Check-Out Counts As', 'HALF_DAY').toUpperCase().replace(/[\s-]+/g, '_');
    const shiftStart = toMinutes_(raw['Shift Start']);

    return {
      company: str('Company Name', 'Attendance'),
      officeLat: num('Office Latitude', NaN),
      officeLng: num('Office Longitude', NaN),
      radius: num('Allowed Radius (m)', 30),
      maxAccuracy: num('Max GPS Accuracy (m)', 50),
      flagAccuracy: num('Flag GPS Accuracy Above (m)', 35),
      checkoutLocation: yes('Check Location On Check-Out', true),
      selfieRequired: yes('Selfie Required', true),
      liveCameraOnly: yes('Live Camera Only', false),
      shiftStartMin: shiftStart == null ? 570 : shiftStart,
      lateGrace: num('Late Grace (min)', 10),
      standardHours: num('Standard Hours', 9),
      fullDayHours: num('Full Day Min Hours', 8),
      halfDayHours: num('Half Day Min Hours', 4),
      noCheckoutStatus: ['PRESENT', 'HALF_DAY', 'ABSENT'].indexOf(noCheckout) >= 0 ? noCheckout : 'HALF_DAY',
      overnight: yes('Allow Overnight Shift', false),
      maxShiftHours: num('Max Shift Hours', 16),
      otMultiplier: num('OT Multiplier', 1.5),
      otBlock: num('OT Block (min)', 0),
      maxOtPerDay: num('Max OT Per Day (min)', 0),
      otApproval: yes('OT Needs Approval', false),
      salaryDays: num('Salary Days Basis', 30),
      lateReducesOt: yes('Late Minutes Reduce OT', true),
      earlyReducesOt: yes('Early Leaving Reduces OT', true),
      clockTolerance: num('Phone Time Tolerance (min)', 3),
      pfBankPct: num('Default PF Bank Salary %', 90),
      pfEmployeePct: num('Default PF Employee %', 12),
      pfEmployerPct: num('Default PF Employer %', 13),
      adjustIn: str('OT & Deductions Paid In', 'CASH').toUpperCase() === 'BANK' ? 'BANK' : 'CASH',
      roundRupee: yes('Round To Rupee', true),
      weeklyOff: weeklyOff,
      offDayOt: yes('Off-Day Work Is OT', true),
      woStartMin: toMinutes_(raw['Week-Off Shift Start']) != null ? toMinutes_(raw['Week-Off Shift Start']) : 570,
      woEndMin: toMinutes_(raw['Week-Off Shift End']) != null ? toMinutes_(raw['Week-Off Shift End']) : 1020,
      woHalfHours: num('Week-Off Half Day Hours', 3),
      woFullHours: num('Week-Off Full Day Hours', 6),
      latesPerHalfDay: num('Lates Per Half-Day Cut', 0),
      backDateDays: num('Admin Back-Date Limit (days)', 45),
      requestBackDays: num('Request Back-Date Limit (days)', 7),
      currency: str('Currency', '₹'),
      minAppVersion: num('Min Android App Version', 0),
      sessionDays: num('Stay Logged In (days)', 30),
      faceDistance: num('Face Match Max Distance', 0.42),
      refreshAppsAt: num('Refresh Apps At', 0),
      lateGif: gifUrl_(raw['Late GIF'] === undefined ? 'https://giphy.com/stickers/maskoai-cute-masko-dumple-WPZ4x9TSQO16YeC9ix' : raw['Late GIF']),
      earlyGif: gifUrl_(raw['Early Leaving GIF'] === undefined ? 'https://giphy.com/stickers/solarbearshockey-shades-polar-bear-solar-DUcyNsf3oPmVNZYBh8' : raw['Early Leaving GIF']),
      birthdayAnim: blank('Birthday Animation') ? 'balloons' : String(raw['Birthday Animation']).trim().toLowerCase(),
      birthdayMusic: blank('Birthday Music') ? 'birthday' : String(raw['Birthday Music']).trim().toLowerCase(),
      birthdaySeconds: Math.max(2, Math.min(60, num('Birthday Seconds', 10))),
      birthdayFrom: toTimeStr_(raw['Birthday Wishes From']) || '09:00',
      birthdayTill: toTimeStr_(raw['Birthday Wishes Till']) || '15:00',
      appLink: str('Android App Link', 'https://github.com/travalateapp/shipment-scanner/releases/latest/download/Attendance.apk'),
      selfieFolderId: str('Selfie Folder ID', ''),
      keepSelfieDays: num('Keep Selfies (days)', 60),
    };
  });
}

function setSetting_(key, value) {
  const sh = sheet_(SHEET.SETTINGS);
  const keys = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => String(r[0]).trim());
  const i = keys.indexOf(key);
  if (i >= 0) sh.getRange(i + 1, 2).setValue(value);
  else sh.appendRow([key, value, '']);
  forget_('settings');
}

/**
 * Everyone in the Employees tab who takes part in attendance and payroll. Guards are left out: they only
 * mark attendance for others and have no attendance, salary or requests of their own.
 */
function getEmployees_() {
  // A–Z by name everywhere (payroll, summary, export, PF, advances, entries, pickers).
  return getPeople_().filter(e => e.role !== 'GUARD')
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

/** Every row of the Employees tab, guards included (login, PINs, the Employees screen). */
function getPeople_() {
  return memo_('employees', () => {
    const values = sheetValues_(SHEET.EMPLOYEES);
    if (!values) sheet_(SHEET.EMPLOYEES); // throws the "run setup()" message
    const h = headerIndex_(null, values[0]);
    const get = (r, name) => (h[name] === undefined ? '' : r[h[name]]);
    return values.slice(1)
      .map((r, i) => ({ r: r, row: i + 2 }))
      .filter(x => String(x.r[0]).trim())
      .map(x => {
        const r = x.r;
        return {
          row: x.row,
          id: String(r[0]).trim().toUpperCase(),
          name: String(r[1]).trim(),
          pin: String(r[2]).trim(),
          salary: Number(r[3]) || 0,
          role: parseRole_(r[4]),
          active: !/^(n|no|false|0|inactive)$/i.test(String(r[5]).trim()),
          joinDate: toDateStr_(r[6]),
          phone: String(r[7] || ''),
          anywhere: /^(y|yes|true|1|on)$/i.test(String(get(r, 'Mark From Anywhere')).trim()),
          shiftStart: toTimeStr_(get(r, 'Shift Start')),
          shiftEnd: toTimeStr_(get(r, 'Shift End')),
          hourlyOt: !/^(n|no|false|0|off)$/i.test(String(get(r, 'Hourly OT')).trim()),
          morningOt: !/^(n|no|false|0|off)$/i.test(String(get(r, 'Morning OT')).trim()),
          gender: parseGender_(get(r, 'Gender')),
          leaderboard: !/^(n|no|false|0|off)$/i.test(String(get(r, 'In Leaderboard')).trim()), // blank = Yes
          lateCut: !/^(n|no|false|0|off)$/i.test(String(get(r, 'Late Cut')).trim()), // blank = Yes
          birthDate: toMonthDay_(get(r, 'Birth Date')), // 'MM-DD': day and month only
          pf: {
            active: /^(y|yes|true|1|on)$/i.test(String(get(r, 'PF Active')).trim()),
            bankSalary: get(r, 'PF Bank Salary'),
            employee: get(r, 'PF Employee'),
            employer: get(r, 'PF Employer'),
          },
        };
      });
  });
}

/** Role column dropdown in the Employees tab (EMPLOYEE / ADMIN / SUPER_ADMIN / GUARD). */
function roleValidation_(sh) {
  sh = sh || sheet_(SHEET.EMPLOYEES);
  sh.getRange('E2:E').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(ROLES, true).build());
}

function parseRole_(v) {
  const r = String(v || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (r === 'SUPER_ADMIN' || r === 'SUPERADMIN') return 'SUPER_ADMIN';
  if (r === 'GUARD' || r === 'SECURITY') return 'GUARD';
  return r === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE';
}

/** { 'Header name': columnIndex (0-based) } */
function headerIndex_(sh, headerRow) {
  const row = headerRow || sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  const map = {};
  row.forEach((v, i) => { if (String(v).trim()) map[String(v).trim()] = i; });
  return map;
}

/** Adds any missing headers to the end of row 1 (used when upgrading an existing sheet). */
function ensureHeaders_(sh, headers) {
  const have = headerIndex_(sh);
  let col = sh.getLastColumn();
  headers.forEach(name => {
    if (have[name] === undefined) {
      col++;
      sh.getRange(1, col).setValue(name).setFontWeight('bold').setBackground('#e8eefc');
    }
  });
}

/**
 * The sheet row of an employee, checked against the sheet itself (rows may have been inserted or
 * deleted by hand since the employee list was cached).
 */
function empRow_(emp) {
  const sh = sheet_(SHEET.EMPLOYEES);
  const idAt = row => String(sh.getRange(row, 1).getValue()).trim().toUpperCase();
  if (emp.row >= 2 && emp.row <= sh.getLastRow() && idAt(emp.row) === emp.id) return emp.row;
  const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => String(r[0]).trim().toUpperCase());
  forget_('employees');
  const i = ids.indexOf(emp.id);
  if (i < 1) throw new Error('Employee ' + emp.id + ' was not found in the sheet.');
  return i + 1;
}

function findEmployee_(empId) {
  const people = getPeople_();
  if (!people.byId) { people.byId = {}; people.forEach(e => { people.byId[e.id] = e; }); }
  return people.byId[empId] || null;
}

/**
 * Settings for one employee: their own shift (Shift Start / Shift End in the Employees tab) and whether they
 * get hourly OT. With an own shift, Standard Hours = the shift length and the full / half-day minimums are
 * scaled to it (e.g. company 9 h shift with 8 h / 4 h minimums → a 7 h shift needs 6.2 h / 3.1 h).
 */
function empSettings_(emp, s) {
  if (!emp) return s;
  if (emp._sBase === s) return emp._s;
  const start = toMinutes_(emp.shiftStart), end = toMinutes_(emp.shiftEnd);
  const own = start != null && end != null && start !== end;
  let o = s;
  if (own || emp.hourlyOt === false || emp.morningOt === false || emp.lateCut === false) {
    o = Object.assign({}, s);
    if (own) {
      const hours = ((end - start + 1440) % 1440) / 60;
      const k = s.standardHours > 0 ? hours / s.standardHours : 1;
      o.shiftStartMin = start;
      o.standardHours = round2_(hours);
      o.fullDayHours = round2_(s.fullDayHours * k);
      o.halfDayHours = round2_(s.halfDayHours * k);
    }
    if (emp.hourlyOt === false) o.hourlyOt = false;
    if (emp.morningOt === false) o.morningOt = false;
    if (emp.lateCut === false) o.lateCut = false;
  }
  emp._sBase = s; emp._s = o;
  return o;
}

/** Shift Start / Shift End / Hourly OT cells from the Employees form. Blank times = the company shift. */
function shiftFields_(data) {
  const a = toTimeStr_(data.shiftStart), b = toTimeStr_(data.shiftEnd);
  if (!!a !== !!b) throw new Error('Enter both the shift start and end time, or leave both empty for the company shift.');
  if (a && a === b) throw new Error('Shift start and end cannot be the same time.');
  return [a ? "'" + a : '', b ? "'" + b : '', data.hourlyOt === false ? 'No' : 'Yes', data.morningOt === false ? 'No' : 'Yes'];
}

function readAttendance_() {
  return memo_('att', () => {
    const sh = sheet_(SHEET.ATTENDANCE);
    const last = sh.getLastRow();
    if (last < 2) return [];
    const c = cachedAttendance_(last);
    if (c.rows) return c.rows.map(attFromCache_);
    const width = Math.min(ATT_HEADERS.length, sh.getMaxColumns()); // older sheets may not have the last columns yet
    const rows = sh.getRange(2, 1, last - 1, width).getValues().map((r, i) => {
      const ov = String(r[COL.OVERRIDE]).trim().toUpperCase().replace(/[\s-]+/g, '_');
      const ota = String(r[COL.OT_APPROVED] || '').trim().toUpperCase();
      return {
        row: i + 2,
        date: toDateStr_(r[COL.DATE]),
        empId: String(r[COL.EMP]).trim().replace(/^'/, '').toUpperCase(),
        in: toTimeStr_(r[COL.IN]),
        out: toTimeStr_(r[COL.OUT]),
        inLat: r[COL.IN_LAT], inLng: r[COL.IN_LNG],
        inDist: r[COL.IN_DIST], inAcc: r[COL.IN_ACC],
        selfie: String(r[COL.SELFIE] || ''),
        outPhoto: String(r[COL.OUT_PHOTO] || ''),
        override: OVERRIDE_VALUES.indexOf(ov) >= 0 ? ov : '',
        note: String(r[COL.NOTE] || ''),
        otApproved: ota === 'YES' || ota === 'NO' ? ota : '',
        flags: String(r[COL.FLAGS] || '').trim(),
        review: reviewState_(r[COL.REVIEW]),
        breaks: cleanBreaks_(r[COL.BREAKS]),
      };
    }).filter(a => a.date && a.empId);
    storeAttendance_(c.version, last, rows.map(attToCache_));
    return rows;
  });
}

const ATT_CACHE_FIELDS = ['row', 'date', 'empId', 'in', 'out', 'inLat', 'inLng', 'inDist', 'inAcc', 'selfie', 'override',
  'note', 'otApproved', 'flags', 'review', 'breaks', 'outPhoto'];
function attToCache_(a) { return ATT_CACHE_FIELDS.map(k => a[k]); }
function attFromCache_(x) {
  const a = {};
  ATT_CACHE_FIELDS.forEach((k, i) => { a[k] = x[i]; });
  if (a.breaks == null) a.breaks = '';
  if (a.outPhoto == null) a.outPhoto = '';
  return a;
}

/*
 * Breaks: someone checks out, leaves the office for a while and checks in again. The day keeps its first
 * check-in and last check-out; the time away is kept as 'HH:mm-HH:mm' pieces (';' between) and is not
 * counted as worked time. Late still uses the first check-in and early leaving the last check-out.
 */
function cleanBreaks_(v) {
  if (v instanceof Date) return '';
  return String(v || '').split(/[;,]\s*/).map(x => {
    const m = x.trim().match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
    if (!m) return '';
    const a = toTimeStr_(m[1]), b = toTimeStr_(m[2]);
    return a && b && toMinutes_(b) > toMinutes_(a) ? a + '-' + b : '';
  }).filter(String).join(';');
}

/** [[startMin, endMin], …] of a day's breaks. */
function breakList_(breaks) {
  return String(breaks || '').split(';').filter(String).map(x => x.split('-').map(toMinutes_))
    .filter(p => p[0] != null && p[1] != null && p[1] > p[0]);
}

/** Minutes of the breaks that fall between a and b. */
function breakOverlap_(breaks, a, b) {
  return breakList_(breaks).reduce((n, p) => n + Math.max(0, Math.min(b, p[1]) - Math.max(a, p[0])), 0);
}

function breakTotal_(breaks) {
  return breakList_(breaks).reduce((n, p) => n + p[1] - p[0], 0);
}

/** The Breaks column (added to older sheets the first time it is needed). */
function breaksCol_(sh) {
  if (String(sh.getRange(1, COL.BREAKS + 1).getValue()).trim() !== 'Breaks') {
    sh.getRange(1, COL.BREAKS + 1).setValue('Breaks').setFontWeight('bold').setBackground('#e8eefc');
  }
  return COL.BREAKS + 1;
}

/** First row per date for one employee (a row with a check-in wins over one without). */
function byDate_(att, empId) {
  const map = {};
  att.forEach(r => {
    if (r.empId !== empId) return;
    if (!map[r.date] || (!map[r.date].in && r.in)) map[r.date] = r;
  });
  return map;
}

function readRequests_() {
  return memo_('requests', () => {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.REQUESTS);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, REQ_HEADERS.length).getValues().map((r, i) => ({
      row: i + 2, id: String(r[0]), created: r[1] instanceof Date ? Utilities.formatDate(r[1], tz_(), 'yyyy-MM-dd HH:mm') : String(r[1]),
      empId: String(r[2]).trim().toUpperCase(), name: String(r[3]), type: String(r[4]).toUpperCase(),
      from: toDateStr_(r[5]), to: toDateStr_(r[6]) || toDateStr_(r[5]), in: toTimeStr_(r[7]), out: toTimeStr_(r[8]),
      leaveType: String(r[9] || '').toUpperCase(), reason: String(r[10] || ''), status: String(r[11] || '').toUpperCase(),
      decidedBy: String(r[12] || ''), decidedAt: r[13] instanceof Date ? Utilities.formatDate(r[13], tz_(), 'yyyy-MM-dd HH:mm') : String(r[13] || ''),
      remark: String(r[14] || ''), amount: Number(r[15]) || 0, monthly: Number(r[16]) || 0,
    })).filter(r => r.id);
  });
}

function getHolidays_() {
  return memo_('holidays', () => {
    const map = {};
    holidayList_().forEach(x => { if (!x.closeAt) map[x.date] = x.name; }); // short days are working days
    return map;
  });
}

/* --------------------------- Celebrations -------------------------- */

/** [{ from, to, animation, seconds, message, row }] sorted by date. */
function readCelebrations_() {
  return memo_('celebrations', () => (sheetValues_(SHEET.CELEBRATIONS) || []).slice(1).map((r, i) => {
    const from = toDateStr_(r[0]);
    return { from: from, to: toDateStr_(r[1]) || from, animation: ANIMATIONS.indexOf(String(r[2]).trim().toLowerCase()) >= 0 ? String(r[2]).trim().toLowerCase() : 'fireworks',
      seconds: Math.max(2, Math.min(60, Number(r[3]) || 6)), message: String(r[4] || '').trim(),
      music: MUSIC.indexOf(String(r[7] || '').trim().toLowerCase()) > 0 ? String(r[7]).trim().toLowerCase() : 'none', row: i + 2 };
  }).filter(c => c.from).sort((a, b) => (a.from < b.from ? -1 : 1)));
}

/** The celebration running on a date (the first one if several overlap). */
function celebrationOn_(date) {
  const c = readCelebrations_().filter(x => x.from <= date && date <= x.to)[0];
  return c ? { animation: c.animation, seconds: c.seconds, message: c.message, music: c.music, from: c.from, to: c.to } : null;
}

/**
 * Today's birthdays (active staff, guards excluded): { me: true when it is mine, names: [the others],
 * animation, music, seconds, date, from, till } or null. The page shows them only between from and till. Only the day is used — never the year or the age.
 * 29 Feb birthdays are celebrated on 28 Feb in other years.
 */
function birthdayOn_(date, me) {
  const md = date.slice(5), y = Number(date.slice(0, 4));
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const hits = getPeople_().filter(e => e.active && e.role !== 'GUARD' && e.birthDate).filter(e => {
    const b = e.birthDate;
    return b === md || (b === '02-29' && !leap && md === '02-28');
  });
  if (!hits.length) return null;
  const s = getSettings_();
  return {
    me: hits.some(e => e.id === me.id),
    names: hits.filter(e => e.id !== me.id).map(e => e.name).sort((a, b) => a.localeCompare(b)),
    animation: ANIMATIONS.indexOf(s.birthdayAnim) >= 0 ? s.birthdayAnim : '',
    music: MUSIC.indexOf(s.birthdayMusic) >= 0 ? s.birthdayMusic : 'none',
    seconds: s.birthdaySeconds,
    date: date, from: s.birthdayFrom, till: s.birthdayTill, // shown only from–till (e.g. 09:00–15:00) on this date
  };
}

function adminCelebrations(token) {
  authAdmin_(token, 'manageHolidays');
  const today = todayStr_();
  const s = getSettings_();
  return { animations: ANIMATIONS, music: MUSIC, list: readCelebrations_().filter(c => c.to >= addDays_(today, -60)),
    birthday: { animation: ANIMATIONS.indexOf(s.birthdayAnim) >= 0 ? s.birthdayAnim : 'none', music: MUSIC.indexOf(s.birthdayMusic) >= 0 ? s.birthdayMusic : 'none',
      seconds: s.birthdaySeconds, from: s.birthdayFrom, till: s.birthdayTill } };
}

/** b = { animation ('none' = card only), music, seconds (2–60), from, till ('HH:mm') } → the Birthday rows of Settings. */
function adminSaveBirthdaySettings(token, b) {
  const ctx = authAdmin_(token, 'manageHolidays');
  b = b || {};
  const animation = b.animation === 'none' || ANIMATIONS.indexOf(b.animation) >= 0 ? b.animation : null;
  if (!animation) throw new Error('Choose an animation.');
  if (MUSIC.indexOf(b.music) < 0) throw new Error('Choose the music.');
  const seconds = Math.round(Number(b.seconds));
  if (!(seconds >= 2 && seconds <= 60)) throw new Error('Duration must be 2 to 60 seconds.');
  const from = toTimeStr_(b.from), till = toTimeStr_(b.till);
  if (!from || !till) throw new Error('Enter the start and end time.');
  if (from >= till) throw new Error('The end time must be after the start time.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    setSetting_('Birthday Animation', animation);
    setSetting_('Birthday Music', b.music);
    setSetting_('Birthday Seconds', seconds);
    setSetting_('Birthday Wishes From', "'" + from);
    setSetting_('Birthday Wishes Till', "'" + till);
    audit_(ctx.emp, 'EDIT_BIRTHDAY_WISHES', '', '', animation + ', ' + b.music + ', ' + seconds + ' s, ' + from + '–' + till);
  } finally {
    lock.releaseLock();
  }
  return adminCelebrations(token);
}

/** c = { row (to edit), from, to, animation, seconds, message } */
function adminSaveCelebration(token, c) {
  const ctx = authAdmin_(token, 'manageHolidays');
  c = c || {};
  const from = toDateStr_(c.from), to = toDateStr_(c.to) || from;
  if (!from) throw new Error('Choose the date.');
  if (to < from) throw new Error('"To" must be on or after "From".');
  if (ANIMATIONS.indexOf(c.animation) < 0) throw new Error('Choose an animation.');
  const seconds = Math.round(Number(c.seconds));
  if (!(seconds >= 2 && seconds <= 60)) throw new Error('Duration must be 2 to 60 seconds.');
  const message = String(c.message || '').trim().slice(0, 80);
  const music = MUSIC.indexOf(c.music) >= 0 ? c.music : 'none';
  const row = ["'" + from, "'" + to, c.animation, seconds, message, ctx.emp.id + ' ' + ctx.emp.name, Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), music];
  const sh = sheetOrCreate_(SHEET.CELEBRATIONS, CELEB_HEADERS);
  ensureHeaders_(sh, CELEB_HEADERS);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const old = c.row ? readCelebrations_().filter(x => x.row === Number(c.row))[0] : null;
    if (old) sh.getRange(old.row, 1, 1, row.length).setValues([row]);
    else sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    forget_('celebrations');
    audit_(ctx.emp, old ? 'EDIT_CELEBRATION' : 'ADD_CELEBRATION', '', from, c.animation + ' ' + seconds + 's' + (music !== 'none' ? ' ♪ ' + music : '') + (to !== from ? ' to ' + to : '') + (message ? ' · ' + message : ''));
  } finally {
    lock.releaseLock();
  }
  return adminCelebrations(token);
}

function adminDeleteCelebration(token, rowNo) {
  const ctx = authAdmin_(token, 'manageHolidays');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    forget_('celebrations');
    const old = readCelebrations_().filter(x => x.row === Number(rowNo))[0];
    if (!old) throw new Error('Celebration not found.');
    sheet_(SHEET.CELEBRATIONS).deleteRow(old.row);
    forget_('celebrations');
    audit_(ctx.emp, 'DELETE_CELEBRATION', '', old.from, old.animation + (old.message ? ' · ' + old.message : ''));
  } finally {
    lock.releaseLock();
  }
  return adminCelebrations(token);
}

/** { date: { closeMin, closeAt, name } } of the days the office closes early. */
function shortDays_() {
  return memo_('shortDays', () => {
    const map = {};
    holidayList_().forEach(x => { if (x.closeAt) map[x.date] = { closeMin: toMinutes_(x.closeAt), closeAt: x.closeAt, name: x.name }; });
    return map;
  });
}

/**
 * Settings for one day: on a short day the shift ends at the closing time, so Standard Hours shrink and the
 * full / half-day minimums shrink in proportion (e.g. 09:30–18:30 closing 16:30 → 7 h shift, full day from
 * 6.2 h). Everything else (early leaving, OT after closing, monthly OT, late cut) then follows from them.
 */
function shortenDay_(es, date) {
  const sd = date ? shortDays_()[date] : null;
  if (!sd) return es;
  // (The "Allow Overnight Shift" setting only lets a check-out after midnight close the day before; it must not
  // switch short days off. A shift that does not include the closing time is simply left as it is.)
  const start = es.shiftStartMin, end = start + es.standardHours * 60;
  if (!(sd.closeMin > start && sd.closeMin < end)) return es;
  const hours = (sd.closeMin - start) / 60, k = hours / es.standardHours;
  return Object.assign({}, es, { standardHours: round2_(hours), fullDayHours: round2_(es.fullDayHours * k),
    halfDayHours: round2_(es.halfDayHours * k), shortDay: sd });
}

/** [{ date, name, type, row }] from the Holidays tab, sorted by date. */
function holidayList_() {
  return memo_('holidayList', () => {
    const values = sheetValues_(SHEET.HOLIDAYS) || [];
    return values.slice(1).map((r, i) => {
      const closeAt = toTimeStr_(r[3]);
      return { date: toDateStr_(r[0]), name: String(r[1] || 'Holiday').trim(), closeAt: closeAt,
        type: closeAt ? SHORT_DAY : (String(r[2] || '').trim() || 'Festival'), row: i + 2 };
    }).filter(x => x.date)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  });
}

function upcomingHolidays_(from, days, max) {
  const to = addDays_(from, days);
  return holidayList_().filter(x => x.date >= from && x.date <= to).slice(0, max)
    .map(x => ({ date: x.date, name: x.name, type: x.type, closeAt: x.closeAt }));
}

/* ----------------------- Employment periods ------------------------ */
/*
 * "Employment History" keeps every period someone worked (From – To, To blank = still working). An employee
 * made inactive gets a last working day; made active again, a new period starts on the date given. Days
 * outside every period are not paid and the person is left out of Mark Attendance, Today and the payroll of
 * months they did not work at all. Without rows the period is Join Date → (still active).
 */
function employmentRows_() {
  return memo_('employment', () => (sheetValues_(SHEET.EMPLOYMENT) || []).slice(1)
    .map((r, i) => ({ empId: String(r[0]).trim().toUpperCase(), from: toDateStr_(r[1]), to: toDateStr_(r[2]) || '', row: i + 2 }))
    .filter(x => x.empId && x.from));
}

function periods_(emp) {
  const cache = MEMO.periods || (MEMO.periods = {});
  if (cache[emp.id]) return cache[emp.id];
  const rows = employmentRows_().filter(x => x.empId === emp.id).sort((a, b) => (a.from < b.from ? -1 : 1));
  let per;
  if (rows.length) per = rows.map(x => ({ from: x.from, to: x.to }));
  else {
    const from = emp.joinDate || '2000-01-01';
    if (emp.active) per = [{ from: from, to: '' }];
    else {
      // Made inactive before this history existed: until their last attendance (or the join date).
      const last = readAttendance_().reduce((m, r) => (r.empId === emp.id && r.date > m ? r.date : m), from);
      per = [{ from: from, to: last }];
    }
  }
  cache[emp.id] = per;
  return per;
}

function employedOn_(emp, ds, per) {
  return (per || periods_(emp)).some(p => ds >= p.from && (!p.to || ds <= p.to));
}
function employedBetween_(emp, a, b) {
  return periods_(emp).some(p => p.from <= b && (!p.to || p.to >= a));
}
function employedInMonth_(emp, ym) {
  return employedBetween_(emp, ym + '-01', ym + '-31');
}

/** Deactivate (date = last working day, not in the future) or activate again (date = first day back). */
function changeEmployment_(ctx, emp, active, date) {
  date = toDateStr_(date) || todayStr_();
  const sh = sheetOrCreate_(SHEET.EMPLOYMENT, EMPLOYMENT_HEADERS);
  const stamp = () => [ctx.emp.id, Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm')];
  if (!employmentRows_().some(x => x.empId === emp.id)) {
    // First change: write the period(s) so far so they are kept.
    periods_(emp).forEach(p => sh.appendRow([emp.id, "'" + p.from, p.to ? "'" + p.to : '', 'Joined'].concat(stamp())));
    forget_('employment', 'periods');
  }
  const rows = employmentRows_().filter(x => x.empId === emp.id).sort((a, b) => (a.from < b.from ? -1 : 1));
  const last = rows[rows.length - 1];
  if (!active) {
    if (date > todayStr_()) throw new Error('The last working day cannot be in the future. Make the employee inactive on or after that day.');
    if (last.to) throw new Error(emp.name + ' is already inactive.');
    if (date < last.from) throw new Error('The last working day cannot be before ' + last.from + ' (start of the current period).');
    sh.getRange(last.row, 3, 1, 2).setValues([["'" + date, 'Left']]);
    audit_(ctx.emp, 'DEACTIVATE', emp.id, date, 'Last working day ' + date);
  } else {
    if (!last.to) throw new Error(emp.name + ' is already active.');
    if (date <= last.to) throw new Error('The new start date must be after the last working day (' + last.to + ').');
    sh.appendRow([emp.id, "'" + date, '', 'Active again'].concat(stamp()));
    audit_(ctx.emp, 'ACTIVATE', emp.id, date, 'Active again from ' + date);
  }
  forget_('employment', 'periods');
}

/** A changed Join Date moves the start of the first period too. */
function setFirstJoin_(emp, date) {
  const rows = employmentRows_().filter(x => x.empId === emp.id).sort((a, b) => (a.from < b.from ? -1 : 1));
  if (!rows.length) return;
  if (rows[0].to && date > rows[0].to) throw new Error('The join date cannot be after the end of the first period (' + rows[0].to + ').');
  sheet_(SHEET.EMPLOYMENT).getRange(rows[0].row, 2).setValue("'" + date);
  forget_('employment', 'periods');
}

/* ------------------------- Salary increments ------------------------ */
/*
 * The Monthly Salary in the Employees tab is the original salary and is never changed. Each increment has an
 * effective month: from that month on the salary is original + all increments up to then; earlier months
 * (and locked months) are not affected.
 */
function incrementRows_() {
  return memo_('increments', () => (sheetValues_(SHEET.INCREMENTS) || []).slice(1)
    .map((r, i) => ({ empId: String(r[0]).trim().toUpperCase(), month: String(r[1]).trim().replace(/^'/, '').slice(0, 7),
      amount: Number(r[2]) || 0, newSalary: Number(r[3]) || 0, note: String(r[4] || ''), row: i + 2 }))
    .filter(x => x.empId && /^\d{4}-\d{2}$/.test(x.month) && x.amount));
}

function baseSalary_(emp) {
  return emp.baseSalary !== undefined ? emp.baseSalary : emp.salary;
}

function salaryFor_(emp, ym) {
  return round2_(baseSalary_(emp) + incrementRows_().filter(x => x.empId === emp.id && x.month <= ym)
    .reduce((a, x) => a + x.amount, 0));
}

function incrementsOf_(emp) {
  const locks = getLocks_();
  return incrementRows_().filter(x => x.empId === emp.id).sort((a, b) => (a.month < b.month ? -1 : 1))
    .map(x => ({ month: x.month, amount: x.amount, newSalary: salaryFor_(emp, x.month), note: x.note, row: x.row, locked: !!locks[x.month] }));
}

/** The latest locked month from ym on, if any (an increment there would change a final payroll). */
function lockedFrom_(ym) {
  return Object.keys(getLocks_()).filter(k => k >= ym).sort().pop() || '';
}

/** inc = { amount, month: 'yyyy-MM', note }. A negative amount is a decrease. */
function adminAddIncrement(token, empId, inc) {
  const ctx = authAdmin_(token, 'manageEmployees');
  const emp = managedEmployee_(ctx, empId, true);
  inc = inc || {};
  const month = String(inc.month || '');
  const amount = Number(inc.amount);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Choose the month the new salary starts.');
  if (!isFinite(amount) || !amount) throw new Error('Enter the increment amount.');
  // Starting in a month that is already locked (paid): allowed for a raise; the back-pay for the locked months
  // becomes arrears paid with this month's salary (see incrementArrears_).
  const locked = lockedFrom_(month);
  if (locked && amount < 0) throw new Error('A salary decrease cannot start in ' + ymLabel_(month) + ': payroll up to ' + ymLabel_(locked) + ' is locked. Choose a month after it.');
  const newSalary = round2_(salaryFor_(emp, month) + amount);
  if (newSalary <= 0) throw new Error('The salary would become ' + newSalary + '.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheetOrCreate_(SHEET.INCREMENTS, INCREMENT_HEADERS);
    sh.appendRow([emp.id, "'" + month, amount, newSalary, String(inc.note || '').trim().slice(0, 200), ctx.emp.id,
      Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm')]);
    forget_('increments');
    audit_(ctx.emp, 'INCREMENT', emp.id, month + '-01', (amount > 0 ? '+' : '') + amount + ' from ' + ymLabel_(month) +
      ' → ' + newSalary + (inc.note ? ' (' + inc.note + ')' : ''));
    if (locked) incrementArrears_(ctx, emp, month, amount);
  } finally {
    lock.releaseLock();
  }
  return adminStaff(token);
}

function adminDeleteIncrement(token, empId, row) {
  const ctx = authAdmin_(token, 'manageEmployees');
  const emp = managedEmployee_(ctx, empId, true);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    forget_('increments');
    const x = incrementRows_().filter(r => r.row === Number(row) && r.empId === emp.id)[0];
    if (!x) throw new Error('Increment not found. Reload and try again.');
    const locked = lockedFrom_(x.month);
    if (locked) throw new Error('Payroll for ' + ymLabel_(locked) + ' is locked, so this increment can no longer be removed.');
    sheet_(SHEET.INCREMENTS).deleteRow(x.row);
    forget_('increments');
    audit_(ctx.emp, 'DELETE_INCREMENT', emp.id, x.month + '-01', (x.amount > 0 ? '+' : '') + x.amount + ' from ' + ymLabel_(x.month));
  } finally {
    lock.releaseLock();
  }
  return adminStaff(token);
}

/* ---------------------------- Holidays ----------------------------- */

/** Holidays of a year (admins with "Manage Holidays"). */
function adminHolidays(token, year) {
  authAdmin_(token, 'manageHolidays');
  year = /^\d{4}$/.test(String(year)) ? String(year) : todayStr_().slice(0, 4);
  return { year: year, types: HOLIDAY_TYPES,
    list: holidayList_().filter(x => x.date.slice(0, 4) === year).map(x => ({ date: x.date, name: x.name, type: x.type, closeAt: x.closeAt })) };
}

/** h = { date, name, type, closeAt }. closeAt (HH:mm) makes it a short day: a working day closing early. */
function adminSaveHoliday(token, h) {
  const ctx = authAdmin_(token, 'manageHolidays');
  h = h || {};
  const date = toDateStr_(h.date);
  const name = String(h.name || '').trim().slice(0, 80);
  const closeAt = h.type === SHORT_DAY ? toTimeStr_(h.closeAt) : '';
  if (h.type === SHORT_DAY && !closeAt) throw new Error('Enter the time the office closes.');
  const type = closeAt ? SHORT_DAY : (HOLIDAY_TYPES.indexOf(h.type) >= 0 ? h.type : 'Festival');
  if (!date) throw new Error('Choose the date.');
  if (!name) throw new Error('Enter the holiday name.');
  assertUnlocked_(date);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheetOrCreate_(SHEET.HOLIDAYS, HOLIDAY_HEADERS);
    ensureHeaders_(sh, HOLIDAY_HEADERS);
    forget_('holidays', 'holidayList', 'shortDays');
    const old = holidayList_().filter(x => x.date === date)[0];
    const row = ["'" + date, name, type, closeAt ? "'" + closeAt : ''];
    if (old) sh.getRange(old.row, 1, 1, 4).setValues([row]);
    else sh.appendRow(row);
    forget_('holidays', 'holidayList', 'shortDays');
    audit_(ctx.emp, old ? 'EDIT_HOLIDAY' : 'ADD_HOLIDAY', '', date, (old ? old.name + ' → ' : '') + name + ' (' + type + (closeAt ? ', closes ' + closeAt : '') + ')');
  } finally {
    lock.releaseLock();
  }
  return adminHolidays(token, date.slice(0, 4));
}

function adminDeleteHoliday(token, date) {
  const ctx = authAdmin_(token, 'manageHolidays');
  date = toDateStr_(date);
  assertUnlocked_(date);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    forget_('holidays', 'holidayList', 'shortDays');
    const old = holidayList_().filter(x => x.date === date)[0];
    if (!old) throw new Error('No holiday on this date.');
    sheet_(SHEET.HOLIDAYS).deleteRow(old.row);
    forget_('holidays', 'holidayList', 'shortDays');
    audit_(ctx.emp, 'DELETE_HOLIDAY', '', date, old.name);
  } finally {
    lock.releaseLock();
  }
  return adminHolidays(token, date.slice(0, 4));
}

function offType_(dateStr, s, holidays) {
  if (holidays[dateStr]) return 'HOLIDAY';
  const p = dateStr.split('-').map(Number);
  return s.weeklyOff.indexOf(new Date(p[0], p[1] - 1, p[2]).getDay()) >= 0 ? 'WEEK_OFF' : '';
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" not found. Run setup() from the Apps Script editor.');
  return sh;
}

function sheetOrCreate_(name, headers) {
  return getOrCreate_(SpreadsheetApp.getActive(), name, headers);
}

function getOrCreate_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e8eefc');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Deletes every data row matching fn (bottom-up so row numbers stay valid). */
function deleteRowsWhere_(name, fn) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (let i = vals.length - 1; i >= 0; i--) if (fn(vals[i])) sh.deleteRow(i + 2);
}

/** The spreadsheet's time zone, looked up once per request (it is used for every date and time). */
function tz_() {
  return memo_('tz', () => SpreadsheetApp.getActive().getSpreadsheetTimeZone() || Session.getScriptTimeZone());
}

function todayStr_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
}

function toDateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  const str = String(v || '').trim().replace(/^'/, '');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(str); // dd/MM/yyyy
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  return '';
}

const MONTHS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * A birthday as 'MM-DD' (no year), or '' when it is not a valid day. Accepts '20 Oct', 'Oct 20', '10-20',
 * a full date (yyyy-MM-dd or dd/MM/yyyy, the year is ignored) and date cells. 29 Feb is allowed.
 */
function toMonthDay_(v) {
  let m = null, d = null;
  if (v instanceof Date) { const ds = Utilities.formatDate(v, tz_(), 'yyyy-MM-dd'); m = +ds.slice(5, 7); d = +ds.slice(8, 10); }
  else {
    const str = String(v || '').trim().replace(/^'/, '');
    let x;
    const mon = w => MONTHS_.indexOf(String(w).slice(0, 3).toLowerCase()) + 1;
    if ((x = /^\d{4}-(\d{1,2})-(\d{1,2})$/.exec(str))) { m = +x[1]; d = +x[2]; }
    else if ((x = /^(\d{1,2})[\/.-](\d{1,2})[\/.-]\d{4}$/.exec(str))) { d = +x[1]; m = +x[2]; }
    else if ((x = /^(\d{1,2})-(\d{1,2})$/.exec(str))) { m = +x[1]; d = +x[2]; }
    else if ((x = /^(\d{1,2})\s*[-\s]\s*([a-z]{3,})\.?$/i.exec(str))) { d = +x[1]; m = mon(x[2]); }
    else if ((x = /^([a-z]{3,})\.?\s*[-\s]\s*(\d{1,2})$/i.exec(str))) { m = mon(x[1]); d = +x[2]; }
  }
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return m >= 1 && m <= 12 && d >= 1 && d <= max ? pad2_(m) + '-' + pad2_(d) : '';
}

/** 'MM-DD' → '20 Oct' for the sheet. */
function monthDayCell_(md) {
  const m = Number(md.slice(0, 2)), d = Number(md.slice(3, 5));
  return d + ' ' + MONTHS_[m - 1].charAt(0).toUpperCase() + MONTHS_[m - 1].slice(1);
}

function toYm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM');
  const m = /^(\d{4})-(\d{1,2})/.exec(String(v || '').trim().replace(/^'/, ''));
  return m ? m[1] + '-' + pad2_(m[2]) : '';
}

function toTimeStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'HH:mm');
  const m = /(\d{1,2}):(\d{2})/.exec(String(v || ''));
  return m ? pad2_(m[1]) + ':' + m[2] : '';
}

function toMinutes_(v) {
  const t = toTimeStr_(v);
  if (!t) return null;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

function minutesToStr_(min) {
  return pad2_(Math.floor(min / 60)) + ':' + pad2_(min % 60);
}

function addDays_(dateStr, n) {
  const p = dateStr.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2] + n);
  return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
}

function nextYm_(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return m === 12 ? (y + 1) + '-01' : y + '-' + pad2_(m + 1);
}

function prevYm_(ym) {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return m === 1 ? (y - 1) + '-12' : y + '-' + pad2_(m - 1);
}

function validYm_(ym) {
  ym = String(ym || '');
  return /^\d{4}-\d{2}$/.test(ym) ? ym : todayStr_().slice(0, 7);
}

function ymLabel_(ym) {
  const p = ym.split('-').map(Number);
  return Utilities.formatDate(new Date(p[0], p[1] - 1, 15), tz_(), 'MMMM yyyy');
}

function pad2_(n) {
  return ('0' + n).slice(-2);
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}
