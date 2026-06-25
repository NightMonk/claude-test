# Deploying your databank (so you can use it from your phone)

This puts **People** on an always-on private server, so you can reach it from
your phone anywhere — without leaving your own computer switched on.

The recommended host is **Railway**: it deploys straight from GitHub, needs no
command line, has an EU region near London, and costs roughly **$5/month** for
an app this small.

You only do this **once**. After that, every change merged into the repo
redeploys automatically.

---

## Before you start

You'll set three secret values on the server. Have these ready:

| Variable | What it is | Value to use |
|---|---|---|
| `PASSCODE` | The code you'll type to unlock the app. | Choose your own — make it long. |
| `SESSION_SECRET` | A random string that signs your login. You never type this. | Use the one Claude generated for you, or any long random string. |
| `DB_PATH` | Where your data file lives (on the persistent disk). | `/data/people.sqlite` |

> Need a fresh `SESSION_SECRET`? Ask Claude, or run this on any computer with
> Node installed:
> `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

---

## Deploy on Railway — step by step

### 1. Create an account
- Go to **<https://railway.com>** and sign up (sign in with GitHub — it makes
  the next step easier).

### 2. Start a new project from this repo
- Click **New Project** → **Deploy from GitHub repo**.
- Authorise Railway to see your GitHub if it asks, then pick
  **`nightmonk/claude-test`**.
- Railway sees the `Dockerfile` in the repo and starts building automatically.
  The first build takes a couple of minutes. (It may show an error until you
  finish the next two steps — that's expected.)

### 3. Add the persistent disk (so your data is never lost)
- Open your service (the box named after the repo) → **Variables / Settings**
  area → find **Volumes** → **New Volume**.
- Set the **Mount path** to exactly:
  ```
  /data
  ```
- Save. This is the disk your `people.sqlite` lives on; it survives restarts and
  redeploys.

### 4. Add your settings (environment variables)
- In the service, open the **Variables** tab → **New Variable** (or **Raw
  Editor** to paste all at once) and add:
  ```
  PASSCODE=your-chosen-passcode
  SESSION_SECRET=paste-the-long-random-string-here
  DB_PATH=/data/people.sqlite
  ```
- You do **not** need to set `PORT` — Railway provides it automatically.
- Save. Railway redeploys with the new settings.

### 5. Choose the region (closest to London)
- In **Settings → Region**, pick the **EU West** region (e.g. Amsterdam /
  `europe-west`). This keeps it fast from the UK.

### 6. Turn on a public web address
- In **Settings → Networking**, click **Generate Domain**.
- Railway gives you a URL like `https://people-production-xxxx.up.railway.app`.
- Open it in your browser — you should see the **Unlock** screen. Enter your
  `PASSCODE`. 🎉

### 7. Add it to your phone
- Open that same `https://…` URL in **Safari (iPhone)** or **Chrome (Android)**.
- **iPhone:** Share button → **Add to Home Screen**.
- **Android:** menu (⋮) → **Add to Home screen / Install app**.
- It now behaves like a normal app, full-screen, with its own icon.

> **Why HTTPS matters:** the auto-location and "Add to Home Screen" features only
> work over `https://`. Railway's generated domain is already HTTPS, so you're
> covered.

---

## Keeping it updated

Whenever code is merged into the repo's `main` branch, Railway **redeploys
automatically** — you don't do anything. Your data on the `/data` volume is
untouched by deploys.

## Backing up your data

Inside the app: **More → Export a backup** downloads everything as a JSON file.
Do this occasionally and keep the file somewhere safe (it's your own private
copy, independent of the host).

## Roughly what it costs

Railway bills for the small amount of compute + the tiny volume your app uses —
about **$5/month** for single-user use. There's a trial credit to start. If you
ever pause the project, billing stops.

---

## Alternative hosts (if you ever want them)

The repo includes a standard `Dockerfile`, so it runs anywhere that takes a
container. Two notes if you switch:

- **Render** (<https://render.com>): New → **Web Service** → connect the repo
  (it detects the Dockerfile). Add a **Disk** mounted at `/data` (this requires
  the smallest paid instance, ~$7/mo). Set the same three variables. Pick the
  **Frankfurt** region for EU.
- **Fly.io** (<https://fly.io>): cheapest and has an actual **London (`lhr`)**
  region, but it's set up via the `flyctl` command-line tool — more technical.
  In short: `fly launch` (it reads the Dockerfile), `fly volumes create data
  --region lhr`, mount it at `/data`, then `fly secrets set PASSCODE=… 
  SESSION_SECRET=… DB_PATH=/data/people.sqlite`.

Whatever the host, the rule is the same: **mount a persistent volume at `/data`
and set the three variables.**
