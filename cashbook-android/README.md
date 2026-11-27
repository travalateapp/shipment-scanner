# Cash Book — Android app

A full-screen Android app for the [Travalate Cash Book](../cashbook-app/README.md): its own icon (Travalate logo on
light indigo), no browser bar, no Google "created by an Apps Script user" bar. Same screens as the web app: Book,
Report, Requests, Settings.

## Install (each phone, once)

1. On the phone, open **https://github.com/travalateapp/shipment-scanner/releases/download/cashbook-apk/CashBook.apk**
2. Open the downloaded file and tap **Install**. If Android asks, allow **Install unknown apps** for the browser.
3. Open **Cash Book**, tap your name and enter your PIN.
   If the app asks to **Connect the Cash Book**, paste the Cash Book web-app link (Apps Script → Deploy → Manage
   deployments → Web app URL, ending in `/exec`) once.

Attachments: **Add photo or PDF** offers the camera (Android 10+; photos are kept in Pictures/Cash Book), the gallery
and files. Excel / PDF reports and downloaded attachments are saved to **Downloads**. Back closes a pop-up, then
goes to the Book tab; press Back twice there to leave.

## Updates

The app carries the Cash Book page inside it. Whenever `cashbook-app/Index.html` (or this app) changes on `main`,
the **Build Cash Book APK** workflow builds a new APK and puts it on the `cashbook-apk` release. Installed apps check
every few hours and offer **Update** (you stay logged in). Server changes (`Code.gs`) need no new APK.

## How it's built

- `app/` — a WebView that serves the bundled page from `https://appassets.androidplatform.net/` and talks to the
  Apps Script web app with `fetch` (`doPost` in `Code.gs`). `MainActivity` adds file picking + camera, saving
  downloads (`window.CashBookApp.saveFile`) and Back (`appBack()` in the page). `Updater` reads only the
  `cashbook-apk` release, never the repository's "latest" release (that one is the Attendance app's).
- `.github/workflows/cashbook-apk.yml` — copies `cashbook-app/Index.html` into `app/src/main/assets/index.html`,
  builds, signs with the same private key as the Attendance app (repository secrets `ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`) and publishes. Pushes to other branches make a test APK only (Actions → the run →
  Artifacts), signed with a throwaway key.
- Repository secret `CASHBOOK_DEPLOYMENT_ID` (the Cash Book's `AKfycb…` Deployment ID, the same secret the
  auto-deploy uses): built into the app so nobody has to paste the link. Without it, the app asks once.
- The web app must be deployed with **Who has access: Anyone** so the app can reach it.
