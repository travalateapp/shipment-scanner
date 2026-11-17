# Automatic deploy for Inventory, Shipment Manager, Daily Task Sheet and PO

After this is set up, every merge to `main` that changes one of these apps uploads its files to Apps Script and
updates the web app to a new version. The `/exec` link stays the same.

| App | Workflow (Actions tab) | Secrets to add |
|---|---|---|
| Inventory | Deploy Inventory App | `INVENTORY_SCRIPT_ID`, `INVENTORY_DEPLOYMENT_ID` |
| Shipment Manager | Deploy Shipment Manager | `SHIPMENT_SCRIPT_ID`, `SHIPMENT_DEPLOYMENT_ID` |
| Daily Task Sheet | Deploy Daily Task Sheet | `DAILY_TASK_SCRIPT_ID`, `DAILY_TASK_DEPLOYMENT_ID` |
| PO App | Deploy PO App | `PO_SCRIPT_ID`, `PO_DEPLOYMENT_ID` |
| Inventory + Shipment | (both) | `TRAVALATE_SHARED_SECRET` |

An app without its secrets is simply skipped, so you can set them up one at a time.

## One-time setup

1. **Sign-in (`CLASPRC_JSON`)**: if Attendance or Production already deploy automatically, this secret is already
   there. It works for every app owned by (or shared as editor with) that same Google account. If an app belongs
   to another account, share the Apps Script project with the first account as Editor.
2. **For each app**, open its Apps Script project:
   - **Project Settings (⚙) → Script ID**: copy it into the secret `<APP>_SCRIPT_ID`.
   - **Deploy → Manage deployments**: copy the web app's **Deployment ID** (`AKfycb…`) into `<APP>_DEPLOYMENT_ID`.
     Use the deployment people already open, so the link stays the same.
3. **`TRAVALATE_SHARED_SECRET`**: the real value of `SHARED_SECRET` (Inventory) / `INVENTORY_SHARED_SECRET`
   (Shipment Manager), the text between the quotes. The repo has `XXXX` there; the deploy puts the real value in.
   Inventory and Shipment refuse to deploy without it, so the sync never breaks.
4. Add the secrets in GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
5. **Check**: **Actions → Deploy … → Run workflow** with **dry run** ticked. It signs in and checks that every file
   name in the folder exists in Apps Script. Nothing is uploaded.

## File names must match

Each `.gs` / `.html` file in the app folder must have a file with the same name in Apps Script (`Code.gs` ↔
`Code`, `Index.html` ↔ `Index`). If one doesn't match, the deploy stops before uploading and lists the names in
Apps Script; rename one side so they match. Files that are only in Apps Script are left alone.

To stop automatic deploys of one app, delete its `<APP>_DEPLOYMENT_ID` secret.
