# Karigar Production App (Google Apps Script)

Karigars make bags and parts for you. This app keeps track of everything from raw material to payment:

- **Work orders:** what each karigar is making (for example 300 × TR-1323-Black). What is not received yet is
  "in production" and shows small and grey in the Inventory Snapshot.
- **Raw material, issued with the work order:** creating a lot issues its material to the karigar
  automatically (quantity × material per piece, from the item's BOM). It counts as **given at once** (no
  confirmation). Extra material outside a lot can still be issued in **Material issue**, where a **different**
  person confirms it. There are **no returns**.
- **Final count, 2 people:** count 1 with a **photo** of the goods, then count 2 by a **different** person who
  does **not** see count 1 (blind). **Count 2 is final:** the batch is locked with count 2's numbers. If count 1
  was different, that is kept and flagged ("Count 1 differed") but does not block anything.
  - **New batch** lists only karigars with a running work order, one batch at a time: if the karigar already has a
    batch waiting for count 1, that one opens (no second batch). A batch waiting for count 1 (nothing counted yet)
    can be **removed**; a super admin can also remove one waiting for count 2 (a duplicate or a mistake: count 1
    changes no stock or pay). Every removal is in the Change log.
  - **Counted against the work order:** each count line is one of the karigar's open work orders (W-0008 ·
    item · given · received · still to make). No double count: a work order already in a batch waiting for its
    final count cannot be counted in another batch, the same work order twice in one count is refused, and an
    exact repeat of a batch finished in the last 12 hours asks "is it really another delivery?". **More than the
    work order** is saved and marked: Work orders shows "+N extra" (given X, received Y).
  - The item list in a count has **only what that karigar is making now** (items of their open work orders; one
    item = already chosen). No running work order → add one first.
  - The count 1 photo is taken with the **live camera only** (back camera, 🔄 for the front one), on a **mobile
    phone** (best in the Android app). There is no gallery or file picker; on a computer count 1 cannot be saved.
- **Inventory:** on lock, the good pieces of inventory SKUs are added to the **Travalate Inventory App**. The
  note there reads `05-Nov 14:20 | Harshit | +40 (In) | Received From Ramesh (P-0012)`.
- **Parts** (straps, belts …) are paid but not added to the inventory.
- **Rates:** every item has a **standard rate**, entered with the item and paid to every karigar. Each work
  order (**lot**) keeps its rate:
  - Normally the lot gets the standard rate.
  - Rarely, a lot gets a **special rate**, either when it is made or later with **Rate**. That applies to
    that lot only, and the karigar's next lot is back on the standard rate. If **"also for future lots"** is
    ticked, that karigar keeps the rate for later lots of the item, until it is set back to standard
    (Karigars & rates → Rates).
  - When a **standard rate changes**, the app asks where to apply it: **all running lots** on the standard
    rate, **only the running lots you select**, or **only new lots**.
  - The change log keeps every rate change. Pieces in pay periods that are already approved never change.
- **Pay:** counted good pieces × their lot's rate. Goods without a lot use the karigar's own rate, else the
  standard rate. **Rejected pieces are not paid.** Karigars are paid only for what was
  counted. Karigars do not enter hand-overs in the app: staff start each batch in **Count goods → New batch**.
- **Pay period 5th to 4th** (5 Nov – 4 Dec). After it ends, **1 approver** approves each karigar's pay. The
  figures are then frozen. The approver then marks it **paid** with the actual date.
- **Advances:** given with a cut per pay period (Advances tab). At **payroll**, the person who approves pay
  can **raise, lower or zero** each karigar's cut for that month (**Change** under the advance). This only
  works before approving, and later periods keep the normal cut.
- **Production cost per piece:** every material has a **price as bought** and the app converts it to the unit
  the BOM uses (Materials → **Price**):
  - **Roll:** price per roll and its length × width. For example ₹9,000 for 50 m × 1.47 m = 73.5 sq m, so ₹122.45 per sq m.
  - **By weight:** price per kg and the weight of 1 unit. For example chain at ₹600/kg, where 1 inch weighs 1.2 g:
    1 kg = 833.3 inch, so ₹0.72 per inch.
  - **By count:** price per piece or per pack (e.g. kunda ₹250 for 100 = ₹2.50 each), or a price per unit.
  - **Items & rates** shows the **cost per piece** = Σ(material per piece × cost per unit) + labour (standard
    rate), with a breakdown. **Work orders** show each lot's real cost: the material issued for it at the price
    on the day it was issued, plus the lot's rate. A new price does not change earlier lots.
- **Colour on materials:** a material can have a colour; it is shown at the end of the name in brackets:
  Niwar (1.00") + Black → **Niwar (1.00") (Black)**. Colour suggestions appear while typing.
- **Suppliers.** A supplier typed on a purchase bill for the first time is saved (sheet "Suppliers"); from then on it
  shows while typing in the bill's Supplier box (any word, any case; ↑/↓, Enter, Esc). The same name typed in another
  case is saved with the first spelling. **edit** next to a suggestion renames the supplier on every one of its bills
  (renaming to an existing supplier joins the two); the rename is in the Change log.
- **Roll sizes.** On a purchase bill each line has its own roll size (length × width; or the size of a pack / kg),
  filled in with the usual one: change it when these rolls are different. The store gets rolls × that size, and the
  newest bill becomes the material's price with its size. **Opening stock** can be counted roll by roll, one line
  per size (3 rolls × 50 m × 1.47 m + 2 rolls × 45 m × 1.47 m …); the total is worked out and the breakdown is kept
  in the note.
- **Search everywhere.** Every list to choose from (karigar, item, material, unit, pay period…) is a search box:
  type any part of the name, colour or code (every word, any order: "1.5" finds Niwar (1.50") and Velcro (1.50"))
  and every match is listed. ↑/↓ moves and shows the highlighted one in the box, Enter picks it, Esc puts back what was
  typed; a click/tap shows the whole list. Every staff screen with a list has a **🔍 Search this list** box at the top
  (filters as you type; ↑/↓ highlights a row, Enter opens it, Esc clears). **Ctrl+F** (⌘F on Mac) jumps to it from
  anywhere on the screen (on the Change log, to its search box).
- **Copy a BOM** from another item (Items & rates → BOM → Copy from another item), then **Change the colour**
  (e.g. Black → Grey): every material that has a Grey version is swapped; the others are marked to pick by hand.
- **Store & bills:** enter each material's **opening stock** (what is in the store today); after that every
  **purchase bill** adds to it and every issue to a karigar takes from it. Bills can be **edited**. A bill also
  records **bilty / loading / unloading charges**: paid, but not part of any material's price. The newest bill
  sets the material's price. A **reorder level** per material (Materials → Edit) gives a low-stock alert, and a
  new work order warns when the store does not have enough.
- **Several items in one work order:** one karigar, several SKUs at once; each becomes its own lot.
- **Stock-take at the karigar** (Material balance → 📋 Stock-take): count what is with the karigar (blind: the
  expected figure is not shown). Shortages raise an alert; nothing is cut from pay.
- **Alerts** (🔔 in the app's top bar, with the number of new ones): count 1 ≠ final count, material short with a
  karigar, large advance (Settings → *Large Advance Alert*), locked batch changed, stock-take shortage, low store
  stock. Only super admins (the owner) and staff given the **alerts** permission see them; nothing is e-mailed.
- **Profit per item** (selling price, profit and margin %, low margins in red: Settings → *Low Margin %*): only for
  super admins and staff given the **profit** permission.
- **WhatsApp statement** to each karigar from Payroll (pieces, rate, earned, advance cut and balance, net,
  paid date) to the karigar's phone number.
- **Karigar app:** Home (this pay period, work orders, material with them, recent counts, advance left), My work,
  Payslips, **My advances** (each advance, extra given, cut in each pay period, left after, what is cut this period),
  Change PIN. Karigars do not enter hand-overs.
- **Hindi** on the karigar screens: the **हिंदी / English** button on the login page and in the top bar.
- **Material balance:** given − used (good + rejected pieces × material per piece). No wastage allowance. A
  negative balance (more made than the material given, e.g. goods without a lot) or material left with a
  karigar who has no running lot is **flagged**.
- **Locked entries** can only be corrected by a **super admin**, with a reason. Every entry and change is
  in the **Change log**.
- **Logins:** karigars (ID + PIN) see their own work, material, work orders and payslips. Staff see the
  screens their permissions allow.
- Phone layout, desktop layout (side menu, wide tables), payslip print/PDF and WhatsApp, payroll download.

Screens are in `production-app/screenshots/`.

---

## Speed

- **Server:** a copy of every tab (except the Change Log) is kept in the Apps Script cache, so opening a screen reads
  it in one quick call instead of opening 5–13 tabs (about 0.1–0.3 s instead of 1–4 s of sheet reads). Every save
  through the app renews the copy of the tabs it wrote, at once. A cell edited **by hand** in the Google Sheet renews
  that tab at once too (onEdit). Rows inserted / deleted by hand, or changes by other scripts, show within 20 minutes,
  or at once with **Production App → Refresh the app after big changes made here** in the Sheet's menu.
- **Device:** the last screens are kept on the phone / computer (per user, removed at log out), so after a refresh a
  screen shows at once and is updated a moment later. Google's own start-up time for each request (about 1 s) stays.
- **Screens loaded in the background:** after the first screen, the other menu screens are fetched one by one in
  the background (and again a few seconds after a save, at most once a minute), so opening them is instant. An
  answer is used once and only within 2 minutes; one asked for while a save was running is never used.
- **Saves in pop-up windows run in the background:** the window closes at once and "⏳ Saving…" shows at the bottom;
  if the save fails, the window opens again as it was, with the message. Closing the page while saving asks first.
- **Kept ready:** while the app is open, a tiny request every 4 minutes keeps the server from going cold.

## 1. Install (about 15 minutes)

1. Create a **new Google Sheet** (separate from attendance), e.g. "Karigar Production".
   **File → Settings → Time zone** = `(GMT+05:30) India Standard Time`.
2. **Extensions → Apps Script.**
   - Replace `Code.gs` with [`Code.gs`](Code.gs).
   - **+ → HTML**, name it **`Index`**, paste [`Index.html`](Index.html).
   - **Project Settings ⚙ → Time zone** = the same as the Sheet.
3. Select the function **`setup`** → **Run** → allow the permissions (Sheets, Drive, external requests).
   This creates the tabs, a Drive folder for batch photos, an hourly trigger and a first super admin:
   **ID `S001`, PIN `1234`**. Log in and change the PIN at once.
4. In the **Settings** tab fill in:
   - `Inventory App URL`: the Travalate Inventory web app's `/exec` link.
   - `Inventory Secret`: the same value as `SHARED_SECRET` in the Inventory App (the one the Shipment
     Manager uses). Never put it in GitHub.
   - `Pay Period Start Day` is 5 (the 5th to the 4th).
5. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone* → copy the deployment ID.
6. Share this link (it works in browsers signed into several Google accounts):
   ```
   https://travalateapp.github.io/shipment-scanner/production/?id=YOUR_DEPLOYMENT_ID
   ```
   GitHub Pages publishes `production/index.html`, an identical copy of `production-app/Index.html`.
   Copy it again after every change.

### First things to set up in the app
1. **Staff & permissions:** add the people who count, issue material, confirm, approve pay. Permissions:
   count goods, enter material, confirm material, work orders, approve & pay, advances, masters (karigars,
   items, materials, rates), reports. A super admin has everything.
2. **Materials:** add the raw materials (name + the unit the BOM uses; the code is made automatically) (sq m, inch, pcs …) and set each one's
   **Price** (roll / by weight / by count).
3. **Items & rates:** add inventory SKUs (picked from the Inventory App's list) and parts, each with its
   **standard rate**. Set each item's **material per piece (BOM)**.
4. **Karigars & rates:** add karigars (ID + PIN). Set a karigar's own rate only in the rare cases it differs.
5. **Work orders (lots):** the material is issued with each lot. Another person confirms it, then counting can start.

### Automatic deploy (optional)
Same as the attendance app (`.github/workflows/deploy-production-apps-script.yml`). Add the repository
secrets `PRODUCTION_APPS_SCRIPT_ID` and `PRODUCTION_DEPLOYMENT_ID` (`CLASPRC_JSON` is shared with the
attendance app). After that, every merge to `main` that changes `production-app/Code.gs` or `Index.html`
updates the web app (same link).

### Android app (APK)
GitHub → **Actions → Build Android APK → Run workflow** → **Which app: production** → paste the production
link. The APK (`Production.apk`) is attached to a release tagged `production-apk-v1.N`. It installs **next to**
the attendance app (its own package `com.travalate.production`) and updates itself from those releases.

---

## 2. Inventory App changes (Travalate Inventory Code.gs)

Four small changes. Nothing else in the Inventory App changes.

**a) Paste** the whole of [`inventory-app-addon.gs`](inventory-app-addon.gs) at the end of the Inventory
App's `Code.gs`.

**b) In `doPost`**, add two actions just before the `getStockSnapshot` line:
```js
    } else if (body.action === "productionIn") {
      result = productionInToInventory(body.batchId, body.items || {}, body.date, body.employee, body.comment);
    } else if (body.action === "setInProduction") {
      result = setInProduction(body.items || {});
    } else if (body.action === "getStockSnapshot") {
```

**c) In `getInventorySnapshot()`**, add `inProduction` to both `return { success: true, … }` lines:
```js
      return { success: true, monthLabel, dates: [], rows: [], inProduction: getInProductionMap_() };
    ...
    return { success: true, monthLabel, dates, rows, inProduction: getInProductionMap_() };
```

**d) Snapshot page (`InventoryForm.html`):** shows the number small and grey in the bottom-left corner of the
latest date's cell (the hover text also says "In production with karigars: N").

1. In the `<style>`, right after the line `.snapshot-table tbody tr:nth-child(even) td.has-in { background: #b3ddc0; }`, add:
   ```css
   .snapshot-table td.has-prod { position: relative; padding-left: 24px; }
   .snapshot-table td .in-prod {
     position: absolute; left: 4px; bottom: 2px; line-height: 1;
     font-size: 0.62em; font-weight: 700; color: #6b7280; pointer-events: none;
   }
   ```
2. In `renderInventorySnapshot_`, right after `const dates = colOrder.map(i => result.dates[i]);`, add:
   ```js
   const inProduction = result.inProduction || {};
   const latestIdx = result.dates.length - 1;
   ```
3. In the same function, replace the two lines `const titleAttr = …` and `return \`<td class=…\`;` with:
   ```js
   const prodQty = origIdx === latestIdx ? Number(inProduction[String(row.sku).trim().toUpperCase()]) || 0 : 0;
   if (prodQty) classes.push("has-prod");
   const tip = (hasNote ? note : "") + (prodQty ? (hasNote ? "\n" : "") + "In production with karigars: " + prodQty : "");
   const titleAttr = tip ? ` title="${escapeHtml_(tip)}"` : "";
   const prodHtml = prodQty ? `<span class="in-prod">${prodQty}</span>` : "";
   return `<td class="${classes.join(" ")}" tabindex="-1" data-sku="${escapeHtml_(row.sku)}" data-date="${escapeHtml_(dates[i])}"${titleAttr}>${prodHtml}${v === "" || v === null || v === undefined ? "" : v}</td>`;
   ```

Then **Deploy → Manage deployments → Edit → New version** in the Inventory App (same link).

How it works:
- `productionIn` keeps a ledger per batch (`Production_Sync_Log`, hidden). Sending a batch again only adds
  the difference: a retry never adds stock twice, and a super-admin correction from 40 to 42 adds +2.
  Combo SKUs and SKUs not in Master_SKU are skipped, and the batch shows "Not in inventory yet" in the
  production app.
- `setInProduction` keeps the in-production quantity per SKU (`In_Production`, hidden). The production app
  sends it after every work order change and every locked batch, and every hour.
- If the Inventory App can't be reached, the batch stays locked and shows **Not in inventory yet**. It is
  retried every hour and with the **Send to inventory again** button.

---

## 3. Sheet tabs

| Tab | What it holds |
|---|---|
| Settings | Company, currency, pay period start day, Inventory App link and secret |
| Karigars / Staff | IDs, names, PINs (hashed after the first login), staff roles and permissions |
| Items | Code, type **SKU** (inventory) or **PART** |
| Rates | Standard rates (Karigar ID `*`) and karigars' own rates for future lots (`STD` = back to standard). History: a new row per change |
| Materials / BOM | Raw materials with their price as bought and conversion, and the material per piece of each item |
| Material Prices | Every price change of a material (history) |
| Work Orders | The lots: what each karigar is making, and the lot's rate (standard / karigar / special) |
| Material Moves | Material issued (per lot, or extra) with who entered, who confirmed and the cost per unit on the day |
| Batches | (old hand-over claim), count 1 (+photo), count 2 (final), status, final date, inventory status |
| Batch Lines | Locked counts per item and work order (what pay and the material balance use) |
| Advances / Advance Periods | Advances and the full / partial / skipped cut per pay period |
| Payroll | Approved and paid periods with the frozen figures |
| Change Log | Every entry and change: who, when, what |

Do not edit locked data in the Sheet by hand. Use the app, so that the change log stays complete.
