/**
 * Purchase Order App — Google Apps Script
 *
 * 1. Create a Google Sheet → Extensions → Apps Script.
 * 2. Paste this file as Code.gs and Index.html as an HTML file named "Index".
 * 3. Run setup() once (authorise when asked), then check the Settings tab.
 * 4. Deploy → New deployment → Web app
 *      Execute as: Me      Who has access: Only myself (or Anyone with a Google account)
 *
 * The first PO for a vendor saves the vendor's full details in the Vendors tab and its items/rates
 * in the Vendor Products tab. From then on, picking the vendor fills everything in automatically.
 */

const SHEET = {
  SETTINGS: 'Settings',
  VENDORS: 'Vendors',
  POS: 'Purchase Orders',
  ITEMS: 'PO Items',
  PRODUCTS: 'Vendor Products',
};

const VENDOR_HEADERS = ['Vendor ID', 'Vendor Name', 'Contact Person', 'Address', 'City / State', 'Phone',
  'Email', 'GSTIN', 'Created At', 'Updated At'];
const PO_HEADERS = ['PO #', 'Date', 'Vendor ID', 'Vendor Name', 'Requisitioner', 'Ship Via', 'F.O.B.',
  'Shipping Terms', 'Subtotal', 'Tax %', 'Tax', 'Shipping', 'Other', 'Total', 'Comments', 'PDF Link',
  'PDF File ID', 'Created By', 'Created At'];
const ITEM_HEADERS = ['PO #', 'Vendor ID', 'Item #', 'Description', 'Qty', 'Unit Price', 'Total'];
/** Each vendor's products and current rate. Updated by every PO and by the Vendors screen. */
const PRODUCT_HEADERS = ['Vendor ID', 'Item #', 'Description', 'Rate', 'Last Ordered', 'Updated At'];

/** Settings tab: one row per setting. Edit the values in the Sheet, not here. */
const SETTING_DEFAULTS = [
  ['Company Name', 'Sethi Industries'],
  ['Company Address', 'H-1177, Sitapura Industrial Area'],
  ['Company City / State', 'Jaipur, Rajasthan'],
  ['Company Phone', '9660598669'],
  ['Company GSTIN', ''],
  ['Ship To Name', 'Sethi Industries'],
  ['Ship To Contact', 'Sethi Industries'],
  ['Ship To Address', 'H-1177, Sitapura Industrial Area'],
  ['Ship To City / State', 'Jaipur, Rajasthan'],
  ['Ship To Phone', '9660598669'],
  ['Questions Contact', 'Pramil - 9660598669'],
  ['Default Comments', 'Thank you for your business.'],
  ['Default Tax %', 5],
  ['Next PO Number', 211],
  ['PDF Folder ID', ''],
];

const PDF_MIN_ROWS = 15; // empty rows keep the item table the same height as the template

// ---------------------------------------------------------------- setup / web app

function setup() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, SHEET.VENDORS, VENDOR_HEADERS);
  ensureSheet_(ss, SHEET.POS, PO_HEADERS);
  ensureSheet_(ss, SHEET.ITEMS, ITEM_HEADERS);
  const prod = ensureSheet_(ss, SHEET.PRODUCTS, PRODUCT_HEADERS);
  if (prod.getLastRow() < 2) seedProductsFromHistory_();

  const st = ensureSheet_(ss, SHEET.SETTINGS, ['Setting', 'Value']);
  const have = st.getLastRow() > 1
    ? st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().map(r => String(r[0]))
    : [];
  SETTING_DEFAULTS.forEach(([k, v]) => { if (have.indexOf(k) < 0) st.appendRow([k, v]); });
  st.autoResizeColumns(1, 2);

  const s = getSettings_();
  if (!s['PDF Folder ID'] || !folderExists_(s['PDF Folder ID'])) {
    const folder = DriveApp.createFolder('Purchase Orders (PDF)');
    setSetting_('PDF Folder ID', folder.getId());
  }
  const del = ss.getSheetByName('Sheet1');
  if (del && del.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(del);
}

function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.company = getSettings_()['Company Name'] || 'Purchase Orders';
  return t.evaluate()
    .setTitle(t.company + ' – Purchase Orders')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------------------------------------------------------------- API used by Index.html

/** Everything the form needs on load. */
function getInitData() {
  const s = getSettings_();
  return {
    company: s['Company Name'],
    nextPoNumber: nextPoNumber_(s),
    taxPct: Number(s['Default Tax %']) || 0,
    comments: s['Default Comments'] || '',
    shipTo: shipTo_(s),
    vendors: getVendors_(),
    recent: getRecentPos_(25),
    today: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
  };
}

/**
 * Saves the PO, adds or updates the vendor, creates the PDF in Drive.
 * Returns the PO number and PDF links plus the refreshed lists for the form.
 */
function savePO(po) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActive();
    const s = getSettings_();

    const poNumber = String(po.poNumber || '').trim();
    if (!poNumber) throw new Error('PO # is required.');
    if (poExists_(poNumber)) throw new Error('PO # ' + poNumber + ' already exists. Use another number.');
    if (!po.date) throw new Error('Date is required.');

    const vendor = upsertVendor_(po.vendor || {});

    const items = (po.items || [])
      .map(it => ({
        item: String(it.item || '').trim(),
        description: String(it.description || '').trim(),
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0,
      }))
      .filter(it => it.item || it.description);
    if (!items.length) throw new Error('Add at least one item.');
    items.forEach(it => { it.total = round2_(it.qty * it.price); });

    const subtotal = round2_(items.reduce((a, it) => a + it.total, 0));
    const taxPct = Number(po.taxPct) || 0;
    const tax = round2_(subtotal * taxPct / 100);
    const shipping = Number(po.shipping) || 0;
    const other = Number(po.other) || 0;
    const total = round2_(subtotal + tax + shipping + other);

    const tz = Session.getScriptTimeZone();
    const date = parseDate_(po.date);
    const data = {
      poNumber: poNumber,
      dateText: Utilities.formatDate(date, tz, 'dd/MM/yyyy'),
      vendor: vendor,
      shipTo: shipTo_(s),
      requisitioner: String(po.requisitioner || '').trim(),
      shipVia: String(po.shipVia || '').trim(),
      fob: String(po.fob || '').trim(),
      terms: String(po.terms || '').trim(),
      items: items,
      subtotal: subtotal, taxPct: taxPct, tax: tax, shipping: shipping, other: other, total: total,
      comments: String(po.comments || '').trim(),
      settings: s,
    };

    const file = createPdf_(data);

    const now = new Date();
    ss.getSheetByName(SHEET.POS).appendRow([
      "'" + poNumber, date, vendor.id, vendor.name, data.requisitioner, data.shipVia, data.fob, data.terms,
      subtotal, taxPct, tax, shipping, other, total, data.comments, file.getUrl(), file.getId(),
      userEmail_(), now,
    ]);
    const itemSheet = ss.getSheetByName(SHEET.ITEMS);
    const rows = items.map(it => ["'" + poNumber, vendor.id, it.item, it.description, it.qty, it.price, it.total]);
    itemSheet.getRange(itemSheet.getLastRow() + 1, 1, rows.length, ITEM_HEADERS.length).setValues(rows);

    // Move the counter past this number (also when a higher number was typed by hand).
    const n = Number(poNumber);
    if (isFinite(n) && n >= (Number(s['Next PO Number']) || 0)) setSetting_('Next PO Number', n + 1);

    upsertProducts_(vendor.id, items, date);

    return {
      poNumber: poNumber,
      url: file.getUrl(),
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      total: total,
      init: getInitData(),
    };
  } finally {
    lock.releaseLock();
  }
}

/** Makes the PDF again for an existing PO (e.g. after changing Settings or vendor details). */
function regeneratePdf(poNumber) {
  const ss = SpreadsheetApp.getActive();
  const s = getSettings_();
  const sh = ss.getSheetByName(SHEET.POS);
  const vals = sh.getDataRange().getValues();
  const i = vals.findIndex((r, k) => k > 0 && String(r[0]) === String(poNumber));
  if (i < 0) throw new Error('PO # ' + poNumber + ' not found.');
  const r = vals[i];
  const vendor = getVendors_().find(v => v.id === String(r[2])) || { name: r[3] };
  const items = ss.getSheetByName(SHEET.ITEMS).getDataRange().getValues().slice(1)
    .filter(x => String(x[0]) === String(poNumber))
    .map(x => ({ item: x[2], description: x[3], qty: x[4], price: x[5], total: x[6] }));
  const file = createPdf_({
    poNumber: String(poNumber),
    dateText: Utilities.formatDate(new Date(r[1]), Session.getScriptTimeZone(), 'dd/MM/yyyy'),
    vendor: vendor, shipTo: shipTo_(s),
    requisitioner: r[4], shipVia: r[5], fob: r[6], terms: r[7], items: items,
    subtotal: r[8], taxPct: r[9], tax: r[10], shipping: r[11], other: r[12], total: r[13],
    comments: r[14], settings: s,
  });
  const oldId = String(r[16] || '');
  if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) { /* already gone */ } }
  sh.getRange(i + 1, 16, 1, 2).setValues([[file.getUrl(), file.getId()]]);
  return { url: file.getUrl(), downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId() };
}

// ---------------------------------------------------------------- vendors

/** Vendors with their products (item, description, rate) and their last PO #. */
function getVendors_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.VENDORS);
  if (!sh || sh.getLastRow() < 2) return [];
  const products = getProducts_();
  const lastPo = {};
  const po = SpreadsheetApp.getActive().getSheetByName(SHEET.POS);
  if (po && po.getLastRow() > 1) {
    po.getRange(2, 1, po.getLastRow() - 1, 3).getValues().forEach(r => { if (r[0] !== '') lastPo[String(r[2])] = String(r[0]); });
  }
  return sh.getRange(2, 1, sh.getLastRow() - 1, VENDOR_HEADERS.length).getValues()
    .filter(r => r[0] && r[1])
    .map(r => {
      const id = String(r[0]);
      return {
        id: id, name: String(r[1]), contact: String(r[2]), address: String(r[3]),
        city: String(r[4]), phone: String(r[5]), email: String(r[6]), gstin: String(r[7]),
        products: products.filter(p => p.vendorId === id).map(p => ({ item: p.item, description: p.description, rate: p.rate })),
        lastPo: lastPo[id] || '',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Vendors screen: saves the vendor's details and its full product list (rows not sent are removed).
 * payload = { vendor: {...}, products: [{item, description, rate}] }
 */
function saveVendor(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const vendor = upsertVendor_(payload.vendor || {});
    const seen = {};
    const rows = (payload.products || [])
      .map(p => ({
        item: String(p.item || '').trim() || String(p.description || '').trim(),
        description: String(p.description || '').trim(),
        rate: Number(p.rate) || 0,
      }))
      .filter(p => {
        const k = p.item.toLowerCase();
        if (!k || seen[k]) return false;
        seen[k] = true;
        return true;
      });

    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.PRODUCTS);
    const vals = sh.getDataRange().getValues();
    const old = {};
    vals.slice(1).forEach(r => { if (String(r[0]) === vendor.id) old[String(r[1]).toLowerCase()] = r; });
    const now = new Date();
    const keep = vals.slice(1).filter(r => r[0] !== '' && String(r[0]) !== vendor.id);
    rows.forEach(p => {
      const o = old[p.item.toLowerCase()];
      const changed = !o || String(o[2]) !== p.description || Number(o[3]) !== p.rate;
      keep.push([vendor.id, p.item, p.description, p.rate, o ? o[4] : '', changed ? now : o[5]]);
    });
    rewriteRows_(sh, PRODUCT_HEADERS.length, keep);
    return { vendorId: vendor.id, init: getInitData() };
  } finally {
    lock.releaseLock();
  }
}

/** Items of an existing PO, used by "Repeat last order". */
function getPoItems(poNumber) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.ITEMS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, ITEM_HEADERS.length).getValues()
    .filter(r => String(r[0]) === String(poNumber))
    .map(r => ({ item: String(r[2]), description: String(r[3]), qty: Number(r[4]) || 0, price: Number(r[5]) || 0 }));
}

/** New vendor → new row. Existing vendor → its row is updated when details were changed in the form. */
function upsertVendor_(v) {
  const clean = {
    id: String(v.id || '').trim(),
    name: String(v.name || '').trim(),
    contact: String(v.contact || '').trim(),
    address: String(v.address || '').trim(),
    city: String(v.city || '').trim(),
    phone: String(v.phone || '').trim(),
    email: String(v.email || '').trim(),
    gstin: String(v.gstin || '').trim().toUpperCase(),
  };
  if (!clean.name) throw new Error('Vendor name is required.');

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.VENDORS);
  const vals = sh.getDataRange().getValues();
  const now = new Date();
  const rowOf = clean.id
    ? vals.findIndex((r, k) => k > 0 && String(r[0]) === clean.id)
    : vals.findIndex((r, k) => k > 0 && String(r[1]).trim().toLowerCase() === clean.name.toLowerCase());

  if (rowOf > 0) {
    clean.id = String(vals[rowOf][0]);
    const next = [clean.name, clean.contact, clean.address, clean.city, clean.phone, clean.email, clean.gstin];
    const prev = vals[rowOf].slice(1, 8).map(String);
    if (next.some((x, k) => x !== prev[k])) {
      sh.getRange(rowOf + 1, 2, 1, 7).setValues([next]);
      sh.getRange(rowOf + 1, 10).setValue(now);
    }
    return clean;
  }

  let max = 0;
  vals.slice(1).forEach(r => { const m = /^V(\d+)$/.exec(String(r[0])); if (m) max = Math.max(max, Number(m[1])); });
  clean.id = 'V' + String(max + 1).padStart(3, '0');
  sh.appendRow([clean.id, clean.name, "'" + clean.contact, clean.address, clean.city, "'" + clean.phone,
    clean.email, clean.gstin, now, now]);
  return clean;
}

// ---------------------------------------------------------------- history

function getProducts_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.PRODUCTS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, PRODUCT_HEADERS.length).getValues()
    .filter(r => r[0] !== '' && String(r[1]).trim())
    .map(r => ({ vendorId: String(r[0]), item: String(r[1]).trim(), description: String(r[2]), rate: Number(r[3]) || 0 }))
    .sort((a, b) => a.item.localeCompare(b.item));
}

/** After a PO: add new items to the vendor's list and store the rate just used as the vendor's rate. */
function upsertProducts_(vendorId, items, date) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.PRODUCTS);
  const vals = sh.getDataRange().getValues();
  const idx = {};
  vals.forEach((r, i) => { if (i > 0 && String(r[0]) === vendorId) idx[String(r[1]).trim().toLowerCase()] = i; });
  const now = new Date();
  items.forEach(it => {
    const name = it.item || it.description;
    const i = idx[name.toLowerCase()];
    if (i === undefined) {
      sh.appendRow([vendorId, name, it.description, it.price, date, now]);
      idx[name.toLowerCase()] = sh.getLastRow() - 1;
      return;
    }
    const r = vals[i];
    const changed = Number(r[3]) !== it.price || (it.description && String(r[2]) !== it.description);
    sh.getRange(i + 1, 3, 1, 4).setValues([[it.description || r[2], it.price, date, changed ? now : r[5]]]);
  });
}

/** One-time fill of Vendor Products from earlier POs (latest rate per vendor + item). */
function seedProductsFromHistory_() {
  const ss = SpreadsheetApp.getActive();
  const items = ss.getSheetByName(SHEET.ITEMS);
  if (!items || items.getLastRow() < 2) return;
  const map = {};
  items.getRange(2, 1, items.getLastRow() - 1, ITEM_HEADERS.length).getValues().forEach(r => {
    const name = String(r[2]).trim() || String(r[3]).trim();
    if (!r[1] || !name) return;
    map[r[1] + '|' + name.toLowerCase()] = [String(r[1]), name, String(r[3]), Number(r[5]) || 0, '', new Date()];
  });
  const rows = Object.keys(map).map(k => map[k]);
  if (rows.length) ss.getSheetByName(SHEET.PRODUCTS).getRange(2, 1, rows.length, PRODUCT_HEADERS.length).setValues(rows);
}

function getRecentPos_(limit) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.POS);
  if (!sh || sh.getLastRow() < 2) return [];
  const tz = Session.getScriptTimeZone();
  return sh.getRange(2, 1, sh.getLastRow() - 1, PO_HEADERS.length).getValues()
    .filter(r => r[0] !== '')
    .slice(-limit).reverse()
    .map(r => ({
      poNumber: String(r[0]),
      date: r[1] instanceof Date ? Utilities.formatDate(r[1], tz, 'dd/MM/yyyy') : String(r[1]),
      vendorId: String(r[2]),
      vendor: String(r[3]),
      total: Number(r[13]) || 0,
      url: String(r[15]),
      downloadUrl: r[16] ? 'https://drive.google.com/uc?export=download&id=' + r[16] : '',
    }));
}

function poExists_(poNumber) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.POS);
  if (sh.getLastRow() < 2) return false;
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().some(r => String(r[0]) === poNumber);
}

function nextPoNumber_(s) {
  let n = Number(s['Next PO Number']) || 1;
  while (poExists_(String(n))) n++;
  return n;
}

// ---------------------------------------------------------------- PDF

function createPdf_(d) {
  const html = poHtml_(d);
  const name = 'PO ' + d.poNumber + ' - ' + d.vendor.name + '.pdf';
  const blob = Utilities.newBlob(html, 'text/html', 'po.html').getAs(MimeType.PDF).setName(name);
  return pdfFolder_().createFile(blob);
}

/** Same layout as the Vertex42 purchase order template the company uses. */
function poHtml_(d) {
  const s = d.settings;
  const e = esc_;
  const blue = '#3b4e87';
  const head = 'background:' + blue + ';color:#fff;font-weight:bold;font-size:9pt;padding:4px 6px;';
  const cell = 'border:1px solid #9aa3b5;padding:3px 6px;font-size:9pt;height:14px;';
  const line = (t) => t ? '<div>' + e(t) + '</div>' : '';
  const phone = (t) => t ? '<div>Phone: ' + e(t) + '</div>' : '';

  const v = d.vendor;
  const vendorBlock = line(v.name) + line(v.contact) + line(v.address) + line(v.city) + phone(v.phone)
    + (v.gstin ? '<div>GSTIN: ' + e(v.gstin) + '</div>' : '');
  const st = d.shipTo;
  const shipBlock = line(st.name) + line(st.contact) + line(st.address) + line(st.city) + line(st.phone);

  let itemRows = d.items.map(it =>
    '<tr><td style="' + cell + '">' + e(it.item) + '</td>' +
    '<td style="' + cell + '">' + e(it.description) + '</td>' +
    '<td style="' + cell + 'text-align:center">' + e(fmtQty_(it.qty)) + '</td>' +
    '<td style="' + cell + 'text-align:right">' + e(fmtMoney_(it.price)) + '</td>' +
    '<td style="' + cell + 'text-align:right;background:#eef0f5">' + e(fmtMoney_(it.total)) + '</td></tr>').join('');
  for (let i = d.items.length; i < PDF_MIN_ROWS; i++) {
    itemRows += '<tr>' + [0, 1, 2, 3].map(() => '<td style="' + cell + '">&nbsp;</td>').join('') +
      '<td style="' + cell + 'background:#eef0f5">&nbsp;</td></tr>';
  }

  const tot = (label, value, extra) =>
    '<tr><td style="font-size:9pt;padding:3px 6px;' + (extra || '') + '">' + label + '</td>' +
    '<td style="font-size:9pt;padding:3px 6px;text-align:right;border:1px solid #9aa3b5;' + (extra || '') + '">' +
    value + '</td></tr>';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:9pt;margin:0}' +
    'table{border-collapse:collapse;width:100%}td,th{vertical-align:top;font-size:9pt}' +
    '</style></head><body>' +

    // Header
    '<table><tr>' +
    '<td style="width:55%"><div style="font-size:15pt;margin-bottom:6px">' + e(s['Company Name']) + '</div>' +
    line(s['Company Address']) + line(s['Company City / State']) + phone(s['Company Phone']) +
    (s['Company GSTIN'] ? '<div>GSTIN: ' + e(s['Company GSTIN']) + '</div>' : '') + '</td>' +
    '<td style="text-align:right"><div style="font-size:22pt;font-weight:bold;color:#7189c4;margin-bottom:6px">PURCHASE ORDER</div>' +
    '<table style="width:auto;margin-left:auto">' +
    '<tr><td style="padding:2px 8px;font-size:9pt">DATE</td><td style="border:1px solid #9aa3b5;padding:2px 8px;text-align:center;width:90px">' + e(d.dateText) + '</td></tr>' +
    '<tr><td style="padding:2px 8px;font-size:9pt">PO #</td><td style="border:1px solid #9aa3b5;padding:2px 8px;text-align:center">' + e(d.poNumber) + '</td></tr>' +
    '</table></td></tr></table>' +

    // Vendor / Ship to
    '<table style="margin-top:28px"><tr>' +
    '<td style="width:47%"><div style="' + head + '">VENDOR</div><div style="padding:4px 2px;line-height:1.45">' + vendorBlock + '</div></td>' +
    '<td style="width:6%"></td>' +
    '<td style="width:47%"><div style="' + head + '">SHIP TO</div><div style="padding:4px 2px;line-height:1.45">' + shipBlock + '</div></td>' +
    '</tr></table>' +

    // Requisitioner row
    '<table style="margin-top:18px"><tr>' +
    ['REQUISITIONER', 'SHIP VIA', 'F.O.B.', 'SHIPPING TERMS'].map(h => '<td style="' + head + 'text-align:center">' + h + '</td>').join('') +
    '</tr><tr>' +
    [d.requisitioner, d.shipVia, d.fob, d.terms].map(x => '<td style="' + cell + 'text-align:center">' + e(x) + '</td>').join('') +
    '</tr></table>' +

    // Items
    '<table style="margin-top:18px"><tr>' +
    '<td style="' + head + 'text-align:center;width:18%">ITEM #</td>' +
    '<td style="' + head + 'text-align:center;width:40%">DESCRIPTION</td>' +
    '<td style="' + head + 'text-align:center;width:10%">QTY</td>' +
    '<td style="' + head + 'text-align:center;width:15%">UNIT PRICE</td>' +
    '<td style="' + head + 'text-align:center;width:17%">TOTAL</td></tr>' +
    itemRows + '</table>' +

    // Comments + totals
    '<table style="margin-top:6px"><tr>' +
    '<td style="width:55%;padding-top:16px"><div style="border:1px solid #9aa3b5">' +
    '<div style="background:#bfbfbf;font-weight:bold;padding:3px 6px">Comments or Special Instructions</div>' +
    '<div style="padding:4px 6px;min-height:60px;white-space:pre-wrap">' + e(d.comments) + '</div></div></td>' +
    '<td style="width:12%"></td>' +
    '<td style="width:33%"><table>' +
    tot('SUBTOTAL', e(fmtMoney_(d.subtotal)), 'background:#eef0f5') +
    tot('TAX' + (d.taxPct ? ' (' + e(fmtQty_(d.taxPct)) + '%)' : ''), e(d.tax ? fmtMoney_(d.tax) : '')) +
    tot('SHIPPING', e(d.shipping ? fmtMoney_(d.shipping) : '')) +
    tot('OTHER', e(d.other ? fmtMoney_(d.other) : '')) +
    tot('<b>TOTAL</b>', '<b>' + e(fmtMoney_(d.total)) + '</b>', 'background:#b4c0e4;border-top:2px solid #000') +
    '</table></td></tr></table>' +

    // Footer
    '<div style="text-align:center;margin-top:24px;line-height:1.5">' +
    'If you have any questions about this purchase order, please contact<br>' + e(s['Questions Contact']) + '</div>' +
    '</body></html>';
}

function pdfFolder_() {
  const id = getSettings_()['PDF Folder ID'];
  if (id && folderExists_(id)) return DriveApp.getFolderById(id);
  const folder = DriveApp.createFolder('Purchase Orders (PDF)');
  setSetting_('PDF Folder ID', folder.getId());
  return folder;
}

// ---------------------------------------------------------------- helpers

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    const have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
    headers.forEach((h, i) => { if (!have[i]) sh.getRange(1, i + 1).setValue(h).setFontWeight('bold'); });
  }
  return sh;
}

/** Replaces all data rows (keeps the header). */
function rewriteRows_(sh, width, rows) {
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(width, sh.getLastColumn())).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, width).setValues(rows);
}

function getSettings_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.SETTINGS);
  const out = {};
  SETTING_DEFAULTS.forEach(([k, v]) => { out[k] = v; });
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { if (r[0]) out[String(r[0])] = r[1]; });
  }
  return out;
}

function setSetting_(key, value) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.SETTINGS);
  const keys = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => String(r[0])) : [];
  const i = keys.indexOf(key);
  if (i < 0) sh.appendRow([key, value]);
  else sh.getRange(i + 2, 2).setValue(value);
}

function shipTo_(s) {
  return {
    name: String(s['Ship To Name'] || ''), contact: String(s['Ship To Contact'] || ''),
    address: String(s['Ship To Address'] || ''), city: String(s['Ship To City / State'] || ''),
    phone: String(s['Ship To Phone'] || ''),
  };
}

function folderExists_(id) {
  try { return !DriveApp.getFolderById(id).isTrashed(); } catch (e) { return false; }
}

function parseDate_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd));
  if (!m) throw new Error('Invalid date.');
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function userEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
}

function round2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/** 97650 → "97,650.00" (Indian grouping: 1,23,45,678.00). */
function fmtMoney_(n) {
  const neg = n < 0;
  const parts = Math.abs(round2_(n)).toFixed(2).split('.');
  let x = parts[0];
  if (x.length > 3) x = x.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + x.slice(-3);
  return (neg ? '-' : '') + x + '.' + parts[1];
}

function fmtQty_(n) {
  const v = Number(n) || 0;
  return String(Math.round(v * 1000) / 1000);
}

function esc_(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
