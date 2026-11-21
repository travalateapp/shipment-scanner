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

### Answers given 21 Nov 2026 (later the same day) and the revised proposal — also on hold

**Answers:**
1. Faridabad, Kundli, Jaipur: **4 days in total** (far warehouses stay 15 days incl. 2 packing).
2. Dispatch on **any day except Sunday** (Mon–Sat), not fixed dates.
3. A round does **not** go to all warehouses at once: at most **2,500–3,000 units can be dispatched per day**.

**Revised proposal — the calendar as a dispatch plan:**
1. Settings: daily dispatch capacity (e.g. 2,800), working days Mon–Sat, lead time per warehouse (15 / 4), group
   rhythm every 10 days.
2. Every RO gets a dispatch day: with an appointment, dispatch = appointment − shipping days (Sundays skipped,
   moving earlier); awaiting appointment → the planner suggests a day.
3. Calendar: per-day load bar (units to dispatch vs capacity, red when over), 📦 packing 2 days before,
   📍 arrivals per warehouse.
4. After Create RO, spread the round over the next working days up to capacity, most urgent warehouse first
   (runs out soonest vs earliest possible arrival); an RO can be moved to another day.
5. Cover days per warehouse: far 15 + 10 ≈ 25; Faridabad/Kundli/Jaipur 4 + 10 ≈ 14 (instead of 26).
6. Warnings: ⚠ runs out before its next possible arrival, 🕑 awaiting appointment > 3 days, ⏳ RO about to expire.

**Still open:**
1. One capacity number (e.g. 2,800), or different per day (e.g. less on Saturday)?
2. Is Blinkit's appointment date the day the stock arrives at the warehouse (so dispatch = appointment − shipping)?
3. Do the 2 packing days also use the daily capacity, or only units leaving that day?
4. First step: Settings + dispatch days from appointments + load bar (1–3), then spreading and cover days (4–5)?

### Decided 21 Nov 2026 and built (dispatch plan, steps 1–4 and 6)

Answers: capacity **2,800** units a day (one number); the appointment date **is** the arrival at the warehouse;
capacity counts **only units leaving** that day. Built: Settings → Dispatch, dispatch day per RO (from the
appointment, else set), calendar load bar / packing / arrivals, spreading after Create RO (movable), warnings.

**Still on hold:** step 5 — Days of cover per warehouse from the schedule (far ≈ 25, Faridabad/Kundli/Jaipur ≈ 14
instead of the flat 26).
