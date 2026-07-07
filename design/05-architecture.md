# 05 · Technical architecture

This design must run **natively on iPhone and on Windows desktop**, work offline,
sync instantly, and — critically for an ADHD reminder app — **deliver
notifications reliably**. Those requirements drive every decision below.

## The overriding constraint: reminders must be reliable

For a to‑do app you could get away with a lot. For an *ADHD reminder* app, if the
reminders don't fire — reliably, on time, and forcefully when needed — the product
has failed at its core job. This single constraint rules out some otherwise
attractive options (see "Why not a PWA" below) and shapes the notification
architecture.

## Client platform decision

**Recommendation: a single Flutter codebase targeting iOS and Windows.**

### The options weighed

| Option | iOS | Windows | Notifications/widgets | Verdict |
| --- | --- | --- | --- | --- |
| **Flutter** | Native, excellent | **Native, first‑class desktop** | Full native access via plugins/platform channels | **✅ Recommended** |
| **.NET MAUI** | Good | **Excellent (native Windows)** | Good | ✅ Strong alt, esp. if the team is C# |
| **React Native (+ RN‑Windows)** | Excellent | Windows support lags, more fragile | Good on iOS, patchier on Windows | ◑ Viable, riskier Windows |
| **Native ×2 (Swift + WinUI)** | Best possible | Best possible | Best possible | ◑ Best UX, ~2× the work |
| **PWA / web** (like the existing People app) | Poor notifications | OK | **iOS web push is weak; no Live Activities, weak widgets, no critical alerts** | ❌ Fails the core constraint |

### Why Flutter

- **One codebase, two first‑class targets.** iOS and Windows are both fully
  supported desktop/mobile targets — not an afterthought. Cheap to add Android and
  web later from the same code.
- **Pixel‑level control** over the custom, animation‑rich, calming ADHD UI (the
  shrinking timer ring, satisfying completion motion, progressive disclosure) —
  Flutter renders its own UI so the design is identical and fully controllable
  across platforms.
- **Full native capability** where it matters, via platform channels/plugins:
  local notifications, APNs, iOS App Intents/Widgets/Live Activities, Windows toast
  notifications and global hotkey. The custom‑UI parts are shared; the deeply
  native bits (an iOS WidgetKit widget, a Windows tray hook) are thin
  platform‑specific modules.
- **Performance** is native‑compiled, important for smooth animation (the reward
  and time‑visualisation moments depend on it).

**Why not a PWA**, despite the existing repo being one: a personal contact app can
live with best‑effort web notifications; an ADHD *reminder* app cannot. iOS web
push is limited and unreliable, there are no Live Activities or proper Home/Lock
Screen widgets, no Critical Alerts, and no App Intents/Siri capture. Those aren't
nice‑to‑haves here — they're Pillar 1 and Pillar 5. Native (via Flutter) is the
right call.

**If the team is a .NET shop**, MAUI is a legitimate swap — its Windows story is
arguably even stronger. The architecture below is client‑agnostic from the sync
layer down.

## High‑level architecture

```
        iPhone (Flutter)                      Windows (Flutter)
   ┌────────────────────────┐            ┌────────────────────────┐
   │  UI  ·  local logic    │            │  UI  ·  local logic    │
   │  ┌──────────────────┐  │            │  ┌──────────────────┐  │
   │  │ Local DB (SQLite │  │            │  │ Local DB (SQLite │  │
   │  │  via Drift)      │  │  ← source  │  │  via Drift)      │  │
   │  └────────┬─────────┘  │    of      │  └────────┬─────────┘  │
   │  Local notifications   │   truth    │  Windows toast + hotkey│
   │  Widgets / Live Activ. │  offline   │  Tray / floating timer │
   └────────┬───────────────┘            └───────────┬────────────┘
            │  background sync (delta, last‑write‑wins + merge)     │
            └───────────────┬──────────────────────────────────────┘
                            ▼
            ┌───────────────────────────────────┐
            │   Sync backend  (Supabase)         │
            │  · Postgres (row‑level security)   │
            │  · Auth (Apple / Google / email)   │
            │  · Realtime change feed            │
            │  · Edge functions:                 │
            │     – push orchestration (APNs/WNS)│
            │     – NL parse / "break it down"   │
            │     – email‑to‑task, calendar sync │
            └───────────────┬───────────────────┘
                            ▼
                 APNs (iOS)   ·   WNS (Windows)   ·   Calendar APIs
```

### Offline‑first: the local DB is the source of truth

- Every device holds a full **local SQLite** database (via **Drift** in Flutter).
  All reads/writes hit local storage first, so the UI is instant and **fully
  functional offline** — quick‑capture can never be blocked by the network
  (Pillar 1).
- A **background sync engine** pushes/pulls deltas when connectivity allows. The
  server (Postgres) is the shared canonical copy that reconciles devices, but the
  user never *waits* on it.
- **Conflict resolution:** per‑field last‑write‑vote with sensible merges (e.g.
  completing a task on one device and editing its note on another both survive).
  Tombstones for deletes. Each row carries `updated_at` + a device/lamport clock.
- **Build vs buy the sync:** start pragmatic with Supabase's realtime + a
  hand‑rolled delta sync over the Drift DB; if it groans at scale, adopt a
  purpose‑built local‑first sync engine (PowerSync, ElectricSQL, or Turso embedded
  replicas) — the data model is designed to allow that swap without a rewrite.

### Sync backend — Supabase

Chosen for speed‑to‑market, low cost, and no lock‑in on the data (it's just
Postgres):
- **Postgres** with **row‑level security** so each user only ever touches their own
  rows — the security boundary is in the database, not just the app.
- **Auth** with Sign in with Apple (expected on iOS), Google, and email.
- **Realtime** change feed to drive near‑instant cross‑device sync.
- **Edge functions** for the server‑side jobs: push orchestration, the
  model‑backed "break it down"/NL features, email‑to‑task, and calendar sync.
- Self‑hostable / swappable later if needed.

## Notifications — the part that must not fail

Two complementary mechanisms:

1. **On‑device scheduled local notifications** (`flutter_local_notifications`;
   Windows toast). These fire **without any server or network** — the reliable
   backbone. Most reminders are scheduled locally the moment the task is created,
   so they work on a plane, offline, forever.
2. **Server push** (APNs / WNS via edge functions) for what local can't do:
   cross‑device changes, dynamic/smart‑timed nudges, and delivering
   **time‑sensitive / critical alerts**.

ADHD‑specific delivery, mapped to Pillar 5:
- **Time‑sensitive interruption level** (iOS) so important reminders pierce
  Focus/DND; **Critical Alerts** (requires an Apple entitlement + explicit user
  opt‑in) for the small set the user marks as unmissable — sounds even on silent.
- **Escalation / re‑nudge:** schedule a follow‑up local notification at
  creation/reminder time; cancel it when the task is completed. If the task is
  still open, the re‑nudge fires. Purely on‑device, so it's reliable.
- **Actionable notifications:** Complete / Snooze / Start‑2‑min as notification
  actions (iOS `UNNotificationAction`, Windows toast buttons), handled without
  opening the app.
- **Location reminders:** iOS region monitoring (`CLRegion`) for arrive/leave.

## iOS‑specific surfaces (each maps to a pillar)

- **App Intents / Siri** + **Lock Screen / Control Center / Action Button** capture
  (P1).
- **WidgetKit** Home/Lock Screen widgets: quick‑add + "today's few" glanceable view
  (P1, P2).
- **Live Activities / Dynamic Island** for the running focus timer — the shrinking
  clock on the Lock Screen (P4).
- **Apple Watch** app: capture, reminders, timer (P1, P5).
- **Haptics** on completion (P6).
- **Share Extension** for share‑sheet capture (P1).

## Windows‑specific surfaces

- **Global hotkey** capture popover over any app; **system‑tray** quick‑add (P1).
- **Windows toast notifications** with action buttons (P5).
- **Floating always‑on‑top mini‑window** for the focus timer (P4).
- **Start‑with‑Windows / background agent** so reminders fire even when the main
  window is closed.
- **Keyboard‑first** navigation throughout.

## Data model (core entities)

```
User(id, auth, prefs: {capacity, notif_intensity, theme, quiet_hours, …})

Task(
  id, user_id, title, notes,
  list_id?, project_id?, goal_id?, parent_task_id?,   # sub‑tasks via self‑ref
  due_at?, scheduled_for?,                            # "due" vs "planned for today"
  priority(0‑2), status(inbox|today|later|done|dropped),
  time_estimate_min?, energy(low|med|high)?,
  recurrence_rule?,                                   # RRULE‑style
  completed_at?,
  created_at, updated_at, device_clock                # for sync/merge
)

Reminder(id, task_id, fire_at | location_trigger, lead_offset,
         interruption_level(normal|time_sensitive|critical),
         escalate_after_min?, snoozed_until?)

Subtask  → Task with parent_task_id (a task IS the checklist item)

List(id, user_id, name, colour, emoji)
Project(id, user_id, goal_id?, name, progress_cached)
Goal(id, user_id, name, target, progress_cached, next_action_task_id?)
Routine(id, user_id, goal_id?, recurrence_rule, streak, grace_days_left)

FocusSession(id, task_id, started_at, ended_at, planned_min, actual_min)
   # actual vs planned feeds the estimation‑feedback loop (P4)

Event(id, user_id, source(google|apple|outlook), external_id, start, end)  # v1 cal sync
```

Design notes tying model → principles:
- **`scheduled_for` is separate from `due_at`.** "Planned for today" (the daily
  loop, P2) is distinct from a hard deadline (P4) — a distinction most apps blur and
  ADHD users need kept clear.
- **`status` carries `inbox`** so capture‑without‑filing is a first‑class state (P1).
- **`FocusSession` logs planned vs actual** to power the gentle estimation feedback
  (P4).
- **`grace_days_left`** on routines encodes the *forgiving* streak (P6/P7) in the
  data, not just the UI.
- **`next_action_task_id`** on a goal makes "always show the next physical action"
  (P8) a cheap lookup, not a computation guess.

## Privacy, security, cost

- **RLS in Postgres** as the hard boundary; **TLS** everywhere; sensitive local DB
  can be OS‑keychain‑encrypted.
- **Data minimisation:** location reminders resolve on‑device where possible; only
  what's needed leaves the device. A **full‑export** (JSON) and account deletion
  from day one.
- **Cost profile:** Supabase + APNs (free) + WNS + a small model spend for
  "break it down"/NL keeps early running costs low; the architecture scales to a
  paid‑subscription business without re‑platforming.

## Build sequencing (feeds the roadmap)

1. Flutter app skeleton + Drift local DB + core task CRUD (offline).
2. Local scheduled notifications + Today/Plan‑my‑day + Focus timer + reward moment
   → **an ADHD‑useful app even before sync exists.**
3. Supabase auth + sync → the "one brain on two devices" promise.
4. Native surfaces (widgets, App Intents, hotkey, Live Activities) + push +
   time‑sensitive/critical + break‑it‑down + calendar.
