# Adding another Apps Script app

1. Make a new folder at the top of the repo named after the app, ending in `-app`, e.g. `stock-app/`.
2. Put in every file from the Apps Script editor with the **same names**:
   - each `.gs` file (e.g. `Code.gs`)
   - each `.html` file (e.g. `Index.html`)
   - optional: `appsscript.json` (Project Settings → "Show appsscript.json")
3. Copy this README into the folder and replace it with: what the app does, which Google Sheet it uses, the web-app
   link (`…/exec`), and the Script ID (Project Settings → Script ID).
4. Add a row to `APPS.md` and to the table in `CLAUDE.md`.

Easiest way: in a Claude chat on this repo, attach the files (or paste them) and say
"add this as `<name>-app`". Claude puts them in the right place, updates `APPS.md`, and pushes to GitHub.

Optional: automatic deploy after every merge, like the attendance and production apps — copy
`.github/workflows/deploy-production-apps-script.yml`, change the folder name and the secret names.
