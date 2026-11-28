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

## Shipped short → why? (Blinkit, Zepto, Swiggy)
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

## 🚚 Dispatch Date
Each shipment card has a **🚚 Dispatch Date** button that opens a date picker, defaulting to today. Set it to the day
the shipment actually left.
- **Where it is kept:** `SHIPMENTS` → column N `DISPATCH_DATE`. The column is added by itself. **Clear date** removes
  it.
- **On the card:** *🚚 Dispatched dd-mm-yyyy*, or *🚚 Not dispatched yet*.
- **Blinkit Planner:** for shipments entered from **26-11-2026** on, the Planner counts an RO as shipped only from this
  date (once that day has come), not from the shipment's 📅 date. Until it is set, the RO stays Planned there.
  Shipments entered before 26-11-2026 still count from their 📅 date.

## Current stock next to Qty (one call per screen)
The Stock figure beside each box row, and in the Suggest Boxes popup, comes from Travalate Inventory. All rows asking
at about the same time share **one** server call, `getInventoryStockForSkus`. That call makes one Inventory
`getStockSnapshot` request, and the result is kept for 30 seconds. Before this, each row made its own call. Opening or
editing a shipment with many SKUs then started dozens of script runs at once, and Google stops every app of an account
when about 30 run at the same time.

## Confirm before saving

Every button that saves something asks first, so an accidental tap or click changes nothing. The question appears in
the app's own dialog and names the shipment, PO, date or invoice number where there is one. The buttons:

- Generate Outputs, and the suggested-boxes Generate
- Save Changes on a shipment
- Dispatch Date Save and Clear date
- the short-quantity reasons
- Generate Labels (invoice number)
- RO Invoice and RO details
- Adjustment
- warehouse, SKU, UPC and inventory mapping
- PO upload, POD and settings
- profile, employee and Add Employee
- Logout

Buttons that already asked (Delete, Remove, Deactivate, Switch Platform, Restore invoice number) ask only once. The
Enter-key shortcuts are not affected. One click listener (`SAVE_GUARDS_` in `Index.html`) does this: on the dialog's
action button it clicks the original button again, so each button's own code is unchanged.

Since this change the same pop-up also asks for **Zepto** and **Swiggy** shipments. The reasons are saved in ZEPTO_PO / SWIGGY_PO (columns SHORT_REASON, SHORT_REASON_QTY). The Blinkit Planner copies them into the Zepto / Swiggy Planning tab cell notes. `getBlinkitShortLines(poNumbers, platform)` and `saveBlinkitShortReasons(po, reasons, employee, platform)` take the platform; Blinkit is the default.
