# Travalate Shipment Manager (Google Apps Script)

Shipments, box scanning, employees with PINs and an AI assistant (Gemini; key in Script Properties
`GEMINI_API_KEY`, never in the code). Shipped stock is sent to the Inventory App's `doPost`.
The Box Scanner page at the top of this repo (`/index.html`, GitHub Pages) calls this web app.

| File in Apps Script | File here |
|---|---|
| `Code.gs` | `Code.gs` |
| HTML file `Index` | `Index.html` |

## Secrets kept out of GitHub
The shared secret between the Inventory App and the Shipment Manager (`SHARED_SECRET` / `INVENTORY_SHARED_SECRET`)
is written as `XXXX` here. The real value stays only in the Apps Script editor. When copying a file from here into
Apps Script, keep the real value that is already there. The automatic deploy fills it in from the GitHub secret
`TRAVALATE_SHARED_SECRET` (see `_new-app-template/AUTO-DEPLOY.md`).

## Dummy RO Invoice for the Blinkit Planner
The Blinkit Planner's **RO PDF → 🧾 Dummy RO Invoice** button calls this web app. `plannerDummyRoInvoice_` in
`Code.gs` uploads the R.O. PDF as a dummy PO (unless that PO is already here), applies the suggested boxes, creates the
RO Invoice with the next number `SI/2026-27/D001`, `D002`, … and then cancels the dummy PO. No shipment is saved.
- **Hook:** the first line of `doPost(e)` (which lives only in the Apps Script editor) must be
  `const __p = plannerDummyRoFromPost_(e); if (__p) return __p;`
- **Key:** Script Property `PLANNER_API_SECRET`. It must match the key saved in the planner's Settings. The real value
  stays only in Script Properties.
- **Counter:** Script Property `DUMMY_RO_INVOICE_SEQ` (the last D number used). Change it there to restart or skip numbers.
