// ============================================================
//  STOCK SNAPSHOT LOGGER — for Looker Studio reporting
//  Creates/append to a flat "Stock_Snapshot_Log" sheet:
//     Date | SKU | ClosingQty | MonthSheet
//  One row per SKU per day. This is the table Looker Studio
//  should connect to for stock-level trend charts, since the
//  monthly Stock Register sheets are wide-format (date columns)
//  and don't work well as a BI data source.
//
//  SET UP A DAILY TRIGGER (one-time):
//    Apps Script editor -> Triggers (clock icon, left sidebar)
//    -> Add Trigger -> Function: dailyStockSnapshot
//    -> Event source: Time-driven -> Day timer -> pick a time
//       (e.g. 11:45pm - 12am), so it captures the day's closing stock.
// ============================================================

const SNAPSHOT_SHEET_NAME = "Stock_Snapshot_Log";

/** Ensures the Stock_Snapshot_Log sheet exists with headers. */
function getOrCreateSnapshotSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SNAPSHOT_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SNAPSHOT_SHEET_NAME);
    sh.getRange(1, 1, 1, 4).setValues([["Date", "SKU", "ClosingQty", "MonthSheet"]]);
    sh.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#1a73e8").setFontColor("#FFFFFF");
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Reads the active month's Stock Register sheet ONCE (fully batched),
 * finds each SKU's most recent non-blank running balance, and appends
 * one snapshot row per SKU to Stock_Snapshot_Log for today's date.
 *
 * Safe to run multiple times per day — it OVERWRITES today's existing
 * snapshot rows first (if the trigger fires twice, or you run it
 * manually to backfill), rather than creating duplicates.
 */
function dailyStockSnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const srSh = getActiveStockSheet();       // from your existing Inventory script
  const snapSh = getOrCreateSnapshotSheet();

  const monthSheetName = srSh.getName();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── 1. Read the WHOLE stock register in one call (fully batched) ──
  const lastRow = srSh.getLastRow();
  const lastCol = srSh.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return; // nothing to snapshot yet

  const allData = srSh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  // allData[r][0] = SKU name, allData[r][1..] = running qty per date column

  const snapshotRows = [];
  allData.forEach(row => {
    const sku = String(row[0] || "").trim();
    if (!sku) return;

    // Walk backward across the date columns to find the latest known qty
    let closingQty = null;
    for (let c = row.length - 1; c >= 1; c--) {
      const v = row[c];
      if (v !== "" && v !== null && v !== undefined) {
        closingQty = Number(v) || 0;
        break;
      }
    }
    if (closingQty === null) return; // SKU has no recorded stock yet

    snapshotRows.push([today, sku, closingQty, monthSheetName]);
  });

  if (!snapshotRows.length) return;

  // ── 2. Remove any existing rows for TODAY, to avoid duplicates ─────
  const existingLastRow = snapSh.getLastRow();
  if (existingLastRow > 1) {
    const existing = snapSh.getRange(2, 1, existingLastRow - 1, 1).getValues();
    // Delete from bottom up so row indices don't shift mid-loop
    for (let i = existing.length - 1; i >= 0; i--) {
      const existingDate = new Date(existing[i][0]);
      existingDate.setHours(0, 0, 0, 0);
      if (existingDate.getTime() === today.getTime()) {
        snapSh.deleteRow(i + 2);
      }
    }
  }

  // ── 3. Append today's snapshot rows (single batched write) ─────────
  const writeRow = snapSh.getLastRow() + 1;
  snapSh.getRange(writeRow, 1, snapshotRows.length, 4).setValues(snapshotRows);
}

/**
 * OPTIONAL ONE-TIME BACKFILL: run this manually once to populate
 * today's snapshot immediately after adding this script, so your
 * Looker Studio dashboard has at least one data point right away
 * instead of waiting for the first trigger fire.
 */
function backfillTodaySnapshotNow() {
  dailyStockSnapshot();
}
