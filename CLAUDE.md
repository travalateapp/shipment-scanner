# All Google Apps Script web apps — one repo

This repository is the single home for every Google Apps Script web app. Every Claude session on this repo starts
with all the code already here, so there is no need to re-upload `Code.gs` / `.html` files in a new chat.

## Layout

| Folder | App | Notes |
|---|---|---|
| `index.html` (root) | Box Scanner page of the Travalate Shipment Manager | Static page (GitHub Pages) |
| `attendance-app/` | Employee Attendance & Salary | `Code.gs` + `Index.html`; auto-deploy: `.github/workflows/deploy-apps-script.yml` |
| `attendance/` | Hosted copy of `attendance-app/Index.html` (GitHub Pages) | Keep identical to `attendance-app/Index.html` |
| `production-app/` | Machine Production App (Karigar Production) | `Code.gs` + `Index.html` (+ `inventory-app-addon.gs`); auto-deploy: `.github/workflows/deploy-production-apps-script.yml` |
| `production/` | Hosted copy of `production-app/Index.html` (GitHub Pages) | Keep identical to `production-app/Index.html` |
| `android/` | Android wrapper app (APK built by `.github/workflows/android-apk.yml`) | |
| `inventory-app/` | Travalate Inventory App | `Code.gs`, `StockSnapshot.gs`, `InventoryForm.html` |
| `shipment-app/` | Travalate Shipment Manager (Apps Script side) | `Code.gs` + `Index.html` |
| `daily-task-app/` | Travalate Daily Task Sheet | `Code.gs` + `Index.html` |
| `po-app/` | PO Web App with Vendor Autofill | `Code.gs` + `Index.html` |
| `_new-app-template/` | How to add another app | |

The full list with links is in `APPS.md`. Keep it up to date when an app is added.

## Conventions

- One folder per app, named `<name>-app/`, containing the Apps Script files exactly as they are in the Apps Script
  editor: `Code.gs` (and any other `.gs` files) and the `.html` files, with the same file names.
- Each app folder has a `README.md`: what the app does, the Google Sheet it uses, the web-app link, and how it is
  deployed.
- When changing an app, edit only that app's folder (and its hosted copy, if it has one).
- Never commit passwords, API keys or `.clasprc.json`; deploy sign-ins live in GitHub repository secrets.
- Secrets are written as `XXXX` in the repo (e.g. the Inventory/Shipment `SHARED_SECRET`); the real values live
  only in Apps Script (or Script Properties). Never put a real value back into a file here.
