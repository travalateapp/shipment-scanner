# Blinkit Shipment Planner (Google Apps Script web app)

A web app for computers and phones that plans Blinkit shipments (ROs) and keeps the **Blinkit Google Sheet** up to date by itself.

- **New Plan:** upload the Bulk RO file; the Inventory is read from the sheet's *Formula Sheet* (filled by the daily 📦 Blinkit Inventory upload). The app works out, for each warehouse × item, how much to send for **26 days of cover**, using the rules below. You can change any quantity. The warehouse chips above the plan pick **one or more** warehouses (click to add, click again to remove, **All** to clear); the Create ROs window starts with those warehouses ticked.
- **Create RO file:** one tap does three things:
  - downloads **Blinkit's own Bulk RO file** with *RO Quantity* and *Shipping Address* filled in, ready to upload;
  - saves every line in the **RO Log**;
  - writes the quantities into the month tab (e.g. *Oct 2026*), in the **next free column D–H** of that warehouse's TBI / TBO / TBG block.
  - In the Create ROs window, each ticked warehouse shows its **TBI / TBO / TBG** units in small print (a group not in the chosen file is struck through) and, as its total, the units that will be saved. The window always fits the screen: only the warehouse list scrolls (in its own box), the Excel choice is one row (Merged · All separate (ZIP) · TBI · TBO · TBG, with "Merge: TBI TBO TBG" under it for Merged), and above the Save button 📍 names each ticked warehouse with its units, so you always see which warehouse you are saving.
  - In the Create ROs window, choose **one** Excel option: **Merged** (one file; all groups, or untick a group to merge only the others, e.g. *…_TBI+TBO.xlsx*), **All separate** (one file per group, in one ZIP folder, e.g. *Blinkit_Bulk_RO_2026-11-25_Faridabad.zip*), or **TBI**, **TBO** or **TBG** only. Each file holds only the header and the lines being ordered — the ticked warehouses and the SKUs with an RO quantity; Blinkit's other rows are left out. **Only the chosen groups' lines are saved as ROs**; the other groups' lines stay in the plan with what you typed (the window says which). The file name carries the group, and the warehouse when only one is ticked. The done screen can download the ZIP or any single file again.
- **RO Log search (Ctrl+F):** a search box next to the filters narrows the ROs shown at once (no reading from the sheet): every word must match the RO's warehouse, group, RO number, SKUs, item IDs, status or a date (e.g. *mumbai belt*, *4999700011*, *25 nov*). A matching RO is shown whole; Esc clears the search.
- **RO Log shows ROs as on Blinkit:** ROs created with the **Merged** file, or sharing one Blinkit RO number at one warehouse, are one card (e.g. *Faridabad · TBI + TBO + TBG*), saved together. In the RO Log tab and the month tab they stay one batch per group (each group's own block), as before; the RO Log tab's **Merged RO** column links them.
- **RO Log:** every RO. Set the status (Planned → Created, or Cancelled); the RO Log opens on Created ROs, and add the Blinkit RO number and appointment date. The RO heading in the month tab updates too. It has three lines, centred: `RO 21 NOV`, the full Blinkit RO number in **font size 7** (`4999612345`), and **dispatch day - appointment** (`23/11 - 30/11`; `23/11 -` until there is an appointment). It is rewritten by itself whenever the RO number, appointment or dispatch day changes (RO Log, calendar, RO PDF) or the lead / packing / dispatch days in Settings change; **Settings → Sync month tabs** rewrites every open RO's heading at once. Changing a quantity, or cancelling a line, also changes the month tab.
- **RO PDF:** upload one or more Blinkit R.O. PDFs. They're read with the same parser as the Shipment Manager (`parseBlinkitRoPdf_`, copied unchanged), and the app picks up the RO number, warehouse, RO date, expiry and each Item Code + Qty. The items are checked against the PDF's *Total Quantity*.
  - If a PDF is a planner RO that has no RO number yet (same warehouse, same items), that RO gets the number, and the PDF's quantities replace the planned ones. No second RO is made.
  - Otherwise it's saved as a new **Created** RO in the RO Log and the month tab. An RO with items of more than one group (TBI / TBO / TBG) becomes one column per group, all with the same RO number.
  - An RO number already in the log is skipped.
  - Tick **Log only** for ROs you've already typed into the month tab by hand. They're logged, but never written into the tab, even by *Sync month tabs* or *Start new month*.
  - *Add an RO by hand* is still there, under the upload, for an RO without a PDF.
- **Planned vs Created:** *Planned* = not on Blinkit yet; it always counts as incoming in the next plan. *Created* = on Blinkit; it counts only until Blinkit's own Bulk RO file shows it as incoming, so it's never counted twice. For an RO from a PDF, "on Blinkit since" is the **R.O. date and time printed on the PDF** (RO Log column *Blinkit Created At*), not the upload time. An older RO's PDF is therefore never counted on top of a Bulk RO file that already shows it.
- **Fill a whole block:** each warehouse block's *Send* heading has a small box: type a quantity and press Enter to put it in every Send box of that block (never above a line's Blinkit max; locked lines stay 0). **↺** next to it puts the block back to the suggested quantities.
- **Android app:** a full-screen app with its own icon — see [`planner-android/README.md`](../planner-android/README.md). It updates itself when this page changes.
- **Sort the lines:** click any heading in a New Plan block (SKU, Sold, Per day, Stock, Delivered, Shipped, Planned, Days now, Blinkit max, Send, TI, Days after) to sort by it. The sort applies to **every warehouse block at once**. Click it again to flip the order (▲ / ▼). **↺ Default order** (above the blocks) goes back to the planner's order, biggest suggestion first. The sort is kept on this device after a refresh. Lines don't move while you type; the new order applies the next time the list is drawn.
- **Instant loading:** the RO Log, New Plan, the Formula Sheet inventory, TI and the Dashboard open at once from what this device already has (the last read, kept in the browser, and the open ROs loaded with the app), and the fresh data from the sheet replaces it quietly in the background ("Updating from the sheet…"). New Plan works the plan out at once and again only if the RO Log or the Formula Sheet changed (what you typed is kept). The kept copies are cleared on log out.
- **Refresh-safe:** New Plan is kept in the browser (uploaded files, typed Send quantities, filters) and comes back after a page refresh. **🗑 Wipe plan** clears it. The Inventory read from the Formula Sheet is read again on refresh, so it's always the sheet's latest.
- **Delivered:** mark an RO **Delivered** in the RO Log (status) or in the Dashboard calendar (day pop-up → 📍 Arriving → *Mark delivered*); it asks for the delivery date. **2 days after that date** the RO's quantities and its RO heading are removed from the month tab (columns D–H), so the column is free again; the RO Log keeps the RO (*Delivered On*, *Removed From Tab*). This runs when the planner is opened (at most every 30 minutes); for a daily run without opening it, add a time-driven trigger for `cleanupDeliveredROs` (Apps Script → Triggers). Delivered ROs no longer count as incoming. In the calendar they show on their delivery day as **✅ Delivered** (last 45 days). On the Dashboard, an RO marked Delivered after the last plan was still part of that plan's *Planned* (Blinkit's file still had it on its way): its units are shown under **Has** instead ("+N delivered") until the next plan, so it never shows as *Planned without RO*.
- **Dispatch plan (Settings → Dispatch):** daily capacity (2,800 units), dispatch days (Mon–Sat), lead days (15; 4 for Faridabad, Kundli, Jaipur) and packing days (2). Every RO gets a dispatch day: with an appointment it is appointment − shipping days (lead − packing; Sundays skipped); otherwise the day it was given. **A dispatch day can also be set by hand for an RO with an appointment** (RO Log *Dispatch day*, or *Move to* in the calendar pop-up). It is kept instead of the worked-out one (RO Log column *Dispatch Fixed* = Yes) until you empty it in the RO Log, click **↺ Follow appointment** in the calendar, or give a new appointment. After **Create RO** the new ROs are spread over the next working days after packing within the capacity, most urgent warehouse first; move them in the Dashboard calendar (click a day: a pop-up lists the day's dispatches, packing, arrivals and warnings; move a dispatch, **✕** to take an RO off that day (its dispatch day — and appointment, after a confirm — is cleared in the RO Log and the month-tab heading), add or change an appointment — its dispatch day follows — or **add an open RO** to that day: click the box to see all open ROs, or type a warehouse, RO no. or units to narrow the list, pick with ↑/↓ + Enter or a click) or in the RO Log (**Dispatch day**, saved in the RO Log's *Dispatch Date* column). The **📅 Calendar** shows 🚚 load per day vs capacity (red when over), 📦 packing, 📍 arrivals, RO dates, ⚠ items that run out before their next possible arrival and ⏳ ROs expiring without appointment; above it the warnings (⚠ run-outs, 🕑 awaiting appointment > 3 days, ⏳ expiring within 5 days, 📋 open ROs without a dispatch day — with **Give them dispatch days**).
- **Dashboard extras:** click any column heading of the items table to sort (A→Z / lowest first, click again to reverse). A collapsible **📅 Calendar** (closed by default) shows 38 days from 7 days ago (the last 7 days, today and the next 30): open ROs by RO date, appointments, and items whose days of cover run out; click a day for the list. It follows the warehouse picked on the dashboard.
- **TI column (Travalate Inventory):** New Plan shows, between *Send* and *Days after*, the stock of each SKU in the Travalate Inventory app that is **still free**, the same for every warehouse. That is TI minus the quantities on open ROs (Created / Planned, all warehouses) that are **not shipped yet**: no shipment found by the Shipment Manager sync (without a Shipment Manager link: dispatch day after today). Shipped ROs are already deducted in TI by the Shipment Manager. Hover a TI number for the split; the Excel download has *TI stock* and *TI free*. (Projections keeps the full TI, next to the open RO quantities.) The number shown is what stays free **after this plan**: free now − the Send quantities of that SKU in this plan (all warehouses), updated **as you type**; below it "774 − sending 50". It turns red (below 0) when the plan sends more than TI has. Send boxes start **grey** (the planner's suggestion) and count in "sending" once you click into them, type or fill a quantity; ↺ puts a block back to grey suggestions. Set up once in **Settings → Travalate Inventory** (the Inventory app's link and its shared secret, kept only in this script's settings). SKUs named differently in TI get their TI name in **Settings → SKUs → TI SKU**; spaces, dashes and capitals are ignored when matching.
- **Why not sent (short shipments):** when the Shipment Manager shows an RO line was not sent in full, the RO Log shows "shipped X · Y not sent" with a box **"Why not sent?"**. Type the reason and press Enter (or leave the box): it is saved in the RO Log (column *Short Note*) and added to the red cell's note in the month tab ("Why: …").
- **💬 Ask (bottom right):** ask about an SKU, optionally at a warehouse, e.g. *Why was 2 in 1 Belt not sent in Mumbai?*, *What is not sent?*, *When does 1323 arrive in Kundli?*. While you type, it **suggests SKUs** (by name or item ID) **and warehouses**; **Tab** fills in the first one (or ↑ / ↓ then Enter, or a click); **Enter** alone asks the question. It answers from the RO Log (last 120 days) and the last plan, with no AI and no API key: each RO with ordered / shipped / not-sent quantities and the reason noted, status, dispatch, appointment and delivery, plus the last plan's stock, sale per day, suggested quantity and whether it is locked. Esc closes it.
- **Hover details:** every number that shows more on hover has a **dotted underline** (Planned, Days now, TI, the Dashboard's Days and "+N delivered"). Each heading has a small note under it saying what it counts.
- **Days now vs Days after (New Plan):** *Days now* = how long the stock already there lasts: (Stock + Delivered) ÷ Per day − days passed. *Days after* = how long everything lasts once this RO arrives: (Stock + Delivered + Shipped + Planned + Send) ÷ Per day − days passed.
- **Totals and pages:** a **Total** row sits right under the Dashboard's item headings (fixed with them): items, per day, Has (+ delivered), Shipped, Planned, Days (total Has ÷ total per day) and Suggested of every item that passes the search / warehouse / *Planned without RO* filters, on all pages, so it changes with them. The **RO Log** (25 ROs a page) and **Projections** (25 SKUs a page; its Total row still counts all) have the same « ‹ Prev · Next › » pages. Settings → SKUs stays one list (it is saved in one go).
- **Dashboard items list:** 25 items a page (« ‹ Prev · Page 2 of 9 · Next › » under the table; a new search, sort or warehouse goes back to page 1). The table scrolls in its own box with its **headings fixed at the top**, on the phone too. On the phone a tap on a Planned number opens only its pop-up (no hover card on top of it).
- **Hover Delivered:** on New Plan (Delivered) and the Dashboard ("+N delivered" under Has), the card lists the ROs marked Delivered there in the last 45 days: RO number, RO date, delivery date, quantity shipped, and whether each still **waits for Blinkit's GRN** (counted) or is already in Blinkit's stock, with the total still waiting.
- **Hover Planned:** on New Plan and the Dashboard, hold the mouse over an item's **Planned** number to see the ROs behind it: the RO Log's open ROs for that warehouse + item not shipped yet (RO number, Draft / Planned, RO date, dispatch, appointment, qty), plus any part that is on Blinkit but not in the RO Log. On New Plan the first line also shows Blinkit incoming + RO Log − shipped.
- **Planned breakdown:** on the Dashboard, click an item's **Planned** number to see what makes it up: Blinkit's own Incoming (Bulk RO file) + RO Log lines Blinkit can't show yet, and that item's open ROs at that warehouse.
- **Dashboard:** days of cover per warehouse and item from the last plan (red under 7 days, amber 7–15). Handy on a phone.
- **Projections:** what the open ROs still need, per SKU. **Total** (default) shows each SKU's total quantity and number of ROs; **Warehouse-wise** turns the table into one column per warehouse (plus the total). By default it counts **Created ROs not shipped yet** (dispatch day today or later, or not set yet); it can also show all Created ROs, or Created + Planned. **TI stock** = stock in Travalate Inventory now (red when less than the open ROs need); **Current inventory** = Total sellable on Blinkit today (Inventory upload); **Blinkit incoming** = ROs Blinkit already shows as on their way (Bulk RO file on New Plan, else the last plan's copy). Both are totals in the Total view and per warehouse in the rows under each SKU in the Warehouse-wise view. **Monthly sale** = the highest of 7-day sale ÷ 7 × 30, 15-day sale ÷ 15 × 30 and 30-day sale, all warehouses together, from the Inventory upload (Formula Sheet). **Projection 30 days** = monthly sale × 1.2. In the Warehouse-wise view each SKU has two more rows: that warehouse's **monthly sale** and its **projection for the next 30 days** (warehouses are matched to the Inventory by name; one named differently there is listed above the table). Filter by group, search, and download as Excel.
- **Sales for the Production App:** the Production App's Projections read Blinkit's last 7 / 15 / 30 days of sales per item
  (all warehouses, from the Formula Sheet) with each item's SKU and TI SKU, through `doPost` action `productionSales`.
  It needs the same shared secret as **Settings → Travalate Inventory**; without it nothing is given out.
- **Settings (admin):** days of cover, rounding, address, the SKU list with TBI / TBO / TBG group (or **Take groups & tiers from the month tab**, which also lists SKUs that sit in two groups of one warehouse), and **Start new month**.
- **Users (admin):** User ID + PIN logins with the roles Admin, Planner (plans and ROs) and Viewer (dashboard and log only).
- **Delivered, waiting for Blinkit's GRN:** Blinkit shows delivered goods in its stock only 2–3 days after delivery (GRN), and they may already have left its *Incoming*. So when an RO is marked **Delivered**, the planner saves the item's stock on Blinkit at that moment (*GRN Base*, from the Formula Sheet) and the quantity **actually shipped** (*Shipped Qty*, from the Shipment Manager's BLINKIT_PO tab; link in **Settings → Shipment Manager**). New Plan counts that quantity in a **Delivered** column, between Stock and Planned. It stops as soon as the Inventory shows the item's stock above the GRN base, which means Blinkit has received it, and after 7 days at the latest. It is never counted twice with Blinkit's Incoming. On the Dashboard it is part of **Has** ("+N delivered").
- **Shipment Manager sync:** once an RO has a Blinkit shipment in the Shipment Manager (SHIPMENTS, PO number = RO number, not deleted):
  - its **dispatch day becomes the shipment date**, set as fixed;
  - its RO keeps the **RO quantity** (BLINKIT_PO → PO_QTY) and gets the **quantity actually shipped** (SHIPPED_QTY, RO Log *Shipped Qty*);
  - when less was sent, the month-tab cell shows the quantity **actually shipped** (0 when nothing went), in **red**, with a note *"Ordered Y — shipped X, Z not sent"* (+ *"Why: …"*). Cells marked before this change are corrected once at the next Shipment Manager sync; if a later shipment completes the RO, the cell goes back to the ordered quantity;
  - the planner leaves the part **not sent** out everywhere. Blinkit still lists it as incoming until the RO closes, so it is taken off Blinkit's incoming in the plan and in Projections, and it never shows as *Planned without RO*;
  - the RO Log line shows "shipped X · Z not sent";
  - when the RO is delivered, the whole quantity (red part included) leaves the month tab 2 days later like any other, and the red mark goes with it.

  - **Not shipped by its dispatch day:** an open RO (Draft / Planned) whose dispatch day has passed and that the Shipment Manager has no shipment for is **not** marked Shipped; right after the sync its dispatch day moves to **today** (or the next dispatch day, Settings → Dispatch), and its month-tab heading follows. Every day it is still not shipped, it moves again. Once the Shipment Manager has its shipment, the real shipment date replaces it. (With an appointment, the moved day is kept as set by hand; the daily capacity is not re-balanced.)
  The sync runs at most every 30 minutes, in the background when the planner is opened, from **Settings → Shipment Manager → Sync now**, or from a time-driven trigger on `syncFromShipmentManager`. Each RO is checked again for **2 days** after its shipment is first found (RO Log *Ship Sync Until*), then left alone.
- **Appointment passed — reminder:** when the calendar opens, ROs whose appointment date has passed and are not marked Delivered pop up: **Mark delivered** (with the date), **New appointment**, or **⏰ Remind me later** (3 hours, on that device).
- **Plan columns** (New Plan and Dashboard), from left to right:
  - **Stock:** on Blinkit now (warehouse + in-between + darkstore).
  - **Delivered:** at the warehouse, waiting for Blinkit's GRN.
  - **Shipped:** on the road. These are open ROs the **Shipment Manager has a shipment for**, not delivered yet. An RO whose dispatch day has passed without a shipment there stays Planned. (Without a Shipment Manager link in Settings, the dispatch day decides: today or earlier counts as shipped.)
  - **Planned:** on its way but **not shipped yet** (Blinkit's Incoming + RO Log ROs Blinkit does not show yet, minus Shipped; hover for the split).

  Shipped and Planned follow the Shipment Manager: once it has the shipment, the RO moves to Shipped.
- **Days (Dashboard) / Days now (New Plan):**
  - **How long the stock that is there lasts:** (Stock + Delivered) ÷ Per day − days passed since the stock date. Its colour shows real urgency (red under 7, amber under 15).
  - **"Runs out ~"** uses the same figure.
  - **Never below 0:** stock already used up shows **0**; hover it for how many days ago it ran out. Sorting still uses the real figure, so the items out longest come first.
  - **Hover a number** for the days counting what is on its way (Shipped + Planned).
  - **Suggested still counts everything:** Stock, Delivered, Shipped and Planned. Nothing is ordered twice. Days now, Days after and Suggested count all four, so the split changes nothing in the numbers.
- **Status names on screen:**
  - **Draft:** saved here, not on Blinkit yet.
  - **Planned:** on Blinkit, not shipped yet.
  - **Shipped:** set by itself once the Shipment Manager has its shipment.
  - **Delivered**, **Cancelled**.

  The RO Log tab keeps its own values: Draft is stored as *Planned* and Planned / Shipped as *Created*, which the planner's counting relies on. **Escape** closes any pop-up.
- **Speed:** every save is one request (a merged RO with its dispatch day included); the month tab is read once per save and written in one go, and the answer carries the changed lines and open ROs, so nothing is read again afterwards. The app opens at once with the last data kept on the device (Dashboard, RO Log) and refreshes it in the background. RO changes are **instant**: Calendar move / appointment / ✕ / Follow appointment / Mark delivered / Add an open RO / Give dispatch days, the reminder, the Planned pop-up's appointment, and RO Log Save RO / line Save / Cancel line all show at once and are saved in the background, one after the other, with a small **Saving… → ✓ Saved** pill. If a save fails, the pill and a message say so and the page reads the sheet again, undoing what was not saved. Bigger jobs (Create ROs, RO PDF, Settings, Users, Start month, Sync) still blur the screen with **Saving…** until they are done.

The app only writes to the **RO columns** of a month tab (D–H, plus any it added when they were full) and the RO heading above them. It never changes the columns after them; when it adds an RO column they move one column right, formulas included.

---

## 1. Install (about 10 minutes)

The Blinkit sheet's Apps Script project already holds the **daily inventory updater**: `Code.gs`, `UploadDialog.html` and `appsscript.json`, with the *📦 Blinkit Inventory* menu. The planner is **added next to it**, so don't replace or change those files.

1. Open the **Blinkit Google Sheet**, then **Extensions → Apps Script**.
2. Click **+ → Script**, name it **`Planner`**, and paste [`Planner.gs`](Planner.gs) into it.
3. Click **+ → HTML**, name it **`Index`** (exactly, without `.html`), and paste [`Index.html`](Index.html) into it.
4. Leave `Code.gs`, `UploadDialog.html` and `appsscript.json` as they are. The project's time zone (Asia/Kolkata) and permissions (spreadsheets) already cover the planner.
5. Choose the function **`setup`** in the toolbar (from the file *Planner*) and click **Run**. Allow the permissions if asked.
   This creates the tabs *Planner Settings*, *Planner SKUs*, *Planner Users*, *RO Log* and *Planner Snapshot*. It also fills the SKU list (Item ID, SKU, TBI/TBO/TBG group, tier) from the month tabs, and creates the first login: **User ID `admin`, PIN `1234`**.
6. **Deploy → New deployment → ⚙ → Web app**
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
   - Click **Deploy**, then copy the **Deployment ID** (`AKfycb…`).
7. Open the app (see *Opening the app* below), log in as `admin` / `1234`, then go to **Account → Change PIN**. Add your team under **Users**.

> **Updating:** paste `Planner.gs` and `Index.html` again, run `setup` again (it only adds what is missing), then **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. The link stays the same. With *Automatic deploy* (below) this happens by itself; it only replaces `Planner` and `Index`.

Ideas discussed but not built yet are kept in [`IDEAS-ON-HOLD.md`](IDEAS-ON-HOLD.md).

### Working together with the daily inventory updater

- The updater finds today's column from **row 4** (the rightmost filled cell, e.g. AO). The planner only writes RO quantities and headings into **D–H**, so that detection is not affected.
- When the planner adds a row for an item missing from a block, the new row gets the formulas of the row above, including the live formula column. Numbers in the frozen daily columns are not copied.
- When the planner **adds an RO column** (D–H full), the daily columns move one to the right. The updater still finds today's column from row 4, and Sheets adjusts the formulas. The planner also moves the column letters that **"Undo Last Upload"** remembers (e.g. AN→AO), so an undo after that still hits the right columns.
- The updater copies its formula for rows **4–513** only (`FORMULA_COPY_END_ROW`). If a month tab grows past row 513 (the planner adds rows for missing items), raise that number in the updater's `Code.gs`, or use the tab's last row.
- **"Undo Last Upload"** restores the column exactly as it was by row number. If the planner inserted a row between an upload and its undo, the undone column would be off by one row below that point. So don't undo an upload after a Create RO that reported "Added a row for …".

### Opening the app

The page is also published on GitHub Pages. That works on phones signed into several Google accounts, where `script.google.com` links often fail:

    https://travalateapp.github.io/shipment-scanner/planner/?id=<Deployment ID>

The `/exec` link from step 6 works too. On a phone, open the link in Chrome or Safari and tap **⋮ / Share → Add to Home Screen**.

`planner/index.html` is a copy of `blinkit-planner-app/Index.html` (GitHub Pages). Keep the two identical.

### Automatic deploy

The workflow `.github/workflows/deploy-blinkit-planner.yml` pushes `Planner.gs` and `Index.html` to Apps Script after every merge to `main`, keeping the same link. It never touches `Code.gs` or `UploadDialog.html`, and stops if the file it would replace turns out to be the inventory updater. It needs these repository secrets:

| Secret | Value |
|---|---|
| `CLASPRC_JSON` | Already set for the Attendance app. It works for this app if the same Google account owns the Blinkit sheet's script. |
| `PLANNER_SCRIPT_ID` | Apps Script → Project Settings → Script ID |
| `PLANNER_DEPLOYMENT_ID` | The Deployment ID from step 6 |

---

## 2. Planning a shipment

1. In the sheet, run **📦 Blinkit Inventory → Upload Today's Inventory** as you do every day. The planner reads the Inventory from **Formula Sheet**, so you don't upload it again.
2. On the Blinkit seller portal, download the **Bulk RO input** (*SELLER_BULK_SHIPMENT_INPUT_….xlsx*), fresh every time, because max limits and locks change during the day. Open **New Plan** and pick it.
   - The Inventory box turns **yellow** if Formula Sheet doesn't hold today's inventory. Upload today's inventory in the sheet and tap *read it again*, or tap the box to upload the Inventory file directly.
3. Check the plan. Filter by warehouse, group or search, and change quantities if you need to. Lines above Blinkit's max are shown in red, and the RO can't be created until they're fixed.
4. Click **Create RO file**, untick any warehouses you don't want, pick the date and status, then click **Save & download file**.
5. Upload the downloaded file on Blinkit. Then open the **RO Log** and add the RO number and appointment date.

### How the quantity is worked out

| Part | Rule |
|---|---|
| Target | Stock now + incoming + this RO ≈ **daily sales × (Days of cover (26) + days since the stock date)**, so the RO still covers 26 days from today. The **stock date** is the Inventory's *generated at* date − 1 (a file generated 29 Oct counts stock as of 28 Oct). *Days now*, *Days after* and the Dashboard's *Days* = days of stock − days since the stock date, so the Dashboard counts down by one every day. |
| Stock now | **Total sellable** from the Inventory (Formula Sheet): warehouse + in-between + darkstore. The Bulk RO file's *Sellable Quantity* isn't used. Note: if an RO is received after the Inventory snapshot but before the Bulk RO download, it's in neither figure, and the plan asks for it again. Download both close together. |
| Incoming | Blinkit's *Incoming Quantity*, **plus** RO Log lines Blinkit can't know about yet. That means *Planned* ROs, and *Created* ROs saved after the Bulk RO file was downloaded. So an RO is never counted twice, and never forgotten. **Safety:** ROs created on Blinkit before the Bulk RO file — in the last 3 days, or with no appointment yet (up to 30 days old) — may be missing from its Incoming; when they are (Blinkit's Incoming only covers the older ROs still on their way — under 30 days old, appointment not passed), the missing part is counted from the RO Log. |
| Daily sales (Per day) | The **highest** of: last 7 days ÷ 7, last 15 days ÷ 15, last 30 days ÷ 30, **rounded up** to a whole unit. E.g. 37 / 41 / 64 sold → 5.29, 2.73, 2.13 → **6 a day**. |
| Recently listed | Shown as *New listing (≤7 / ≤15 days)*. Taking the highest average already keeps the days before the listing from pulling the rate down. |
| Limits | Rounded up to multiples of 5, at least 10 units per line, never above Blinkit's max. Locked rows get 0 and are listed with Blinkit's reason. |
| Not live yet | Not sent unless **New-listing starters** is on. Then a small starter qty is suggested (half a typical warehouse's need, up to Blinkit's suggested min) for items that sell 1+ a day elsewhere. On the plan, **Show → New-listing starters only** lists just those lines. |

---

## 3. Month tabs

- An RO goes into the tab of the month of its **RO date**: a tab named like `Oct 2026`, `Sept 2026` or `January 2026`.
- In the warehouse block (`<Warehouse>-TBI`, `<Warehouse>-TBO` or `<Warehouse>-TBG`; a warehouse with no TBG block gets its TBG items in the TBO block), the app uses the first column D–H in which **no item row has a quantity**. It writes each item's quantity on its row and the RO heading above it.
- An item that isn't in the block gets a new row at the end of the block. The formulas and formatting of the row above are copied; the numbers aren't.
- If D–H are all used in that block, the app **adds a new RO column** to the tab. It is inserted just before the last RO column, inside the D–H range, so any formula over D:H, such as a sum, grows to include it. It is formatted like the column next to it and marked with a note in row 1 (*Blinkit Planner: RO column added*). The RO that was in the last column moves one column right, and the RO Log follows. Columns I onwards move one column right too, with their formulas adjusted by Sheets. Later ROs use the added columns like D–H. If you delete an added column by hand, the app simply stops counting it.

### Starting a new month

**Settings → Start new month**, then pick the month:

1. If the tab doesn't exist, it's created as a copy of the newest month tab, right after it. Columns D–H are emptied; columns I onwards are copied as they were, so set the dates there as you usually do. If you'd rather create the tab yourself, do that first; the app then only does step 2.
2. Open ROs (Planned / Created) from the last **Carry Over Days** (default 5) of the old month are copied into the new tab. ROs already dated in the new month are written in too. Set Carry Over Days to 0 to turn this off.

---

## 4. Tabs the app adds to the sheet

| Tab | Holds |
|---|---|
| Planner Settings | Days of cover, min line, rounding, address, starters, carry-over days |
| Planner SKUs | Item ID, SKU, name, **Group (TBI = Travalate Bags Inhouse, TBO = Travalate Bags Outsourced, TBG)**, tier, active. New Blinkit items are added automatically with no group, and an admin sets it. |
| Planner Users | User ID, name, PIN (stored hashed), role, active |
| RO Log | One row per RO line. This is what the app works from, and you can filter it like any sheet. |
| Planner Snapshot | The last plan's figures, for the dashboard |
