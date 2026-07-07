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

## Notes

- **Back up any time:** in the app, **⋯ → Export a backup (JSON)**.
- **Reminders:** browser notifications fire while Tempo is open. True lock-screen
  push (when the app is closed) needs the native wrappers described in the design
  roadmap — a later step.
- **Security:** the passcode is a single shared secret, fine for a personal tool.
  Always serve over HTTPS and use a strong `SESSION_SECRET`.
