# Tempo — Backlog

Everything the master build (Phases 0–6) intentionally deferred, so nothing is
lost. Grouped by why it's waiting. Nothing here blocks daily use of the app.

## Waiting on your credentials (Phase 5 activation)
- **Anthropic API key** — set `ANTHROPIC_API_KEY` in the server `.env` to switch
  on the ✨ features (Suggest steps, Improve wording, Note → tasks). The code is
  built, tested and hides itself cleanly until the key is present.
  Get one at https://console.anthropic.com → API keys.
- **Google Calendar two-way sync** — set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  (OAuth Web client, redirect `https://tempo.falkconsulting.co.uk/api/google/callback`).
  Until then: the "Add to Google Calendar" button already works with no setup,
  and you can subscribe to any calendar via its ICS link in Settings.

## Waiting on one server touch (deploy)
- **Auto-deploy bootstrap** — the pull-based auto-updater needs installing once
  via Oracle Cloud Shell + Bastion (`deploy/cloudshell-deploy.sh`). After that,
  every phase deploys itself when pushed. See `AUDIT.md` §3b.

## Waiting on a desktop toolchain (native)
- **iOS / Windows native wrappers** — `native/` holds a Capacitor scaffold plus a
  WidgetKit widget. Compiling and signing needs a Mac/Xcode (iOS) or VS
  (Windows), which CI can't run. Cross-platform push already works via Web Push,
  so the PWA covers day-to-day use without them.
- **Home-screen widgets / Live Activities** — depend on the native build above.

## Deliberately small for now (would be nice later)
- **Task locations** — the Google Calendar link already carries a `location` if a
  task has one, but there's no location field in the editor yet (additive column
  when wanted).
- **Recurrence** — daily / weekly / monthly / annual only. No "every 2 weeks",
  "last Friday of the month", or custom RRULE authoring (inbound ICS RRULEs are
  still read).
- **Sub-tasks** — one level deep (no nested sub-sub-tasks), by design.
- **NLP edge cases** — chrono handles most phrases; "end of month"/"eom" and a
  few idioms aren't recognised and fall back to no date.
- **Attachments / tags / notes formatting** — plain text notes only.
- **Multi-user** — single passcode, single user. Recovery is via `.env` over SSH
  (see `AUDIT.md` §8); no in-app account system.

## Nice polish, not essential
- Momentum-ring progress could animate its sweep on load.
- Optional haptics on complete (limited on iOS Safari; skipped for now).
- A dedicated "Someday/Anytime" review nudge during the weekly review.
