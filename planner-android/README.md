# Blinkit Planner — Android app

A full-screen Android app for the [Blinkit Shipment Planner](../blinkit-planner-app/README.md): its own icon (Travalate
logo on yellow), no browser bar, no Google "created by an Apps Script user" bar. It is the same planner page as on the
computer, so everything works the same: Dashboard, New Plan, RO Log, RO PDF, Settings.

## Install (each phone, once)

1. On the phone, open **https://github.com/travalateapp/shipment-scanner/releases/download/planner-apk/BlinkitPlanner.apk**
2. Open the downloaded file and tap **Install**. If Android asks, allow **Install unknown apps** for the browser.
3. Open **Blinkit Planner** and log in with your planner User ID and PIN.
   If the app asks to **Connect the planner**, paste the planner's web-app link (Apps Script → Deploy → Manage
   deployments → Web app URL, ending in `/exec`) once.

Files: choosing the Inventory / Bulk RO / R.O. PDF files opens the phone's file picker; the Blinkit Bulk RO files and
the plan Excel are saved to **Downloads**. Back closes a pop-up, then goes to the Dashboard; press Back twice there to leave.

## Updates

The app carries the planner page inside it. Whenever `blinkit-planner-app/Index.html` (or this app) changes on
`main`, the **Build Planner APK** workflow builds a new APK and puts it on the `planner-apk` release.
Installed apps check every few hours and offer **Update**; one tap on Android's install screen and it's done (you
stay logged in and the plan is kept). Server changes (`Planner.gs`) need no new APK.

## How it's built

- `app/` — a WebView that serves the bundled page from `https://appassets.androidplatform.net/` and talks to the
  Apps Script web app with `fetch` (like the GitHub Pages copy). `MainActivity` adds file picking, saving downloads
  (`window.PlannerApp.saveFile`) and Back (`appBack()` in the page). `Updater` reads only the `planner-apk` release,
  never the repository's "latest" release (that one is the Attendance app's).
- `.github/workflows/planner-apk.yml` — copies `blinkit-planner-app/Index.html` into `app/src/main/assets/index.html`,
  builds, signs with the same private key as the Attendance app (repository secrets `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`) and publishes. Pushes to other branches make a test APK only (Actions → the run →
  Artifacts), signed with a throwaway key.
- Repository secret `PLANNER_DEPLOYMENT_ID` (set 21 Nov 2026) (the planner's `AKfycb…` Deployment ID): built into the app so
  nobody has to paste the link. Without it, the app asks once.
