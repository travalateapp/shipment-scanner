# Travalate Shipment Manager (Google Apps Script)

Shipments, box scanning, employees with PINs and an AI assistant (Gemini; key in Script Properties
`GEMINI_API_KEY`, never in the code). Shipped stock is sent to the Inventory App's `doPost`.
The Box Scanner page at the top of this repo (`/index.html`, GitHub Pages) calls this web app.

| File in Apps Script | File here |
|---|---|
| `Code.gs` | `Code.gs` |
| HTML file `Index` | `Index.html` |

## Secrets kept out of GitHub
The shared secret between the Inventory App and the Shipment Manager (`SHARED_SECRET` / `INVENTORY_SHARED_SECRET`)
is written as `XXXX` here. The real value stays only in the Apps Script editor. When copying a file from here into
Apps Script, keep the real value that is already there. The automatic deploy fills it in from the GitHub secret
`TRAVALATE_SHARED_SECRET` (see `_new-app-template/AUTO-DEPLOY.md`).
