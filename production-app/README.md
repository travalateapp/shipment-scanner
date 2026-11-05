# Karigar Production App (Google Apps Script)

Karigars make bags and parts for you. This app keeps track of everything from raw material to payment:

- **Work orders:** what each karigar is making (for example 300 × TR-1323-Black). What is not received yet is
  "in production" and shows small and grey in the Inventory Snapshot.
- **Raw material, 2 people:** one person enters an issue or return, a **different** person confirms it.
- **Final count, 2 people:** count 1 with a **photo** of the goods, then count 2 by a **different** person who
  does **not** see count 1 (blind). **Count 2 is final:** the batch is locked with count 2's numbers. If count 1
  was different, that is kept and flagged ("Count 1 differed") but does not block anything.
- **Inventory:** on lock, the good pieces of inventory SKUs are added to the **Travalate Inventory App**. The
  note there reads `05-Nov 14:20 | Harshit | +40 (In) | Received From Ramesh (P-0012)`.
- **Parts** (straps, belts …) are paid but not added to the inventory.
- **Pay:** counted good pieces × the karigar's own rate for that item, on the count date. Rates have a full
  history. **Rejected pieces are not paid.** Karigars are never paid for what they claim, only for what was
  counted.
- **Pay period 5th to 4th** (5 Nov – 4 Dec). After it ends, **1 approver** approves each karigar's pay. The
  figures are then frozen. The approver then marks it **paid** with the actual date.
- **Advances:** given with a cut per pay period. For any period the cut can be the **full balance**, a
  **part**, or **skipped**. This is the same logic as the attendance app.
- **Material balance:** given − returned − used (good + rejected pieces × bill of materials). No wastage
  allowance. A negative balance or material left with a karigar who has no open work order is **flagged**.
- **Locked entries** can only be corrected by a **super admin**, with a reason. Every entry and change is
  in the **Change log**.
- **Logins:** karigars (ID + PIN) see their own work, material, work orders and payslips. Staff see the
  screens their permissions allow.
- Phone layout, desktop layout (side menu, wide tables), payslip print/PDF and WhatsApp, payroll download.

Screens are in `production-app/screenshots/`.

---

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
2. **Items & materials:** add inventory SKUs (picked from the Inventory App's list) and parts; add raw
   materials; set each item's **material per piece (BOM)**.
3. **Karigars & rates:** add karigars (ID + PIN) and each karigar's rate per item.
4. **Work orders**, then **Material issue**, then counting can start.

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
| Rates | Karigar × item × rate × from date (history: never edited, a new row per change) |
| Materials / BOM | Raw materials and the material per piece of each item |
| Work Orders | What each karigar is making |
| Material Moves | Issues and returns with who entered and who confirmed |
| Batches | Hand-over claim, count 1 (+photo), count 2 (final), status, final date, inventory status |
| Batch Lines | Locked counts per item and work order (what pay and the material balance use) |
| Advances / Advance Periods | Advances and the full / partial / skipped cut per pay period |
| Payroll | Approved and paid periods with the frozen figures |
| Change Log | Every entry and change: who, when, what |

Do not edit locked data in the Sheet by hand. Use the app, so that the change log stays complete.
