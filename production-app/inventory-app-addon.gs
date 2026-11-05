// ============================================================
//  PRODUCTION APP LINK  —  paste this whole block at the END of
//  the Travalate Inventory App's Code.gs (it adds; nothing else in
//  the Inventory App changes except the 3 small edits listed in
//  production-app/README.md → "Inventory App changes").
//
//  The Karigar Production App calls the Inventory App's doPost with
//  the same SHARED_SECRET the Shipment Manager uses:
//
//   { action: "productionIn", batchId: "P-0012", date: "2026-11-05",
//     employee: "Harshit", comment: "Received From Ramesh (P-0012)",
//     items: { "TR-1323-Black": 40 } }
//       → adds the counted good pieces as an Inward entry. The cell
//         note reads:  05-Nov 14:20 | Harshit | +40 (In) | Received From Ramesh (P-0012)
//         A ledger per batch (Production_Sync_Log) means sending the
//         same batch again only applies the DIFFERENCE, so a retry
//         after a time-out never adds stock twice, and a corrected
//         batch (40 → 42) adds just +2.
//
//   { action: "setInProduction", items: { "TR-1323-Black": 50, ... } }
//       → saves how many pieces of each SKU karigars are still making
//         (In_Production tab, hidden). getInventorySnapshot() returns
//         it as `inProduction`, shown small and grey in the corner of
//         today's cell.
// ============================================================

const PRODUCTION_LINK = {
  LEDGER: "Production_Sync_Log",
  IN_PRODUCTION: "In_Production",
};

function getOrCreateProductionSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#1a73e8").setFontColor("#FFFFFF");
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}

/** Adds (or corrects) one production batch. itemsQtyMap = the batch's FULL good quantity per SKU. */
function productionInToInventory(batchId, itemsQtyMap, entryDate, employeeName, comment) {
  // No LockService here on purpose: processInventoryEntry() takes and releases the script lock itself
  // (getNextGroupId_), which would release an outer lock early.
  try {
    if (!batchId) return { success: false, error: "Missing batchId." };
    const date = entryDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const sh = getOrCreateProductionSheet_(PRODUCTION_LINK.LEDGER, ["BATCH_ID", "SKU", "QTY", "UPDATED_TS"]);
    const canonicalCase = getSkuCanonicalCaseMap_();
    const combos = loadCombos();

    // What this batch has added so far.
    const have = {};
    const lastRow = sh.getLastRow();
    const data = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, 3).getValues() : [];
    data.forEach(r => {
      if (String(r[0]) === String(batchId)) {
        const k = String(r[1]).trim().toUpperCase();
        have[k] = (have[k] || 0) + (Number(r[2]) || 0);
      }
    });

    // What it should have added now (only real, non-combo Master_SKU entries).
    const want = {};
    const skipped = [];
    Object.keys(itemsQtyMap || {}).forEach(sku => {
      const k = String(sku).trim().toUpperCase();
      const qty = Number(itemsQtyMap[sku]) || 0;
      if (!canonicalCase[k] || isComboSKU(canonicalCase[k], combos)) { if (qty) skipped.push(sku); return; }
      want[k] = (want[k] || 0) + qty;
    });

    const inward = [], outward = [], applied = [];
    new Set([...Object.keys(want), ...Object.keys(have)]).forEach(k => {
      if (!canonicalCase[k]) return;
      const delta = (want[k] || 0) - (have[k] || 0);
      if (!delta) return;
      const item = { sku: canonicalCase[k], qty: Math.abs(delta), comment: comment || ("Production " + batchId) };
      (delta > 0 ? inward : outward).push(item);
      applied.push({ sku: item.sku, qty: item.qty, direction: delta > 0 ? "in" : "out" });
    });

    if (inward.length) {
      const res = processInventoryEntry({ date: date, type: "Inward", employee: employeeName || "Production", items: inward });
      if (!res.success) return { success: false, error: "Inward failed: " + res.error };
    }
    if (outward.length) {
      const res = processInventoryEntry({ date: date, type: "Outward", employee: employeeName || "Production", items: outward });
      if (!res.success) return { success: false, error: "Correction failed: " + res.error };
    }

    // The ledger now holds exactly what this batch has added.
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][0]) === String(batchId)) sh.deleteRow(i + 2);
    }
    const ts = new Date();
    const rows = Object.keys(want).filter(k => want[k]).map(k => [batchId, canonicalCase[k], want[k], ts]);
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);

    return { success: true, applied: applied, skipped: skipped };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/** Replaces the "in production" list: { SKU: qty }. */
function setInProduction(itemsQtyMap) {
  const sh = getOrCreateProductionSheet_(PRODUCTION_LINK.IN_PRODUCTION, ["SKU", "IN_PRODUCTION", "UPDATED_TS"]);
  const last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 3).setValues(Array.from({ length: last - 1 }, () => ["", "", ""]));
  const ts = new Date();
  const rows = Object.keys(itemsQtyMap || {}).filter(k => Number(itemsQtyMap[k]) > 0).map(k => [k, Number(itemsQtyMap[k]), ts]);
  if (rows.length) sh.getRange(2, 1, rows.length, 3).setValues(rows);
  return { success: true, count: rows.length };
}

/** { "TR-1323-BLACK": 50, ... } (UPPERCASE keys) for the snapshot. */
function getInProductionMap_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRODUCTION_LINK.IN_PRODUCTION);
  const map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
    const k = String(r[0] || "").trim().toUpperCase();
    const q = Number(r[1]) || 0;
    if (k && q > 0) map[k] = q;
  });
  return map;
}
