# Blinkit Shipment Planner (Google Apps Script web app)

A web app for computers and phones that plans Blinkit shipments (ROs) and keeps the **Blinkit Google Sheet** up to date by itself.

- **New Plan:** upload the Bulk RO file; the Inventory is read from the sheet's *Formula Sheet* (filled by the daily 📦 Blinkit Inventory upload). The app works out, for each warehouse × item, how much to send for **26 days of cover**, using the rules below. You can change any quantity.
- **Create RO file:** one tap does three things:
  - downloads **Blinkit's own Bulk RO file** with *RO Quantity* and *Shipping Address* filled in, ready to upload;
  - saves every line in the **RO Log**;
  - writes the quantities into the month tab (e.g. *Oct 2026*), in the **next free column D–H** of that warehouse's TBI / TBO / TBG block.
  - In the Create ROs window, choose the Excel file(s): **Merged** (ticked by default) and/or one file per group (**TBI / TBO / TBG**). Only the ticked warehouses are filled in; the file name carries the group, and the warehouse when only one is ticked.
- **RO Log shows ROs as on Blinkit:** ROs created with the **Merged** file, or sharing one Blinkit RO number at one warehouse, are one card (e.g. *Faridabad · TBI + TBO + TBG*), saved together. In the RO Log tab and the month tab they stay one batch per group (each group's own block), as before; the RO Log tab's **Merged RO** column links them.
- **RO Log:** every RO. Set the status (Planned → Created, or Cancelled); the RO Log opens on Created ROs, and add the Blinkit RO number and appointment date. The RO heading in the month tab updates too, e.g. `RO 29 Oct / 4999… / app 2 Nov`. Changing a quantity, or cancelling a line, also changes the month tab.
- **RO PDF:** upload one or more Blinkit R.O. PDFs. They're read with the same parser as the Shipment Manager (`parseBlinkitRoPdf_`, copied unchanged), and the app picks up the RO number, warehouse, RO date, expiry and each Item Code + Qty. The items are checked against the PDF's *Total Quantity*.
  - If a PDF is a planner RO that has no RO number yet (same warehouse, same items), that RO gets the number, and the PDF's quantities replace the planned ones. No second RO is made.
  - Otherwise it's saved as a new **Created** RO in the RO Log and the month tab. An RO with items of more than one group (TBI / TBO / TBG) becomes one column per group, all with the same RO number.
  - An RO number already in the log is skipped.
  - Tick **Log only** for ROs you've already typed into the month tab by hand. They're logged, but never written into the tab, even by *Sync month tabs* or *Start new month*.
  - *Add an RO by hand* is still there, under the upload, for an RO without a PDF.
- **Planned vs Created:** *Planned* = not on Blinkit yet; it always counts as incoming in the next plan. *Created* = on Blinkit; it counts only until Blinkit's own Bulk RO file shows it as incoming, so it's never counted twice. For an RO from a PDF, "on Blinkit since" is the **R.O. date and time printed on the PDF** (RO Log column *Blinkit Created At*), not the upload time. An older RO's PDF is therefore never counted on top of a Bulk RO file that already shows it.
- **Fill a whole block:** each warehouse block's *Send* heading has a small box: type a quantity and press Enter to put it in every Send box of that block (never above a line's Blinkit max; locked lines stay 0). **↺** next to it puts the block back to the suggested quantities.
- **Android app:** a full-screen app with its own icon — see [`planner-android/README.md`](../planner-android/README.md). It updates itself when this page changes.
- **Refresh-safe:** New Plan is kept in the browser (uploaded files, typed Send quantities, filters) and comes back after a page refresh. **🗑 Wipe plan** clears it. The Inventory read from the Formula Sheet is read again on refresh, so it's always the sheet's latest.
- **Dispatch plan (Settings → Dispatch):** daily capacity (2,800 units), dispatch days (Mon–Sat), lead days (15; 4 for Faridabad, Kundli, Jaipur) and packing days (2). Every RO gets a dispatch day: with an appointment it is appointment − shipping days (lead − packing; Sundays skipped); otherwise the day it was given. After **Create RO** the new ROs are spread over the next working days after packing within the capacity, most urgent warehouse first; move them in the Dashboard calendar (click a day: a pop-up lists the day's dispatches, packing, arrivals and warnings; move a dispatch, change an appointment — its dispatch day follows — or **add an open RO** to that day) or in the RO Log (**Dispatch day**, saved in the RO Log's *Dispatch Date* column). The **📅 Calendar** shows 🚚 load per day vs capacity (red when over), 📦 packing, 📍 arrivals, RO dates, ⚠ items that run out before their next possible arrival and ⏳ ROs expiring without appointment; above it the warnings (⚠ run-outs, 🕑 awaiting appointment > 3 days, ⏳ expiring within 5 days, 📋 open ROs without a dispatch day — with **Give them dispatch days**).
- **Dashboard extras:** click any column heading of the items table to sort (A→Z / lowest first, click again to reverse). A collapsible **📅 Calendar** (closed by default) shows 38 days from 7 days ago (the last 7 days, today and the next 30): open ROs by RO date, appointments, and items whose days of cover run out; click a day for the list. It follows the warehouse picked on the dashboard.
- **TI column (Travalate Inventory):** New Plan shows, between *Send* and *Days after*, your current stock of each SKU in the Travalate Inventory app (same for every warehouse). It turns red with "sending N" when the confirmed Send quantities of that SKU, across all warehouses, are more than TI has. Send boxes start **grey** (the planner's suggestion) and count in "sending" once you click into them, type or fill a quantity; ↺ puts a block back to grey suggestions. Set up once in **Settings → Travalate Inventory** (the Inventory app's link and its shared secret, kept only in this script's settings). SKUs named differently in TI get their TI name in **Settings → SKUs → TI SKU**; spaces, dashes and capitals are ignored when matching.
- **Planned breakdown:** on the Dashboard, click an item's **Planned** number to see what makes it up: Blinkit's own Incoming (Bulk RO file) + RO Log lines Blinkit can't show yet, and that item's open ROs at that warehouse.
- **Dashboard:** days of cover per warehouse and item from the last plan (red under 7 days, amber 7–15). Handy on a phone.
- **Settings (admin):** days of cover, rounding, address, the SKU list with TBI / TBO / TBG group (or **Take groups & tiers from the month tab**, which also lists SKUs that sit in two groups of one warehouse), and **Start new month**.
- **Users (admin):** User ID + PIN logins with the roles Admin, Planner (plans and ROs) and Viewer (dashboard and log only).

The app only writes to **columns D–H** of a month tab and the RO heading above them. Columns **I onwards are never changed.**

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
| Not live yet | Not sent unless **New-listing starters** is on. Then a small starter qty is suggested (half a typical warehouse's need, up to Blinkit's suggested min) for items that sell 1+ a day elsewhere. |

---

## 3. Month tabs

- An RO goes into the tab of the month of its **RO date**: a tab named like `Oct 2026`, `Sept 2026` or `January 2026`.
- In the warehouse block (`<Warehouse>-TBI`, `<Warehouse>-TBO` or `<Warehouse>-TBG`; a warehouse with no TBG block gets its TBG items in the TBO block), the app uses the first column D–H in which **no item row has a quantity**. It writes each item's quantity on its row and the RO heading above it.
- An item that isn't in the block gets a new row at the end of the block. The formulas and formatting of the row above are copied; the numbers aren't.
- If D–H are all used, the RO stays in the RO Log only and you get a warning. Free a column, then use **Settings → Sync month tabs**.

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
