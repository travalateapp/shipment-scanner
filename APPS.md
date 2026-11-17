# Travalate Apps Script web apps

| # | App | Folder | Auto-deploy |
|---|---|---|---|
| 1 | Travalate Inventory App | `inventory-app/` | – |
| 2 | Travalate Shipment Manager App | `shipment-app/` (+ Box Scanner page `index.html` at the top) | Box Scanner: GitHub Pages |
| 3 | Travalate Attendance App | `attendance-app/` (+ hosted copy `attendance/`) | Yes (`deploy-apps-script.yml`) |
| 4 | Travalate Daily Task Sheet | `daily-task-app/` | – |
| 5 | PO Web App with Vendor Autofill | `po-app/` | – |
| 6 | Machine Production App (Karigar Production) | `production-app/` (+ hosted copy `production/`) | Yes (`deploy-production-apps-script.yml`) |

How the apps talk to each other: Shipment Manager → Inventory (shipped stock), Production → Inventory
(`productionIn`, `setInProduction`); both use the same shared secret (kept only in Apps Script, `XXXX` here).
Box Scanner page → Shipment Manager web app.

Apps without auto-deploy: after a change is merged, copy the changed file into the Apps Script editor and use
Deploy → Manage deployments → Edit → New version (same link).

To add another app, see `_new-app-template/README.md`.
