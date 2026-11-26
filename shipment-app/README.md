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
- **doPost:** in `Code.gs` (the project had none before). Its first line hands the Planner's request to
  `plannerDummyRoFromPost_`; anything else gets `Unknown request`. The deploy (`post_hook` in `deploy-shipment.yml`)
  checks that line is there and warns if a second `doPost` ever appears in a file that is only in Apps Script.
- **Key:** Script Property `PLANNER_API_SECRET`. It must match the key saved in the planner's Settings. The real value
  stays only in Script Properties.
- **Counter:** Script Property `DUMMY_RO_INVOICE_SEQ` (the last D number used). Change it there to restart or skip numbers.

## Shipped short → why? (Blinkit)
When a Blinkit shipment sent less than the PO quantity on some lines, **Box Details** and **📥 JPG** (Shipments tab)
first open a popup. It lists each of those SKUs with the PO quantity, what was sent and how many less, and asks why.
The reason can be picked from a list or typed. **Save & continue** needs a reason for every SKU. **Skip for now**
continues without one, and the popup comes back next time.
- **Where it is kept:** `BLINKIT_PO` → column P `SHORT_REASON`, on the PO line. The column is added the first time a
  reason is saved.
- **Planner:** its Shipment Manager sync copies the reason into the RO Log's *Short Note* and into the note of the red
  cell in its month tab.
- **Edited later:** if the shipment is edited and the line is now shipped in full, the reason is cleared here and the
  Planner removes its note. If it is still short, the note stays. Once every short line has a reason, the buttons no
  longer ask.
