/* ══════════════════════════════════════════════
   DAILY TASK SHEET TRACKER — backend (single file)
   ------------------------------------------------------------
   Everything Code.gs/Auth.gs/Directory.gs/Tasks.gs/Dashboard.gs/
   Messages.gs used to be, combined into one script file for
   easier copy-pasting into the Apps Script editor. Sectioned
   with banner comments below in the same order they used to
   be split — nothing else changed.
══════════════════════════════════════════════ */


/* ────────────────────────────────────────────
   Code.gs
──────────────────────────────────────────── */
/* ══════════════════════════════════════════════
   DAILY TASK SHEET TRACKER — shared backend plumbing
   ------------------------------------------------------------
   Split across several .gs files that share one global scope:
     Code.gs        — this file: doGet, sheet schemas, generic helpers
     Auth.gs         — login / sessions / password hashing
     Directory.gs    — Employees + Departments (admin management)
     Tasks.gs        — task CRUD, department-scoped, RBAC-checked
     Dashboard.gs    — status/overdue summaries
     Messages.gs     — Inbox: tag-anyone messaging
   Every privileged function takes a `token` (the session token the
   client got back from login) and re-derives the caller's identity
   /role/departments from the Sessions+Employees sheets server-side —
   the client's own claims about who it is are never trusted.
══════════════════════════════════════════════ */

const SCHEMAS = {
  // DesktopOnly/Monitored appended at the END on purpose — migrateSheetHeaders_() back-fills
  // them onto the already-live sheet without touching/reordering any existing column, so
  // every row already written stays exactly aligned.
  Employees:   ['ID', 'Name', 'Email', 'PasswordHash', 'Salt', 'Role', 'Departments', 'Active', 'CreatedAt', 'DesktopOnly', 'Monitored'],
  Departments: ['ID', 'Name', 'CreatedAt'],
  Tasks:       ['ID', 'DepartmentId', 'Date', 'Status', 'SortOrder', 'Name', 'Priority', 'Tags', 'Labels', 'Subtasks', 'AssignedTo', 'CreatedBy', 'StartDate', 'DueDate', 'CreatedAt', 'UpdatedAt'],
  Sessions:    ['Token', 'EmployeeId', 'CreatedAt', 'ExpiresAt'],
  Messages:    ['ID', 'FromEmployeeId', 'ToEmployeeId', 'TaskId', 'Text', 'CreatedAt', 'Read'],
  // Simple global key/value store — currently holds 'WorkingHours' (JSON) and 'Holidays' (JSON array).
  Settings:    ['Key', 'Value'],
};
// Columns that MUST stay plain "YYYY-MM-DD" text — Sheets' auto-detection (especially on
// non-US locales) otherwise silently converts a freshly-appended "2026-08-25" string into a
// real Date-typed cell, which breaks every exact-string date comparison below and makes
// same-day tasks vanish from view even though the row is still sitting right there.
const TEXT_DATE_COLUMNS = { Tasks: ['Date', 'StartDate', 'DueDate', 'CreatedAt'] };
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days of inactivity before a session expires

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Daily Task Sheet Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSheet_(name) {
  const headers = SCHEMAS[name];
  if (!headers) throw new Error('Unknown sheet: ' + name);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    (TEXT_DATE_COLUMNS[name] || []).forEach(col => {
      const c = headers.indexOf(col) + 1;
      if (c > 0) sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  } else {
    migrateSheetHeaders_(sh, headers);
  }
  return sh;
}

/** Appends any SCHEMAS column missing from an already-live sheet's header row, at the END —
 *  never reorders or removes a column, so every row already written stays perfectly aligned.
 *  A newly-added column just reads back blank/undefined on old rows until something writes it.
 *  This is what lets us add fields like Employees.DesktopOnly/Monitored without a manual
 *  migration step or risking the existing production sheet's data. */
function migrateSheetHeaders_(sh, headers) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const missing = headers.filter(h => existing.indexOf(h) === -1);
  if (!missing.length) return;
  sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
}

/** Sheets sometimes hands back a real JS Date object for a cell instead of the plain
 *  "YYYY-MM-DD" string we wrote (see TEXT_DATE_COLUMNS above) — normalize back to that string
 *  using the script's own calendar date so exact-string date filters keep working regardless
 *  of whether a given cell got auto-converted. Safe to call on an already-plain string too. */
function normalizeDateStr_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  // Slicing to 10 chars also turns a full timestamp string (e.g. CreatedAt's
  // "2026-08-25T10:07:34.994Z") into just its calendar date — harmless no-op on an
  // already-plain "yyyy-MM-dd" string.
  return val ? String(val).slice(0, 10) : '';
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Reads every data row (header excluded) of a sheet as an array of plain objects keyed by header name. */
function readAllObjects_(name) {
  const sh = getSheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const rows = values.slice(1).map((row, i) => {
    const obj = { __row: i + 2 }; // 1-indexed sheet row, header row is row 1
    headers.forEach((h, c) => { obj[h] = row[c]; });
    return obj;
  });
  return { sh, headers, rows };
}

function findById_(name, id) {
  const { rows } = readAllObjects_(name);
  return rows.find(r => String(r.ID) === String(id)) || null;
}

function newId_() {
  return Utilities.getUuid();
}

function nowIso_() {
  return new Date().toISOString();
}

function safeParseArray_(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function todayStr_() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ────────────────────────────────────────────
   Auth.gs
──────────────────────────────────────────── */
/* ══════════════════════════════════════════════
   AUTH — login, sessions, password hashing
   ------------------------------------------------------------
   Passwords are stored as SHA-256(password + per-user salt), never
   in plain text. This is a reasonable minimum for a small internal
   tool, but it is NOT bcrypt/scrypt-grade — don't reuse these
   passwords anywhere sensitive, and treat the sheet itself as
   something only trusted admins can open.

   "Stay logged in until I log out" is implemented as a long-lived
   session token: the client stores it in localStorage and sends it
   with every call; validateSession() extends its expiry on every
   use, so it only goes stale after 30 days of the browser NOT
   opening the app — logout is what actually kills it early.
══════════════════════════════════════════════ */

function hashPassword_(password, salt) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password) + String(salt));
  return digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function boolCell_(val) {
  return val === true || val === 'TRUE';
}

function publicEmployee_(emp) {
  return {
    id: emp.ID,
    name: emp.Name,
    email: emp.Email,
    role: emp.Role,
    departments: safeParseArray_(emp.Departments),
    active: emp.Active !== false && emp.Active !== 'FALSE',
    // Device/monitoring flags — meaningless (and always false) for admins, who always get
    // full access on every device and are never screenshotted.
    desktopOnly: emp.Role !== 'admin' && boolCell_(emp.DesktopOnly),
    monitored: emp.Role !== 'admin' && boolCell_(emp.Monitored),
  };
}

function findEmployeeByEmail_(email) {
  const { rows } = readAllObjects_('Employees');
  const norm = String(email).trim().toLowerCase();
  return rows.find(r => String(r.Email).trim().toLowerCase() === norm) || null;
}

/** True when no employees exist yet — the client uses this to show a one-time "create the first admin" screen instead of the login form. */
function needsBootstrap() {
  const { rows } = readAllObjects_('Employees');
  return rows.length === 0;
}

function createSession_(employeeId) {
  const sh = getSheet_('Sessions');
  const token = newId_() + newId_();
  const now = Date.now();
  sh.appendRow([token, employeeId, new Date(now).toISOString(), new Date(now + SESSION_LIFETIME_MS).toISOString()]);
  return token;
}

function bootstrapFirstAdmin(name, email, password) {
  return withLock_(() => {
    if (!needsBootstrap()) throw new Error('Setup has already been completed — please log in instead.');
    if (!name || !name.trim()) throw new Error('Name is required.');
    if (!email || !email.trim()) throw new Error('Email is required.');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
    const sh = getSheet_('Employees');
    const salt = newId_();
    const id = newId_();
    sh.appendRow([id, name.trim(), email.trim(), hashPassword_(password, salt), salt, 'admin', '[]', true, nowIso_()]);
    const token = createSession_(id);
    return { token, employee: publicEmployee_({ ID: id, Name: name.trim(), Email: email.trim(), Role: 'admin', Departments: '[]', Active: true }) };
  });
}

function login(email, password) {
  return withLock_(() => {
    const emp = findEmployeeByEmail_(email);
    if (!emp) throw new Error('No account found for that email.');
    if (emp.Active === false || emp.Active === 'FALSE') throw new Error('This account has been deactivated. Contact your admin.');
    if (hashPassword_(password, emp.Salt) !== emp.PasswordHash) throw new Error('Incorrect password.');
    const token = createSession_(emp.ID);
    return { token, employee: publicEmployee_(emp) };
  });
}

function logout(token) {
  return withLock_(() => {
    const { sh, headers, rows } = readAllObjects_('Sessions');
    const tokenCol = headers.indexOf('Token');
    const match = rows.find(r => r.Token === token);
    if (match) sh.deleteRow(match.__row);
    return { success: true };
  });
}

/** Validates a session token and returns the caller's employee record, sliding the expiry forward. Throws if missing/invalid/expired — every privileged endpoint calls this first and trusts nothing else about "who is calling" from the client. */
function requireSession_(token) {
  if (!token) throw new Error('Not logged in. Please sign in again.');
  const { sh, rows } = readAllObjects_('Sessions');
  const session = rows.find(r => r.Token === token);
  if (!session) throw new Error('Your session has expired. Please sign in again.');
  if (new Date(session.ExpiresAt).getTime() < Date.now()) {
    sh.deleteRow(session.__row);
    throw new Error('Your session has expired. Please sign in again.');
  }
  const emp = findById_('Employees', session.EmployeeId);
  if (!emp || emp.Active === false || emp.Active === 'FALSE') {
    sh.deleteRow(session.__row);
    throw new Error('This account is no longer active.');
  }
  // Sliding expiry — any activity keeps the session alive for another 30 days.
  sh.getRange(session.__row, 4).setValue(new Date(Date.now() + SESSION_LIFETIME_MS).toISOString());
  return emp;
}

function requireAdmin_(token) {
  const emp = requireSession_(token);
  if (emp.Role !== 'admin') throw new Error('This action requires an admin account.');
  return emp;
}

/** Client calls this on load with a token pulled from localStorage, to silently resume a session instead of showing the login form. Returns null (not a throw) on any invalid/expired token so the caller can fall back to the login screen. */
function validateSession(token) {
  try {
    const emp = requireSession_(token);
    return { employee: publicEmployee_(emp) };
  } catch (e) {
    return null;
  }
}

/* ────────────────────────────────────────────
   Directory.gs
──────────────────────────────────────────── */
/* ══════════════════════════════════════════════
   DIRECTORY — employees & departments (mostly admin-only)
══════════════════════════════════════════════ */

/* ── Departments ── */

function listDepartments(token) {
  const emp = requireSession_(token);
  const { rows } = readAllObjects_('Departments');
  const all = rows.map(r => ({ id: r.ID, name: r.Name }));
  if (emp.Role === 'admin') return all;
  const mine = new Set(safeParseArray_(emp.Departments));
  return all.filter(d => mine.has(d.id));
}

/** Admin-only: every department that exists, regardless of whether the admin is personally tagged into it — needed for the department-management screen. */
function listAllDepartmentsForAdmin(token) {
  requireAdmin_(token);
  const { rows } = readAllObjects_('Departments');
  return rows.map(r => ({ id: r.ID, name: r.Name }));
}

function createDepartment(token, name) {
  return withLock_(() => {
    requireAdmin_(token);
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('Department name is required.');
    const { sh, rows } = readAllObjects_('Departments');
    if (rows.some(r => String(r.Name).trim().toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('A department with that name already exists.');
    }
    const id = newId_();
    sh.appendRow([id, trimmed, nowIso_()]);
    return { id, name: trimmed };
  });
}

function renameDepartment(token, id, newName) {
  return withLock_(() => {
    requireAdmin_(token);
    const trimmed = (newName || '').trim();
    if (!trimmed) throw new Error('Department name is required.');
    const { sh, headers, rows } = readAllObjects_('Departments');
    const dept = rows.find(r => String(r.ID) === String(id));
    if (!dept) throw new Error('Department not found.');
    if (rows.some(r => r.ID !== dept.ID && String(r.Name).trim().toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('A department with that name already exists.');
    }
    sh.getRange(dept.__row, headers.indexOf('Name') + 1).setValue(trimmed);
    return { id, name: trimmed };
  });
}

/* ── Employees ── */

function listEmployees(token) {
  requireAdmin_(token);
  const { rows } = readAllObjects_('Employees');
  return rows.map(publicEmployee_);
}

function addEmployee(token, input) {
  return withLock_(() => {
    requireAdmin_(token);
    const name = (input.name || '').trim();
    const email = (input.email || '').trim();
    const password = input.password || '';
    const role = input.role === 'admin' ? 'admin' : 'employee';
    const departments = Array.isArray(input.departments) ? input.departments : [];
    if (!name) throw new Error('Name is required.');
    if (!email) throw new Error('Email is required.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (findEmployeeByEmail_(email)) throw new Error('An account with that email already exists.');

    const sh = getSheet_('Employees');
    const salt = newId_();
    const id = newId_();
    sh.appendRow([id, name, email, hashPassword_(password, salt), salt, role, JSON.stringify(departments), true, nowIso_()]);
    return publicEmployee_({ ID: id, Name: name, Email: email, Role: role, Departments: JSON.stringify(departments), Active: true });
  });
}

/** Ensures at least one other active admin exists before letting this edit demote/deactivate `emp` — prevents an admin from locking everyone (including themselves) out. */
function assertNotLastAdmin_(rows, emp, willStillBeAdmin) {
  if (emp.Role !== 'admin' || willStillBeAdmin) return;
  const otherActiveAdmins = rows.some(r => r.ID !== emp.ID && r.Role === 'admin' && r.Active !== false && r.Active !== 'FALSE');
  if (!otherActiveAdmins) throw new Error('Cannot remove the last active admin account.');
}

/** Admin edits an employee's name / role / departments / active flag (not password — see setEmployeePassword). */
function updateEmployee(token, employeeId, patch) {
  return withLock_(() => {
    requireAdmin_(token);
    const { sh, headers, rows } = readAllObjects_('Employees');
    const emp = rows.find(r => String(r.ID) === String(employeeId));
    if (!emp) throw new Error('Employee not found.');

    const nextRole = patch.role === 'admin' || patch.role === 'employee' ? patch.role : emp.Role;
    const nextActive = typeof patch.active === 'boolean' ? patch.active : (emp.Active !== false && emp.Active !== 'FALSE');
    assertNotLastAdmin_(rows, emp, nextRole === 'admin' && nextActive);

    if (typeof patch.name === 'string' && patch.name.trim()) {
      sh.getRange(emp.__row, headers.indexOf('Name') + 1).setValue(patch.name.trim());
    }
    if (Array.isArray(patch.departments)) {
      sh.getRange(emp.__row, headers.indexOf('Departments') + 1).setValue(JSON.stringify(patch.departments));
    }
    sh.getRange(emp.__row, headers.indexOf('Role') + 1).setValue(nextRole);
    sh.getRange(emp.__row, headers.indexOf('Active') + 1).setValue(nextActive);
    if (typeof patch.desktopOnly === 'boolean') {
      sh.getRange(emp.__row, headers.indexOf('DesktopOnly') + 1).setValue(patch.desktopOnly);
    }
    if (typeof patch.monitored === 'boolean') {
      sh.getRange(emp.__row, headers.indexOf('Monitored') + 1).setValue(patch.monitored);
    }

    const updated = findById_('Employees', employeeId);
    return publicEmployee_(updated);
  });
}

function setEmployeePassword(token, employeeId, newPassword) {
  return withLock_(() => {
    requireAdmin_(token);
    if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters.');
    const { sh, headers, rows } = readAllObjects_('Employees');
    const emp = rows.find(r => String(r.ID) === String(employeeId));
    if (!emp) throw new Error('Employee not found.');
    const salt = newId_();
    sh.getRange(emp.__row, headers.indexOf('Salt') + 1).setValue(salt);
    sh.getRange(emp.__row, headers.indexOf('PasswordHash') + 1).setValue(hashPassword_(newPassword, salt));
    return { success: true };
  });
}

function changeOwnPassword(token, oldPassword, newPassword) {
  return withLock_(() => {
    const emp = requireSession_(token);
    if (hashPassword_(oldPassword, emp.Salt) !== emp.PasswordHash) throw new Error('Current password is incorrect.');
    if (!newPassword || newPassword.length < 6) throw new Error('New password must be at least 6 characters.');
    const { sh, headers } = readAllObjects_('Employees');
    const salt = newId_();
    sh.getRange(emp.__row, headers.indexOf('Salt') + 1).setValue(salt);
    sh.getRange(emp.__row, headers.indexOf('PasswordHash') + 1).setValue(hashPassword_(newPassword, salt));
    return { success: true };
  });
}

/** Employees selectable in an assignee/@-tag picker: admins see everyone active; regular employees see active co-workers who share at least one department with them, plus every admin (so anyone can reach an admin). */
function listTaggableEmployees(token) {
  const me = requireSession_(token);
  const { rows } = readAllObjects_('Employees');
  const active = rows.filter(r => r.Active !== false && r.Active !== 'FALSE');
  if (me.Role === 'admin') return active.map(publicEmployee_);
  const myDepts = new Set(safeParseArray_(me.Departments));
  return active
    .filter(r => r.Role === 'admin' || safeParseArray_(r.Departments).some(d => myDepts.has(d)))
    .map(publicEmployee_);
}

/* ────────────────────────────────────────────
   Tasks.gs
──────────────────────────────────────────── */
/* ══════════════════════════════════════════════
   TASKS — department-scoped CRUD, RBAC-checked server-side
══════════════════════════════════════════════ */

const STATUSES = ['todo', 'progress', 'complete'];

function assertDepartmentAccess_(emp, departmentId) {
  if (emp.Role === 'admin') return;
  const mine = safeParseArray_(emp.Departments);
  if (mine.indexOf(departmentId) === -1) {
    throw new Error('You do not have access to that department.');
  }
}

function accessibleDepartmentIds_(emp) {
  if (emp.Role === 'admin') {
    const { rows } = readAllObjects_('Departments');
    return rows.map(r => r.ID);
  }
  return safeParseArray_(emp.Departments);
}

function rowToTask_(headers, row) {
  const c = name => row[headers.indexOf(name)];
  return {
    id: String(c('ID')),
    departmentId: String(c('DepartmentId')),
    date: normalizeDateStr_(c('Date')),
    status: c('Status') || 'todo',
    sortOrder: Number(c('SortOrder')) || 0,
    name: c('Name') || '',
    priority: c('Priority') || null,
    subtasks: safeParseArray_(c('Subtasks')),
    assignedTo: c('AssignedTo') || null,
    createdBy: c('CreatedBy') || null,
    createdAt: normalizeDateStr_(c('CreatedAt')),
    deadline: c('DueDate') ? normalizeDateStr_(c('DueDate')) : null,
  };
}

function taskToRow_(headers, task, createdAt) {
  return headers.map(h => {
    switch (h) {
      case 'ID': return task.id;
      case 'DepartmentId': return task.departmentId;
      case 'Date': return task.date;
      case 'Status': return STATUSES.indexOf(task.status) >= 0 ? task.status : 'todo';
      case 'SortOrder': return Number(task.sortOrder) || 0;
      case 'Name': return String(task.name || '').slice(0, 500);
      case 'Priority': return task.priority || '';
      case 'Tags': return '[]';   // feature removed — column kept only so existing sheet rows stay column-aligned
      case 'Labels': return '[]'; // feature removed — column kept only so existing sheet rows stay column-aligned
      case 'Subtasks': return JSON.stringify((task.subtasks || []).slice(0, 100));
      case 'AssignedTo': return task.assignedTo || '';
      case 'CreatedBy': return task.createdBy || '';
      case 'StartDate': return ''; // feature removed (was the timeline's start date) — column kept for alignment
      case 'DueDate': return task.deadline || '';
      case 'CreatedAt': return createdAt;
      case 'UpdatedAt': return nowIso_();
      default: return '';
    }
  });
}

/** departmentId === null means "everything I can see" (all departments for an admin, all of my tagged departments for an employee) — that's what powers the "All Departments" switcher option. */
function getTasksForDate(token, dateStr, departmentId) {
  const emp = requireSession_(token);
  let deptFilter;
  if (departmentId) {
    assertDepartmentAccess_(emp, departmentId);
    deptFilter = new Set([departmentId]);
  } else {
    deptFilter = new Set(accessibleDepartmentIds_(emp));
  }
  const { headers, rows } = readAllObjects_('Tasks');
  const dateCol = headers.indexOf('Date');
  const deptCol = headers.indexOf('DepartmentId');
  const raw = rows
    .map(r => headers.map(h => r[h]))
    .filter(row => normalizeDateStr_(row[dateCol]) === dateStr && deptFilter.has(String(row[deptCol])));
  return raw.map(row => rowToTask_(headers, row)).sort((a, b) => a.sortOrder - b.sortOrder);
}

function createTask(token, dateStr, departmentId, status) {
  if (!dateStr) throw new Error('A date is required.');
  if (!departmentId) throw new Error('A department is required to create a task.');
  return withLock_(() => {
    const emp = requireSession_(token);
    assertDepartmentAccess_(emp, departmentId);
    const sh = getSheet_('Tasks');
    const id = newId_();
    const now = nowIso_();
    const siblings = getTasksForDate(token, dateStr, departmentId).filter(t => t.status === (status || 'todo'));
    const sortOrder = siblings.length ? Math.max.apply(null, siblings.map(t => t.sortOrder)) + 1 : 1;
    const task = {
      id, departmentId, date: dateStr, status: status || 'todo', sortOrder, name: 'New task',
      priority: null, subtasks: [], assignedTo: null, createdBy: emp.ID, createdAt: normalizeDateStr_(now),
      deadline: null,
    };
    sh.appendRow(taskToRow_(SCHEMAS.Tasks, task, now));
    return task;
  });
}

function findTaskRow_(id) {
  const { sh, headers, rows } = readAllObjects_('Tasks');
  const row = rows.find(r => String(r.ID) === String(id));
  return row ? { sh, headers, row } : null;
}

/** Upserts a task. Everyone with department access can edit most fields collaboratively, but
 *  the name and deadline can only be changed by the task's original creator or an admin —
 *  silently reverted to the stored value otherwise, so the rest of the save still succeeds. */
function saveTask(token, task) {
  if (!task || !task.id) throw new Error('Task id is required.');
  return withLock_(() => {
    const emp = requireSession_(token);
    const found = findTaskRow_(task.id);
    if (!found) throw new Error('Task not found — it may have been deleted elsewhere.');
    const existing = rowToTask_(found.headers, found.headers.map(h => found.row[h]));
    assertDepartmentAccess_(emp, existing.departmentId);

    const canEditCreatorOnly = emp.Role === 'admin' || existing.createdBy === emp.ID;
    const newName = typeof task.name === 'string' ? task.name.trim().slice(0, 500) : '';
    const merged = Object.assign({}, existing, task, {
      id: existing.id,
      departmentId: existing.departmentId, // department is fixed at creation — moving departments isn't supported
      createdBy: existing.createdBy,
      createdAt: existing.createdAt, // system-set, never client-editable
      name: canEditCreatorOnly && newName ? newName : existing.name,
      deadline: canEditCreatorOnly ? (task.deadline || null) : existing.deadline,
    });
    // A stray tags/labels/startDate from an out-of-date client build would otherwise ride
    // along in the *response* object (never persisted — taskToRow_ ignores unknown keys —
    // but still worth keeping the returned shape clean and consistent with a fresh fetch).
    delete merged.tags; delete merged.labels; delete merged.startDate;

    const createdAt = found.row.CreatedAt;
    found.sh.getRange(found.row.__row, 1, 1, found.headers.length).setValues([taskToRow_(found.headers, merged, createdAt)]);
    return merged;
  });
}

/** Who may delete a task depends on who created it:
 *    - admin-created task  → only that SAME admin can delete it (not other admins).
 *    - employee-created task → that employee OR any admin can delete it.
 *  If the creator's account can't be resolved (e.g. deleted), only an admin can delete it. */
function deleteTask(token, id) {
  return withLock_(() => {
    const emp = requireSession_(token);
    const found = findTaskRow_(id);
    if (!found) return { success: true }; // already gone
    const existing = rowToTask_(found.headers, found.headers.map(h => found.row[h]));
    assertDepartmentAccess_(emp, existing.departmentId);

    const creator = findById_('Employees', existing.createdBy);
    const creatorIsAdmin = !!(creator && creator.Role === 'admin');
    const isCreator = String(existing.createdBy) === String(emp.ID);
    const allowed = creatorIsAdmin ? isCreator : (isCreator || emp.Role === 'admin');
    if (!allowed) {
      throw new Error(creatorIsAdmin
        ? 'Only the admin who created this task can delete it.'
        : 'Only the task creator or an admin can delete this task.');
    }
    found.sh.deleteRow(found.row.__row);
    return { success: true };
  });
}

/** Per-day status counts AND a lightweight task list (name + status) for a whole month
 *  (yearMonth like "2026-08"), for the Calendar view's day cells and its hover tooltip. */
function getTaskCountsForMonth(token, yearMonth, departmentId) {
  const emp = requireSession_(token);
  let deptFilter;
  if (departmentId) {
    assertDepartmentAccess_(emp, departmentId);
    deptFilter = new Set([departmentId]);
  } else {
    deptFilter = new Set(accessibleDepartmentIds_(emp));
  }
  const { rows } = readAllObjects_('Tasks');
  const counts = {};
  rows.forEach(r => {
    const date = normalizeDateStr_(r.Date);
    if (date.indexOf(yearMonth) !== 0) return;
    if (!deptFilter.has(String(r.DepartmentId))) return;
    counts[date] = counts[date] || { todo: 0, progress: 0, complete: 0, tasks: [] };
    const st = STATUSES.indexOf(r.Status) !== -1 ? r.Status : 'todo';
    counts[date][st]++;
    counts[date].tasks.push({ name: r.Name || '', status: st, sortOrder: Number(r.SortOrder) || 0 });
  });
  Object.keys(counts).forEach(date => counts[date].tasks.sort((a, b) => a.sortOrder - b.sortOrder));
  return counts;
}

function carryOverOpenTasks(token, dateStr, departmentId) {
  if (!departmentId) throw new Error('Pick a specific department to carry tasks into.');
  return withLock_(() => {
    const emp = requireSession_(token);
    assertDepartmentAccess_(emp, departmentId);
    const sh = getSheet_('Tasks');
    const { headers, rows } = readAllObjects_('Tasks');
    const dateCol = headers.indexOf('Date');
    const deptCol = headers.indexOf('DepartmentId');

    const earlierDates = {};
    rows.forEach(r => {
      const rowDate = normalizeDateStr_(r[headers[dateCol]]);
      if (String(r[headers[deptCol]]) === departmentId && rowDate < dateStr) {
        earlierDates[rowDate] = true;
      }
    });
    const dates = Object.keys(earlierDates).sort();
    if (!dates.length) return { added: 0, sourceDate: null, message: 'No earlier day with tasks was found in this department.' };

    const sourceDate = dates[dates.length - 1];
    const sourceTasks = getTasksForDate(token, sourceDate, departmentId).filter(t => t.status !== 'complete');
    if (!sourceTasks.length) return { added: 0, sourceDate, message: 'No open tasks found on ' + sourceDate + '.' };

    const targetTasks = getTasksForDate(token, dateStr, departmentId);
    const existingNames = new Set(targetTasks.map(t => t.name));
    let sortOrder = targetTasks.filter(t => t.status === 'todo').reduce((max, t) => Math.max(max, t.sortOrder), 0) + 1;
    const now = nowIso_();
    let added = 0;
    sourceTasks.forEach(t => {
      if (existingNames.has(t.name)) return;
      const newTask = {
        id: newId_(), departmentId, date: dateStr, status: 'todo', sortOrder: sortOrder++,
        name: t.name, priority: t.priority,
        subtasks: (t.subtasks || []).map(s => ({ id: newId_(), text: s.text, done: false })),
        assignedTo: t.assignedTo, createdBy: emp.ID, createdAt: normalizeDateStr_(now), deadline: null,
      };
      sh.appendRow(taskToRow_(SCHEMAS.Tasks, newTask, now));
      added++;
    });
    return { added, sourceDate };
  });
}

/* ────────────────────────────────────────────
   Dashboard.gs
──────────────────────────────────────────── */
/* ══════════════════════════════════════════════
   DASHBOARD — status/overdue summaries
   ------------------------------------------------------------
   Admins get every department broken out individually; employees
   get only the departments they're tagged into (rolled into one
   "mine" view, since that's the scope requirement #4 asks for).
══════════════════════════════════════════════ */

function emptyCounts_() {
  return { todo: 0, progress: 0, complete: 0, overdue: 0, assignedToMe: 0 };
}

function getDashboardSummary(token, dateStr) {
  const emp = requireSession_(token);
  const deptIds = accessibleDepartmentIds_(emp);
  const deptRows = readAllObjects_('Departments').rows.filter(d => deptIds.indexOf(d.ID) !== -1);
  const { headers, rows } = readAllObjects_('Tasks');
  const today = todayStr_();

  const byDept = {};
  deptRows.forEach(d => { byDept[d.ID] = { id: d.ID, name: d.Name, counts: emptyCounts_() }; });

  rows.forEach(r => {
    const deptId = String(r.DepartmentId);
    if (!byDept[deptId]) return; // not in an accessible department
    const status = r.Status || 'todo';
    const dueDate = r.DueDate ? normalizeDateStr_(r.DueDate) : '';
    const isOverdue = dueDate && dueDate < today && status !== 'complete';
    const isAssignedToMe = String(r.AssignedTo) === String(emp.ID);

    // Same-day counts (todo/progress/complete) reflect the selected date's sheet;
    // overdue and assignedToMe are evaluated across all of that department's tasks,
    // since a task's due date can fall on a different day than the one it's listed under.
    if (normalizeDateStr_(r.Date) === dateStr) {
      if (STATUSES.indexOf(status) !== -1) byDept[deptId].counts[status]++;
      if (isAssignedToMe) byDept[deptId].counts.assignedToMe++;
    }
    if (isOverdue) byDept[deptId].counts.overdue++;
  });

  const departments = Object.keys(byDept).map(k => byDept[k]);
  const totals = departments.reduce((acc, d) => {
    Object.keys(acc).forEach(k => { acc[k] += d.counts[k]; });
    return acc;
  }, emptyCounts_());

  return { scope: emp.Role === 'admin' ? 'admin' : 'employee', departments, totals };
}

/* ────────────────────────────────────────────
   Messages.gs
──────────────────────────────────────────── */
/* ══════════════════════════════════════════════
   MESSAGES — Inbox: tag anyone, about a task or anything else
══════════════════════════════════════════════ */

function resolveEmployeeName_(id) {
  if (!id) return null;
  const emp = findById_('Employees', id);
  return emp ? emp.Name : '(removed employee)';
}

function resolveTaskName_(id) {
  if (!id) return null;
  const found = findTaskRow_(id);
  return found ? found.row.Name : '(deleted task)';
}

function sendMessage(token, toEmployeeId, text, taskId) {
  return withLock_(() => {
    const emp = requireSession_(token);
    const trimmed = (text || '').trim();
    if (!trimmed) throw new Error('Message text is required.');
    if (trimmed.length > 2000) throw new Error('Message is too long (2000 characters max).');
    const recipient = findById_('Employees', toEmployeeId);
    if (!recipient || recipient.Active === false || recipient.Active === 'FALSE') {
      throw new Error('That person is not a valid recipient.');
    }
    const sh = getSheet_('Messages');
    const id = newId_();
    sh.appendRow([id, emp.ID, toEmployeeId, taskId || '', trimmed.slice(0, 2000), nowIso_(), false]);
    return { id };
  });
}

function decorateMessage_(r) {
  return {
    id: r.ID,
    fromId: r.FromEmployeeId,
    fromName: resolveEmployeeName_(r.FromEmployeeId),
    toId: r.ToEmployeeId,
    toName: resolveEmployeeName_(r.ToEmployeeId),
    taskId: r.TaskId || null,
    taskName: r.TaskId ? resolveTaskName_(r.TaskId) : null,
    text: r.Text,
    createdAt: r.CreatedAt,
    read: r.Read === true || r.Read === 'TRUE',
  };
}

function listInbox(token) {
  const emp = requireSession_(token);
  const { rows } = readAllObjects_('Messages');
  return rows
    .filter(r => String(r.ToEmployeeId) === String(emp.ID))
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt))
    .map(decorateMessage_);
}

function listSent(token) {
  const emp = requireSession_(token);
  const { rows } = readAllObjects_('Messages');
  return rows
    .filter(r => String(r.FromEmployeeId) === String(emp.ID))
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt))
    .map(decorateMessage_);
}

function markMessageRead(token, messageId) {
  return withLock_(() => {
    const emp = requireSession_(token);
    const { sh, headers, rows } = readAllObjects_('Messages');
    const msg = rows.find(r => String(r.ID) === String(messageId));
    if (!msg || String(msg.ToEmployeeId) !== String(emp.ID)) throw new Error('Message not found.');
    sh.getRange(msg.__row, headers.indexOf('Read') + 1).setValue(true);
    return { success: true };
  });
}

function getUnreadCount(token) {
  const emp = requireSession_(token);
  const { rows } = readAllObjects_('Messages');
  return rows.filter(r => String(r.ToEmployeeId) === String(emp.ID) && r.Read !== true && r.Read !== 'TRUE').length;
}

/* ────────────────────────────────────────────
   Monitoring.gs
──────────────────────────────────────────── */
/* ══════════════════════════════════════════════
   MONITORING — admin-configured working hours / holidays, and the
   server side of the separate Windows desktop agent (see the
   desktop-agent/ folder): per-employee screenshot capture, gated by
   those working hours and by the Employees.Monitored flag.
   ------------------------------------------------------------
   DEFAULT_WORKING_HOURS.days uses ISO weekday numbers: 1=Mon..7=Sun.
══════════════════════════════════════════════ */

const DEFAULT_WORKING_HOURS = { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] };

function getSettings_() {
  const { rows } = readAllObjects_('Settings');
  const map = {};
  rows.forEach(r => { map[r.Key] = r.Value; });
  return map;
}

function setSetting_(key, value) {
  const { sh, headers, rows } = readAllObjects_('Settings');
  const row = rows.find(r => r.Key === key);
  if (row) {
    sh.getRange(row.__row, headers.indexOf('Value') + 1).setValue(value);
  } else {
    sh.appendRow([key, value]);
  }
}

/** Any signed-in user may read working hours/holidays (needed by both the web app, if it ever
 *  wants to show them, and the desktop agent) — only an admin may change them. */
function getWorkingHours(token) {
  requireSession_(token);
  const s = getSettings_();
  return s.WorkingHours ? JSON.parse(s.WorkingHours) : DEFAULT_WORKING_HOURS;
}

function setWorkingHours(token, hours) {
  return withLock_(() => {
    requireAdmin_(token);
    if (!hours || !/^\d{2}:\d{2}$/.test(hours.start) || !/^\d{2}:\d{2}$/.test(hours.end)) {
      throw new Error('Start and end time are required, as HH:MM.');
    }
    const days = Array.isArray(hours.days) ? hours.days.filter(d => d >= 1 && d <= 7) : DEFAULT_WORKING_HOURS.days;
    setSetting_('WorkingHours', JSON.stringify({ start: hours.start, end: hours.end, days }));
    return { start: hours.start, end: hours.end, days };
  });
}

function listHolidays(token) {
  requireSession_(token);
  const s = getSettings_();
  return s.Holidays ? JSON.parse(s.Holidays) : [];
}

function addHoliday(token, dateStr) {
  return withLock_(() => {
    requireAdmin_(token);
    const normalized = normalizeDateStr_(dateStr);
    if (!normalized) throw new Error('A valid date is required.');
    const list = listHolidays(token);
    if (list.indexOf(normalized) === -1) { list.push(normalized); list.sort(); }
    setSetting_('Holidays', JSON.stringify(list));
    return list;
  });
}

function removeHoliday(token, dateStr) {
  return withLock_(() => {
    requireAdmin_(token);
    const normalized = normalizeDateStr_(dateStr);
    const list = listHolidays(token).filter(d => d !== normalized);
    setSetting_('Holidays', JSON.stringify(list));
    return list;
  });
}

const SCREENSHOT_INTERVAL_MINUTES = 30;
const SCREENSHOTS_ROOT_FOLDER_NAME = 'Travalate Monitoring Screenshots';

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** What the desktop agent polls every run: am I supposed to be monitored right now, and
 *  under what rules. The agent decides locally whether "now" falls inside workingHours and
 *  isn't a holiday — kept server-side too (see uploadScreenshot) so a tampered/old client
 *  can't just claim it's within hours to force an upload. */
function getAgentConfig(token) {
  const emp = requireSession_(token);
  const s = getSettings_();
  return {
    employeeId: emp.ID,
    name: emp.Name,
    role: emp.Role,
    monitored: emp.Role !== 'admin' && boolCell_(emp.Monitored),
    workingHours: s.WorkingHours ? JSON.parse(s.WorkingHours) : DEFAULT_WORKING_HOURS,
    holidays: s.Holidays ? JSON.parse(s.Holidays) : [],
    screenshotIntervalMinutes: SCREENSHOT_INTERVAL_MINUTES,
  };
}

/** True if `dateStr`/`hhmm` (the agent's own local clock) falls inside the configured working
 *  window and isn't a configured holiday. Re-checked server-side on every upload — the agent
 *  is a normal, inspectable program on someone's own PC, so nothing it claims about "I'm
 *  inside working hours" is trusted without this independent check. */
function isWithinWorkingWindow_(workingHours, holidays, dateStr, hhmm, isoWeekday) {
  if (holidays.indexOf(dateStr) !== -1) return false;
  if (workingHours.days.indexOf(isoWeekday) === -1) return false;
  return hhmm >= workingHours.start && hhmm <= workingHours.end;
}

/** Stores one screenshot for the calling employee in Drive, under a per-employee subfolder of
 *  SCREENSHOTS_ROOT_FOLDER_NAME. Rejects the upload (instead of silently accepting it) unless
 *  the employee is actually flagged Monitored AND the agent-supplied local timestamp falls
 *  inside the admin-configured working window and isn't a holiday — this is the server-side
 *  enforcement of "only during working hours, not on holidays", not just a client-side rule. */
function uploadScreenshot(token, imageBase64, takenAtIso, isoWeekday) {
  const emp = requireSession_(token);
  if (emp.Role === 'admin') throw new Error('Admins are never monitored.');
  if (!boolCell_(emp.Monitored)) throw new Error('This account is not flagged for screen monitoring.');
  if (!imageBase64) throw new Error('Image data is required.');
  const takenAt = takenAtIso ? new Date(takenAtIso) : new Date();
  const dateStr = normalizeDateStr_(takenAt);
  const hhmm = Utilities.formatDate(takenAt, Session.getScriptTimeZone(), 'HH:mm');
  const weekday = isoWeekday || (takenAt.getDay() === 0 ? 7 : takenAt.getDay());
  const s = getSettings_();
  const workingHours = s.WorkingHours ? JSON.parse(s.WorkingHours) : DEFAULT_WORKING_HOURS;
  const holidays = s.Holidays ? JSON.parse(s.Holidays) : [];
  if (!isWithinWorkingWindow_(workingHours, holidays, dateStr, hhmm, weekday)) {
    throw new Error('Outside configured working hours — screenshot rejected.');
  }
  return withLock_(() => {
    const root = getOrCreateFolder_(DriveApp.getRootFolder(), SCREENSHOTS_ROOT_FOLDER_NAME);
    const empFolder = getOrCreateFolder_(root, emp.Name + ' (' + String(emp.ID).slice(0, 8) + ')');
    const raw = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const bytes = Utilities.base64Decode(raw);
    const fileName = Utilities.formatDate(takenAt, Session.getScriptTimeZone(), 'yyyy-MM-dd_HH-mm-ss') + '.png';
    const blob = Utilities.newBlob(bytes, 'image/png', fileName);
    empFolder.createFile(blob);
    return { success: true };
  });
}

/** Admin-only convenience link to open the screenshots root folder in Drive. */
function getScreenshotsFolderUrl(token) {
  requireAdmin_(token);
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), SCREENSHOTS_ROOT_FOLDER_NAME);
  return root.getUrl();
}

/* ════════════════════════════════════════════
   doPost — JSON API for the external Windows agent
   ------------------------------------------------------------
   google.script.run (used everywhere above) only works from inside
   this project's own HtmlService page running in a browser — it has
   no meaning to an external process. The desktop agent is a plain
   Python program, so it instead POSTs JSON to this Web App's
   published URL and gets JSON back. Login reuses the exact same
   Employees-sheet email/password check as the web app; nothing here
   is a separate, weaker auth path.
   Deploying this requires the Web App's access to be set to
   "Anyone" (not "Only myself") — see the desktop-agent README.
══════════════════════════════════════════════ */

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOut_({ error: 'Invalid JSON body.' });
  }
  try {
    switch (body.action) {
      case 'login':
        return jsonOut_(login(body.email, body.password));
      case 'getAgentConfig':
        return jsonOut_(getAgentConfig(body.token));
      case 'uploadScreenshot':
        return jsonOut_(uploadScreenshot(body.token, body.imageBase64, body.takenAt, body.isoWeekday));
      default:
        return jsonOut_({ error: 'Unknown action: ' + body.action });
    }
  } catch (err) {
    return jsonOut_({ error: err.message || String(err) });
  }
}

function emergencyResetMyPassword() {
  const email = 'pramiltravalate@gmail.com';
  const newPassword = 'XXXX'; // type a new password here only when you need to run this, then delete it again

  const { sh, headers, rows } = readAllObjects_('Employees');
  const emp = rows.find(r => String(r.Email).trim().toLowerCase() === email.trim().toLowerCase());
  if (!emp) { Logger.log('No employee found with email: ' + email); return; }

  const salt = newId_();
  const hash = hashPassword_(newPassword, salt);
  sh.getRange(emp.__row, headers.indexOf('Salt') + 1).setValue(salt);
  sh.getRange(emp.__row, headers.indexOf('PasswordHash') + 1).setValue(hash);

  Logger.log('Password reset OK for ' + email + ' (role: ' + emp.Role + ')');
}
