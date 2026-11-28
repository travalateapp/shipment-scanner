# Blinkit Shipment Planner (Google Apps Script web app)

A web app for computers and phones that plans Blinkit shipments (ROs) and keeps the **Blinkit Google Sheet** up to date by itself.

- **New Plan:** upload the Bulk RO file; the Inventory is read from the sheet's *Formula Sheet* (filled by the daily 📦 Blinkit Inventory upload). The app works out, for each warehouse × item, how much to send for **26 days of cover**, using the rules below. You can change any quantity. The warehouse chips above the plan pick **one or more** warehouses (click to add, click again to remove, **All** to clear); the Create ROs window starts with those warehouses ticked.
- **Create RO file:** one tap does three things:
  - downloads **Blinkit's own Bulk RO file** with *RO Quantity* and *Shipping Address* filled in, ready to upload;
  - saves every line in the **RO Log**;
  - writes the quantities into the month tab (e.g. *Oct 2026*), in the **next free column D–H** of that warehouse's TBI / TBO / TBG block.
  - **Picked SKUs only:** when SKUs are picked in New Plan's search box, only those SKUs (in the warehouses ticked in Create ROs) are saved and put in the RO file; the bottom bar and the warehouse totals count only them too. Clear the picks to include every SKU.
  - In the Create ROs window, each ticked warehouse shows its **TBI / TBO / TBG** units in small print (a group not in the chosen file is struck through) and, as its total, the units that will be saved. The window always fits the screen: only the warehouse list scrolls (in its own box), the Excel choice is one row (Merged · All separate (ZIP) · TBI · TBO · TBG, with "Merge: TBI TBO TBG" under it for Merged), and above the Save button 📍 names each ticked warehouse with its units, so you always see which warehouse you are saving.
  - In the Create ROs window, choose **one** Excel option: **Merged** (one file; all groups, or untick a group to merge only the others, e.g. *…_TBI+TBO.xlsx*), **All separate** (one file per group, in one ZIP folder, e.g. *Blinkit_Bulk_RO_2026-11-25_Faridabad.zip*), or **TBI**, **TBO** or **TBG** only. Each file holds only the header and the lines being ordered — the ticked warehouses and the SKUs with an RO quantity; Blinkit's other rows are left out. **Only the chosen groups' lines are saved as ROs**; the other groups' lines stay in the plan with what you typed (the window says which). The file name carries the group, and the warehouse when only one is ticked. The done screen can download the ZIP or any single file again.
- **RO Log search (Ctrl+F):** a search box next to the filters searches **all ROs** — any date, warehouse or status, not only what the filters show (the whole RO Log is read once in the background): every word must match the RO's warehouse, group, RO number, SKUs, item IDs, status or a date (e.g. *mumbai belt*, *4999700011*, *25 nov*). A matching RO is shown whole; Esc clears the search.
- **RO Log shows ROs as on Blinkit:** ROs created with the **Merged** file, or sharing one Blinkit RO number at one warehouse, are one card (e.g. *Faridabad · TBI + TBO + TBG*), saved together. In the RO Log tab and the month tab they stay one batch per group (each group's own block), as before; the RO Log tab's **Merged RO** column links them.
- **RO number hover:** wherever an RO number is shown (calendar pop-ups: Dispatch, Arriving and Delivered; RO Log; Ask; the Planned pop-up), hover it, or tap it on a phone, for its **balance in the Shipment Manager**. This is the same as its 📊 Balance there, read straight from the Shipment Manager's sheet:
  - each PO line with PO Qty, Packed, Short (Adjustments) and Remaining, plus *Why* when it was sent short;
  - the RO's shipments with their boxes, invoice and 🚚 Dispatch Date.

  The balance is kept for 2 minutes. An RO **shipped short** (a line sent less than its RO quantity) has its number on a **light yellow** background.
- **RO Log:** every RO. The Status filter has **Planned (not shipped yet)** and **Shipped** apart, and **Planned + Shipped** together (the default view). Set the status (Planned → Created, or Cancelled); the RO Log opens on Created ROs, and add the Blinkit RO number and appointment date. The RO heading in the month tab updates too. It has three lines, centred: `RO 21 NOV`, the full Blinkit RO number in **font size 7** (`4999612345`), and **dispatch day - appointment** (`23/11 - 30/11`; `23/11 -` until there is an appointment). It is rewritten by itself whenever the RO number, appointment or dispatch day changes (RO Log, calendar, RO PDF) or the lead / packing / dispatch days in Settings change; **Settings → Sync month tabs** rewrites every open RO's heading at once. Changing a quantity, or cancelling a line, also changes the month tab.
- **RO PDF:** the **🧾 Dummy RO Invoice** card is on top and always open (see *Dummy RO Invoice* below). Under it, **Upload Blinkit R.O. PDFs** is collapsed: click it to upload one or more Blinkit R.O. PDFs. They're read with the same parser as the Shipment Manager (`parseBlinkitRoPdf_`, copied unchanged), and the app picks up the RO number, warehouse, RO date, expiry and each Item Code + Qty. The items are checked against the PDF's *Total Quantity*.
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
- **Confirm before saving:** every button that saves or moves something (Move, Follow appointment, appointment Save, Mark delivered from the reminder, Add to day, Give dispatch days, RO Log Save, line Save, Reset block, RO PDF Save / Save all, Create ROs, all Settings saves, Start the month, Tidy now, Sync now, SKU list, user Save / Add user, Change PIN, Log out) first asks in the app's own dialog, naming the RO and date where there is one, so an accidental tap changes nothing. Buttons that already asked (Mark delivered, Cancel, Remove, Wipe, New PIN) ask only once.
- **Dispatch plan (Settings → Dispatch):** daily capacity (2,800 units), dispatch days (Mon–Sat), lead days (15; 4 for Faridabad, Kundli, Jaipur) and packing days (2). Every RO gets a dispatch day: with an appointment it is appointment − shipping days (lead − packing; Sundays skipped); otherwise the day it was given. **A dispatch day can also be set by hand for an RO with an appointment** (RO Log *Dispatch day*, or *Move to* in the calendar pop-up). It is kept instead of the worked-out one (RO Log column *Dispatch Fixed* = Yes) until you empty it in the RO Log, click **↺ Follow appointment** in the calendar, or give a new appointment. After **Create RO** the new ROs are spread over the next working days after packing within the capacity, most urgent warehouse first; move them in the Dashboard calendar (click a day: a pop-up lists the day's dispatches, packing, arrivals and warnings; move a dispatch, **✕** to take an RO off that day (its dispatch day — and appointment, after a confirm — is cleared in the RO Log and the month-tab heading), add or change an appointment — its dispatch day follows — or **add an open RO** to that day: click the box to see all open ROs, or type a warehouse, RO no. or units to narrow the list, pick with ↑/↓ + Enter or a click) or in the RO Log (**Dispatch day**, saved in the RO Log's *Dispatch Date* column). The **📅 Calendar** runs from 20 days ago to about a month ahead. ROs marked Delivered stay on it for 20 days after their delivery day: on the day they were dispatched (the Shipped On day if known; counted in that day's 🚚 load, without Move / ✕) and on their delivery day (✅). It shows 🚚 load per day vs capacity (red when over), 📦 packing, 📍 arrivals, RO dates, ⚠ items that run out before their next possible arrival and ⏳ ROs expiring without appointment; above it the warnings (⚠ run-outs, 🕑 awaiting appointment > 3 days, ⏳ expiring within 5 days, 📋 open ROs without a dispatch day — with **Give them dispatch days**).
- **Dashboard extras:** click any column heading of the items table to sort (A→Z / lowest first, click again to reverse). A collapsible **📅 Calendar** (closed by default) shows 38 days from 7 days ago (the last 7 days, today and the next 30): open ROs by RO date, appointments, and items whose days of cover run out; click a day for the list. It follows the warehouse picked on the dashboard.
- **TI column (Travalate Inventory):** New Plan shows, between *Send* and *Days after*, the stock of each SKU in the Travalate Inventory app that is **still free**, the same for every warehouse. That is TI minus the quantities on open ROs (Created / Planned, all warehouses) that are **not shipped yet**: no shipment found by the Shipment Manager sync (without a Shipment Manager link: dispatch day after today). Shipped ROs are already deducted in TI by the Shipment Manager. Hover a TI number for the split; the Excel download has *TI stock* and *TI free*. (Projections keeps the full TI, next to the open RO quantities.) The number shown is what stays free **after this plan**: free now − the Send quantities of that SKU in this plan (all warehouses), updated **as you type**; below it "774 − sending 50". It turns red (below 0) when the plan sends more than TI has. Send boxes start **grey** (the planner's suggestion) and count **as 0 everywhere** — block totals, the bottom bar, Create ROs, the RO file and the Excel — until you click into them, type or fill a quantity (then the line turns green and counts); ↺ puts a block back to grey suggestions. Set up once in **Settings → Travalate Inventory** (the Inventory app's link and its shared secret, kept only in this script's settings). SKUs named differently in TI get their TI name in **Settings → SKUs → TI SKU**; spaces, dashes and capitals are ignored when matching.
- **Why not sent (short shipments):** when the Shipment Manager shows an RO line was not sent in full, the RO Log shows "shipped X · Y not sent" with a box **"Why not sent?"**. Type the reason and press Enter (or leave the box): it is saved in the RO Log (column *Short Note*) and added to the red cell's note in the month tab ("Why: …").
- **💬 Ask (bottom right):** ask about an SKU, optionally at a warehouse, e.g. *Why was 2 in 1 Belt not sent in Mumbai?*, *What is not sent?*, *When does 1323 arrive in Kundli?*. While you type, it **suggests SKUs** (by name or item ID) **and warehouses**; **Tab** fills in the first one (or ↑ / ↓ then Enter, or a click); **Enter** alone asks the question. It answers from the RO Log (last 120 days) and the last plan, with no AI and no API key. First come the **quantities now** for each warehouse, or just the one named: **Stock** on Blinkit, **Delivered** (waiting for the GRN), **Shipped** (on the road), **Planned** (RO made, not shipped yet), Per day and Days, with a total. These are the same figures as the Dashboard, e.g. *How much 1323 is there?*. Then each RO with ordered / shipped / not-sent quantities and the reason noted, status, dispatch, appointment and delivery, plus the last plan's stock, sale per day, suggested quantity and whether it is locked. Esc closes it.
- **Days, explained on hover:** Dashboard *Days* = Has (stock + delivered) ÷ per day − days since the stock date, e.g. *Days = Has 395 (stock 54 + delivered 341) ÷ 37.0 per day − 1 day since the stock date = 9.7*; the second line gives the days with Shipped + Planned on their way too. New Plan's *Days now* hover shows the same sum.
- **Private connections in Settings:** the *Travalate Inventory* and *Shipment Manager* cards start collapsed, and their links are hidden (Show / Hide next to each).
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
- **New item rows in the month tab:** when an RO has an item that has no row in its warehouse block yet (e.g. not live there), the planner adds the row under the block's last item, copied from the item row above like a normal copy-paste (so its formulas work): every **earlier day column = 0**, the **current day = the formula from the row above**, later days empty, totals keep their formulas, and no numbers of the other item are copied. Day columns are the ones with a date heading (e.g. *26/11*). Rows added before this fix that show **#ERROR!** are repaired once per month tab by the tidy-up below (earlier days 0, current day / totals get the formula again).
- **Month tab kept tidy (automatic, daily at 10 AM):** once a day from 10 AM — by the `dailyTidy` trigger (Apps Script → Triggers → add → function **dailyTidy**, *Time-driven*, *Day timer*, *10am to 11am*), or, without it, at the first opening of the planner after 10 AM — the current and previous month tabs are tidied: in each warehouse block (TBI / TBO / TBG) the ROs are put **left to right by RO date — earliest first** (RO Log's RO date, then when it was saved; an RO not in the RO Log by the date in its heading "RO 21 NOV"), with no empty RO column between them. Each RO takes its **cell formatting** (colours, bold, red "not sent" marks) and notes along, and the RO Log's *Month Tab / Tab Refs* follow. A heading left over without quantities is cleared. When an RO's quantity leaves a cell (cancelled, delivered and removed, moved), that cell's **formatting is removed** too (the heading row keeps its own background and borders). Then RO columns the planner added (from **I** on) that are empty in **every** block are **deleted**; D–H always stay. Formulas over the RO columns shrink with it, and the daily updater's *Undo Last Upload* columns move along. **Settings → Tidy month tabs now** does it at once.
- **Settings (admin):** days of cover, rounding, address, the SKU list with TBI / TBO / TBG group (or **Take groups & tiers from the month tab**, which also lists SKUs that sit in two groups of one warehouse), and **Start new month**.
- **Users (admin):** User ID + PIN logins with the roles Admin, Planner (plans and ROs) and Viewer (dashboard and log only).
- **Delivered, waiting for Blinkit's GRN:** Blinkit shows delivered goods in its stock only 2–3 days after delivery (GRN), and they may already have left its *Incoming*. So when an RO is marked **Delivered**, the planner saves the item's stock on Blinkit at that moment (*GRN Base*, from the Formula Sheet) and the quantity **actually shipped** (*Shipped Qty*, from the Shipment Manager's BLINKIT_PO tab; link in **Settings → Shipment Manager**). New Plan counts that quantity in a **Delivered** column, between Stock and Planned. It stops as soon as the Inventory shows the item's stock above the GRN base, which means Blinkit has received it, and after 7 days at the latest. If Blinkit's Bulk RO file still lists it as **Incoming** (no GRN yet), that part is taken **off Incoming** and shown under **Delivered** instead, so it never appears as Planned "without RO" and is never counted twice. On the Dashboard it is part of **Has** ("+N delivered").
- **Shipment Manager sync:** once an RO has a Blinkit shipment in the Shipment Manager (SHIPMENTS, PO number = RO number, not deleted):
  - its **dispatch day becomes the shipment date**, set as fixed;
  - its RO keeps the **RO quantity** (BLINKIT_PO → PO_QTY) and gets the **quantity actually shipped** (SHIPPED_QTY, RO Log *Shipped Qty*);
  - when less was sent, the month-tab cell shows the quantity **actually shipped** (0 when nothing went), in **red**, with a note *"Ordered Y — shipped X, Z not sent"* (+ *"Why: …"*). Cells marked before this change are corrected once at the next Shipment Manager sync; if a later shipment completes the RO, the cell goes back to the ordered quantity;
  - the planner leaves the part **not sent** out everywhere. Blinkit still lists it as incoming until the RO closes, so it is taken off Blinkit's incoming in the plan and in Projections, and it never shows as *Planned without RO*;
  - the RO Log line shows "shipped X · Z not sent";
  - when the RO is delivered, the whole quantity (red part included) leaves the month tab 2 days later like any other, and the red mark goes with it.

  - **Shipped = 🚚 Dispatch Date:** for shipments entered in the Shipment Manager from **26-11-2026** on, an RO counts
    as shipped only once its shipment has a **Dispatch Date** (Shipment Manager → Shipments → 🚚 Dispatch Date) on or
    before today. That date is its shipped day and dispatch day. Box quantities and shipped-short reasons also arrive
    from that day.
    - **No dispatch date yet:** the RO stays Planned, even with a shipment. An RO marked shipped earlier from the
      shipment's date is set back.
    - **Older shipments:** shipments entered before 26-11-2026 still count from their shipment date.
  - **Marked shipped by hand:** in the RO Log, open the RO and set **Status → Shipped (on a date)**. Pick the day it
    left and click **Save RO**. That day becomes its shipped day and dispatch day. Use this for an RO that has no
    shipment in the Shipment Manager, or one still shown there as *Not dispatched yet*. A date set by hand stays
    until the Shipment Manager has a 🚚 Dispatch Date for the shipment. From then on, that date is used.
    Choosing *Planned (on Blinkit)* un-ships it.
  - **Log-only ROs** (typed into the month tab by hand) are synced with the Shipment Manager too. They get their
    shipped day and quantities in the RO Log. Nothing is written to the month tab for them.
  - **Not shipped by its dispatch day:** an open RO (Draft / Planned) whose dispatch day has passed and that the Shipment Manager has no shipment for is **not** marked Shipped; right after the sync its dispatch day moves to **today** (or the next dispatch day, Settings → Dispatch), and its month-tab heading follows. Every day it is still not shipped, it moves again. Once the Shipment Manager has its shipment, the real shipment date replaces it. (With an appointment, the moved day is kept as set by hand; the daily capacity is not re-balanced.)
  The sync runs at most every 30 minutes, in the background when the planner is opened, from **Settings → Shipment Manager → Sync now**, or from a time-driven trigger on `syncFromShipmentManager`. Each RO is checked again for **2 days** after its shipment is first found (RO Log *Ship Sync Until*), then left alone.
- **Appointment passed — reminder:** when the calendar opens, ROs whose appointment date has passed and are not marked Delivered pop up: **Mark delivered** (with the date), **New appointment**, or **⏰ Remind me later** (3 hours, on that device).
- **Plan columns** (New Plan and Dashboard), from left to right:
  - **Stock:** on Blinkit now (warehouse + in-between + darkstore).
  - **Delivered:** at the warehouse, waiting for Blinkit's GRN.
  - **Shipped:** on the road (hover the number for its ROs: RO number, RO date, shipped day, appointment and the quantity sent). These are open ROs whose Shipment Manager shipment is **dispatched** (🚚 Dispatch Date set, for shipments entered from 26-11-2026), not delivered yet. An RO whose dispatch day has passed without a dispatched shipment there stays Planned. (Without a Shipment Manager link in Settings, the dispatch day decides: today or earlier counts as shipped.)
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
3. Check the plan. **Warehouse order:** drag a warehouse chip under *2. Plan* (on a phone, hold it a moment first, then move it) to move that warehouse up or down; the warehouse blocks below and the Create ROs list follow that order (kept on this device; **↺ A–Z order** puts it back). It opens on **Show: All items** (every item of each warehouse, also those with nothing to send); pick *Lines to send (+ locked)* to see only lines with a quantity. Filter by warehouse, group or search, and change quantities if you need to. The warehouse chips (and the *2. Plan* heading) show each warehouse's **suggested** units, in grey italics, until you start its plan (click, type or fill a Send box there); from then on that warehouse shows only what you picked. The bar at the bottom, Create RO file and the file always count picked lines only. Lines above Blinkit's max are shown in red, and the RO can't be created until they're fixed.
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

### Why a line was shipped short
When a Blinkit RO is shipped with less than the RO quantity, the Shipment Manager's **Box Details** and **JPG** open
only after a reason is given for each SKU sent less: *Not Enough Quantity*, *Management Decided* or *Other: …*. It is
asked again when an edit changes the shortfall. The reason is kept in `BLINKIT_PO` → `SHORT_REASON`. The Shipment Manager sync copies the
reason into the RO Log's **Short Note** and into the note of the red cell in the month tab
(*Ordered … — shipped …, … not sent … Why: …*).
- **Edited later:** if the shipment is edited and the line is shipped in full, the red cell, its note and the Short
  Note are cleared. If it is still short, they stay.
- **Checked until settled:** lines shipped short are checked on every sync, not only for the first 2 days, so a reason
  given later or a later edit still arrives.
- **Typed in the planner:** a reason typed in the RO Log (*Why not sent?*) is kept while the Shipment Manager has none.

### Dummy RO Invoice (RO PDF tab)

The **🧾 Dummy RO Invoice** card on the RO PDF tab makes an RO Invoice for one or more Blinkit R.O. PDFs without you
touching the Shipment Manager. For each PDF, the Shipment Manager does the work and the planner only downloads the
final file:

1. **Upload the PO.** If the RO is not in the Shipment Manager yet, it is uploaded there as a **dummy** PO. An RO that is
   already there as a real PO is used as it is.
2. **Apply boxes.** The suggested box layout is used. Items without box details (no case size) are left out and listed.
3. **Generate the output and create the RO Invoice** with the next dummy number: `SI/2026-27/D001`, then `D002`, and so
   on. The counter is kept in the Shipment Manager (Script Property `DUMMY_RO_INVOICE_SEQ`) and only goes up when an
   invoice is made. Invoice date is **today**, and the delivery date is the RO's **expiry / appointment**.
4. **Download** `Invoice-<number>-RO<RO number>.pdf`, laid out exactly like the Shipment Manager's RO Invoice.
5. **Clean up.** The dummy PO is cancelled in the Shipment Manager. No shipment is saved there.

The Shipment Manager side (its `doPost` and the invoice code, all in its `Code.gs`) deploys by itself from GitHub.

**One-time setup (keys only):**
1. In the planner, open **Settings → Shipment Manager details → Dummy RO Invoice**. Tap 🎲 to make a key and copy it.
2. In the Shipment Manager's **Project Settings → Script Properties**, add `PLANNER_API_SECRET` with that key. No
   redeploy is needed.
3. Back in the planner, paste the Shipment Manager's web-app link (ending in `/exec`), then tap **Save & test**.

The link and key are kept only in the planner's Script Properties (`SM_WEBAPP_URL`, `SM_API_SECRET`), never in this repo.

---

## 3. Month tabs

- An RO goes into the tab of the month of its **RO date**: a tab named like `Oct 2026`, `Sept 2026` or `January 2026`.
- In the warehouse block (`<Warehouse>-TBI`, `<Warehouse>-TBO` or `<Warehouse>-TBG`; a warehouse with no TBG block gets its TBG items in the TBO block), the app uses the first column D–H in which **no item row has a quantity**. It writes each item's quantity on its row and the RO heading above it.
- An item that isn't in the block gets a new row at the end of the block. The formulas and formatting of the row above are copied; the numbers aren't.
- If D–H are all used in that block, the app **adds a new RO column** to the tab. It is inserted just before the last RO column, inside the D–H range, so any formula over D:H, such as a sum, grows to include it. It is formatted like the column next to it and marked with a note in row 1 (*Blinkit Planner: RO column added*). The RO that was in the last column moves one column right, and the RO Log follows. Columns I onwards move one column right too, with their formulas adjusted by Sheets. Later ROs use the added columns like D–H. If you delete an added column by hand, the app simply stops counting it.

### RO columns locked (colours stay free)
The RO columns of the month tabs (D up to the last RO column) are written only by the planner. If someone types,
pastes or deletes a value there, it is put back at once and a small *🔒 RO columns* message shows. Colours, borders
and other formatting stay as they made them, because formatting changes are not edits of the value.
- **One cell:** its value from before the edit comes back. An RO heading comes back with its small RO number.
- **Several cells** (paste, fill, delete): each cell is rebuilt from the RO Log, either the RO's quantity, or the
  shipped quantity when it was shipped short, plus the RO heading. A cell the RO Log knows nothing about is emptied.
- **Planner and updater writes:** the planner's own writes and the daily inventory updater's are not edits by a
  person, so they are never undone. ROs are added and changed in the planner (New Plan, RO PDF, RO Log).
- **Not prevented:** deleting or inserting whole columns or rows. Use the sheet's version history if that happens.

**One-time setup:** in the sheet, go to **Extensions → Apps Script → Triggers** (clock icon) → **Add Trigger**. Choose
function **guardRoEdits**, event source **From spreadsheet** and event type **On edit**, then **Save** and allow access.

**To turn it off:** in the planner's **Settings** tab of the sheet, set **Lock RO Columns** to `No`. If the row is
missing, add it. The default is Yes.

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

## Swiggy and Zepto (one tab each)

Swiggy and Zepto each have their own tab in the app, each with two separate uploads (**PO PDFs**, and **sales & inventory reports**; a file of the wrong kind or of the other platform is turned away with a message saying where it belongs), open POs, What to send first, SKU mapping and stock table. Only the Dashboard calendar and Projections → All show them together with Blinkit.

Swiggy and Zepto raise their own POs, so the app creates nothing for them. It shows **what matters most to send**.

**The app fills the Swiggy Planning and Zepto tabs**, like the RO columns of the Blinkit month tab:
- **Upload PO PDFs** (Swiggy or Zepto, several at once) in the same box as the reports. Each is read, matched by its warehouse (Swiggy Pod Name; Zepto FC such as `MUM - Mumbai`), PO no., release date, expiry date and quantities per SKU (Swiggy item code; Zepto SKU code + material code), and shown for checking.
- **Write to tab:**
  - A new PO gets a column after the last PO, with one empty column first when its release date is different (the tabs group POs by release date).
  - A PO already in the tab is updated in its own column.
  - Row 1 is the warehouse, row 2 the PO no. (its expiry date goes in the cell's note), row 3 the release date, and from row 7 the quantity on each SKU's row.
  - A SKU not in the tab yet gets a new row inserted right under the last SKU row; rows below it move down. Its name can be typed before writing.
  - **Which rows are SKU rows:** rows whose column B has a Swiggy item code (a number) or a Zepto SKU code (or, for Zepto, a material code in E). Notes, dates, PO numbers and a Total row kept below the SKU list are not SKUs: they are not listed, not counted in PO quantities, and never changed when a PO is written or removed.
- **Shipping date (row 4):** set from the Shipment Manager's 🚚 Dispatch Date when the PO's shipment has one; a date already in the tab is not changed. It can also be set on the PO in the app.
- **Appointment (row 5):** set on the PO in the app (**Save dates**).
- **Remove from tab** empties a PO's column, for a PO written by mistake or closed.
- **Expired POs:** a PO past its expiry date with no shipping date is left out of the priorities.

**Data it uses**
- **POs** are read from the sheet's **Swiggy Planning** and **Zepto** tabs. Each PO is one column:
  - row 1: warehouse;
  - row 2: PO no.;
  - row 3: release date;
  - row 4: shipping date;
  - row 5: appointment date;
  - from row 7: one row per SKU, with its name in A and its Swiggy item code / Zepto SKU code in B.
- **PO status:**
  - Open: no shipping date yet, or a shipping date after today.
  - On the way: shipped, appointment today or later.
- **Reports:** upload the latest reports, several at once:
  - Swiggy: Sales `.xlsx` + SOH stock `.csv`.
  - Zepto: Sales `.csv` + Inventory `.csv`.
- **What the page works out from the reports:**
  - Sold per day for each warehouse and SKU: the highest of the last-7-day, last-15-day and whole-report averages.
  - Stock.
  - Days of cover: stock plus what is on the way, divided by sold per day.
- The result is saved in the **Planner QC Snapshot** tab, so the Dashboard shows it without uploading again.
- **File names don't matter.** Each file is recognised by its column headings.
- **New stock report only:** a new stock report on its own updates the stock and uses the saved sales history.
- **Swiggy check:** Swiggy's stock report lists each warehouse's open POs. The tab is checked against it:
  - **Missing from the tab:** a PO open on Swiggy but not in the tab is shown as a warning.
  - **Probably closed:** a PO in the tab with no shipping date that Swiggy no longer lists as open (released before that report) is listed as probably expired or closed, and left out of the priorities.
- **Zepto warehouse names:** a Zepto PO's warehouse may be written as `MUM - Mumbai` or just `Mumbai`.
- **Sales history:** sales are kept per day in the **Planner QC Sales** tab, for the last 90 days.
  - A later upload that repeats days already read replaces those days, so nothing is counted twice, and adds the new days.
  - Sold per day uses the last 30 days of that history.
  - Days missing between two uploads count as no sales; the upload message says how many.
  - Stock always comes from the newest upload.
- **SKU mapping:** Swiggy and Zepto codes are not Blinkit's, and new ones appear. The **🔗 SKU mapping** card in each tab lists every code from the tabs and the last reports. Link each one to our SKU as named in Travalate Inventory; the links are saved in the **Planner QC SKUs** tab.
  - **New:** in a report but not in the tab yet, and not linked.
  - **Fill suggestions:** puts in name matches.
  - **What the link is used for:** **Our stock**, and adding up the same product across Swiggy and Zepto in **What to send first**.

**Warehouses**
- **Swiggy:** counted per warehouse city, as in the SOH report. Its stock report has warehouse stock only, not dark stores.
- **Zepto:** counted per Zepto warehouse (MUM, BLR, CHN, GUR), from the cities each one serves.
- Both city lists are in **Settings → Swiggy cities / Zepto cities**, one line per warehouse: `warehouse: city, city`.
  - Swiggy: sales in a city without a Swiggy warehouse count under the city named there.

**What the tab shows**
- **Each open PO line** is marked by the days of cover at its warehouse:
  - **Must send:** under the Lead Days. It runs out before a shipment could arrive.
  - **Send:** under the Days of cover.
  - **Can wait:** otherwise.
- **What to send first:** all open Swiggy + Zepto PO lines per SKU, compared with our stock in Travalate Inventory (matched by the SKU name in the tab).
- **Stock and days per warehouse:** stock, on the way, open POs, and days with and without the open POs.

**Projections (Platform: Blinkit / Swiggy / Zepto / All)**
- **Swiggy** and **Zepto** (each on its own): open POs per SKU.
  - "Planned + Shipped" also counts POs on the way.
  - **TI stock** comes through the SKU mapping.
  - **Their stock** and **On the way** come from shipped POs not arrived yet.
  - **Monthly sale** = sold per day × 30, from the sales history. **Projection 30 days** = monthly sale × 1.2.
  - Warehouse-wise shows their warehouses: Swiggy cities, Zepto MUM / BLR / CHN / GUR.
- **All:** Blinkit ROs + Swiggy POs + Zepto POs added up per our SKU.
  - Blinkit SKUs are matched by their TI SKU; Swiggy and Zepto codes by their link. Unlinked codes stay on their own row.
  - Warehouse-wise then shows one column per platform.
- The Excel download follows the platform chosen.

**Dashboard**
- Separate **🛵 Swiggy** and **🛵 Zepto** cards above the Items table: open POs, lines that must be sent, PO check warnings and items that run out within the Lead Days. **Open Swiggy / Open Zepto** goes to that platform's tab. The Items table stays Blinkit only.
- In the calendar, with no Blinkit warehouse picked, their POs show on the shipping day (🚚, counted in the load) and on the appointment day (📍).
- Those dates are changed in the sheet.
