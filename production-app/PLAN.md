# Karigar Production App — plan

**Status (5 Nov 2026): built.** See [README.md](README.md) for setup and [screenshots/](screenshots/).
Decided since this plan: pay period 5th to 4th; `productionIn` added to the Inventory App
([inventory-app-addon.gs](inventory-app-addon.gs)); work orders added, so "in production" can be shown in the
Inventory Snapshot; theft checks agreed: photo per batch, locked entries + change log, pay only on counted quantity.
The second count is final (no recount when count 1 differs; the difference is flagged).

A Google Apps Script web app with its **own Google Sheet** (separate from the attendance app).
It has a phone view, a desktop view, a GitHub Pages copy and an Android APK, all set up the same
way as the attendance app.

## Requirements (from the owner)
1. Karigars (artisans) make bags.
2. SKUs come from the **Travalate Inventory App**. **Parts** (straps, belts, etc.) are not inventory
   SKUs, but karigars are paid for them per piece like an SKU.
3. Rate **per karigar per SKU/part**, with a **history of rate changes**.
4. The quantity each karigar makes.
5. Final production date: once received goods are counted, the stock is **added to the Inventory App
   automatically** (inventory SKUs only, not parts).
6. Advances to karigars.
7. Advance recovery each month, full or partial (same logic as the attendance app).
8. Theft checks (below).

## Decisions
| Topic | Decision |
|---|---|
| Inventory app | Apps Script app. It already has a `doPost` web endpoint with a shared secret (used by Shipment Manager). |
| Rates | Per karigar per SKU/part, with an effective-from date. A batch is paid at the rate in force on its final count date. |
| Raw material | Given out to karigars and tracked. |
| Material issue | **2 people**: one enters it, a second confirms it. |
| Final count | **2 people** count separately (the second cannot see the first count). The **second count is final**; a different count 1 is flagged. |
| Payment | **1 approver** per karigar per pay period. |
| Rejected pieces | **Not paid.** |
| Wasted material | **Not deducted** from pay, and **no wastage % allowed**: any material shortfall is **flagged** for review. |
| Logins | Karigars (ID + PIN: their own work, materials, advances and payslips) and admins (with permissions). |
| Advances | Same logic as the attendance app: amount, monthly instalment (full or part), starting month. |
| Pay period | Monthly, **5th to 5th**. Payment is usually made around the 7th, but the date varies, so the actual paid date is recorded. |

## Theft checks (agreed)
1. **A photo of every received batch**, taken at the final count.
2. **Counted entries are locked.** Only a super admin can change one, with a reason, and every change
   goes to the **Change Log** (who, when, old value → new value).
3. **Pay only on counted quantity**, never on what the karigar claims. A karigar may enter what they
   handed over; any difference from the count is shown, but pay always uses the count.

Also built in because of the 2-person rules: two-person material issue, two-person blind count, and a
material balance per karigar that flags shortfalls (no wastage allowance). Server time is used for
every entry. More theft checks to discuss later.

## Inventory App link
The Inventory App (`Travalate_Inventory.gs`) already has, in `doPost`:
- `getSkuList`: the Master_SKU list. Used for the SKU dropdown and the link check.
- `adjustmentIn`: adds stock as an Inward entry, with a cell note.

**Recommended:** add one small action, **`productionIn`**, to the Inventory App, with its own ledger
keyed by **batch ID**. Then a retry after a network time-out can never add the same batch twice.
(`adjustmentIn` has no ledger, so a retry would add the stock again.) The code will be supplied
ready to paste, and nothing else in the Inventory App changes.

- Stock is added with the **count date** (today), which is always in the Inventory App's active month sheet.
- Cell note: `05-Nov 14:20 | <counter> | +40 (In) | Production P-0123 – <Karigar>`.
- If the Inventory App can't be reached, the batch is still saved and locked and shows
  "**Not in inventory yet – Retry**". A daily trigger retries automatically.
- The Inventory App's URL and shared secret go in this app's **Settings** tab, **not in GitHub**.
  This repository is public, so the uploaded `.gs` file (which contains the secret and email
  addresses) is **not** committed.

## Workflow
1. **Setup (admin):** karigars; items (inventory SKUs picked from the Inventory App, plus parts);
   materials and units; the **bill of materials** per item (material per piece); rates per karigar per item.
2. **Material issue:** person A records material and quantity for a karigar → person B confirms
   → it counts toward the karigar's material balance. Unconfirmed issues show as pending.
3. **Material return:** same 2-person flow (unused material coming back).
4. **(Optional) Karigar hands over:** the karigar enters the items and quantities on their phone.
5. **Final count:** counter 1 enters good and rejected quantities per item and takes the photo →
   counter 2 counts blind → count 2 is final: the batch is **locked**, inventory SKUs are pushed to the
   Inventory App, and pay is credited at the karigar's rate. A different count 1 is flagged, not blocked.
6. **Material check:** material used = (good + rejected pieces) × bill of materials. The karigar's
   balance = issued − returned − used. A negative balance means more output than material (wrong
   bill of materials or entry); a positive balance that isn't returned is flagged at period end.
7. **Pay period (5th to 5th):** earnings from locked batches − advance instalment (full or partial,
   chosen per karigar) = net pay → **approver approves** → marked **paid** with the actual date →
   payslip (PDF, WhatsApp share like the attendance app).

## Sheet tabs
Settings · Karigars · Items · Rates (history) · Materials · BOM · Material Issues · Material Returns ·
Batches · Batch Lines · Inventory Push Log · Advances · Advance Recovery · Pay Periods · Admins
(permissions) · Change Log

## Screens
- **Karigar (phone):** Home (this period's earnings so far, material with them), My Work (batches),
  My Material, Advances, Payslips, Change PIN.
- **Admin (phone + desktop):** Dashboard, Issue / Confirm Material, Final Count (count 1 / count 2 +
  photo), Batches, Material Balance, Payroll (approve, mark paid, Excel), Advances, Karigars, Items &
  BOM, Rates, Admins *(super admin)*, Change Log *(super admin)*.

## Build phases
1. **Core:** Sheet setup, logins, karigars, items (with the Inventory App SKU list), parts, rates with
   history, final count with 2 counters + photo + lock, push to the Inventory App, Change Log.
2. **Material:** materials, bill of materials, 2-person issue and return, material balance and flags.
3. **Pay:** 5th-to-5th periods, advances with full or partial recovery, approve and mark paid, payslip,
   Excel export.
4. **Desktop layout, GitHub Pages copy, Android APK, automatic deploy.**
