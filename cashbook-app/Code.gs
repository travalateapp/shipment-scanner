/* ══════════════════════════════════════════════
   TRAVALATE CASH BOOK — backend (single file)
   ------------------------------------------------------------
   Bound to a Google Sheet. Sheets are created automatically on first use:
     Users         — owner + staff, PINs stored salted + hashed
     Sessions      — login tokens (30 days)
     Entries       — every Cash In / Cash Out (soft-deleted, never removed)
     (Parties      — no longer written: party suggestions are built from Entries. An old tab is left as it is.)
     EditRequests  — staff requests to change or delete an entry; owner approves
     Settings      — key/value (BusinessName)
   Attachments are saved in a Drive folder "Cash Book Attachments" and are only
   served back through getAttachment() to a logged-in user (never shared publicly).

   Roles: OWNER can do everything. STAFF can add entries and view the book/reports,
   but every change or delete of an existing entry goes through an Edit Request.
   Every function that needs a login takes `token` and re-checks the user server-side.
══════════════════════════════════════════════ */

const SCHEMAS = {
  Users:        ['ID', 'Name', 'Role', 'PinHash', 'Salt', 'Active', 'CreatedAt'],
  Sessions:     ['Token', 'UserId', 'CreatedAt', 'ExpiresAt'],
  Entries:      ['ID', 'Date', 'Time', 'Type', 'Amount', 'PartyName', 'PartyPhone', 'Mode', 'Category', 'Notes',
                 'Attachments', 'CreatedBy', 'CreatedByName', 'CreatedAt', 'UpdatedAt', 'UpdatedByName', 'Deleted'],
  EditRequests: ['ID', 'EntryId', 'Action', 'Changes', 'Reason', 'RequestedBy', 'RequestedByName', 'Status',
                 'ReviewedByName', 'ReviewNote', 'CreatedAt', 'ReviewedAt'],
  Settings:     ['Key', 'Value'],
};
// Kept as plain text so Sheets never turns them into Date cells.
const TEXT_COLUMNS = { Entries: ['Date', 'Time', 'PartyPhone'] };
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PIN_TRIES = 5;           // wrong PINs before the user is locked out…
const LOCKOUT_SECONDS = 15 * 60;   // …for this long
const ATTACH_FOLDER_NAME = 'Cash Book Attachments';
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MODES = ['Cash', 'UPI', 'Bank', 'Card', 'Cheque', 'Other'];
const EDITABLE_FIELDS = ['Date', 'Time', 'Type', 'Amount', 'PartyName', 'PartyPhone', 'Mode', 'Category', 'Notes', 'Attachments'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Cash Book')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ───────── JSON API for the Android app (same functions as google.script.run) ─────────
   The app carries Index.html inside the APK and POSTs {fn, args, rid} here. Only the functions listed below can
   be called, and each one still checks the login token itself. A retried request (same rid) gets the first
   answer back, so a Cash In is never saved twice on a bad connection. */
const API_FUNCTIONS = {
  getBootstrap, setupOwner, login, logout, resume, getBook, saveEntry, deleteEntry, uploadAttachment, getAttachment,
  createEditRequest, listEditRequests, reviewEditRequest, listUsers, saveUser, changeMyPin, saveBusinessName,
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
    json = JSON.stringify({ ok: true, result: result === undefined ? null : result });
  } catch (err) {
    json = JSON.stringify({ ok: false, error: String((err && err.message) || err) });
  }
  if (rid && json.length < 95000) {
    try { CacheService.getScriptCache().put(rid, json, 600); } catch (err) { /* ignore */ }
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/* ───────── sheet helpers ───────── */

/* Speed: every Sheet/Drive call costs 20–100 ms in Apps Script, so within one request each sheet is opened and read
   at most once (MEMO_, cleared by every write), and the column check below runs once per schema change, not on
   every call. */
const MEMO_ = {};
/** Apps Script normally starts each request fresh; if it ever reuses one, memo older than 15 s is dropped. */
function memoFresh_() {
  if (MEMO_._t && Date.now() - MEMO_._t < 15000) return;
  Object.keys(MEMO_).forEach(k => { delete MEMO_[k]; });
  MEMO_._t = Date.now();
}
const SCHEMA_KEY = 'SCHEMA_OK_' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(SCHEMAS))).slice(0, 10);

function getSheet_(name) {
  memoFresh_();
  if (MEMO_['sh_' + name]) return MEMO_['sh_' + name];
  const headers = SCHEMAS[name];
  const ss = MEMO_.ss || (MEMO_.ss = SpreadsheetApp.getActiveSpreadsheet());
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    (TEXT_COLUMNS[name] || []).forEach(col => {
      sh.getRange(1, headers.indexOf(col) + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  } else if (!schemaChecked_(name)) {
    // Add any missing column at the END only, so existing rows stay aligned.
    const have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
    headers.filter(h => have.indexOf(h) < 0).forEach(h => sh.getRange(1, sh.getLastColumn() + 1).setValue(h));
    schemaChecked_(name, true);
  }
  MEMO_['sh_' + name] = sh;
  return sh;
}

/** Remembers (Script Properties) which sheets already have every SCHEMAS column. */
function schemaChecked_(name, mark) {
  if (MEMO_.schemaOk === undefined) MEMO_.schemaOk = PropertiesService.getScriptProperties().getProperty(SCHEMA_KEY) || '';
  const list = MEMO_.schemaOk.split(',');
  if (!mark) return list.indexOf(name) >= 0;
  if (list.indexOf(name) < 0) {
    MEMO_.schemaOk = list.concat(name).filter(Boolean).join(',');
    PropertiesService.getScriptProperties().setProperty(SCHEMA_KEY, MEMO_.schemaOk);
  }
  return true;
}

/** Returns {sh, headers, rows:[{_row, Col:value…}]} */
function readAll_(name) {
  memoFresh_();
  if (MEMO_['rows_' + name]) return MEMO_['rows_' + name];
  const sh = getSheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values.shift().map(String);
  const rows = values.map((r, i) => {
    const o = { _row: i + 2 };
    headers.forEach((h, j) => { o[h] = r[j]; });
    return o;
  });
  MEMO_['hd_' + name] = headers;
  return (MEMO_['rows_' + name] = { sh, headers, rows });
}

/** The sheet's header row (read once per request). */
function headers_(name) {
  if (!MEMO_['hd_' + name]) {
    const sh = getSheet_(name);
    MEMO_['hd_' + name] = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  }
  return MEMO_['hd_' + name];
}

/** After a write, the next read of that sheet in this request reads it again. */
function dirty_(name) { delete MEMO_['rows_' + name]; }

function appendObj_(name, obj) {
  const headers = headers_(name);
  getSheet_(name).appendRow(headers.map(h => (obj[h] === undefined ? '' : obj[h])));
  dirty_(name);
}

/** obj holds only the columns to change; `cur` (the row as read) saves reading it again. */
function updateObj_(name, rowNum, obj, cur) {
  const headers = headers_(name), sh = getSheet_(name);
  const old = cur ? headers.map(h => cur[h]) : sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  const next = headers.map((h, j) => (obj[h] === undefined ? old[j] : obj[h]));
  sh.getRange(rowNum, 1, 1, headers.length).setValues([next]);
  dirty_(name);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function nowIso_() { return new Date().toISOString(); }
function tz_() { return Session.getScriptTimeZone() || 'Asia/Kolkata'; }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

function txt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}
function timeTxt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'HH:mm');
  return txt_(v);
}

function getSetting_(key, def) {
  const cache = CacheService.getScriptCache(), hit = cache.get('set_' + key);
  if (hit !== null) return hit || def;
  const r = readAll_('Settings').rows.find(x => x.Key === key);
  const v = r ? String(r.Value) : '';
  cache.put('set_' + key, v, 21600);
  return v || def;
}
function setSetting_(key, value) {
  const t = readAll_('Settings');
  const r = t.rows.find(x => x.Key === key);
  if (r) updateObj_('Settings', r._row, { Value: value }, r);
  else appendObj_('Settings', { Key: key, Value: value });
  CacheService.getScriptCache().put('set_' + key, String(value), 21600);
}

/* ───────── PINs & sessions ───────── */

function hashPin_(pin, salt) {
  let h = salt + ':' + pin;
  for (let i = 0; i < 300; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt));
  }
  return h;
}

function checkPinFormat_(pin) {
  pin = String(pin || '');
  if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN must be 4 to 6 digits.');
  return pin;
}

function publicUser_(u) {
  return { id: String(u.ID), name: String(u.Name), role: String(u.Role), active: isActive_(u) };
}

function isActive_(u) { return u.Active === true || String(u.Active).toUpperCase() === 'TRUE'; }

/**
 * The users without PIN data, kept in the script cache (6 h) so a normal request reads no Users sheet.
 * Every write to Users clears it (usersChanged_).
 */
function usersLite_() {
  memoFresh_();
  if (MEMO_.users) return MEMO_.users;
  const cache = CacheService.getScriptCache(), hit = cache.get('users_v1');
  if (hit) return (MEMO_.users = JSON.parse(hit));
  const list = readAll_('Users').rows.filter(r => r.ID !== '')
    .map(r => ({ ID: String(r.ID), Name: String(r.Name), Role: String(r.Role), Active: isActive_(r) }));
  cache.put('users_v1', JSON.stringify(list), 21600);
  return (MEMO_.users = list);
}
function usersChanged_() { delete MEMO_.users; CacheService.getScriptCache().remove('users_v1'); }

/**
 * Returns the logged-in user {ID, Name, Role, Active} or throws. The token → user link is kept in the script
 * cache (up to 6 h, never past the session's end), so most requests skip the Sessions sheet.
 */
function auth_(token, ownerOnly) {
  if (!token || !/^[\w-]{20,100}$/.test(String(token))) throw new Error('SESSION_EXPIRED');
  const cache = CacheService.getScriptCache();
  let userId = cache.get('tok_' + token);
  if (!userId) {
    const s = readAll_('Sessions').rows.find(r => r.Token === token);
    const left = s ? new Date(s.ExpiresAt).getTime() - Date.now() : 0;
    if (!s || left <= 0) throw new Error('SESSION_EXPIRED');
    userId = String(s.UserId);
    cache.put('tok_' + token, userId, Math.max(1, Math.min(21600, Math.floor(left / 1000))));
  }
  const u = usersLite_().find(r => r.ID === userId);
  if (!u || !u.Active) { cache.remove('tok_' + token); throw new Error('SESSION_EXPIRED'); }
  if (ownerOnly && u.Role !== 'OWNER') throw new Error('Only the owner can do this.');
  return u;
}

/* ───────── public: first run, login ───────── */

function getBootstrap() {
  const users = usersLite_().filter(u => u.Active);
  return {
    hasOwner: users.some(u => u.Role === 'OWNER'),
    business: getSetting_('BusinessName', 'My Cash Book'),
    users: users.map(publicUser_),
  };
}

function setupOwner(business, name, pin) {
  return withLock_(() => {
    if (readAll_('Users').rows.some(u => u.Role === 'OWNER')) throw new Error('Owner is already set up.');
    name = String(name || '').trim();
    if (!name) throw new Error('Enter your name.');
    pin = checkPinFormat_(pin);
    const salt = uid_();
    appendObj_('Users', { ID: uid_(), Name: name, Role: 'OWNER', PinHash: hashPin_(pin, salt), Salt: salt,
                          Active: true, CreatedAt: nowIso_() });
    usersChanged_();
    setSetting_('BusinessName', String(business || '').trim() || 'My Cash Book');
    return getBootstrap();
  });
}

/** from/to (optional, 'yyyy-MM-dd'): also returns that month's book, so the app opens in one request. */
function login(userId, pin, from, to) {
  const cache = CacheService.getScriptCache();
  const key = 'pinfail_' + userId;
  const fails = Number(cache.get(key) || 0);
  if (fails >= MAX_PIN_TRIES) throw new Error('Too many wrong PINs. Try again in 15 minutes or ask the owner.');
  const u = readAll_('Users').rows.find(r => String(r.ID) === String(userId) && isActive_(r));
  if (!u) throw new Error('User not found.');
  if (hashPin_(String(pin || ''), String(u.Salt)) !== String(u.PinHash)) {
    cache.put(key, String(fails + 1), LOCKOUT_SECONDS);
    const left = MAX_PIN_TRIES - fails - 1;
    throw new Error(left > 0 ? 'Wrong PIN. ' + left + ' tries left.' : 'Too many wrong PINs. Try again in 15 minutes.');
  }
  cache.remove(key);
  const token = Utilities.getUuid() + Utilities.getUuid();
  withLock_(() => {
    // Drop this user's expired sessions while we are here.
    const t = readAll_('Sessions');
    const dead = t.rows.filter(r => new Date(r.ExpiresAt).getTime() < Date.now()).map(r => r._row).reverse();
    dead.forEach(rn => t.sh.deleteRow(rn));
    if (dead.length) dirty_('Sessions');
    appendObj_('Sessions', { Token: token, UserId: String(u.ID), CreatedAt: nowIso_(),
                             ExpiresAt: new Date(Date.now() + SESSION_LIFETIME_MS).toISOString() });
  });
  CacheService.getScriptCache().put('tok_' + token, String(u.ID), 21600);
  const out = { token, user: publicUser_(u), business: getSetting_('BusinessName', 'My Cash Book') };
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(from)) && /^\d{4}-\d{2}-\d{2}$/.test(String(to))) out.book = getBook(token, from, to);
  return out;
}

function logout(token) {
  CacheService.getScriptCache().remove('tok_' + token);
  withLock_(() => {
    const t = readAll_('Sessions');
    const r = t.rows.find(x => x.Token === token);
    if (r) { t.sh.deleteRow(r._row); dirty_('Sessions'); }
  });
  return true;
}

/** Checks a saved token when the page is reopened. */
function resume(token) {
  const u = auth_(token);
  return { user: publicUser_(u), business: getSetting_('BusinessName', 'My Cash Book') };
}

/* ───────── entries ───────── */

function entryOut_(r) {
  let att = [];
  try { att = JSON.parse(r.Attachments || '[]'); } catch (e) { att = []; }
  return {
    id: String(r.ID), date: txt_(r.Date), time: timeTxt_(r.Time), type: String(r.Type),
    amount: Number(r.Amount) || 0, partyName: txt_(r.PartyName), partyPhone: txt_(r.PartyPhone),
    mode: txt_(r.Mode), category: txt_(r.Category), notes: txt_(r.Notes), attachments: att,
    createdByName: txt_(r.CreatedByName), createdAt: txt_(r.CreatedAt),
    updatedAt: txt_(r.UpdatedAt), updatedByName: txt_(r.UpdatedByName),
  };
}

function liveEntries_() {
  return readAll_('Entries').rows.filter(r => r.ID !== '' && !(r.Deleted === true || String(r.Deleted).toUpperCase() === 'TRUE'));
}

/**
 * Entries between from..to (inclusive, 'yyyy-MM-dd'), plus the opening balance before `from`.
 * Also returns parties (for autofill) and the number of pending edit requests.
 */
function getBook(token, from, to) {
  const me = auth_(token);
  let opening = 0;
  const list = [], parties = {};
  liveEntries_().forEach(r => {
    const date = txt_(r.Date), amt = Number(r.Amount) || 0;
    const name = txt_(r.PartyName).trim();
    if (name) { // party suggestions: every party used before, with its latest phone
      const k = name.toLowerCase(), ph = txt_(r.PartyPhone);
      if (!parties[k]) parties[k] = { name, phone: ph, last: date };
      else if (date >= parties[k].last) { parties[k].last = date; if (ph) parties[k].phone = ph; parties[k].name = name; }
    }
    if (date < from) opening += String(r.Type) === 'IN' ? amt : -amt;
    else if (date <= to) list.push(entryOut_(r));
  });
  list.sort((a, b) => (a.date + a.time + a.createdAt).localeCompare(b.date + b.time + b.createdAt));
  const reqs = readAll_('EditRequests').rows.filter(r => r.Status === 'PENDING' &&
    (me.Role === 'OWNER' || String(r.RequestedBy) === String(me.ID)));
  return {
    from, to, opening: round2_(opening), entries: list,
    parties: Object.keys(parties).map(k => ({ name: parties[k].name, phone: parties[k].phone }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    pendingRequests: reqs.length, modes: MODES,
    user: { id: me.ID, name: me.Name, role: me.Role }, business: getSetting_('BusinessName', 'My Cash Book'),
  };
}

function round2_(n) { return Math.round(n * 100) / 100; }

/** `prev` = the entry row as it is now (edits): attachments it already has are not checked again. */
function cleanEntry_(e, prev) {
  const out = {};
  if ('type' in e) {
    if (e.type !== 'IN' && e.type !== 'OUT') throw new Error('Type must be Cash In or Cash Out.');
    out.Type = e.type;
  }
  if ('amount' in e) {
    const a = round2_(Number(e.amount));
    if (!(a > 0)) throw new Error('Enter an amount greater than 0.');
    out.Amount = a;
  }
  if ('date' in e) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date))) throw new Error('Pick a valid date.');
    out.Date = String(e.date);
  }
  if ('time' in e) out.Time = /^\d{2}:\d{2}$/.test(String(e.time)) ? String(e.time) : '';
  if ('partyName' in e) out.PartyName = String(e.partyName || '').trim().slice(0, 120);
  if ('partyPhone' in e) out.PartyPhone = String(e.partyPhone || '').replace(/[^\d+\- ]/g, '').slice(0, 20);
  if ('mode' in e) out.Mode = MODES.indexOf(e.mode) >= 0 ? e.mode : 'Cash';
  if ('category' in e) out.Category = String(e.category || '').trim().slice(0, 60);
  if ('notes' in e) out.Notes = String(e.notes || '').slice(0, 1000);
  if ('attachments' in e) {
    const att = (e.attachments || []).slice(0, 10).map(a => ({ id: String(a.id), name: String(a.name || 'file'),
                                                                mimeType: String(a.mimeType || '') }));
    let had = [];
    try { had = prev ? JSON.parse(prev.Attachments || '[]').map(a => String(a.id)) : []; } catch (x) { had = []; }
    att.forEach(a => { if (had.indexOf(a.id) < 0) checkAttachment_(a.id); });
    out.Attachments = JSON.stringify(att);
  }
  return out;
}

/** New entry (owner or staff), or a direct edit of an existing one (owner only). */
function saveEntry(token, e) {
  const me = auth_(token);
  return withLock_(() => {
    if (e.id) {
      if (me.Role !== 'OWNER') throw new Error('Staff cannot edit entries directly. Send an Edit Request.');
      const r = readAll_('Entries').rows.find(x => String(x.ID) === String(e.id));
      if (!r) throw new Error('Entry not found.');
      const ch = cleanEntry_(e, r);
      ch.UpdatedAt = nowIso_(); ch.UpdatedByName = me.Name;
      updateObj_('Entries', r._row, ch, r);
      return entryOut_(Object.assign({}, r, ch));
    }
    const full = cleanEntry_(Object.assign({ time: '', partyName: '', partyPhone: '', mode: 'Cash', category: '',
                                             notes: '', attachments: [] }, e,
                                           { date: e.date || today_() }));
    if (!full.Type || !full.Amount) throw new Error('Type and amount are required.');
    const row = Object.assign(full, { ID: uid_(), CreatedBy: String(me.ID), CreatedByName: me.Name,
                                      CreatedAt: nowIso_(), UpdatedAt: '', UpdatedByName: '', Deleted: false });
    appendObj_('Entries', row);
    return entryOut_(row);
  });
}

function deleteEntry(token, id) {
  const me = auth_(token, true);
  return withLock_(() => {
    const r = readAll_('Entries').rows.find(x => String(x.ID) === String(id));
    if (!r) throw new Error('Entry not found.');
    updateObj_('Entries', r._row, { Deleted: true, UpdatedAt: nowIso_(), UpdatedByName: me.Name }, r);
    return true;
  });
}

/* ───────── attachments ───────── */

function attachFolder_() {
  if (MEMO_.folder) return MEMO_.folder;
  return (MEMO_.folder = attachFolder0_());
}
function attachFolder0_() {
  const id = PropertiesService.getScriptProperties().getProperty('ATTACH_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreated below */ } }
  const f = DriveApp.createFolder(ATTACH_FOLDER_NAME);
  PropertiesService.getScriptProperties().setProperty('ATTACH_FOLDER_ID', f.getId());
  return f;
}

/** Throws unless the file is in this app's attachment folder. Files uploaded in the last 6 h are known from the cache. */
function checkAttachment_(fileId) {
  if (CacheService.getScriptCache().get('att_' + fileId)) return true;
  return checkAttachmentDrive_(fileId);
}
function checkAttachmentDrive_(fileId) {
  const folderId = attachFolder_().getId();
  const file = DriveApp.getFileById(fileId);
  const parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return file;
  throw new Error('Not a Cash Book attachment.');
}

/** a = {name, mimeType, data(base64)} → {id, name, mimeType} */
function uploadAttachment(token, a) {
  const me = auth_(token);
  const ok = /^image\//.test(a.mimeType) || a.mimeType === 'application/pdf';
  if (!ok) throw new Error('Only photos and PDF files can be attached.');
  const bytes = Utilities.base64Decode(a.data);
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('File is too large (max 8 MB).');
  const name = String(a.name || 'file').replace(/[\\/]/g, '_').slice(0, 100);
  const file = attachFolder_().createFile(Utilities.newBlob(bytes, a.mimeType, name));
  file.setDescription('Uploaded by ' + me.Name + ' on ' + nowIso_());
  CacheService.getScriptCache().put('att_' + file.getId(), '1', 21600);
  return { id: file.getId(), name, mimeType: a.mimeType };
}

function getAttachment(token, fileId) {
  auth_(token);
  const file = checkAttachmentDrive_(fileId);
  const blob = file.getBlob();
  return { name: file.getName(), mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ───────── edit requests ───────── */

function requestOut_(r, entriesById) {
  let ch = {};
  try { ch = JSON.parse(r.Changes || '{}'); } catch (e) { ch = {}; }
  const ent = entriesById[String(r.EntryId)];
  return {
    id: String(r.ID), entryId: String(r.EntryId), action: String(r.Action), changes: ch, reason: txt_(r.Reason),
    requestedByName: txt_(r.RequestedByName), status: String(r.Status), reviewedByName: txt_(r.ReviewedByName),
    reviewNote: txt_(r.ReviewNote), createdAt: txt_(r.CreatedAt), reviewedAt: txt_(r.ReviewedAt),
    entry: ent ? entryOut_(ent) : null,
  };
}

/** action: 'EDIT' (changes = entry fields in client form) or 'DELETE'. */
function createEditRequest(token, entryId, action, changes, reason) {
  const me = auth_(token);
  reason = String(reason || '').trim();
  if (!reason) throw new Error('Please write what was wrong.');
  if (action !== 'EDIT' && action !== 'DELETE') throw new Error('Bad request type.');
  return withLock_(() => {
    const ent = liveEntries_().find(x => String(x.ID) === String(entryId));
    if (!ent) throw new Error('Entry not found.');
    const ch = action === 'EDIT' ? cleanEntry_(changes || {}, ent) : {};
    if (action === 'EDIT') {
      // keep only fields that actually change
      Object.keys(ch).forEach(k => { if (String(ch[k]) === (k === 'Date' ? txt_(ent[k]) : k === 'Time' ? timeTxt_(ent[k]) : String(ent[k]))) delete ch[k]; });
      if (!Object.keys(ch).length) throw new Error('Nothing was changed.');
    }
    const dup = readAll_('EditRequests').rows.find(r => r.Status === 'PENDING' && String(r.EntryId) === String(entryId));
    if (dup) throw new Error('This entry already has a pending request.');
    appendObj_('EditRequests', { ID: uid_(), EntryId: String(entryId), Action: action, Changes: JSON.stringify(ch),
                                 Reason: reason.slice(0, 500), RequestedBy: String(me.ID), RequestedByName: me.Name,
                                 Status: 'PENDING', CreatedAt: nowIso_() });
    return true;
  });
}

function listEditRequests(token) {
  const me = auth_(token);
  const byId = {};
  readAll_('Entries').rows.forEach(r => { byId[String(r.ID)] = r; });
  return readAll_('EditRequests').rows
    .filter(r => r.ID !== '' && (me.Role === 'OWNER' || String(r.RequestedBy) === String(me.ID)))
    .map(r => requestOut_(r, byId))
    .sort((a, b) => (a.status === 'PENDING' ? 0 : 1) - (b.status === 'PENDING' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 200);
}

function reviewEditRequest(token, requestId, approve, note) {
  const me = auth_(token, true);
  return withLock_(() => {
    const req = readAll_('EditRequests').rows.find(r => String(r.ID) === String(requestId));
    if (!req) throw new Error('Request not found.');
    if (req.Status !== 'PENDING') throw new Error('This request was already ' + String(req.Status).toLowerCase() + '.');
    if (approve) {
      const ent = readAll_('Entries').rows.find(r => String(r.ID) === String(req.EntryId));
      if (!ent) throw new Error('The entry no longer exists.');
      if (req.Action === 'DELETE') {
        updateObj_('Entries', ent._row, { Deleted: true, UpdatedAt: nowIso_(), UpdatedByName: me.Name + ' (request)' });
      } else {
        const ch = JSON.parse(req.Changes || '{}');
        const safe = {};
        EDITABLE_FIELDS.forEach(k => { if (k in ch) safe[k] = ch[k]; });
        safe.UpdatedAt = nowIso_(); safe.UpdatedByName = me.Name + ' (request by ' + req.RequestedByName + ')';
        updateObj_('Entries', ent._row, safe, ent);
      }
    }
    updateObj_('EditRequests', req._row, { Status: approve ? 'APPROVED' : 'REJECTED', ReviewedByName: me.Name,
                                           ReviewNote: String(note || '').slice(0, 300), ReviewedAt: nowIso_() });
    return true;
  });
}

/* ───────── users & settings (owner) ───────── */

function listUsers(token) {
  auth_(token, true);
  return readAll_('Users').rows.filter(r => r.ID !== '').map(publicUser_);
}

/** u = {id?, name, role:'STAFF'|'OWNER', pin?, active} */
function saveUser(token, u) {
  const me = auth_(token, true);
  return withLock_(() => {
    const t = readAll_('Users');
    const name = String(u.name || '').trim();
    if (!name) throw new Error('Enter a name.');
    const role = u.role === 'OWNER' ? 'OWNER' : 'STAFF';
    if (u.id) {
      const r = t.rows.find(x => String(x.ID) === String(u.id));
      if (!r) throw new Error('User not found.');
      const ch = { Name: name, Role: role, Active: u.active !== false };
      if (String(r.ID) === String(me.ID) && (role !== 'OWNER' || ch.Active === false)) {
        throw new Error('You cannot remove your own owner access.');
      }
      if (u.pin) { ch.Salt = uid_(); ch.PinHash = hashPin_(checkPinFormat_(u.pin), ch.Salt); }
      updateObj_('Users', r._row, ch, r);
      if (u.pin) CacheService.getScriptCache().remove('pinfail_' + r.ID);
    } else {
      const pin = checkPinFormat_(u.pin);
      const salt = uid_();
      appendObj_('Users', { ID: uid_(), Name: name, Role: role, PinHash: hashPin_(pin, salt), Salt: salt,
                            Active: true, CreatedAt: nowIso_() });
    }
    usersChanged_();
    return readAll_('Users').rows.filter(r => r.ID !== '').map(publicUser_);
  });
}

function changeMyPin(token, oldPin, newPin) {
  const me = readAll_('Users').rows.find(r => String(r.ID) === auth_(token).ID);
  if (hashPin_(String(oldPin || ''), String(me.Salt)) !== String(me.PinHash)) throw new Error('Current PIN is wrong.');
  const salt = uid_();
  withLock_(() => updateObj_('Users', me._row, { Salt: salt, PinHash: hashPin_(checkPinFormat_(newPin), salt) }, me));
  return true;
}

function saveBusinessName(token, name) {
  auth_(token, true);
  name = String(name || '').trim();
  if (!name) throw new Error('Enter a name.');
  withLock_(() => setSetting_('BusinessName', name.slice(0, 80)));
  return name;
}
