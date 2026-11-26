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
open only once every such line has a reason. A popup lists those SKUs: the PO quantity, what was sent and how many
less, with a reason beside each. The reason is one of:
- **Not Enough Quantity**
- **Management Decided**
- **Other**, which needs the reason typed in.

**Save & continue** saves the reasons and opens the file. If the shortfalls are not loaded yet, the popup first shows
*Checking…*.
- **Where it is kept:** `BLINKIT_PO`, on the PO line.
  - Column P `SHORT_REASON` holds the reason.
  - Column Q `SHORT_REASON_QTY` holds how many were short when the reason was given.
  - Both columns are added the first time a reason is saved.
- **Asked again after an edit:** if the shipment is edited and a line's shortfall changes, or another line becomes
  short, the popup asks again. It shows the earlier reason, which can be picked again.
- **Shipped in full:** if an edit ships a line in full, its reason is cleared.
- **Planner:** its Shipment Manager sync copies the reason into the RO Log's *Short Note* and into the note of the red
  cell in its month tab. Once the line is shipped in full, the note goes.
