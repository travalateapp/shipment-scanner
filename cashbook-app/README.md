# Travalate Cash Book (Google Apps Script)

Cash In / Cash Out book for a business, used from a phone or computer.

- **Login with PIN**: tap your name, enter a 4–6 digit PIN. Roles: **Owner** and **Staff**. 5 wrong PINs lock that
  user for 15 minutes. PINs are stored salted + hashed.
- **Entries**: amount, date, time, party name + phone (remembered for autofill), payment mode, category, notes,
  attachments (bill photos / PDFs, up to 10 per entry; big photos are shrunk before upload).
- **Book**: month view with opening balance, total in, total out, net balance, running balance per entry, search and
  filters.
- **Edit Requests**: staff cannot change or delete entries. They send a request with a reason; the owner sees
  old → new and approves or rejects. The owner can edit directly. Deleted entries stay in the sheet (`Deleted` = TRUE).
- **Monthly Report**: opening/closing, day-wise, party-wise, payment-mode and all entries. Download as **Excel**
  (4 sheets) or **PDF** (A4; amounts shown as "Rs." because the PDF font has no ₹ sign).
- **Settings** (owner): add staff and set their PINs, reset PINs, disable staff, business name. Everyone can change
  their own PIN.

| File in Apps Script | File here |
|---|---|
| `Code.gs` | `Code.gs` |
| HTML file `Index` | `Index.html` |

## Google Sheet

Bound to its own Google Sheet (Extensions → Apps Script). Tabs are created on first use: `Users`, `Sessions`,
`Entries`, `Parties`, `EditRequests`, `Settings`. Attachments go to a Drive folder **Cash Book Attachments** in the
owner's Drive; they are not shared publicly and only open inside the app for a logged-in user.

## Setup

1. New Google Sheet → Extensions → Apps Script.
2. Paste `Code.gs`; add an HTML file named `Index` and paste `Index.html`.
3. Deploy → New deployment → Web app. Execute as: **Me**. Who has access: **Anyone**.
4. Open the `/exec` link, enter the business name, owner name and owner PIN. Then add staff in **Settings**.

Web-app link: _(add after the first deployment)_

Deploy updates by hand for now: copy the changed file into the Apps Script editor, then
Deploy → Manage deployments → Edit → New version (same link).
