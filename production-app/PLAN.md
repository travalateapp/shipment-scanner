# Karigar Production App — requirements (to discuss)

Planned as a Google Apps Script web app (Sheet backend), like the attendance app,
with a phone view, an Android APK and a desktop view.

## What the owner asked for
1. Karigars (artisans) make bags.
2. SKUs match the **Travalate Inventory App** and should be linked to it.
   Some items are parts of finished goods (for example bag straps and belts). They are
   **not** inventory SKUs, but the karigar is still paid for making them (for example extra belts).
3. A rate for each SKU (what the karigar is paid per piece).
4. The quantity each karigar makes.
5. The final production date. When the received finished goods have been counted,
   that stock is **added to the Travalate Inventory App automatically**.
6. Advances given to karigars.
7. Advance recovery each month: the full amount or a part of it.
8. Checks against theft.

## Decisions (answered 5 Nov 2026)
- **Inventory app:** the Travalate Inventory App is an Apps Script app. Its code is not in GitHub
  (only `travalateapp/shipment-scanner` is connected), so the link still needs its details (below).
- **Rates:** set **per karigar per SKU**, with a **history of rate changes** (rate + effective-from date).
  Pay uses the rate in effect on the final production date.
- **Raw material:** yes, karigars are given raw material, so material is tracked
  (issued → used in finished goods → returned / balance with the karigar).
- **Approvals:**
  - Raw material issue: **2 people** must confirm.
  - Final count: **2 people** must count and agree.
  - Payment: **1 approver**.
- **Rejects / wastage:** rejected pieces are **not paid**; wasted material is **not deducted**.
- **Logins:** karigars log in (ID + PIN) to see their own work and earnings; admins log in too.
- **Data:** a **separate Google Sheet** from the attendance app.
- **Advances:** reuse the attendance app's advance recovery logic (full or partial instalments,
  choosing the start month).

## Still open
- **Inventory app link:** how to read its SKU list and add stock. Options: (a) share the inventory
  Sheet's ID and write to it directly from this app, or (b) add a small `doPost` action to the inventory
  app that this app calls. We need its SKU sheet/tab and column layout, and how stock is recorded
  (a stock-in log row or updating a quantity cell).
- **Bill of materials:** to check material, each SKU needs its material per piece (for example 0.8 sq ft
  leather, 1 zip). Is there an allowed wastage %?
- **Parts (straps, belts):** paid per piece like SKUs, only without an inventory link?
- **Payment cycle:** monthly, like the attendance app?
- **Theft checks:** to discuss later.

## Ideas for theft checks (to discuss)
- **Material reconciliation:** material issued vs (finished goods × bill of materials + allowed
  wastage % + returned material). Flag any shortfall for each karigar or work order.
- **Two-person count:** the karigar's claimed quantity and the store's count must match before
  stock is added. A mismatch blocks payment and is flagged.
- **Photo proof** of each received batch, plus the counter's name and time from the server.
- **Optional QR / barcode label per piece or bundle**, scanned on receipt (the box scanner
  in this repo already does QR scanning) so no piece is counted twice.
- **Locked entries:** once counted and pushed to inventory, only a super admin can edit,
  and every change goes to an audit log.
- **Payment only on counted quantity**, never on claimed quantity.
- **Reports:** expected vs received per karigar, wastage trend, unusual-entry alerts.

## Deliverables (as for the attendance app)
- Apps Script backend (`Code.gs`) + one HTML front end (phone + desktop layouts).
- GitHub Pages copy + Android APK through the existing workflow pattern.
