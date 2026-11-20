# Travalate Warehouse — Raw Material Stock & Daily Ledger (Google Apps Script)

One web app with three parts:

1. **Raw material stock**: a list of materials (code, category, unit, rack, minimum level, opening stock),
   **Stock IN** (received from a supplier, with an optional rate) and **Stock OUT** (issued to a karigar, machine
   or department). Live stock = opening + IN − OUT ± count corrections. Low-stock alerts, stock value at the last
   purchase rate, history with filters, CSV export, and a **Stock Count** screen: type in what you physically
   counted and the system stock is corrected (the difference is saved as a `COUNT` entry, so nothing is lost).
   Stock OUT is refused if there isn't enough stock.
2. **Employee logins**: username + password (stored hashed, never in plain text), stay signed in for 30 days.
   Roles:
   - **admin**: everything, plus Employee Logins, Settings and the Activity Log
   - **manager**: add or edit materials, stock count, edit and delete entries
   - **staff**: add Stock IN/OUT and ledger entries; view everything else, cannot edit or delete
   The admin can switch a login off or reset its password. Every action is written to the Activity Log.
3. **Daily ledger** (cash book): Money IN / Money OUT entries per day with category, party, mode
   (Cash / Bank / UPI / Cheque / Other) and bill no. Each day shows opening balance → IN → OUT → closing balance,
   carried forward day to day. The **Ledger Report** shows a date range day by day and by category, with CSV.
   A Stock IN can also add the purchase payment to the ledger in one step ("Paid now").

Works on phones (bottom menu) and computers (side menu).

| File in Apps Script | File here |
|---|---|
| `Code.gs` | `Code.gs` |
| HTML file `Index` | `Index.html` |

## Google Sheet

The app uses the Google Sheet it is attached to. These tabs are created automatically the first time:
`Users`, `Sessions`, `Materials`, `StockMoves`, `Ledger`, `Settings`, `ActivityLog`. Don't rename the tabs or the
header row. Only share the Sheet with people you trust: it holds every entry (passwords are only stored as hashes).

## First-time setup

1. Create a new Google Sheet (e.g. "Travalate Warehouse"), then **Extensions → Apps Script**.
2. Replace the code in `Code.gs` with this folder's `Code.gs`.
3. **+ → HTML**, name it `Index`, and paste this folder's `Index.html`.
4. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**. Allow the permissions.
5. Open the `/exec` link. The first screen creates the **admin** login. Then:
   - **Settings**: company name and the ledger's opening balance (and start date, if you want).
   - **Employee Logins → + Add employee** for each person (username, password, role).
   - **Raw Material Stock → + Add material** for each material, with today's stock as the opening stock
     (or add them with 0 and do a **Stock Count**).

Web-app link: _add the `/exec` link here once deployed_
Script ID: _add it here (Project Settings → Script ID)_

## Updating

Automatic deploy (same as the other apps): add the secrets `WAREHOUSE_SCRIPT_ID` and `WAREHOUSE_DEPLOYMENT_ID`
(see `_new-app-template/AUTO-DEPLOY.md`); after that every merge to `main` that changes this folder updates the
web app (`.github/workflows/deploy-warehouse.yml`). Until then: copy the changed file into the Apps Script editor
and use **Deploy → Manage deployments → Edit → New version** (the link stays the same).
