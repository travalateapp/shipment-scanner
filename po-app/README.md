# Purchase Order App (Google Apps Script)

A web app that creates purchase orders as PDFs in the company's PO format (the Vertex42 layout: Vendor / Ship To, Requisitioner row, item table, Subtotal / Tax / Shipping / Other / Total).

- **Enter only the basic details:** PO # (filled in automatically), date, vendor, items, quantity and price.
- **Vendors are remembered.** The first time, choose **➕ Add new vendor…** and enter the full details (name, contact person, address, city, phone, email, GSTIN). After that, pick the vendor from the list and all details fill in automatically. Use **Edit vendor details** to change a saved vendor. The change is saved with the next PO.
- **Products and rates are mapped to each vendor.** When you pick a vendor, all of that vendor's products appear with their current rate. **Type the quantity for what you need and save.** Products left at 0 are not ordered.
  - New items you add on a PO are added to that vendor's list automatically.
  - If you change a rate on a PO, it becomes the vendor's new rate for next time.
  - **↻ Repeat last order** copies the quantities of the vendor's previous PO at the current rates. **Repeat** in History does the same for any PO.
- **Vendors screen:** add or edit vendors and their product and rate list before ordering, then tap **Save & new PO**.
- **Our contact person can change.** *Our contact person* and *Contact phone* (in PO details) are printed in the PDF footer. They start with the person used on the last PO. Pick someone used before and their phone fills in, or type a new name and phone. New people are remembered automatically.
- **Works on phone and desktop.** On a computer the order summary stays on the right while you scroll. On a phone each item becomes a card, and the total and **Save** button stay at the bottom of the screen.
- **The PDF downloads straight to the phone or computer** when you save, like any other file (Downloads folder / Files app). Nobody needs a Google account or access to your Drive. A copy is also kept in the owner's Drive (folder *Purchase Orders (PDF)*), and every PO and item is logged in the Sheet.
- **History tab:** recent POs. **Download PDF** downloads the PDF again on any device. **Remake PDF** creates it again, for example after you change company details in Settings.
- **Optional App PIN:** set it in Settings. Each phone or computer asks for it once.

## Install (about 5 minutes)

1. Create a new **Google Sheet**, for example "Purchase Orders".
2. Open **File → Settings** and set the **Time zone**, for example `(GMT+05:30) India Standard Time`.
3. Open **Extensions → Apps Script**.
   - Replace everything in `Code.gs` with the contents of [`Code.gs`](Code.gs).
   - Click **+ → HTML**, name the file **`Index`** (without `.html`), and paste the contents of [`Index.html`](Index.html).
4. Open **Project Settings ⚙** and set the same **Time zone**.
5. Select the function **`setup`** and click **Run**. Allow the permissions when asked (Sheets and Drive).
   This creates the tabs **Settings, Vendors, Vendor Products, Purchase Orders, PO Items** and the Drive folder for PDFs.
6. Open the **Settings** tab and check the values (see below). Make sure **Next PO Number** is correct.
7. Deploy: **Deploy → New deployment → ⚙ → Web app**
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`. Choose this so colleagues can open the app **without requesting access** and without a Google login. Everything still runs under your account, and they never get access to your Sheet or Drive.
   - Click **Deploy**, then share the **Web app URL**. Bookmark it, or add it to the phone's home screen.
8. Set an **App PIN** in the Settings tab (recommended, because the link works for anyone who has it).

> **Already deployed with "Only myself"?** Go to **Deploy → Manage deployments → ✏ Edit**, change **Who has access** to `Anyone`, choose **Version: New version**, and click **Deploy**. The URL stays the same.

> **After changing the code:** paste the new files, then go to **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. The URL stays the same.

## Settings tab

| Setting | Used for |
|---|---|
| Company Name / Address / City / State / Phone / GSTIN | Top-left block of the PO. GSTIN is printed only when filled in. |
| Ship To Name / Contact / Address / City / State / Phone | The **SHIP TO** block |
| Contact Person / Contact Phone | Default person for the footer line "If you have any questions… please contact **Name - Phone**". You can change the person on each PO (see below). |
| Default Comments | Prefilled comment (e.g. *Thank you for your business.*) |
| Default Tax % | Prefilled tax rate (5 % gives 4,650 on 93,000, as in the sample PO) |
| Next PO Number | Suggested PO # for the next order. It moves up automatically, and you can still type another number on the form. Duplicate numbers are rejected. |
| PDF Folder ID | Drive folder for the owner's copy of every PDF. It is created by `setup`, and you can replace it with another folder's ID. |
| App PIN | Leave empty for no PIN. When set, the app asks for the PIN once on each phone or computer. If you change it, everyone is asked again. |

## Sheet tabs

- **Vendors**: one row per vendor (ID `V001`, `V002`, …). You can also add or edit vendors directly here.
- **Vendor Products**: one row per vendor + item with its current **Rate** and when it was last ordered. You can also edit rates directly here.
- **Purchase Orders**: one row per PO with totals and the PDF link.
- **PO Items**: one row per item line of every PO (the full order history).

> **Updating from the first version:** paste both files, run `setup` once more (it adds the Vendor Products tab and fills it from your earlier POs), then deploy a new version.

## Notes

- **Where is the PDF?** On Android and computers it goes to the **Downloads** folder. On iPhone, Safari shows the PDF; tap **Share → Save to Files** (or send it on WhatsApp/email from there). If a download is blocked, tap **Download again** in the green message.
- If the page shows *"Sorry, unable to open the file at present"*, the browser is signed into several Google accounts. Open the link in an incognito/private window.
