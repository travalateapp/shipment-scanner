# Travalate Apps Script web apps

| # | App | Folder | In repo? | Auto-deploy |
|---|---|---|---|---|
| 1 | Travalate Inventory App | `inventory-app/` | ⏳ Not yet (only the add-on block: `production-app/inventory-app-addon.gs`) | – |
| 2 | Travalate Shipment Manager App | `shipment-app/` | ⏳ Partly: the Box Scanner page is `index.html` (root); the Apps Script code is not yet in | GitHub Pages (Box Scanner) |
| 3 | Travalate Attendance App | `attendance-app/` (+ hosted copy `attendance/`) | ✅ | Yes (`deploy-apps-script.yml`) |
| 4 | Travalate Daily Task Sheet | `daily-task-app/` | ⏳ Not yet | – |
| 5 | PO Web App with Vendor Autofill | `po-app/` | ⏳ Not yet | – |
| 6 | Machine Production App (Karigar Production) | `production-app/` (+ hosted copy `production/`) | ✅ | Yes (`deploy-production-apps-script.yml`) |

How the apps talk to each other: Production → Inventory (`productionIn`, `setInProduction`, using the same
`SHARED_SECRET` as the Shipment Manager); Box Scanner page → Shipment Manager web app.

To add another app, see `_new-app-template/README.md`.
