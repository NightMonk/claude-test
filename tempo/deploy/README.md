# Deploying Tempo on your own VPS with Caddy

Run Tempo on a subdomain you own (e.g. `tempo.falkconsulting.co.uk`) with automatic
HTTPS. The stack: **your subdomain → Caddy (HTTPS) → Tempo (Node) → SQLite file**.

## What the pieces are

- **VPS** — a small always-on Linux server you rent; you log in over **SSH**.
- **Caddy** — a web server that automatically gets & renews a free Let's Encrypt
  HTTPS certificate for your domain, and forwards traffic to Tempo (a *reverse
  proxy*).
- **systemd** — keeps Tempo running and restarts it on boot/crash.
- **ufw** — a simple firewall (only SSH + web ports open).

## Where to host (for now)

Any provider works. Tempo is tiny — the **smallest instance is plenty** (1 vCPU /
1 GB RAM, ~£4–6/month). Pick a region near you:

| Provider | Good for | Suggested plan / region |
| --- | --- | --- |
| **DigitalOcean** | Easiest for newcomers, great docs | Basic Droplet, **London (LON1)**, Ubuntu 24.04 |
| **Hetzner Cloud** | Cheapest, excellent | CX22, **Nuremberg/Falkenstein (DE)**, Ubuntu 24.04 |
| **Vultr / Linode** | Also fine | £5 plan, London, Ubuntu 24.04 |

Choose **Ubuntu 24.04 LTS**. Add your SSH key during creation if offered.

## Steps

**1. Create the server**, note its public **IPv4** address.

**2. Point DNS.** At whoever manages `falkconsulting.co.uk`'s DNS, add:

```
Type: A     Name: tempo     Value: <server IPv4>     TTL: default
```

(If your DNS is on **Cloudflare**, set this record to **DNS-only / grey cloud** so
Caddy can obtain its certificate; you can switch to proxied later with SSL =
*Full (strict)*.) Do this before step 4 so the certificate can be issued.

**3. Log in:** `ssh root@<server IPv4>`

**4. Run the installer** (review it first — it's `setup-vps.sh` in this folder):

```bash
curl -fsSL https://raw.githubusercontent.com/NightMonk/claude-test/claude/adhd-todo-app-design-loysre/tempo/deploy/setup-vps.sh -o setup-vps.sh
less setup-vps.sh    # read it
DOMAIN=tempo.falkconsulting.co.uk PASSCODE=pick-a-strong-code bash setup-vps.sh
```

It installs everything, writes a strong `SESSION_SECRET` for you, starts Tempo as a
service, and configures Caddy. Add `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...`
to the command if you've set up Google Calendar sync (see `../DEPLOY.md`).

**5. Open `https://tempo.falkconsulting.co.uk`** (allow ~1 minute for the cert),
unlock with your passcode.

**6. Put it on your devices** — do this *after* the domain is live so installs bind
to the final URL:
- **iPhone:** Safari → Share → **Add to Home Screen**, then **⋯ → Settings → Enable push**.
- **Windows/desktop:** open in Edge/Chrome → **Install**.

## Running it

```bash
systemctl status tempo          # is it up?
journalctl -u tempo -f          # live logs
systemctl restart tempo         # restart
```

**Update to the latest code:**
```bash
sudo -u tempo git -C /opt/tempo/repo pull
sudo -u tempo bash -c 'cd /opt/tempo/repo/tempo && npm ci --omit=dev'
systemctl restart tempo
```

**Back up your data:** it's one file — `/opt/tempo/data/tempo.sqlite`. Copy it off
with `scp`, or use **⋯ → Settings → Export a backup (JSON)** in the app.

## Security basics

- Log in with an **SSH key**, not a password; create a non-root sudo user if you like.
- Keep the box patched: `apt update && apt upgrade` (or enable `unattended-upgrades`).
- Use a **strong `PASSCODE`**. The firewall already limits exposure to SSH + 80/443.

## Switching later (no lock-in)

Tempo is just a Node server + one SQLite file, so moving is easy:

- **To a new server or domain:** repoint the DNS record (and update the domain in
  `/etc/caddy/Caddyfile` → `systemctl reload caddy`). Copy `tempo.sqlite` across, or
  restore a JSON backup in the app.
- **To a managed host (Railway/Render/Fly):** point it at the same repo, set the env
  vars + a persistent volume, add `tempo.falkconsulting.co.uk` as a custom domain,
  move the DNS record, and import your JSON backup.
- **If Google Calendar is connected:** update the OAuth redirect URI to the new host
  in Google Cloud Console.

⚠️ **One caveat:** a PWA install and its push subscription are tied to the exact
origin. If you change the **domain** later, you'll re-add the app to your home
screen and re-enable push. Changing the **server** behind the same domain changes
nothing for your devices. → Pick `tempo.falkconsulting.co.uk` now and keep it.
