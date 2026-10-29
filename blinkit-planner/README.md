# Blinkit Shipment Planner (Google Apps Script web app)

A web app for computers and phones that plans Blinkit shipments (ROs) and keeps the **Blinkit Google Sheet** up to date by itself.

- **New Plan:** upload the Bulk RO file; the Inventory is read from the sheet's *Formula Sheet* (filled by the daily 📦 Blinkit Inventory upload). The app works out, for each warehouse × item, how much to send for **26 days of cover**, using the rules below. You can change any quantity.
- **Create RO file:** one tap does three things:
  - downloads **Blinkit's own Bulk RO file** with *RO Quantity* and *Shipping Address* filled in, ready to upload;
  - saves every line in the **RO Log**;
  - writes the quantities into the month tab (e.g. *Oct 2026*), in the **next free column D–H** of that warehouse's TBI / TBO block.
- **RO Log:** every RO. Set the status (Planned → Created → Delivered, or Cancelled), and add the Blinkit RO number and appointment date. The RO heading in the month tab updates too, e.g. `RO 29 Oct / 4999… / app 2 Nov`. Changing a quantity, or cancelling a line, also changes the month tab.
- **Add RO:** for ROs made directly on Blinkit. They go into the RO Log and the month tab the same way.
- **Dashboard:** days of cover per warehouse and item from the last plan (red under 7 days, amber 7–15). Handy on a phone.
- **Settings (admin):** days of cover, rounding, address, the SKU list with TBI / TBO group, and **Start new month**.
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
   This creates the tabs *Planner Settings*, *Planner SKUs*, *Planner Users*, *RO Log* and *Planner Snapshot*. It also fills the SKU list (Item ID, SKU, TBI/TBO group, tier) from the month tabs, and creates the first login: **User ID `admin`, PIN `1234`**.
6. **Deploy → New deployment → ⚙ → Web app**
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
   - Click **Deploy**, then copy the **Deployment ID** (`AKfycb…`).
7. Open the app (see *Opening the app* below), log in as `admin` / `1234`, then go to **Account → Change PIN**. Add your team under **Users**.

> **Updating:** paste `Planner.gs` and `Index.html` again, run `setup` again (it only adds what is missing), then **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. The link stays the same. With *Automatic deploy* (below) this happens by itself; it only replaces `Planner` and `Index`.

### Working together with the daily inventory updater

- The updater finds today's column from **row 4** (the rightmost filled cell, e.g. AO). The planner only writes RO quantities and headings into **D–H**, so that detection is not affected.
- When the planner adds a row for an item missing from a block, the new row gets the formulas of the row above, including the live formula column. Numbers in the frozen daily columns are not copied.
- **"Undo Last Upload"** restores the column exactly as it was by row number. If the planner inserted a row between an upload and its undo, the undone column would be off by one row below that point. So don't undo an upload after a Create RO that reported "Added a row for …".

### Opening the app

The page is also published on GitHub Pages. That works on phones signed into several Google accounts, where `script.google.com` links often fail:

    https://pramiltravalate-ux.github.io/shipment-scanner/planner/?id=<Deployment ID>

The `/exec` link from step 6 works too. On a phone, open the link in Chrome or Safari and tap **⋮ / Share → Add to Home Screen**.

`planner/index.html` is a copy of `blinkit-planner/Index.html`. Copy it again whenever you change `Index.html`.

### Automatic deploy (optional)

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
6. When the stock reaches Blinkit, set the RO to **Delivered**.

### How the quantity is worked out

| Part | Rule |
|---|---|
| Target | Stock now + incoming + this RO ≈ **Days of cover (26) × daily sales**, counted from today. |
| Stock now | Blinkit warehouse stock (Bulk RO file) + darkstore + in-between (Inventory, from Formula Sheet). |
| Incoming | Blinkit's *Incoming Quantity*, **plus** RO Log lines Blinkit can't know about yet. That means *Planned* ROs, and *Created* ROs saved after the Bulk RO file was downloaded. So an RO is never counted twice, and never forgotten. |
| Daily sales | 50% last 7 days + 30% last 15 days + 20% last 30 days. |
| Recently listed | All sales in the last 7 days → the 7-day rate only. 90%+ of sales in the last 15 days → 60% × 7-day + 40% × 15-day. Days before the listing don't pull the rate down. |
| Ran low | If stock is under 7 days of 30-day sales and the last week dropped, at least the 15/30-day average is used, because a stock-out hides demand. |
| Limits | Rounded up to multiples of 5, at least 10 units per line, never above Blinkit's max. Locked rows get 0 and are listed with Blinkit's reason. |
| Not live yet | Not sent unless **New-listing starters** is on. Then a small starter qty is suggested (half a typical warehouse's need, up to Blinkit's suggested min) for items that sell 1+ a day elsewhere. |

---

## 3. Month tabs

- An RO goes into the tab of the month of its **RO date**: a tab named like `Oct 2026`, `Sept 2026` or `January 2026`.
- In the warehouse block (`<Warehouse>-TBI` or `<Warehouse>-TBO`), the app uses the first column D–H in which **no item row has a quantity**. It writes each item's quantity on its row and the RO heading above it.
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
| Planner SKUs | Item ID, SKU, name, **Group (TBI = Travalate Bags Inhouse, TBO = Travalate Bags Outsourced)**, tier, active. New Blinkit items are added automatically with no group, and an admin sets it. |
| Planner Users | User ID, name, PIN (stored hashed), role, active |
| RO Log | One row per RO line. This is what the app works from, and you can filter it like any sheet. |
| Planner Snapshot | The last plan's figures, for the dashboard |
