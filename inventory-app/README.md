# Travalate Inventory App (Google Apps Script)

Stock register per month (Inward / Outward per SKU per day), combos, low-stock alerts and a weekly email report.
Other apps send stock to it through its `doPost`: the Shipment Manager (shipments out) and the Machine Production
App (`productionIn`, `setInProduction`, see `production-app/inventory-app-addon.gs`).

| File in Apps Script | File here |
|---|---|
| `Code.gs` | `Code.gs` |
| `StockSnapshot.gs` | `StockSnapshot.gs` (daily Stock_Snapshot_Log for Looker Studio; run by a daily trigger on `dailyStockSnapshot`) |
| HTML file `InventoryForm` | `InventoryForm.html` |

## Secrets kept out of GitHub
The shared secret between the Inventory App and the Shipment Manager (`SHARED_SECRET` / `INVENTORY_SHARED_SECRET`)
is written as `XXXX` here. The real value stays only in the Apps Script editor. When copying a file from here into
Apps Script, keep the real value that is already there. The automatic deploy fills it in from the GitHub secret
`TRAVALATE_SHARED_SECRET` (see `_new-app-template/AUTO-DEPLOY.md`).
