# Walkie-Talkie relay (Cloudflare Worker)

The push-to-talk server behind the **🎙 Walkie** tab of the Attendance app. It only passes voice from the person who is
holding the button to everyone else in the same channel. Nothing is recorded or stored.

- Free: runs on the Cloudflare **Workers Free** plan (no card needed, no server of your own).
- Only logged-in employees can connect: the Attendance app's Apps Script gives each person a signed pass (valid
  12 hours), and this Worker checks it. Employee ID and PIN never reach this Worker.
- One person talks at a time (a press holds the floor for at most 60 seconds).
- Voice is 16 kHz mono mu-law in 100 ms pieces (about 16 KB per second of talking), sent over a WebSocket.

## One-time setup (about 15 minutes)

You need a computer with **Node.js 20+** and a free Cloudflare account (https://dash.cloudflare.com/sign-up).

1. Open a terminal in this folder and install:
   ```
   cd walkie-worker
   npm install
   ```
2. Log in to Cloudflare (opens the browser):
   ```
   npx wrangler login
   ```
3. Make a secret (any long random text). Copy the output, you need it twice:
   ```
   openssl rand -hex 32
   ```
   (No openssl? Use `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.)
4. Deploy, then save the secret in the Worker (paste the text from step 3 when asked):
   ```
   npx wrangler deploy
   npx wrangler secret put WALKIE_SECRET
   ```
   `deploy` prints the Worker address, like `https://travalate-walkie.YOURNAME.workers.dev`.
   Check it: opening that address in a browser shows `{"ok":true,"app":"walkie"}`.
5. In the Attendance app's **Apps Script** open **Project Settings ⚙ → Script Properties → Add script property**:

   | Property | Value |
   |---|---|
   | `WALKIE_SECRET` | the same text as in step 3 |
   | `WALKIE_URL` | `wss://travalate-walkie.YOURNAME.workers.dev` (your address, with `wss://`) |
   | `WALKIE_CHANNELS` | optional, e.g. `all,jaipur,packing,dispatch` (lowercase letters, digits and `-`; the first one is the default). Without it there is one channel, `all` |

6. Make sure the new `Code.gs` and `Index.html` are live (the auto-deploy does this after a merge to `main`, or paste
   them and use **Deploy → Manage deployments → Edit → New version**).

Never put the real secret in this repository (the repo rule: secrets are written `XXXX` in files).

## Using it

Open the Attendance app → **🎙 Walkie** → **Join** → allow the microphone → **hold the big button and talk**.
Channels with more than one name show a picker. **Leave** switches the microphone off.

- Phones only play sound after a tap, so every person taps **Join** once each time they open the app.
- The microphone stays on standby after Join (the phone may show its microphone dot) but **nothing is sent unless the
  button is held**.
- **iPhone:** keep the app open with the screen on (the app asks the phone to keep the screen awake). iOS stops
  microphone and sound for web apps when the screen locks or the app goes to the background.
- **Android app (APK):** the microphone permission and background audio need the updated APK. Until then use it
  from Chrome, or keep the app open.

## Optional hardening

In `wrangler.toml` set `ALLOWED_ORIGINS = "https://travalateapp.github.io"` and run `npx wrangler deploy` again, so
only the hosted Attendance page (and the Android app, which loads it) can connect.

## Test it on your computer

```
cd walkie-worker
printf 'WALKIE_SECRET=test-secret\n' > .dev.vars     # local only, ignored by git
npx wrangler dev --port 8799 --ip 127.0.0.1         # keep this running
npm test                                             # in a second terminal
```

The test connects four simulated phones and checks sign-in, who is talking, audio delivery and disconnects.

## Free-plan limits (Cloudflare Workers Free)

Workers allow 100,000 requests a day on the free plan, and each person connecting counts once. Voice pieces are
WebSocket messages, which Cloudflare counts at a reduced rate, so for 15 people an ordinary workday of talking stays
far below the allowance (this is an estimate, check the Cloudflare dashboard → Workers & Pages → travalate-walkie →
Metrics after the first week). If the limit were ever reached, walkie-talkie pauses until the next day (00:00 UTC);
attendance is not affected.
