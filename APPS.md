# Travalate Apps Script web apps

| # | App | Folder | Auto-deploy |
|---|---|---|---|
| 1 | Travalate Inventory App | `inventory-app/` | Yes, once set up (`deploy-inventory.yml`) |
| 2 | Travalate Shipment Manager App | `shipment-app/` (+ Box Scanner page `index.html` at the top) | Yes, once set up (`deploy-shipment.yml`); Box Scanner: GitHub Pages |
| 3 | Travalate Attendance App | `attendance-app/` (+ hosted copy `attendance/`) | Yes (`deploy-apps-script.yml`) |
| 4 | Travalate Daily Task Sheet | `daily-task-app/` | Yes, once set up (`deploy-daily-task.yml`) |
| 5 | PO Web App with Vendor Autofill | `po-app/` | Yes, once set up (`deploy-po.yml`) |
| 6 | Machine Production App (Karigar Production) | `production-app/` (+ hosted copy `production/`) | Yes (`deploy-production-apps-script.yml`) |

How the apps talk to each other: Shipment Manager → Inventory (shipped stock), Production → Inventory
(`productionIn`, `setInProduction`); both use the same shared secret (kept only in Apps Script, `XXXX` here).
Box Scanner page → Shipment Manager web app.

Setup for the four new apps: `_new-app-template/AUTO-DEPLOY.md`. Until it is set up: after a change is merged, copy the changed file into the Apps Script editor and use
Deploy → Manage deployments → Edit → New version (same link).

To add another app, see `_new-app-template/README.md`.

Not an Apps Script app: `walkie-worker/` is the free Cloudflare Worker that carries the Attendance app's **Walkie** tab
(push-to-talk). Setup: `walkie-worker/README.md`.
