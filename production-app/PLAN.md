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

## Questions for tomorrow
- **Inventory app link:** Where does the Travalate Inventory App live (Sheet, Apps Script, other
  repo, API)? How do we read its SKU list and add stock?
- **Rates:** Same rate for every karigar, or per karigar? Do rates change over time (keep history)?
- **Parts / components:** Are they paid per piece, and should they count toward a bag's
  bill of materials (for example 1 bag = 1 body + 2 straps)?
- **Material issue:** Do we give karigars raw material (leather, zips, hardware)? This is the main
  input for theft checks.
- **Flow:** Work order → material issued → goods received → final count → stock added?
  Who does each step (karigar, supervisor, store, admin)?
- **Rejects / rework:** Are rejected pieces paid? Is there a deduction for wasted material?
- **Payment cycle:** Monthly only, or weekly / on delivery? Payslip like the attendance app?
- **Advances:** Reuse the attendance app's advance logic (instalments, choosing the start month)?
- **Logins:** Do karigars log in (ID + PIN) to see their work and earnings, or only admins?
- **Same Sheet as attendance or a separate one?** Are any karigars also employees?

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
