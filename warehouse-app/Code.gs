/* ══════════════════════════════════════════════
   TRAVALATE WAREHOUSE — Raw Material Stock + Daily Ledger
   ------------------------------------------------------------
   One Google Sheet is the database. Tabs are created
   automatically on first use:
     Users       — app logins (username + hashed password, role)
     Sessions    — login tokens (stay signed in for 30 days)
     Materials   — raw material master (code, name, unit, min level…)
     StockMoves  — every stock IN / OUT / ADJUST (stock count) entry
     Ledger      — daily cash book: money IN / OUT entries
     Settings    — key/value (ledger opening balance, company name)
     ActivityLog — who did what, when

   SETUP (one time)
     1. Create a new Google Sheet → Extensions → Apps Script.
     2. Paste this file as Code.gs, add an HTML file named Index
        and paste Index.html into it.
     3. Deploy → New deployment → Web app.
          Execute as: Me      Who has access: Anyone
     4. Open the /exec link. The first screen creates the admin
        login; after that the admin adds employees under Users.

   Roles
     admin   — everything, incl. Users, Settings, Activity log
     manager — materials, stock, stock count, ledger; can edit
               and delete entries
     staff   — can add stock IN/OUT and ledger entries, view
               stock and ledger; cannot edit or delete
══════════════════════════════════════════════ */

const SCHEMAS = {
  Users:       ['ID', 'Name', 'Username', 'PasswordHash', 'Salt', 'Role', 'Active', 'CreatedAt', 'LastLogin'],
  Sessions:    ['Token', 'UserId', 'CreatedAt', 'ExpiresAt'],
  Materials:   ['ID', 'Code', 'Name', 'Category', 'Unit', 'MinStock', 'OpeningStock', 'Location', 'Active', 'CreatedAt'],
  StockMoves:  ['ID', 'Date', 'MaterialId', 'Type', 'Qty', 'Rate', 'Party', 'Reference', 'Note', 'UserId', 'UserName', 'CreatedAt'],
  Ledger:      ['ID', 'Date', 'Type', 'Category', 'Party', 'Description', 'Amount', 'Mode', 'Reference', 'UserId', 'UserName', 'CreatedAt'],
  Settings:    ['Key', 'Value'],
  ActivityLog: ['At', 'UserId', 'UserName', 'Action', 'Details'],
};
// Columns kept as plain text so Sheets never turns "2026-11-20" into a Date cell.
const TEXT_COLUMNS = {
  Users: ['Username', 'PasswordHash', 'Salt'],
  Sessions: ['Token'],
  Materials: ['Code', 'Location'],
  StockMoves: ['Date', 'Party', 'Reference'],
  Ledger: ['Date', 'Party', 'Reference'],
};
const ROLES = ['admin', 'manager', 'staff'];
const MOVE_TYPES = ['IN', 'OUT', 'ADJUST'];
const LEDGER_TYPES = ['IN', 'OUT'];
const PAY_MODES = ['Cash', 'Bank', 'UPI', 'Cheque', 'Other'];
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Travalate Warehouse')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ────────────── Sheet helpers ────────────── */

function getSheet_(name) {
  const headers = SCHEMAS[name];
  if (!headers) throw new Error('Unknown sheet: ' + name);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    (TEXT_COLUMNS[name] || []).forEach(col => {
      const c = headers.indexOf(col) + 1;
      if (c > 0) sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  } else {
    // Add any new column at the end; never reorder existing ones.
    const lastCol = Math.max(sh.getLastColumn(), 1);
    const existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    const missing = headers.filter(h => existing.indexOf(h) === -1);
    if (missing.length) sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
  return sh;
}

/** Every data row of a sheet as objects keyed by header (plus __row = sheet row number). */
function readAll_(name) {
  const sh = getSheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const rows = values.slice(1).map((row, i) => {
    const o = { __row: i + 2 };
    headers.forEach((h, c) => { o[h] = row[c]; });
    return o;
  });
  return { sh, headers, rows };
}

/** Builds a row in header order from an object. */
function toRow_(headers, obj) {
  return headers.map(h => (obj[h] === undefined ? '' : safeCell_(obj[h])));
}

/** Text typed by users must never be run as a spreadsheet formula. */
function safeCell_(v) {
  if (typeof v === 'string' && /^[=+@]/.test(v)) return "'" + v;
  return v;
}

function appendObj_(name, obj) {
  const sh = getSheet_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  sh.appendRow(toRow_(headers, obj));
}

function updateObj_(name, rowNum, headers, obj) {
  const sh = getSheet_(name);
  sh.getRange(rowNum, 1, 1, headers.length).setValues([toRow_(headers, obj)]);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function newId_() { return Utilities.getUuid(); }
function nowIso_() { return new Date().toISOString(); }
function tz_() { return Session.getScriptTimeZone(); }
function todayStr_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

function dateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return v ? String(v).slice(0, 10) : '';
}
function validDate_(s) {
  s = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Please pick a valid date.');
  return s;
}
function num_(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}
function round_(n, d) {
  const f = Math.pow(10, d === undefined ? 3 : d);
  return Math.round(n * f) / f;
}
function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function str_(v, max) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  return max ? s.slice(0, max) : s;
}

/* ────────────── Auth ────────────── */

function hash_(password, salt) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + String(salt));
  return d.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function publicUser_(u) {
  return {
    id: u.ID, name: u.Name, username: u.Username, role: u.Role,
    active: isTrue_(u.Active), createdAt: u.CreatedAt ? String(u.CreatedAt) : '',
    lastLogin: u.LastLogin ? String(u.LastLogin) : '',
  };
}

function findUserByUsername_(username) {
  const norm = str_(username).toLowerCase();
  return readAll_('Users').rows.find(r => str_(r.Username).toLowerCase() === norm) || null;
}

function checkPassword_(p) {
  if (!p || String(p).length < 6) throw new Error('Password must be at least 6 characters.');
}
function checkUsername_(u) {
  u = str_(u).toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) throw new Error('Username: 3–30 letters, numbers, dot, dash or underscore (no spaces).');
  return u;
}

function createSession_(userId) {
  const token = newId_() + newId_();
  const now = Date.now();
  appendObj_('Sessions', {
    Token: token, UserId: userId,
    CreatedAt: new Date(now).toISOString(), ExpiresAt: new Date(now + SESSION_LIFETIME_MS).toISOString(),
  });
  return token;
}

/** True until the first admin account exists. */
function needsSetup() {
  return readAll_('Users').rows.length === 0;
}

function setupFirstAdmin(name, username, password) {
  return withLock_(() => {
    if (!needsSetup()) throw new Error('Setup is already done — please log in.');
    if (!str_(name)) throw new Error('Name is required.');
    username = checkUsername_(username);
    checkPassword_(password);
    const salt = newId_();
    const u = {
      ID: newId_(), Name: str_(name, 80), Username: username, PasswordHash: hash_(password, salt), Salt: salt,
      Role: 'admin', Active: true, CreatedAt: nowIso_(), LastLogin: nowIso_(),
    };
    appendObj_('Users', u);
    log_(u, 'Setup', 'First admin account created');
    return { token: createSession_(u.ID), user: publicUser_(u) };
  });
}

function login(username, password) {
  return withLock_(() => {
    const u = findUserByUsername_(username);
    if (!u || hash_(password, u.Salt) !== u.PasswordHash) throw new Error('Wrong username or password.');
    if (!isTrue_(u.Active)) throw new Error('This login is switched off. Please contact your admin.');
    const { sh, headers } = readAll_('Users');
    sh.getRange(u.__row, headers.indexOf('LastLogin') + 1).setValue(nowIso_());
    log_(u, 'Login', '');
    return { token: createSession_(u.ID), user: publicUser_(u) };
  });
}

function logout(token) {
  return withLock_(() => {
    const { sh, rows } = readAll_('Sessions');
    const s = rows.find(r => r.Token === token);
    if (s) sh.deleteRow(s.__row);
    return true;
  });
}

/** Returns the signed-in user for a token, or throws. Every API call starts here. */
function requireUser_(token) {
  if (!token) throw new Error('Please log in again.');
  const { sh, headers, rows } = readAll_('Sessions');
  const s = rows.find(r => r.Token === token);
  if (!s) throw new Error('Your login has expired. Please log in again.');
  if (new Date(s.ExpiresAt).getTime() < Date.now()) {
    sh.deleteRow(s.__row);
    throw new Error('Your login has expired. Please log in again.');
  }
  const u = readAll_('Users').rows.find(r => String(r.ID) === String(s.UserId));
  if (!u || !isTrue_(u.Active)) {
    sh.deleteRow(s.__row);
    throw new Error('This login is switched off. Please contact your admin.');
  }
  // Sliding expiry, refreshed at most once an hour to save writes.
  const newExp = Date.now() + SESSION_LIFETIME_MS;
  if (newExp - new Date(s.ExpiresAt).getTime() > 60 * 60 * 1000) {
    sh.getRange(s.__row, headers.indexOf('ExpiresAt') + 1).setValue(new Date(newExp).toISOString());
  }
  return u;
}
function requireRole_(token, roles) {
  const u = requireUser_(token);
  if (roles.indexOf(u.Role) === -1) throw new Error('You do not have permission for this. Ask an admin or manager.');
  return u;
}
const MANAGERS_ = ['admin', 'manager'];

/** Called on page load with the saved token; null means "show the login screen". */
function resumeSession(token) {
  try { return { user: publicUser_(requireUser_(token)) }; } catch (e) { return null; }
}

function changeOwnPassword(token, oldPassword, newPassword) {
  return withLock_(() => {
    const me = requireUser_(token);
    if (hash_(oldPassword, me.Salt) !== me.PasswordHash) throw new Error('Current password is wrong.');
    checkPassword_(newPassword);
    setPassword_(me.__row, newPassword);
    log_(me, 'Password', 'Changed own password');
    return true;
  });
}

function setPassword_(rowNum, password) {
  const { sh, headers } = readAll_('Users');
  const salt = newId_();
  sh.getRange(rowNum, headers.indexOf('PasswordHash') + 1).setValue(hash_(password, salt));
  sh.getRange(rowNum, headers.indexOf('Salt') + 1).setValue(salt);
}

/* ────────────── Users (admin) ────────────── */

function listUsers(token) {
  requireRole_(token, ['admin']);
  return readAll_('Users').rows.map(publicUser_);
}

function addUser(token, input) {
  return withLock_(() => {
    const me = requireRole_(token, ['admin']);
    const name = str_(input.name, 80);
    if (!name) throw new Error('Name is required.');
    const username = checkUsername_(input.username);
    if (findUserByUsername_(username)) throw new Error('That username is already taken.');
    const role = ROLES.indexOf(input.role) === -1 ? 'staff' : input.role;
    checkPassword_(input.password);
    const salt = newId_();
    const u = {
      ID: newId_(), Name: name, Username: username, PasswordHash: hash_(input.password, salt), Salt: salt,
      Role: role, Active: true, CreatedAt: nowIso_(), LastLogin: '',
    };
    appendObj_('Users', u);
    log_(me, 'User added', name + ' (' + username + ', ' + role + ')');
    return publicUser_(u);
  });
}

function updateUser(token, userId, patch) {
  return withLock_(() => {
    const me = requireRole_(token, ['admin']);
    const { rows } = readAll_('Users');
    const u = rows.find(r => String(r.ID) === String(userId));
    if (!u) throw new Error('User not found.');
    const next = Object.assign({}, u);
    if (patch.name !== undefined) { next.Name = str_(patch.name, 80); if (!next.Name) throw new Error('Name is required.'); }
    if (patch.role !== undefined) { if (ROLES.indexOf(patch.role) === -1) throw new Error('Unknown role.'); next.Role = patch.role; }
    if (patch.active !== undefined) next.Active = !!patch.active;
    const activeAdmins = rows.filter(r => r.Role === 'admin' && isTrue_(r.Active) && String(r.ID) !== String(u.ID)).length;
    if (activeAdmins === 0 && (next.Role !== 'admin' || !isTrue_(next.Active))) {
      throw new Error('There must always be at least one active admin.');
    }
    const { sh, headers } = readAll_('Users');
    ['Name', 'Role', 'Active'].forEach(k => sh.getRange(u.__row, headers.indexOf(k) + 1).setValue(safeCell_(next[k])));
    if (!isTrue_(next.Active)) dropSessions_(u.ID);
    log_(me, 'User updated', next.Name + ' → ' + next.Role + (isTrue_(next.Active) ? '' : ' (switched off)'));
    return publicUser_(next);
  });
}

function resetUserPassword(token, userId, newPassword) {
  return withLock_(() => {
    const me = requireRole_(token, ['admin']);
    const u = readAll_('Users').rows.find(r => String(r.ID) === String(userId));
    if (!u) throw new Error('User not found.');
    checkPassword_(newPassword);
    setPassword_(u.__row, newPassword);
    dropSessions_(u.ID);
    log_(me, 'Password reset', 'For ' + u.Name);
    return true;
  });
}

function dropSessions_(userId) {
  const { sh, rows } = readAll_('Sessions');
  rows.filter(r => String(r.UserId) === String(userId)).reverse().forEach(r => sh.deleteRow(r.__row));
}

/* ────────────── Activity log ────────────── */

function log_(user, action, details) {
  try {
    appendObj_('ActivityLog', {
      At: nowIso_(), UserId: user ? user.ID : '', UserName: user ? user.Name : '', Action: action, Details: str_(details, 500),
    });
  } catch (e) { /* logging must never break the real action */ }
}

function listActivity(token, limit) {
  requireRole_(token, ['admin']);
  const rows = readAll_('ActivityLog').rows;
  return rows.slice(-Math.min(num_(limit) || 300, 2000)).reverse().map(r => ({
    at: String(r.At), user: r.UserName, action: r.Action, details: r.Details,
  }));
}

/* ────────────── Settings ────────────── */

function getSettings_() {
  const out = { CompanyName: 'Travalate', OpeningBalance: 0, OpeningDate: '' };
  readAll_('Settings').rows.forEach(r => { if (r.Key) out[r.Key] = r.Value; });
  out.OpeningBalance = num_(out.OpeningBalance);
  out.OpeningDate = dateStr_(out.OpeningDate);
  return out;
}

function saveSettings(token, input) {
  return withLock_(() => {
    const me = requireRole_(token, ['admin']);
    const { sh, rows } = readAll_('Settings');
    const put = (key, value) => {
      const r = rows.find(x => x.Key === key);
      if (r) sh.getRange(r.__row, 2).setValue(safeCell_(value));
      else sh.appendRow([key, safeCell_(value)]);
    };
    if (input.companyName !== undefined) put('CompanyName', str_(input.companyName, 80) || 'Travalate');
    if (input.openingBalance !== undefined) put('OpeningBalance', round_(num_(input.openingBalance), 2));
    if (input.openingDate !== undefined) put('OpeningDate', input.openingDate ? "'" + validDate_(input.openingDate) : '');
    log_(me, 'Settings', JSON.stringify(input));
    return publicSettings_();
  });
}

function publicSettings_() {
  const s = getSettings_();
  return { companyName: s.CompanyName, openingBalance: s.OpeningBalance, openingDate: s.OpeningDate };
}

/* ────────────── Start-up data ────────────── */

/** Everything the page needs right after login. */
function getAppData(token) {
  const me = requireUser_(token);
  return {
    user: publicUser_(me),
    settings: publicSettings_(),
    materials: materialsWithStock_(),
    payModes: PAY_MODES,
    today: todayStr_(),
  };
}

/* ────────────── Raw materials ────────────── */

function publicMaterial_(m) {
  return {
    id: m.ID, code: str_(m.Code), name: str_(m.Name), category: str_(m.Category), unit: str_(m.Unit),
    minStock: num_(m.MinStock), openingStock: num_(m.OpeningStock), location: str_(m.Location),
    active: m.Active === '' ? true : isTrue_(m.Active),
  };
}

/** Materials with live stock = opening + IN − OUT ± ADJUST, plus last purchase rate. */
function materialsWithStock_() {
  const mats = readAll_('Materials').rows.map(publicMaterial_);
  const byId = {};
  mats.forEach(m => { m.stock = m.openingStock; m.totalIn = 0; m.totalOut = 0; m.lastRate = 0; m.lastMove = ''; byId[m.id] = m; });
  readAll_('StockMoves').rows.forEach(r => {
    const m = byId[r.MaterialId];
    if (!m) return;
    const q = num_(r.Qty);
    if (r.Type === 'IN') { m.stock += q; m.totalIn += q; if (num_(r.Rate) > 0) m.lastRate = num_(r.Rate); }
    else if (r.Type === 'OUT') { m.stock -= q; m.totalOut += q; }
    else if (r.Type === 'ADJUST') m.stock += q;
    const d = dateStr_(r.Date);
    if (d > m.lastMove) m.lastMove = d;
  });
  mats.forEach(m => {
    m.stock = round_(m.stock);
    m.totalIn = round_(m.totalIn);
    m.totalOut = round_(m.totalOut);
    m.value = round_(m.stock * m.lastRate, 2);
    m.low = m.active && m.minStock > 0 && m.stock <= m.minStock;
  });
  mats.sort((a, b) => a.name.localeCompare(b.name));
  return mats;
}

function listMaterials(token) {
  requireUser_(token);
  return materialsWithStock_();
}

function saveMaterial(token, input) {
  return withLock_(() => {
    const me = requireRole_(token, MANAGERS_);
    const name = str_(input.name, 100);
    if (!name) throw new Error('Material name is required.');
    const unit = str_(input.unit, 20);
    if (!unit) throw new Error('Unit is required (e.g. kg, metre, pcs).');
    const code = str_(input.code, 30);
    const { headers, rows } = readAll_('Materials');
    const clash = rows.find(r => String(r.ID) !== String(input.id || '') &&
      (str_(r.Name).toLowerCase() === name.toLowerCase() || (code && str_(r.Code).toLowerCase() === code.toLowerCase())));
    if (clash) throw new Error('A material with this name or code already exists: ' + clash.Name);
    const obj = {
      Code: code, Name: name, Category: str_(input.category, 50), Unit: unit,
      MinStock: Math.max(0, num_(input.minStock)), OpeningStock: num_(input.openingStock),
      Location: str_(input.location, 50), Active: input.active === undefined ? true : !!input.active,
    };
    if (input.id) {
      const cur = rows.find(r => String(r.ID) === String(input.id));
      if (!cur) throw new Error('Material not found.');
      updateObj_('Materials', cur.__row, headers, Object.assign({}, cur, obj));
      log_(me, 'Material edited', name);
    } else {
      obj.ID = newId_();
      obj.CreatedAt = nowIso_();
      appendObj_('Materials', obj);
      log_(me, 'Material added', name + ' (opening ' + obj.OpeningStock + ' ' + unit + ')');
    }
    return materialsWithStock_();
  });
}

function deleteMaterial(token, id) {
  return withLock_(() => {
    const me = requireRole_(token, ['admin']);
    const { sh, rows } = readAll_('Materials');
    const m = rows.find(r => String(r.ID) === String(id));
    if (!m) throw new Error('Material not found.');
    const used = readAll_('StockMoves').rows.some(r => String(r.MaterialId) === String(id));
    if (used) throw new Error('This material has stock entries. Switch it to "Inactive" instead of deleting.');
    sh.deleteRow(m.__row);
    log_(me, 'Material deleted', m.Name);
    return materialsWithStock_();
  });
}

/* ────────────── Stock IN / OUT / ADJUST ────────────── */

function publicMove_(r, matById) {
  const m = matById[r.MaterialId] || {};
  return {
    id: r.ID, date: dateStr_(r.Date), materialId: r.MaterialId, material: m.name || '(deleted)', unit: m.unit || '',
    type: r.Type, qty: num_(r.Qty), rate: num_(r.Rate), amount: round_(num_(r.Qty) * num_(r.Rate), 2),
    party: str_(r.Party), reference: str_(r.Reference), note: str_(r.Note), user: str_(r.UserName),
    createdAt: String(r.CreatedAt || ''),
  };
}

/** type: IN (received / purchase) or OUT (issued / used). */
function addStockMove(token, input) {
  return withLock_(() => {
    const me = requireUser_(token);
    const type = String(input.type || '').toUpperCase();
    if (type !== 'IN' && type !== 'OUT') throw new Error('Choose Stock IN or Stock OUT.');
    const date = validDate_(input.date);
    const qty = num_(input.qty);
    if (!(qty > 0)) throw new Error('Quantity must be more than 0.');
    const mats = materialsWithStock_();
    const m = mats.find(x => x.id === input.materialId);
    if (!m) throw new Error('Please choose a material.');
    if (!m.active) throw new Error(m.name + ' is inactive.');
    if (type === 'OUT' && qty > m.stock + 1e-9) {
      throw new Error('Not enough stock. ' + m.name + ' has only ' + m.stock + ' ' + m.unit + '.');
    }
    const row = {
      ID: newId_(), Date: date, MaterialId: m.id, Type: type, Qty: round_(qty),
      Rate: Math.max(0, round_(num_(input.rate), 2)), Party: str_(input.party, 80), Reference: str_(input.reference, 60),
      Note: str_(input.note, 300), UserId: me.ID, UserName: me.Name, CreatedAt: nowIso_(),
    };
    appendObj_('StockMoves', row);
    log_(me, 'Stock ' + type, m.name + ': ' + row.Qty + ' ' + m.unit + (row.Party ? ' — ' + row.Party : ''));

    // Optional: also write the payment in the Daily Ledger (purchases paid now).
    if (type === 'IN' && input.addToLedger && row.Rate > 0) {
      appendObj_('Ledger', {
        ID: newId_(), Date: date, Type: 'OUT', Category: 'Raw material purchase', Party: row.Party,
        Description: m.name + ' ' + row.Qty + ' ' + m.unit + ' @ ' + row.Rate, Amount: round_(row.Qty * row.Rate, 2),
        Mode: PAY_MODES.indexOf(input.ledgerMode) === -1 ? 'Cash' : input.ledgerMode, Reference: row.Reference,
        UserId: me.ID, UserName: me.Name, CreatedAt: nowIso_(),
      });
      log_(me, 'Ledger OUT', 'Purchase ' + m.name + ' ' + round_(row.Qty * row.Rate, 2));
    }
    return materialsWithStock_();
  });
}

/** Filters: {from, to, materialId, type}. Newest first, max 1000 rows. */
function listStockMoves(token, filter) {
  requireUser_(token);
  filter = filter || {};
  const matById = {};
  readAll_('Materials').rows.map(publicMaterial_).forEach(m => { matById[m.id] = m; });
  const from = filter.from ? validDate_(filter.from) : '';
  const to = filter.to ? validDate_(filter.to) : '';
  const out = readAll_('StockMoves').rows
    .map(r => publicMove_(r, matById))
    .filter(r => (!from || r.date >= from) && (!to || r.date <= to) &&
      (!filter.materialId || r.materialId === filter.materialId) && (!filter.type || r.type === filter.type));
  out.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  return out.slice(0, 1000);
}

function deleteStockMove(token, id) {
  return withLock_(() => {
    const me = requireRole_(token, MANAGERS_);
    const { sh, rows } = readAll_('StockMoves');
    const r = rows.find(x => String(x.ID) === String(id));
    if (!r) throw new Error('Entry not found (maybe already deleted).');
    const mat = readAll_('Materials').rows.find(m => String(m.ID) === String(r.MaterialId));
    sh.deleteRow(r.__row);
    log_(me, 'Stock entry deleted', (mat ? mat.Name : '?') + ' ' + r.Type + ' ' + r.Qty + ' on ' + dateStr_(r.Date));
    return materialsWithStock_();
  });
}

/**
 * Physical stock count. counts = [{materialId, counted}]. For every material where the counted
 * quantity differs from the system stock, an ADJUST entry (signed difference) is saved.
 */
function saveStockCount(token, date, counts, note) {
  return withLock_(() => {
    const me = requireRole_(token, MANAGERS_);
    date = validDate_(date);
    const byId = {};
    materialsWithStock_().forEach(m => { byId[m.id] = m; });
    let changed = 0;
    const lines = [];
    (counts || []).forEach(c => {
      const m = byId[c.materialId];
      if (!m || c.counted === '' || c.counted === null || c.counted === undefined) return;
      const counted = num_(c.counted);
      if (counted < 0) throw new Error('Counted quantity cannot be negative (' + m.name + ').');
      const diff = round_(counted - m.stock);
      if (Math.abs(diff) < 1e-9) return;
      appendObj_('StockMoves', {
        ID: newId_(), Date: date, MaterialId: m.id, Type: 'ADJUST', Qty: diff, Rate: 0, Party: '',
        Reference: 'Stock count', Note: str_('System ' + m.stock + ', counted ' + counted + (note ? ' — ' + note : ''), 300),
        UserId: me.ID, UserName: me.Name, CreatedAt: nowIso_(),
      });
      changed++;
      lines.push(m.name + ' ' + (diff > 0 ? '+' : '') + diff);
    });
    log_(me, 'Stock count', changed ? lines.join(', ') : 'No differences');
    return { changed: changed, materials: materialsWithStock_() };
  });
}

/* ────────────── Daily Ledger ────────────── */

function publicLedger_(r) {
  return {
    id: r.ID, date: dateStr_(r.Date), type: r.Type, category: str_(r.Category), party: str_(r.Party),
    description: str_(r.Description), amount: num_(r.Amount), mode: str_(r.Mode) || 'Cash',
    reference: str_(r.Reference), user: str_(r.UserName), createdAt: String(r.CreatedAt || ''),
  };
}

function ledgerEntries_() {
  const s = getSettings_();
  return readAll_('Ledger').rows.map(publicLedger_)
    .filter(e => !s.OpeningDate || e.date >= s.OpeningDate);
}

function validLedgerInput_(input) {
  const type = String(input.type || '').toUpperCase();
  if (LEDGER_TYPES.indexOf(type) === -1) throw new Error('Choose Money IN or Money OUT.');
  const amount = round_(num_(input.amount), 2);
  if (!(amount > 0)) throw new Error('Amount must be more than 0.');
  const description = str_(input.description, 300);
  const category = str_(input.category, 60);
  if (!description && !category) throw new Error('Add a category or a description.');
  return {
    Date: validDate_(input.date), Type: type, Category: category, Party: str_(input.party, 80),
    Description: description, Amount: amount, Mode: PAY_MODES.indexOf(input.mode) === -1 ? 'Cash' : input.mode,
    Reference: str_(input.reference, 60),
  };
}

function addLedgerEntry(token, input) {
  return withLock_(() => {
    const me = requireUser_(token);
    const obj = validLedgerInput_(input);
    Object.assign(obj, { ID: newId_(), UserId: me.ID, UserName: me.Name, CreatedAt: nowIso_() });
    appendObj_('Ledger', obj);
    log_(me, 'Ledger ' + obj.Type, obj.Amount + ' — ' + (obj.Category || obj.Description));
    return getLedgerDay_(obj.Date);
  });
}

function updateLedgerEntry(token, id, input) {
  return withLock_(() => {
    const me = requireRole_(token, MANAGERS_);
    const { headers, rows } = readAll_('Ledger');
    const cur = rows.find(r => String(r.ID) === String(id));
    if (!cur) throw new Error('Entry not found.');
    const obj = Object.assign({}, cur, validLedgerInput_(input));
    updateObj_('Ledger', cur.__row, headers, obj);
    log_(me, 'Ledger edited', dateStr_(cur.Date) + ' ' + cur.Type + ' ' + cur.Amount + ' → ' + obj.Type + ' ' + obj.Amount);
    return getLedgerDay_(obj.Date);
  });
}

function deleteLedgerEntry(token, id) {
  return withLock_(() => {
    const me = requireRole_(token, MANAGERS_);
    const { sh, rows } = readAll_('Ledger');
    const cur = rows.find(r => String(r.ID) === String(id));
    if (!cur) throw new Error('Entry not found (maybe already deleted).');
    sh.deleteRow(cur.__row);
    log_(me, 'Ledger deleted', dateStr_(cur.Date) + ' ' + cur.Type + ' ' + cur.Amount + ' — ' + (cur.Category || cur.Description));
    return getLedgerDay_(dateStr_(cur.Date));
  });
}

function getLedgerDay(token, date) {
  requireUser_(token);
  return getLedgerDay_(validDate_(date));
}

/** One day: opening balance, entries, totals, closing balance (all modes together + per mode). */
function getLedgerDay_(date) {
  const s = getSettings_();
  const all = ledgerEntries_();
  let opening = s.OpeningBalance;
  const entries = [];
  all.forEach(e => {
    if (e.date < date) opening += e.type === 'IN' ? e.amount : -e.amount;
    else if (e.date === date) entries.push(e);
  });
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let totalIn = 0, totalOut = 0;
  const byMode = {};
  entries.forEach(e => {
    if (e.type === 'IN') totalIn += e.amount; else totalOut += e.amount;
    byMode[e.mode] = byMode[e.mode] || { in: 0, out: 0 };
    byMode[e.mode][e.type === 'IN' ? 'in' : 'out'] += e.amount;
  });
  return {
    date: date, opening: round_(opening, 2), totalIn: round_(totalIn, 2), totalOut: round_(totalOut, 2),
    closing: round_(opening + totalIn - totalOut, 2), entries: entries, byMode: byMode,
    categories: ledgerCategories_(all),
  };
}

function ledgerCategories_(all) {
  const seen = {};
  ['Sales', 'Raw material purchase', 'Salary', 'Rent', 'Electricity', 'Transport', 'Office expense', 'Tea / Food', 'Other']
    .forEach(c => { seen[c] = true; });
  all.forEach(e => { if (e.category) seen[e.category] = true; });
  return Object.keys(seen).sort();
}

/** Day-by-day summary between two dates, plus every entry (for the report / CSV). */
function getLedgerRange(token, from, to) {
  requireUser_(token);
  from = validDate_(from); to = validDate_(to);
  if (from > to) throw new Error('"From" date is after "To" date.');
  const s = getSettings_();
  const all = ledgerEntries_();
  let opening = s.OpeningBalance;
  const days = {};
  const entries = [];
  all.forEach(e => {
    if (e.date < from) { opening += e.type === 'IN' ? e.amount : -e.amount; return; }
    if (e.date > to) return;
    entries.push(e);
    days[e.date] = days[e.date] || { date: e.date, in: 0, out: 0 };
    days[e.date][e.type === 'IN' ? 'in' : 'out'] += e.amount;
  });
  entries.sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
  let bal = opening, totalIn = 0, totalOut = 0;
  const dayList = Object.keys(days).sort().map(d => {
    const x = days[d];
    const o = bal;
    bal += x.in - x.out; totalIn += x.in; totalOut += x.out;
    return { date: d, opening: round_(o, 2), in: round_(x.in, 2), out: round_(x.out, 2), closing: round_(bal, 2) };
  });
  const byCategory = {};
  entries.forEach(e => {
    const k = (e.type === 'IN' ? 'IN · ' : 'OUT · ') + (e.category || 'Uncategorised');
    byCategory[k] = round_((byCategory[k] || 0) + e.amount, 2);
  });
  return {
    from: from, to: to, opening: round_(opening, 2), totalIn: round_(totalIn, 2), totalOut: round_(totalOut, 2),
    closing: round_(bal, 2), days: dayList, entries: entries, byCategory: byCategory,
  };
}

/* ────────────── Dashboard ────────────── */

function getDashboard(token) {
  requireUser_(token);
  const today = todayStr_();
  const mats = materialsWithStock_();
  const active = mats.filter(m => m.active);
  const day = getLedgerDay_(today);
  const matById = {};
  mats.forEach(m => { matById[m.id] = m; });
  const moves = readAll_('StockMoves').rows.map(r => publicMove_(r, matById));
  const todayMoves = moves.filter(m => m.date === today);
  moves.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  return {
    today: today,
    materialCount: active.length,
    lowStock: active.filter(m => m.low).map(m => ({ name: m.name, stock: m.stock, unit: m.unit, minStock: m.minStock })),
    stockValue: round_(active.reduce((s, m) => s + Math.max(0, m.value), 0), 2),
    todayInCount: todayMoves.filter(m => m.type === 'IN').length,
    todayOutCount: todayMoves.filter(m => m.type === 'OUT').length,
    ledger: { opening: day.opening, totalIn: day.totalIn, totalOut: day.totalOut, closing: day.closing, count: day.entries.length },
    recentMoves: moves.slice(0, 8),
  };
}
