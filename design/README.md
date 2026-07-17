# Tempo — an ADHD‑first to‑do, reminder & goals app

> **Working name:** *Tempo* (alternatives: *Cadence*, *Nudge*, *Momentum*, *Anchor*).
> The name is a placeholder — see [naming](#naming) below.

**One line:** the cross‑platform (iPhone + Windows) task app that does the two
things ADHD brains find hardest — *starting* and *remembering* — for you, so a
task list stops being a wall of guilt and starts creating momentum.

Tempo takes the parts of **TickTick** (structured lists, powerful natural‑language
reminders, calendar, habits, built‑in Pomodoro) and **Any.do** (clean daily
planning, "My Day" ritual, effortless quick capture, voice entry) and rebuilds
them around one question: *what does an ADHD brain actually need to get a thing
done?*

---

## What's in this design package

| Doc | What it covers |
| --- | --- |
| [`01-product-vision.md`](01-product-vision.md) | The problem, who it's for, the product principles, and an honest TickTick vs Any.do comparison |
| [`02-adhd-design-principles.md`](02-adhd-design-principles.md) | **The heart of it** — the 8 ADHD design pillars and the concrete features each one drives |
| [`03-features.md`](03-features.md) | The full feature spec: MVP, v1, and later. What each feature does and why |
| [`04-ux-and-screens.md`](04-ux-and-screens.md) | Navigation model, the key screens, and the flows that matter most (capture, plan, focus) |
| [`05-architecture.md`](05-architecture.md) | Tech stack for iPhone **and** Windows, offline‑first sync, the data model, and how reminders actually fire reliably |
| [`06-roadmap.md`](06-roadmap.md) | A phased build plan — what to ship first and why |
| [`prototype/index.html`](prototype/index.html) | A clickable visual prototype of the core screens — open it in a browser |

**Start here:** read `02-adhd-design-principles.md` first. It's what makes this
different from "TickTick with a different colour scheme."

---

## The 30‑second pitch

Most task apps are *storage*. You put tasks in; they sit there; you feel bad.
For an ADHD brain the hard part was never storage — it's **initiation** (getting
started), **time blindness** (losing all sense of how long things take or how
much time is left), **working memory** (out of sight = genuinely gone), and
**the crash of an overwhelming list** (30 visible tasks → freeze → do none).

Tempo is built around those four, not around folders and tags:

- **Capture in under 3 seconds** — one thumb, or your voice, from anywhere,
  including the lock screen and a Windows global hotkey. Sorting happens later,
  never at the moment of the idea.
- **A "Today" that can't overwhelm you** — you're shown a *small, finite* set of
  things for today. The other 200 tasks exist but are deliberately out of sight.
- **Help *starting*, not just tracking** — a "Just start (2 min)" button, an
  auto‑breakdown that turns "do taxes" into a first tiny step, and a focus timer
  with a visible shrinking clock for time blindness.
- **Reminders that break through** — time‑sensitive, escalating, location‑ and
  time‑based, that survive Do‑Not‑Disturb when you mark something as important,
  and *nudge again* if you ignored them (because you will).
- **Reward the brain, gently** — satisfying completion, streaks and momentum you
  can feel, and a "done today" list that proves you did things — without shame
  when you didn't.
- **Goals that connect to today** — long‑term goals break down into projects and
  the *next physical action*, so a goal is never a vague cloud you avoid.

---

## Naming

`Tempo` is used throughout these docs as a concrete working name so the writing
isn't littered with "the app". Rank order of the options, with rationale:

1. **Tempo / Cadence** — both evoke *rhythm and pace*, which speaks directly to
   the time‑blindness and momentum themes. Cadence is less likely to clash.
2. **Nudge** — captures the gentle, repeated prompting, but undersells the goals side.
3. **Momentum / Anchor** — both are taken by well‑known apps; usable as internal
   codenames only.

Pick the final name before any public store listing; it doesn't affect the design.

---

## Key decisions at a glance

- **Client:** one **Flutter** codebase for iOS and Windows (native performance,
  full access to notifications/widgets/Live Activities, and the pixel‑level control
  the custom ADHD‑friendly UI needs). See `05-architecture.md` for why not a PWA
  or React Native.
- **Model:** **offline‑first.** The app is fully usable with no connection; a sync
  engine reconciles in the background. Quick‑capture can *never* be blocked by a
  spinner.
- **Reminders:** on‑device scheduled local notifications (fire with no server)
  **plus** server push for cross‑device and time‑sensitive/critical alerts.
- **Sync backend:** Postgres via **Supabase** (auth + realtime + row‑level
  security) fronted by a local SQLite cache. Pragmatic, cheap, and it scales.
