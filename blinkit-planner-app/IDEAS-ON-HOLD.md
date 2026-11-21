# Blinkit planner — ideas on hold

Ideas discussed but not built yet. When the user says **"Hold Ideas Discuss"**, go through this list with them.

## 1. Shipment schedule, lead times and the calendar (put on hold 21 Nov 2026)

**Business rhythm (from the user):** every month 3 shipments of TBI, 3 of TBO and 3 of TBG, across warehouses
(≈ one per group every 10 days). Shipping takes 15 days for all warehouses, including 2 days of packing. Only
Faridabad, Kundli and Jaipur take 3 days for shipping.

**Suggestions made (in order of value):**
1. **Shipment schedule in Settings** — dispatch days per group (e.g. TBI 1st/11th/21st, TBO 4th/14th/24th, TBG
   7th/17th/27th, staggered to spread packing). Calendar shows 📦 Pack (2 days before), 🚚 Dispatch, 📍 expected
   arrival per warehouse.
2. **Lead time per warehouse in Settings** — default 15 days incl. 2 packing; Faridabad, Kundli, Jaipur 2 + 3 = 5.
3. **Days of cover per warehouse from the schedule** — an RO only has to last until the next shipment arrives:
   far warehouses ≈ 15 lead + 10 to next = 25 days; Faridabad/Kundli/Jaipur ≈ 5 + 10 = 15 days (today's flat 26
   overstocks these by ~11 days of sales). Plus a safety buffer.
4. **Calendar warnings** — ⚠ "runs out before the next arrival" (with days out of stock), ⏳ RO expiry (~30 days),
   🕑 appointment overdue (awaiting appointment > 3 days).
5. **Calendar day popup** — grouped by warehouse; on a dispatch day "Plan this shipment ▸" (opens New Plan filtered
   to that group with per-warehouse cover); totals per round vs packing capacity; Add appointment / Open in RO Log.
6. Extras — calendar filter by group and warehouse; colour per group with a legend.

Suggested first step: 1 + 2 + 3 together, then 4 + 5.

**Open questions for the user:**
1. Faridabad, Kundli, Jaipur: 5 days in total (2 packing + 3 shipping), or 3 days in total?
2. Dispatch on fixed days of the month (as in the example), or each round's date set by hand?
3. Does each round cover all warehouses of that group at once?
