# Employee Attendance & Salary App (Google Apps Script)

A mobile-friendly web app that runs on a Google Sheet. It lets employees:

- **Check in and check out** only when they are within **30 m of the office**, checked by GPS.
- **Face recognition** (once an admin has registered the employee's face): Check In / Check Out open the camera, the face is matched on the phone in about a second and the attendance is marked at once — no selfie. A small proof photo of each scan is kept (deleted with the selfies after *Keep Selfies (days)*). GPS is still checked. If the face is not recognised in ~12 seconds (or *Use selfie instead* is tapped), the usual selfie is used. Employees without a registered face use the selfie as before.
- **Check in again** after checking out (went out for a few hours and came back) — **only through the guard or an admin** (Mark Attendance → *In again*); the employee sees "Check in again with the guard or an admin" and can do the final check-out from their own phone. The time away is saved in the *Breaks* column (e.g. `13:00-15:30`) and is **not counted as worked**. Late still uses the first check-in, early leaving the last check-out; everything else is calculated as usual. No second selfie; the location is checked again. Guards see **In again** for such people. Admins see and edit each return as a "Check in again" / "Check out" pair in the entry editor.
- **Take a selfie at check-in** with the live front camera. Photos are saved to a Google Drive folder.
- **See their month**: pick any month and see a colour-coded calendar (Absent, Half Day, OT, Late). The month view also shows late and early-leaving minutes, net OT, advance recovery and the salary breakdown with PF and one **Total Salary** figure. The In Bank / In Cash split is shown only to admins who have permission to see it.
- **Download a payslip** (PDF or print) for any month.
- **Send requests:** leave and attendance corrections (forgot to check in or out). The admin decides whether a leave is paid or unpaid.
- **Change their own PIN.**
- **Use the app only to check in and to check out.** Nothing runs in the background and there is no tracking during the day. Location is checked only at the moment of check-in and check-out.
- **Keep the phone clock on automatic.** If the phone's time or time zone is wrong, the app blocks check-in/out. Recorded times always come from Google's server, not the phone.

Admins (with the permissions a super admin gives them) get these screens:

| Screen | What it does |
|---|---|
| Today | **Missed check-outs on top**, live attendance with selfies, and **⚠ flags** on suspicious check-ins |
| Monthly Summary | Month totals for all employees: **total payment (In Bank / In Cash / non-PF)**, presents, absents, half days, late, OT, **PF employee + employer + total deposit**, and a per-employee table |
| Payroll | Every employee's salary and PF (bank/cash split with permission); **lock the month**; **download the payroll as an Excel file** (.xlsx, with a totals row) |
| Requests | Approve or reject leave, corrections and OT |
| Entries | Back-dated entries for one day, or bulk-fill many days |
| Employees | Add employees, change salary and details, deactivate, reset PINs |
| Advances | Give an advance and recover it in monthly instalments |
| PF Setup | Turn PF on or off per employee and set the amounts |
| Admins *(super admin only)* | Make admins and choose what each one may do |
| Activity *(super admin only)* | Everything admins changed |

No Google account is needed for employees. They log in with **Employee ID + PIN**.

---

## 1. Install (about 10 minutes)

1. Create a new **Google Sheet**, for example "Attendance".
2. Open **File → Settings** and set the **Time zone** to your local zone, for example `(GMT+05:30) India Standard Time`.
3. Open **Extensions → Apps Script**.
4. Copy the code into the editor:
   - Replace everything in `Code.gs` with the contents of [`Code.gs`](Code.gs).
   - Click **+ → HTML**, name the file **`Index`** (exactly, without `.html`) and paste the contents of [`Index.html`](Index.html).
5. Open **Project Settings ⚙** and set the **Time zone** to the same zone as the Sheet.
6. Back in the editor, select the function **`setup`** and click **Run**. Allow the permissions when asked: Sheets, Drive and external pages.
   This creates all the tabs (Settings, Employees, Attendance, Holidays, Requests, Advances, Payroll Locks, Payroll Snapshots, Admin Permissions, Audit Log) and a Drive folder for selfies.
7. Fill in the Sheet (see section 2).
8. Deploy the app:
   - Click **Deploy → New deployment → ⚙ → Web app**.
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
   - Click **Deploy** and copy the **Web app URL**.
9. Send the URL to employees. On their phone, they open it in **Chrome** (Android) or **Safari** (iPhone) and tap **⋮ / Share → Add to Home Screen** to use it like an app.

> **Updating from an earlier version:** paste both files, run `setup` again (it only adds what is missing and never deletes data), then go to **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. This keeps the same URL.

### Recommended: open the app from GitHub Pages (works with several Google accounts)
Chrome shows *"Google Drive – Sorry, unable to open the file at present"* for `script.google.com/macros/...` links when the phone is signed into more than one Google account. This is a Google bug. To avoid it, the same page is also published on GitHub Pages and talks to your Apps Script in the background, without any Google login:

1. Merge this branch into `main`. GitHub Pages publishes `attendance/index.html`.
2. Copy your **deployment ID** from **Deploy → Manage deployments**. It's the long `AKfycb…` text above the Web app URL.
3. Share this link with everyone:
   ```
   https://travalateapp.github.io/shipment-scanner/attendance/?id=YOUR_DEPLOYMENT_ID
   ```
   The phone remembers the ID after the first visit, so **Add to Home Screen** works too.

GPS, the camera and PDF downloads also work better this way, because the page is not inside Google's frame.
**After each code update:** paste `Code.gs` into Apps Script and redeploy (**Edit → New version**, which keeps the same ID). Then copy `attendance-app/Index.html` to `attendance/index.html` in GitHub (the two files are identical).

---

### Android app (APK) for employees
GitHub builds a signed Android app that opens your attendance app full-screen. It has its own icon, keeps employees logged in, and needs no Chrome tab.
1. On GitHub open **Actions → Build Android APK → Run workflow**.
2. Paste **your app link**: the GitHub Pages link with `?id=…` that employees already use. The Apps Script `/exec` link or just the deployment ID (`AKfycb…`) also work.
3. Click **Run workflow**. After about 5 minutes, a new **Release** appears with **Attendance.apk**.
4. **Share this link with employees.** It always gives the newest APK:
   `https://github.com/travalateapp/shipment-scanner/releases/latest/download/Attendance.apk`
5. **Employees install it:**
   - Open the link and download the APK.
   - Tap the file. If Android asks, allow **"Install unknown apps"** for Chrome / Files.
   - Tap Install, then allow **Location** and **Camera** when the app asks.

**Updates install themselves (almost):**
- Each APK built by the workflow checks GitHub every few hours. When a newer APK is published, the app asks **"Update available → Update"**, downloads it and opens Android's install screen. The employee taps **Update** and stays logged in.
- The first time, Android asks to allow **"Install unknown apps"** for this app.
- Android never allows a completely silent update outside the Play Store.
- The home screen in the app shows **"App 1.N · Check for update"** to check by hand.
- Employees on an APK older than this feature must install the new APK once from the link. After that, updates come by themselves.

**Making an update compulsory:** in the Settings tab, set **Min Android App Version** to the version everyone must have. The version is the number N in *"App 1.N"* at the bottom of the app's home screen, or in the release name *"Attendance app 1.N"*.
- Phones on an older APK see a full-screen **"Please update the app"** with **Update now**:
  - Apps with the built-in updater download the update and open the installer.
  - Older apps open the download link.
- 0 = no minimum. iPhone users and browsers are never blocked, because they always have the latest version.
- The two settings rows (*Min Android App Version*, *Android App Link*) appear after **Attendance App → Run setup / repair sheets**. You can also add them to the Settings tab by hand.

**When you need a new APK:**
- Changes to the app's screens reach the APK by themselves, because it loads the live page. You don't need a new APK for those.
- Build again (steps 1–3) only if the app link (deployment ID) changes. Employees install the new APK over the old one, and their data is kept.

Inside the app:
- Payslip PDFs and the payroll Excel file are saved to **Downloads**.
- **Print** opens Android's print screen, which can also save as PDF.
- The phone's **Back** button closes a pop-up first, then goes back to the previous screen. On the first screen, press **Back twice** to leave the app.

**Signing key (private):** every APK must be signed with the same key, or phones refuse to install it as an update.
- The key is **not** in this public repository. It lives only in the repository secrets **ANDROID_KEYSTORE_BASE64** (the keystore file in base64) and **ANDROID_KEYSTORE_PASSWORD**, under GitHub → Settings → Secrets and variables → Actions.
- Building the app for employees stops with a clear message if they are missing.
- **Keep a copy of the keystore file and its password somewhere safe** (e.g. a password manager). Without them no update can be installed over the app, and everyone would have to reinstall.
- Apps signed with the old public key (1.10 and earlier) can't update to the new key. Those employees **uninstall the app once** and install it again from the link, then log in again.

### iPhone employees (no APK needed)
The APK works only on Android. iPhone users install the same app from Safari, and it then opens full-screen with its own **Attendance** icon:
1. Send them the GitHub Pages link with `?id=…`, the same one Android users get in the APK.
2. Open it in **Safari**. The login screen shows a blue tip.
3. Tap the **Share** button ⬆ → **Add to Home Screen** → **Add**.
4. From now on, open the app from the **Attendance** icon. **Log in once inside the icon**, because the icon keeps its own login, separate from Safari.
5. Allow **Location** and **Camera** when asked. If they were refused, go to iPhone **Settings → Privacy & Security → Location Services → Safari Websites → While Using**, and **Settings → Safari → Camera → Allow**.

Changes to the app reach iPhones automatically too.

## 2. Fill the Sheet

### Settings tab

| Setting | Default | Meaning |
|---|---|---|
| Company Name | My Company | Shown in the app and on payslips |
| **Office Latitude / Longitude** | *(empty)* | In Google Maps, **right-click your office → click the coordinates** to copy them |
| Allowed Radius (m) | **30** | How close to the office an employee must be |
| Max GPS Accuracy (m) | 50 | GPS readings less accurate than this are rejected |
| Flag GPS Accuracy Above (m) | 35 | Less accurate check-ins are flagged for admins |
| Check Location On Check-Out | Yes | Also require being at the office when checking out |
| Selfie Required | Yes | A selfie is needed at check-in |
| Live Camera Only | No | `Yes` = no gallery photos at all. **Test on your phones first**, then switch on |
| Shift Start | 09:30 | Used for late marking. Shift end = start + Standard Hours |
| Late Grace (min) | 10 | A check-in after 09:40 counts as **Late** |
| Standard Hours | **9** | Hours beyond this are OT |
| Full Day / Half Day Min Hours | 8 / 4 | 8 h or more = full day, 4–8 h = **Half Day**, under 4 h = **Absent** |
| No Check-Out Counts As | HALF_DAY | How a day that was auto-checked-out at midnight counts until an admin fixes it |
| Allow Overnight Shift | No | `Yes` = a check-out after midnight closes the previous day |
| Max Shift Hours | 16 | Longest shift allowed with overnight on |
| Salary Days Basis | **30** | Per day = salary ÷ 30, per hour = per day ÷ 9, per minute = per hour ÷ 60 |
| OT Multiplier | **1.5** | OT pay = OT minutes × per-minute rate × 1.5. **Set `1` for the normal rate** |
| OT Block (min) | 0 | Only for weekly-off / holiday OT. `0` counts every minute, `30` full 30-minute blocks |
| Max OT Per Day (min) | 0 | Only for weekly-off / holiday OT. Cap per day (`0` = no cap) |
| OT Needs Approval | No | Only for weekly-off / holiday OT: `Yes` = it counts after an admin approves it |
| Late Minutes Reduce OT | Yes | Not used any more: coming late already lowers the time worked in the month |
| Early Leaving Reduces OT | Yes | Not used any more: leaving early already lowers the time worked in the month |
| Weekly Off | Sunday | For example `Sunday` or `Saturday,Sunday` |
| Off-Day Work Is OT | Yes | Holidays (and weekly offs when *Week-Off Full Day Hours* = 0): all hours worked count as OT |
| Week-Off Shift Start | 09:30 | Working on the weekly off (Sunday): start of the day hours |
| Week-Off Shift End | 17:00 | End of the day hours. Time before the start or after the end is OT |
| Week-Off Half Day Hours | 3 | Hours inside 09:30–17:00 that earn **half a day's extra pay** |
| Week-Off Full Day Hours | 6 | Hours inside 09:30–17:00 that earn **a full day's extra pay** (0 = old rule: all hours are OT) |
| Lates Per Half-Day Cut | 0 | Optional extra penalty: every N late marks deduct half a day (`0` = off) |
| Phone Time Tolerance (min) | 3 | Check-in is blocked if the phone clock is off by more than this |
| Default PF Bank Salary % / Employee % / Employer % | 90 / 12 / 13 | Used when the PF boxes are blank |
| OT & Deductions Paid In | CASH | For PF employees, which part absorbs OT, leave and advance deductions |
| Round To Rupee | Yes | Salary amounts in whole rupees |
| Admin Back-Date Limit (days) | 45 | How far back admins can change entries (super admin: no limit) |
| Request Back-Date Limit (days) | 7 | How far back employees can request corrections or leave |
| Stay Logged In (days) | 30 | People stay logged in this long after they last used the app. Resetting someone's PIN logs them out |

### Employees tab

| Emp ID | Name | PIN | Monthly Salary | Role | Active | Join Date | Phone | PF Active | PF Bank Salary | PF Employee | PF Employer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E001 | Owner Name | 4821 | 30000 | SUPER_ADMIN | Yes | 2026-01-01 | | No | | | |
| E002 | Ravi Kumar | 1111 | 15000 | EMPLOYEE | Yes | 2026-03-15 | | Yes | 13500 | 1721 | 1755 |

- You can add employees here or in the app (**Admin → Employees**).
- **PINs are encrypted (hashed) automatically.** A PIN typed into the sheet works once, and is replaced by a code like `sha256$…` after that employee's first login. To reset a PIN, use **Admin → Employees → Edit → Reset PIN**, or type a new plain PIN into the sheet.
- Role is `EMPLOYEE`, `ADMIN`, `SUPER_ADMIN` or `GUARD` (see section 4). A guard's salary can be left empty.
- **Someone leaves:** untick **Active** and enter their **last working day**.
  - From the next day they are gone from **Mark Attendance**, **Today** and the payroll / summary / export of months they didn't work.
  - The month they left shows with salary only up to that day. Earlier months are unchanged.
  - They can't log in.
- **Someone comes back:** tick **Active** and enter the date they **start again**. Salary and attendance count from that day, and the days in between are *Inactive* (not paid).
- Every period is kept in the **Employment History** tab (`Emp ID | From | To`) and shown in the employee's edit form.
- **Salary increment:** don't change Monthly Salary. Open the employee and use **Salary increment**: the amount (minus for a decrease), the **month it starts**, and an optional note.
  - From that month the salary is the original + all increments up to then. **Earlier months are not affected**, and a locked month can't get an increment.
  - Increments are kept in the **Salary Increments** tab. *Monthly Salary* in the Employees tab stays the original salary.
  - Remove a wrong increment with **Remove**, as long as its month isn't locked.
- **Mark From Anywhere** (the last column, added automatically): `Yes` lets an employee who works **outstation** check in and out from anywhere. Set it in the app under **Admin → Employees → (employee) → "Can mark from anywhere (outstation)"**.
  - Their **GPS location is still required and saved** with every check-in and check-out, and the selfie rules are the same. Only the office distance and GPS-accuracy limits are skipped.
  - When they are away from the office, the entry gets a 📍 *Checked in / out outside office* tag, and Admin → Today shows the distance (e.g. "1146.9 km"). These entries are not counted as suspicious.
  - Turn it off again when they are back at the office. Guards marking for others must still be at the office.

### Own work timing / no hourly OT (per employee)
Go to **Admin → Employees → (employee) → Work timing**. These are saved in the *Shift Start*, *Shift End* and *Hourly OT* columns:
- **Shift start / end** (e.g. 11:00–19:00): late marks, early leaving and OT use this person's times instead of the company shift. Leave both empty for the company shift.
  - Their **hourly rate** = per-day ÷ their shift hours.
  - The **full / half-day minimums** scale with the shift length. With the company 9 h shift and 8 h / 4 h minimums, an 8 h shift needs 7.1 h / 3.6 h.
- **Morning OT** unticked: coming before the shift start doesn't count as OT; only time **after the shift end** does (evening OT).
- **Hourly OT** unticked: no OT for extra hours on working days. **Sunday / week-off work is still paid** (day pay plus OT outside 09:30–17:00), and holidays still follow *Off-Day Work Is OT*.
- **Cut late coming / early leaving from salary** (only when Hourly OT is unticked; default ticked, the *Late Cut* column): on a full day, the minutes short of the shift are cut from the salary by the minute (salary ÷ 30 ÷ shift hours ÷ 60). Example: ₹40,000, shift 09:00–19:00, worked 09:58–19:05 → 53 min short → ₹118. Untick it for employees whose late coming should not be cut. With Hourly OT on, short time is taken from the month's OT instead.
- **Gender** (Male / Female, the *Gender* column): used for the **top OT leaders** on the home screen.
  - Men see the men's top 3 and women the women's top 3, ranked by **net OT this month**: time worked beyond the shift on full days (late coming and early leaving already taken off) plus Sunday / holiday OT. OT earned on days they left early (the extra time on a half day, the hours of a day counted Absent) is **not** counted for the leaderboard, though the salary still pays it. It refreshes every 15 minutes.
  - On the **1st–5th of each month** the card shows only **last month's champion** (the name, with fireworks), then the new month's top 3 again.
  - **Super admins choose who is ranked:** Employees → *🏆 Choose OT leaderboard employees* (the *In Leaderboard* column; blank = Yes). Employees left out still see the board.
  - Employees without a gender (shown as *Gender not set* in the Employees list) don't see the card and are not ranked.
  - **Admins:** the super admin ticks *Men's Leaders Card* and / or *Women's Leaders Card* for each admin (Admin → Admins). Both unticked = only the card of their own gender. Super admins see both.

### Face recognition
- **Register:** Admin → Employees → Edit → **🙂 Face recognition → 📷 Register face**, with the employee in front of the camera in good light (5 quick scans are averaged). Only admins can register; the same face cannot be registered for two employees. **Remove** sends the employee back to the selfie.
- Only a 128-number "face fingerprint" is stored (tab **Faces**) plus a small reference photo in the selfie folder. Tell employees and take their consent (India's DPDP Act).
- **Guard's phone:** Mark Attendance → **🙂 Scan faces**. The camera stays on; every recognised employee is marked at once — Check In, Check Out or In again from their status — with a proof photo. The same person isn't marked again for 2 minutes. Unknown faces: close it and use the list (with photo) as before.
- **Speed:** the face models (~7 MB) download once per phone from jsDelivr and stay cached; after that a scan takes well under a second on a normal phone.
- **Setting:** *Face Match Max Distance* (default 0.42): lower = stricter. Same person is usually 0.1–0.35, different people from about 0.48. The guard's scanner also needs the best match to be clearly closer than the next person and to show up in 2 looks in a row. It isn't a liveness check: a good photo of someone could fool it, so the proof photos are kept.
- Admin → Today shows **🙂 Check-in by face / Check-out by face** and both proof photos.

### 🔄 Refresh everyone's app (super admin)
- **Admin → Admins → 🔄 Refresh all phones now.** Press it after merging an update (wait about 10 minutes for GitHub Pages to publish it).
- Every phone reloads the newest app the next time it is used, for example when someone opens it again or switches tabs. People stay logged in.
- It never reloads during a check-in or while a pop-up is open.
- Phones still on a version from before this button existed can't reload by themselves. On their next action they see "A new version of the app is ready. Please close the app and open it again" (in English and Hindi).

### Celebrations (festival animations)
- **Admin → Holidays → 🎉 Celebrations**: choose the dates (one day or From–To), an **animation** — 🎆 Fireworks, 🎊 Confetti, 🪔 Diyas (Diwali), 🌼 Flower petals (Dussehra / Navratri), ❄️ Snowfall (Christmas), 🎈 Balloons, ✨ Sparkles (New Year) — the **duration** (2–60 seconds) and an optional **message** (e.g. "Happy Diwali! 🪔"). **▶ Preview** shows it at once.
- On those days the animation plays over the app (with the message at the top) each time someone opens it — employees, admins and guards. The app stays usable while it plays. It replaces the monthly champion's fireworks on the same day. Saved in the **Celebrations** tab.
- **🏹 Dussehra animation:**
  - Lord Rama draws his bow and shoots a flaming arrow into the Ravana effigy (ten heads).
  - The effigy catches fire, bursts with a big bang (flash, shaking screen, flying pieces), and heavy fireworks fill the sky.
  - It always runs at least 10 seconds. With no message, the banner says "🏹 Happy Dussehra! 🔥".
- **Reopening the app:** employees don't need to clear the app from recent apps. When they come back to it after 5 minutes or more (or on a new day), it refreshes and plays today's celebration again.
- **Music:** each celebration can also play a tune. **Indian:** 🪔 Diwali shehnai, 🔔 Aarti (bells & shankh – Puja, Dussehra, Ganesh Chaturthi), 💃 Garba / Dandiya (Navratri), 🥁 Dhol – Bhangra (Lohri, Baisakhi), 🌈 Holi (bansuri & dholak). These are our own raag-style compositions, so there is no copyright issue. **Others:** 🔔 Festive chime, 🎺 Celebration fanfare, 🎂 Happy Birthday, 🎄 Jingle Bells, 🥂 Auld Lang Syne, or 🔇 none. The app plays these itself, so no music files are needed. Phones and browsers allow sound only after a tap, so a **🔊 Tap for music** button appears. Any tap starts the music, and **🔇 Stop music** turns it off. If nobody taps before the animation ends, the music is skipped.

### Birthdays
- **Admin → Employees → Edit → Birth date.** It is saved in the **Birth Date** column.
- On an employee's birthday, **between 9:00 AM and 3:00 PM**, **everyone** who opens the app sees the birthday animation (🎈 balloons with the 🎂 Happy Birthday tune by default). This includes the employee, other employees, admins and guards.
- **The employee** sees "🎂 Happy Birthday, Ankit! 🎉" with a wishes card.
- **Everyone else** sees "🎂 Today is Ankit's birthday".
- Only the day is shown. The age and the year never are.
- A birthday comes before a festival celebration and before the champion's fireworks on the same day.
- Someone born on 29 Feb is celebrated on 28 Feb in other years.
- **Settings tab** (optional rows):
  - **Birthday Animation**: fireworks, confetti, diyas, petals, snow, balloons or sparkles. Blank means the card only, with no animation.
  - **Birthday Music**: the tune.
  - **Birthday Seconds**: the duration (10 by default).
  - **Birthday Wishes From / Till**: the times the wishes are shown (09:00 and 15:00 by default).
- **How the timing works:**
  - Before 9:00 nothing shows. If the app is already open at 9:00, the wishes start by themselves.
  - Every time someone opens the app or the link before 3:00 PM, the animation plays again. Coming back to the app from the background after 5 minutes or more also replays it.
  - At 3:00 PM the card disappears.

### Holidays (national / festival)
- **Who:** admins with the **Manage Holidays** permission (super admins always) add holidays in **Admin → Holidays**. Each has a date, a name and a type: National, Festival or Company.
- **Effect:** on a holiday nobody is marked absent and the day is paid. Anyone who works gets the holiday OT rule. Past dates can be added too, and the months are recalculated, except locked months.
- **Edit / delete:** from the list. Deleting a holiday makes days without attendance count as absent again.
- **Employees** see the next holidays (45 days ahead) on their home screen, and holiday names in their calendar.
- **In the sheet:** the **Holidays** tab (`Date | Holiday Name | Type`) can still be edited by hand.

---

## 3. How salary is calculated

```
Per day    = Total Salary ÷ 30
Per hour   = Per day ÷ 9
Per minute = Per hour ÷ 60

Late minutes  = check-in − Shift Start         (only on days marked Late)
Early minutes = shift end − check-out          (on present days)
Working time  = full days × Standard Hours × 60     (full day = Present on a working day; absent days,
                                                      half days (see below), paid leave and days without check-out are left out)
Time worked   = check-out − check-in on those days  (Morning OT off: counted from Shift Start)
OT mins       = Time worked − Working time (never below 0)
              + on half days: time beyond half the shift (a 6 h half day adds 1.5 h; less than 4.5 h adds 0)
              + on days counted Absent because of too few hours: all the time worked (e.g. 3h 39m),
                while the day's salary is still cut. An Absent / Leave set by an admin adds nothing
              + weekly-off / holiday OT
OT pay        = OT mins × Per minute × OT Multiplier

Leaves     = Absent days × Per day
Half Days  = Half days × ½ × Per day
Gross      = Total Salary + OT pay − Leaves − Half Days
Net        = Gross − advance instalment (− PF Employee for PF employees)
```

**OT example (October: 27 working days, all present, 9 h shift):** working time = 27 × 9 h = 243 h.
Worked 250 h on those days → OT = 7 h. Late coming and early leaving are already inside the 250 h, so they are not cut again.
Absent and half days do not cut OT: their salary is already cut. A half day is paid for 4.5 h, so time beyond that is OT. Work on a Sunday / holiday is paid by its own rule (+1 or +½ day) and the time
outside 09:30–17:00 is added to the OT. Employees with *Hourly OT* off get only the Sunday / holiday OT.

**Current month:** the salary is shown only for the days that have passed: Monthly Salary × days passed ÷ days in the month. Today counts once the employee has checked in. PF and Basic Salary are counted for the same days. The amount grows every day, and once the month is over it is the full month's salary. The Monthly Summary and payslips work the same way.

**Employees with PF:**

| | Example: ₹15,000, full month |
|---|---|
| Total Salary | 15,000 |
| OT / Leaves / Half Days | per calculation |
| PF Employee | 1,721 (deducted) |
| PF Employer | 1,755 (company contribution, shown only) |
| **In Bank** = Basic Salary − PF Employee | 13,500 − 1,721 = **11,779** |
| **In Cash** = Salary − Basic Salary + OT − Leaves − Half Days − Advance | 15,000 − 13,500 = **1,500** |
| **Total Salary** = In Bank + In Cash | **13,279** |

Employees, and admins without the *View Bank / Cash Split* permission, see only **Total Salary**: in the app, on payslips and in the payroll export. "Basic Salary" is the *PF Bank Salary* column in the Employees tab.

If the deductions are more than the cash part, the rest comes out of the bank part. (With a ₹2,000 advance instalment: cash 0, bank 11,279.)

- **Short day** (Holidays → Type *Short day – office closes early*, with the closing time, e.g. Dussehra 16:30): a normal working day whose shift ends at the closing time. Leaving at that time is a full day. **Leaving before the closing time is never cut** on a short day: it is not taken from salary or OT, and the day shows "Left X early · short day, not cut". Coming late is still cut as usual. the full / half-day minimums shrink in the same proportion; only time after closing is OT, and the month's OT target counts the shorter day. Employees see "🕓 Office closes at 16:30 today" on their home screen.

### Forgotten check-outs (automatic at midnight)
`setup` installs an hourly timer (Apps Script trigger) that **checks out automatically after midnight** anyone who checked in but never checked out. Such a day:
- counts as **No Check-Out Counts As** (Half Day by default), with no OT;
- shows a **red outline** in the calendar and a red warning at the top of the employee's home screen;
- stays **at the top of Admin → Today** under *Missed check-outs* until an admin clears it, in one of three ways:
  - enter the real check-out time (hours, OT and status are recalculated);
  - choose **Clear as is**;
  - approve the employee's correction request, or edit that day in **Entries**.

Employees cannot clear it themselves. They can only send a correction request. A month with uncleared missed check-outs **cannot be locked**.
With *Allow Overnight Shift* = Yes, a night shift is closed automatically only after *Max Shift Hours*.

> The first time `setup` runs, Google asks for permission to "run when you are not present". Allow it, because the midnight check-out needs it. To check, open **Apps Script → Triggers ⏰**: there should be one `autoCheckout` trigger, running every hour.

### Locking a month
At month end, check **Admin → Payroll** and tap **🔒 Lock month**. After that:
- The salaries become **final**. A copy is saved in *Payroll Snapshots*, so later changes to salary, PF or settings don't affect that month.
- Attendance entries, leave approvals and corrections for that month are blocked.
- Payslips no longer say "Provisional".
- Only a super admin can unlock a month.

### Advances
**Admin → Advances → Give an advance**: enter the amount, the deduction per month and the first month to deduct. Each month's salary recovers the instalment until the balance is zero.
- **Employees request advances in the app:** Requests → *Salary advance*, with the amount, a suggested monthly deduction and a reason. Admins with **Manage Advances** see it under Admin → Requests. They can change the amount or deduction and approve it either as a **new separate advance** or **added to an advance already running**. Admins can still enter an advance directly under Advances, e.g. one already given in cash.
- **Change or skip this month's deduction from anywhere:** besides the Advances tab, a **Change** button appears next to each advance in the **Monthly Summary** (💳 Advances this month) and on an employee's **salary card** in the admin calendar. Only admins with Manage Advances see these buttons; employees only see the result.
- **More money while an advance is running:** you have two choices.
  - **＋ Add more** on the advance adds the new amount to the same balance, can change the monthly deduction, and logs it as "➕ date +amount".
  - A new advance from **Give an advance** stays separate, with its own monthly deduction, and both are deducted each month. The form warns you when the employee already has an advance running.
- **Change a month:** for any one month, choose **No deduction** or **Deduct a different amount** (e.g. ₹1,000 or ₹5,000), with an optional note. Only that month changes, and the balance simply takes longer, or less time, to clear. Each change is listed on the advance with an **Undo**, and the employee sees it on their salary card. Locked months can't be changed.
- **Pause** skips months until you resume.
- **Close** stops recovery for good, for example if the rest was repaid in cash.
- **Change monthly** changes the instalment from now on. Locked months keep what was actually deducted.

---

### Working on the weekly off (Sunday)
The weekly off is already paid as part of the monthly salary, so working on it earns **extra** pay:
- Hours **inside 09:30–17:00**:
  - 6 h or more = **+1 day's pay** (salary ÷ 30).
  - 3 h or more = **+½ day's pay**.
  - Less than 3 h = no day pay.
- Time **before 09:30 or after 17:00** is **OT**, paid as on other days: multiplier, approval, blocks and the monthly late / early adjustment all apply.
- Examples (₹30,000 salary → ₹1,000/day):

  | Hours worked | Pay |
  |---|---|
  | 09:30–17:00 | +₹1,000 |
  | 09:30–19:00 | +₹1,000 + 2 h OT |
  | 10:00–15:00 | +₹500 |
  | 18:00–21:00 | 3 h OT only |
- The salary card, payslip, Monthly Summary and Excel export show it as **Week-off work**.
- Holidays still follow *Off-Day Work Is OT*.
- The four *Week-Off* settings appear in the Settings tab after you run **Attendance App → Run setup / repair sheets**. Until then the defaults above apply.

## 4. Roles, permissions and requests

| Role | Can do |
|---|---|
| `EMPLOYEE` | Own attendance, month, payslip, requests and PIN |
| `ADMIN` | Only what the super admin allows. Admins can **never change another admin or a super admin**, even with *All employees*. Super admins are also hidden from them. Admins change their own data only with *Edit Own Entries*. Admins' own requests and missed check-outs go to a super admin |
| `SUPER_ADMIN` | Everything, plus the **Admins** and **Activity** screens, and unlocking months |
| `GUARD` | **Only** checks other employees in and out (Mark Attendance). A guard is not an employee: no attendance, salary, payslip or requests of their own, can't mark themselves, and isn't counted in Today, Payroll, Summary or the Excel export. Guards can change their own PIN |

Permissions the super admin can give each admin (**Super Admin → Admins**):

- View Today
- View Payroll
- Edit Attendance
- Approve Requests
- Edit PF
- Manage Employees
- Manage Advances
- Export Payroll (download the Excel file)
- Lock Payroll
- Mark Attendance for Others (no phone / forgot phone). Guards have this automatically and don't need an admin permission
- Manage Holidays (add / edit / delete national and festival holidays)
- View Bank / Cash Split
- View Monthly Summary (the bank/cash totals on it also need *View Bank / Cash Split*)
- Edit Own Entries

Each admin also gets a scope: **All employees** or **Only selected**.

**Requests** (employee → admin):
- **Leave:** a date range (the form shows "Leave for N day(s): …" and asks before sending). The employee doesn't choose the type.
  - The admin must pick **Paid leave** (no salary cut) or **Unpaid leave** (salary cut, counted as absent) when approving.
  - Days in the range on which the employee **already checked in stay as worked**; the leave is only put on the other days. The request shows a warning for them.
  - Approved leave appears in the calendar and is counted when the day arrives.
- **Correction:** the right check-in and/or check-out time for a day. Approving it updates that day.

**Back-dated entries** (**Admin → Entries**):
- **Fill many days** goes up to **yesterday** only, so it can never block a real check-in. Use **One day** for today.
- **Status:** "Auto" works things out from the times. *Present* and *Half Day* keep the late mark. *Leave* and *Absent* remove it.
- **Admin marks today as Leave or Absent:** if the employee then checks in, the check-in replaces that status.

Every change is written to the **Audit Log** tab.

### Employees without a smartphone, or who forgot their phone (Admin → Mark Attendance)
An admin or a **guard** can check employees in and out from their own phone:
- **This phone's GPS** must be at the office, the same radius check as normal.
- **A photo of the employee is compulsory at check-in.** The app opens the front camera (🔄 switches to the back one), shows the photo for a final check, and saves it like a selfie. Admins see it in Admin → Today. Check-out needs only the location, the same as an employee's own check-out. A photo is required even when *Selfie Required* = No.
- Every entry records who marked it by **real name**. The Mark Attendance list, Today, the calendar and Entries show "👤 Check-in marked by Pramil" for an admin, or "👤 Check-in marked by Guard (Ramesh)" for a guard. It is also written to the Audit Log. These entries are not counted as suspicious.
- **Setting up a guard:** Super Admin → **Employees → Add**, give them an ID and PIN, leave the salary empty and set **Role = Guard**. You can also type `GUARD` in the Role column of the sheet. After login the guard sees only the Mark Attendance screen, with all employees. They can't mark themselves, admins or super admins. Only super admins can see or change a guard.
- They can't mark admins, super admins or themselves. Only today's check-in and check-out can be marked here; for other days use Entries.

### Hindi / English (employees and guards)
Employees see an **English | हिंदी** switch at the top of the Attendance screen. Guards see it at the top of their Mark Attendance screen, and in Hindi that whole screen is in Hindi too.
- In Hindi, all of the employee's screens are in Hindi: Attendance, My Month, Requests, the PIN screen and the error messages (for example "too far from the office").
- Numbers, amounts, times and dates stay in English digits (₹4,355 · 09:30 · 10 अक्टूबर 2026).
- The phone remembers the choice. The login screen, the payslip and all admin and super-admin screens stay in English. Admins and super admins don't see the switch.

### Payroll, PF Setup, attendance register
- **Search:** Payroll and PF Setup have a search box (name or ID). All employee lists are A–Z.
- **⬇ Attendance register** (on Payroll and Monthly Summary) downloads the month's muster roll as Excel.
  - Two rows per employee (**In** time and **Out** time) and one column per day. Days without times show **A** absent, **L** paid leave, **WO** weekly off, **H** holiday, **-** not employed (P / HD only when an admin set the status without times).
  - Totals at the end: Present, Half Days, Absent, Paid Leave, Week Off (weekly offs + holidays), OT (h m), Late (h m). Locked months use the final data.

### Check-in photos are kept 2 months
- Once a day, photos older than **Keep Selfies (days)** (Settings, default **60**) are moved to the Google Drive trash. Google deletes them for good after 30 more days.
- Attendance records stay. Opening such a photo says it was deleted automatically.
- Set the setting to 0 to keep all photos.

### Admin → Today
- **Choose the day:** ‹ › go to the previous or next day, and the date box opens a calendar for any past date. **Today** jumps back.
- **Filter with the tiles:** tap **Late** or **Not marked** to list only those people, or **Checked in** (e.g. 32/52) for everyone. The selected tile is green.
- **Search** by name or ID.
- **Open a month:** tap an employee to open their month (calendar, attendance summary and salary) for the day you are viewing. Back returns to the same day.
- **Photos:** 📷 *View selfie* / *View photo* shows the check-in selfie, or the photo a guard or admin took.
- **Out-of-date server warning:** a super admin sees *"Update the server code"* when Apps Script still runs an older Code.gs than the app needs.

## 5. Things to know

- **30 m is tight.** Indoor GPS is often only accurate to 10–40 m. If genuine employees get "too far" errors, raise the radius to 50 m or raise *Max GPS Accuracy*. Test from different corners of the office first.
- **Fake GPS:** no web app can fully block fake-GPS apps. The app flags check-ins with weak GPS, or with the **exact same coordinates** as another day or another person. Fake-GPS apps typically produce identical coordinates, while real GPS always varies a little. Check flagged selfies in **Admin → Today**.
- **Live camera:** the selfie opens the front camera inside the app. If a phone or browser blocks the camera inside the app, it falls back to the phone's camera, unless *Live Camera Only* = Yes.
- **Location and camera permission:** employees must allow both for the site. If they denied it, they open browser settings → Site settings → Location / Camera → Allow.
- **Payslip download:** if the PDF download doesn't start on a phone, use **Print → Save as PDF**.
- **Five wrong PIN attempts** lock that Employee ID for 15 minutes.
- **Speed:** the Settings, Employees, Holidays, Admin Permissions and Payroll Locks tabs are kept in Google's cache, so most actions don't open them. Edits made by hand in those tabs reach the app straight away, because the cache is cleared on edit. Screens you have already opened show at once and then refresh.
- **Automatic retry:** if Google answers with an error page (for example a 404) or the network drops, the app retries up to 3 times. Retries never create duplicate entries.
- **The morning rush:** selfies are uploaded before the app waits its turn to write to the sheet, so many people can check in at the same minute.
