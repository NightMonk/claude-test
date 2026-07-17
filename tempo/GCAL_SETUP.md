# Connect Google Calendar to Tempo — iPhone/Safari walkthrough

This lets Tempo **read** your Google Calendar events into its calendar views
(two-way in spirit: your tasks flow back out via Tempo's ICS feed). It's
optional — the **"Add to Google Calendar"** button on tasks already works with
no setup. This guide sets up the deeper live sync.

You'll do a one-time setup in the **Google Cloud Console**, copy two values
(a *Client ID* and a *Client secret*), paste them into Tempo, and tap Connect.
It looks fiddly the first time; every step is spelled out. ~10 minutes.

> Do it all in Safari on your iPhone, signed into the Google account whose
> calendar you want to see. Turn the phone **landscape** — the console is
> cramped in portrait.

---

## What Tempo will ask for
- **Read-only** access to your calendar (`calendar.readonly`) and your email
  address (to show which account is connected). It never writes or deletes.

## The one value you'll need to paste into Google
Tempo's redirect URI (also shown in **Settings → Smart features**, with a Copy
button):

```
https://tempo.falkconsulting.co.uk/api/google/callback
```

---

## Step 1 — Create a project
1. Go to **https://console.cloud.google.com** and sign in.
2. If prompted, agree to the terms.
3. At the very top, tap the **project dropdown** (says "Select a project") →
   **New Project**.
4. Name it `Tempo` → **Create**. Wait a few seconds, then make sure the top bar
   now shows **Tempo** as the selected project (tap the dropdown and pick it if
   not).

## Step 2 — Turn on the Calendar API
1. In the search bar at the top, type **Google Calendar API** and tap it in the
   results.
2. Tap **Enable**. (If it says "Manage", it's already on — fine.)

## Step 3 — Set up the consent screen
1. Search for **OAuth consent screen** (or left menu → *APIs & Services → OAuth
   consent screen*).
2. If it asks about **Google Auth Platform / Get started**, tap through it:
   - **App name:** `Tempo`  ·  **User support email:** pick your email.
   - **Audience:** choose **External**.
   - **Contact email:** your email. Agree and **Create/Continue**.
3. You do **not** need to publish or get verified — you'll add yourself as a
   test user instead:
   - Find **Audience** (or **Test users**) → **Add users** → type your own Gmail
     address → **Save**. (Only accounts listed here can use the app, which is
     exactly what you want for a personal tool.)

## Step 4 — Create the OAuth client (this gives you the two values)
1. Left menu → **APIs & Services → Credentials**.
2. **+ Create credentials** (top) → **OAuth client ID**.
3. **Application type:** choose **Web application**.
4. **Name:** `Tempo web`.
5. Under **Authorized redirect URIs**, tap **+ Add URI** and paste **exactly**:
   ```
   https://tempo.falkconsulting.co.uk/api/google/callback
   ```
   (No trailing slash. It must match character-for-character.)
6. Tap **Create**.
7. A panel shows **Your Client ID** and **Your Client Secret**. Tap the copy
   icons. If you lose them, reopen the client from **Credentials** later — the
   secret can be viewed/reset there.

## Step 5 — Paste them into Tempo
1. Open **https://tempo.falkconsulting.co.uk**, unlock, then **⋯ More →
   Settings → Smart features → Google Calendar sync**.
2. Paste the **Client ID** and **Client secret** into the two fields → **Save**.
3. Scroll up to **Calendar sync** — a **Connect** button now appears (it only
   shows once credentials are saved). Tap **Connect**.
4. Google asks you to choose your account and approve read-only calendar access.
   Because your app is in "testing", you may see an **"unverified app"** screen:
   tap **Advanced → Go to Tempo (unsafe)** — this is your own app, it's fine.
5. It returns to Tempo showing **Connected ✓** with your email, and pulls your
   events in. Use **Sync** any time to refresh.

---

## If something goes wrong
- **"redirect_uri_mismatch"** → the URI in Step 4.5 doesn't match exactly. It
  must be `https://tempo.falkconsulting.co.uk/api/google/callback`, no trailing
  slash, `https` not `http`.
- **"access_blocked / app not verified"** → add your email under **Test users**
  (Step 3.3), and on the warning screen use **Advanced → Go to Tempo**.
- **"This app is blocked" / 403** → make sure the **Google Calendar API** is
  enabled (Step 2) for the **Tempo** project (check the project name up top).
- **Nothing happens after Connect** → confirm both Client ID *and* secret show
  "set ✓" in Settings → Smart features, then try Connect again.

Your credentials live only on your server (never in the public repo). To revoke,
tap **Remove** in Settings → Smart features, and/or delete the OAuth client in
the Google Cloud Console.
