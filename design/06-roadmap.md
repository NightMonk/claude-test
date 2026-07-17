# 06 · Roadmap

The sequencing rule: **every phase must ship something an ADHD user genuinely
prefers over what they use today** — never a "come back when it's finished" app.
The differentiators (initiation, anti‑overwhelm, reward) appear in Phase 1, not
bolted on later. If they were deferred, the MVP would just be another to‑do app
and would test badly with exactly the users it's for.

---

## Phase 0 — Foundations (≈ weeks 1–3)

*Goal: a skeleton that proves the cross‑platform + offline spine.*

- Flutter project targeting **iOS + Windows**; shared design system (calm theme,
  spacing, components).
- **Drift/SQLite** local DB; core `Task`/`List` CRUD, fully offline.
- Quick‑add with **natural‑language parsing** (date/time/list/priority).
- **Inbox** + basic **Today** + **Lists**.

*Not yet shippable to users, but the riskiest tech (cross‑platform, offline, NL
parse) is de‑risked first.*

## Phase 1 — The ADHD MVP (≈ weeks 4–10) → **first real users / TestFlight**

*Goal: the smallest thing that already feels ADHD‑first. This is the make‑or‑break
release — it must demonstrate the signature value.*

- **Today** as the anti‑overwhelm home (small, finite; backlog off the main path). *(P2)*
- **Plan‑my‑day** swipe ritual + **soft capacity** warning. *(P2, P7)*
- **Focus mode** + **Pomodoro timer with visual shrinking ring** + **"Just start –
  2 min."** *(P3, P4)* ← the signature
- **Energy tags + time estimates** + "fits my 10 minutes" filter. *(P3, P4)*
- **Reward moment** (completion animation/haptic/sound) + **"Done today."** *(P6)*
- **No‑shame defaults** (kind rollover, no overdue‑red, no doom badge). *(P7)*
- **Scheduled local notifications**, multiple lead‑times, actionable + smart snooze. *(P5)*
- **Recurring tasks**, **sub‑tasks**, simple **goals** + **routines/streaks**. *(P8, P6)*

*Ship to TestFlight and a small ADHD tester group. This is where you learn whether
the initiation engine actually helps — instrument it.*

## Phase 2 — One brain everywhere (≈ weeks 11–16)

*Goal: deliver the cross‑device promise and the capture‑anywhere pillar.*

- **Accounts + Supabase sync** — instant iPhone ⇄ Windows. *(P7 – one brain)*
- **Windows global hotkey + tray quick‑add.** *(P1)*
- **iOS widgets + App Intents/Siri + Lock‑Screen/Share‑sheet capture.** *(P1, P2)*
- **Voice capture.** *(P1)*
- **Server push + time‑sensitive & critical alerts + escalation/re‑nudge.** *(P5)*
- **Break it down** (model‑assisted first physical step) + **"Pick for me."** *(P3)*
- **Live Activity / lock‑screen focus timer** (iOS); floating timer (Windows). *(P4)*

## Phase 3 — Depth & delight (≈ weeks 17–24) → **public launch**

*Goal: rounding out into a complete, launchable v1.*

- **Two‑way calendar sync** + **time‑blocking** (one timeline for tasks + events). *(P4)*
- **Goal → project → next‑action** hierarchy with visual progress rings + goal
  nudges in daily planning. *(P8)*
- **Location reminders.** *(P5)*
- **Actual‑vs‑estimated** time feedback loop. *(P4)*
- **Apple Watch** app. *(P1, P5)*
- **Accessibility pass:** dark/high‑contrast, dyslexia‑friendly font, reduce‑motion,
  notification‑intensity control. *(broad + P5/P7)*
- Subscription/monetisation in place (see below).

## Phase 4+ — Post‑launch

- **Web app** and **Android** (cheap from the same Flutter codebase).
- **Auto‑schedule** around calendar; **smart nudge timing**; **body‑doubling rooms.**
- **Opt‑in power layer** (tags, saved filters, Kanban) — hidden by default to
  protect anti‑overwhelm.
- **Sharing / light collaboration**; goal templates; weekly "your wins" recap.

---

## Guardrails on the roadmap

- **Restraint is scoped in.** Every candidate feature is weighed against the
  overwhelm it adds (Pillar 2). "TickTick has it" is not a reason to build it.
- **Instrument the signature.** Track whether "Just start," "Break it down," and
  the capacity limit actually move completion — those are the hypotheses the whole
  product rests on. Kill or refine what doesn't help *this* audience.
- **Test with ADHD users continuously**, ideally including people who've abandoned
  other task apps — they surface the friction points that matter.

## Monetisation (brief, since it shapes scope)

Learn from Any.do's mistake — **don't paywall the basics** (recurring reminders
behind a wall is exactly what frustrates users). Suggested shape:

- **Free:** capture, Today/Plan‑my‑day, focus timer, basic reminders, a reasonable
  number of goals/lists — genuinely useful forever.
- **Premium (subscription):** calendar sync, unlimited goals/projects, advanced
  reminders (location, critical alerts, smart timing), break‑it‑down AI, themes,
  Watch extras, stats.
- **Ethos:** the free tier must be enough that an ADHD user *succeeds* with it; paid
  is for power and polish, never for the core "does it help me function" loop.

## Team & effort (rough)

A small team can hit public launch in ~5–6 months: 1–2 Flutter engineers, one with
iOS‑native depth (widgets/App Intents/Live Activities) and one comfortable with
Windows + backend/Supabase, plus a designer who owns the calm/reward feel (which is
core product, not decoration). A solo developer can reach the Phase‑1 MVP alone; the
native‑surfaces phase is where a second pair of hands pays off most.
