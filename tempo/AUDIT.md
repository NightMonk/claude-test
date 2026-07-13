# Tempo — Phase 0 Audit
*Produced before any Phase 0 code changes. Repo state: branch `claude/adhd-todo-app-design-loysre`, deployed at `tempo.falkconsulting.co.uk` (Oracle Always-Free VPS, Caddy, systemd).*

## 1. Stack

| Layer | What it actually is |
| --- | --- |
| Framework | **None — vanilla JS** single-page app (`public/app.js`, ~1,400 lines), no build step |
| Build tool | None. Files are served as-is by Express static |
| Styling | Plain CSS (`public/styles.css`) — **already CSS-custom-property tokens** (`--ground, --raised, --ink, --primary, --now, --done…`) with light/dark via `prefers-color-scheme` + `data-theme` override. Phase 1 = re-map/extend tokens, not a rescue job |
| State | No client store. The server is the source of truth; every view re-fetches via `fetch()` |
| Backend | **Yes — Node 20 + Express + better-sqlite3** (`server/`). This is the important finding for Phases 3/5: a server exists, so the AI proxy (`/api/ai`), server cron for rollover, and OAuth token storage are all straightforwardly implementable here. No serverless workarounds needed |
| PWA | manifest + service worker (`sw.js`, cache-first shell, network-only for `/api`), PNG + maskable icons, Web Push (VAPID) already live server-side |

## 2. Where data lives

- **Server-side SQLite** at `/opt/tempo/data/tempo.sqlite` (git-ignored; survives deploys). **Not** localStorage/IndexedDB — the iPhone holds no task data, so the lockout never put data at risk.
- Tables: `lists`, `goals`, `tasks` (sub-tasks = rows with `parent_id`, one level), `settings` (single row: theme, week_start, quiet hours, feed token, VAPID keys, Google token columns), `calendars` + `cal_events` (ICS/Google sync cache), `push_subs`, `reminders_sent`.
- `tasks` current shape: `id, title, notes, list_id, goal_id, parent_id, due_at (local wall-clock ISO), has_time, priority (0/1/2), energy, estimate_min, repeat, done (0/1), completed_at, my_day_date, sort, created_at, updated_at`.
- Client keeps only the auth token + (proposed) keyboard preference in localStorage.

## 3. Password lock — how it actually works (differs from spec's assumption)

- The passcode is **never stored client-side, in any form**. It lives in `/opt/tempo/repo/tempo/.env` as `PASSCODE=…` (file mode 600), compared server-side with a constant-time check; success issues a stateless HMAC-signed token (30-day expiry) held in localStorage.
- **Lockout root cause confirmed:** `<input id="passcode" type="password" inputmode="numeric">` — iOS raises the digits-only keypad; the passcode contains letters/symbols. (Desktop ignores `inputmode`, which is why desktop login works today.)
- Spec conflict & adaptation — see §6.

## 3b. Operational constraints (deploy) — LOAD-BEARING

Recorded per operator instruction; these govern every future phase.

- **Server:** Ubuntu 22.04 on **Oracle Cloud Infrastructure** (Always-Free VM.Standard.E2.1.Micro, uk-london-1), Caddy + systemd, at `tempo.falkconsulting.co.uk` (`144.21.51.57`).
- **Operator is iPhone-only** for the foreseeable term (no desktop for ~1 month). No SSH client on the device; the SSH **private key exists only on the operator's Windows PC** (generated there via `ssh-keygen`), not on any phone and not in Claude's environment.
- **Claude cannot SSH to the server:** its sandbox has no private key (`~/.ssh` empty) and outbound port 22 is blocked (HTTPS-only egress via proxy). Verified. Claude therefore cannot deploy directly.
- **OCI Run Command is unavailable** on this Ubuntu image (agent plugin does not run) — not a usable deploy channel.
- **Therefore ALL deploys MUST be automated / pull-based.** The chosen mechanism is the **pull-based auto-updater** (`deploy/install-autoupdate.sh`): a systemd timer on the server that fetches the branch every 5 minutes and restarts on change. Once installed, Claude ships by pushing to GitHub; the server self-deploys. No inbound access, no secrets, no per-deploy human step.
- **Bootstrap (one time only):** installing that auto-updater requires exactly one server touch. With SSH and Run Command both unavailable, the only phone-reachable channel is **Oracle Cloud Shell + OCI Bastion** (`deploy/cloudshell-deploy.sh`, run via a single pasted one-liner). Bastion injects ephemeral access through the instance agent, so it needs **no pre-existing key**. This is unavoidable: reaching the server at all currently requires it. After it runs once, the auto-updater makes all further deploys hands-off.
- **Consequence for phases:** Claude builds, verifies locally (headless browser + API), commits, and pushes each phase. Phases accumulate safely in GitHub and land together on the next auto-update tick. The operator's checklist per phase is browser-only (open the PWA, tap through). No terminal steps are issued to the operator beyond the single one-time bootstrap paste above.

## 4. Deploys

- I (Claude Code) commit + push to GitHub. The server updates by SSH:
  `sudo -u tempo git -C /opt/tempo/repo pull && sudo systemctl restart tempo` (plus `npm ci` only when dependencies change).
- **Conflict with iPhone-only operation:** deploys currently need an SSH session. Adaptation offered: an optional **auto-update systemd timer** (included in this phase as `deploy/install-autoupdate.sh`) that pulls the branch every 5 minutes and restarts only when it changed — one SSH command to install, then all future phases deploy themselves.

## 5. Timezone

- Due dates are stored as **local wall-clock** strings (good), but the server process runs in UTC, and the reminder loop + "today" boundary use server time. In British Summer Time that shifts "midnight" and reminder firing by an hour.
- Adaptation (Phase 2, one line, no code): set `Environment=TZ=Europe/London` in `tempo.service` so server-local == London. Flagged now, applied with Phase 2's rollover work.

## 6. Spec conflicts & proposed adaptations (rule 1 — nothing silently improvised)

| Spec assumption | Reality | Proposed adaptation |
| --- | --- | --- |
| Password stored client-side, possibly plaintext → "store salted hash, migrate" | Passcode is server-side in `.env`, never sent to or stored on the client; comparison is timing-safe | Support **`PASSCODE_HASH`** (salt:sha256) in `.env` as defense-in-depth so the plaintext needn't sit on disk; plaintext `PASSCODE` stays supported. Implemented this phase |
| One-time recovery code shown on password set | Single-user, self-hosted; **SSH to the server is already the root of trust** — anyone with SSH can rotate the passcode in `.env` in 10 seconds; an in-app recovery code would be strictly weaker than, and redundant with, that | **Skip recovery codes.** Recovery = edit `.env` over SSH (documented below). Can revisit if the app ever becomes multi-user |
| `LOCK_BYPASS=true` temporary build to regain access | Not needed: the fix itself restores access (the passcode is known; only the iOS keyboard was wrong), and desktop login works right now | **Skip the bypass** — one fewer risky deploy |
| Import "merges by id (never wipes)" | Current import **wipes and replaces** — direct conflict | **Fixed this phase:** import now upserts by id, deletes nothing |
| Export "all tasks, lists, subtasks, settings" | Export had tasks/lists/goals but not settings | **Fixed this phase:** export now includes non-secret settings (theme, week start, quiet hours, review note). Secrets (VAPID private key, Google tokens, feed token) deliberately excluded from backups |
| "chrono-node pre-approved" | No NLP dep yet; current parser is hand-rolled regex (dates, `#list`, `!prio`, `~est`, repeat) | Adopt chrono-node in Phase 3 as specced |
| Phases reference themes/views not yet present | As expected — they're the work of Phases 1–6 | Proceed as specced |

## 7. Requirement trace — feasibility against this codebase

| # | Requirement | Phase | Feasibility on this stack |
| --- | --- | --- | --- |
| 1 | NLP on creation + wording help | 3.2 / 5.1 | ✅ Regex parser exists to build on; chrono-node is a plain npm dep (no build step needed — served ES module or small vendored bundle; will pick the lighter route in Phase 3). AI rewrite via Express proxy |
| 2 | Note→task, auto-categorise, GCal, locations | 5.2/5.3 | ✅ Backend exists for `/api/ai`; `location` = additive column; GCal template link is pure client |
| 3 | Auto-rollover + overdue marker | 2.4 | ✅ Server cron is easy (setInterval or systemd timer); manual rollover endpoint already exists; `carried_from`/`rollover_count` additive columns |
| 4 | Any.do-style Next 7 Days | 4.1 | ✅ New view over existing `/tasks?from&to` API |
| 5 | Any.do-style creation sheet | 3.1 | ✅ Evolve the existing "I want to…" sheet |
| 6 | Auto-allocation by priority | 3.2/2.2 | ✅ Priority parsing + sort already exist; formalise sort order in 2.2 |
| 7 | Complete → strikethrough/bottom/archive | 2.3/2.5 | ✅ Completion animation + wins list exist; Archive = new filtered view over `done` rows (all history already retained in DB) |
| 8 | Easy subtasks | 3.3 | ✅ Exist (one level, inline add, progress chip); polish to spec in 3.3 |
| 9 | Lock keyboard fix + reset | 0.3 | ✅ **Done this phase** |
| 10 | Colour overhaul, 3 options | 1 | ✅ Token layer already exists; add Graphite/Warm Paper/Eucalyptus palettes + picker + quick-switch |
| 11 | Logo change | 6.1 | ✅ SVG source + PNG raster pipeline already in repo |

**Nothing in the spec is infeasible.** The two structural gifts: a real backend (Phases 3/5 land server-side cleanly) and an existing token-based CSS layer (Phase 1 is re-theming, not refactoring).

## 8. Recovery procedure (the documented replacement for recovery codes)

If ever locked out for real:
```bash
ssh -i <key> ubuntu@144.21.51.57
sudo nano /opt/tempo/repo/tempo/.env    # set PASSCODE=new-code (or PASSCODE_HASH)
sudo systemctl restart tempo
```
To use a hash instead of plaintext (generated locally, paste the output as `PASSCODE_HASH=`):
```bash
node -e "const c=require('crypto'),s=c.randomBytes(16).toString('hex');console.log('PASSCODE_HASH='+s+':'+c.createHash('sha256').update(s+process.argv[1]).digest('hex'))" 'your-passcode'
```
