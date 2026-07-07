# Hosting Tempo on your phone (private cloud sync)

Tempo is one small Node server plus a SQLite file, so **one instance _is_ your
private cloud**: every device you log into reads and writes the same database.
Host it somewhere private, over **HTTPS** (required for installing to the home
screen and for notifications), and add it to your home screen.

Below is the quickest reliable route (Railway). Render, Fly.io, or any small VPS
work the same way — the only requirements are HTTPS and a **persistent disk** for
the database.

## Before you start — set two secrets

- `PASSCODE` — what you type to unlock the app.
- `SESSION_SECRET` — a long random string. Generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

## Railway (recommended, ~5 minutes)

1. Push this repo to GitHub (already done if you're reading this in the repo).
2. Go to <https://railway.app> → **New Project → Deploy from GitHub repo** and pick
   this repo. Railway detects the `Dockerfile` in `tempo/`.
   - If your project has multiple apps, set the **Root Directory** to `tempo`.
3. **Variables** → add:
   - `PASSCODE` = your passcode
   - `SESSION_SECRET` = the random string from above
   - `DB_PATH` = `/data/tempo.sqlite`
4. **Add a Volume** mounted at `/data` (Settings → Volumes). This is what keeps
   your tasks between deploys — without it, data resets on every redeploy.
5. **Generate a Domain** (Settings → Networking). You'll get an
   `https://…up.railway.app` URL, served over HTTPS automatically.
6. Open the URL, unlock with your passcode.

## Put it on your iPhone / desktop

- **iPhone:** open the URL in Safari → Share → **Add to Home Screen**. It launches
  full-screen like a native app.
- **Windows:** open in Edge/Chrome → install icon in the address bar (**Install
  Tempo**), or just bookmark it. Works offline for the shell; your data syncs when
  online.

Log into the same URL on every device — they all share one database.

## Run it locally instead

```bash
cd tempo
npm install
cp .env.example .env        # set PASSCODE + SESSION_SECRET
npm start                    # http://localhost:3000
```

## With Docker

```bash
cd tempo
docker build -t tempo .
docker run -p 3000:3000 \
  -e PASSCODE=your-code \
  -e SESSION_SECRET=your-long-secret \
  -v tempo-data:/data \
  tempo
```

## Push reminders (works when the app is closed)

Tempo uses **Web Push (VAPID)**. On first run it auto-generates a keypair and
stores it in the database, so **push works with no extra config** — just make sure
you're on **HTTPS**. In the app: **⋯ → Settings → Enable push**. It fires on
Windows/desktop Chrome & Edge, macOS Safari, and **iPhone once you Add to Home
Screen** (iOS 16.4+). Set **quiet hours** in Settings to mute overnight.

To pin stable keys across a fresh database, set `VAPID_PUBLIC` / `VAPID_PRIVATE`
(generate with `npx web-push generate-vapid-keys`) and `VAPID_SUBJECT`.

## Calendar sync

- **See your events in Tempo:** Settings → *Subscribe to a calendar* → paste the
  secret ICS URL (Google: “Secret address in iCal format”; Apple iCloud: Public
  Calendar link; Outlook: Publish → ICS).
- **See your Tempo tasks in your calendar:** Settings shows a *feed URL* — add it
  as a subscribed calendar in Google/Apple/Outlook.

## Native apps (iOS / Windows)

The installed PWA already covers both platforms with push. For App Store / Store
distribution, widgets and Live Activities, see [`native/`](native) — a Capacitor +
WidgetKit scaffold you build on your own Mac/Windows toolchain.

## Notes

- **Back up / restore:** **⋯ → Settings → Export / Restore (JSON)**.
- **Security:** the passcode is a single shared secret, fine for a personal tool.
  Always serve over HTTPS and use a strong `SESSION_SECRET`.
