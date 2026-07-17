# 03 · Feature specification

Features are grouped by release and tagged with the ADHD pillar(s) they serve
(P1–P8 from `02-adhd-design-principles.md`). The guiding rule: **the MVP must
already feel ADHD‑first** — the differentiators can't all be "later," or the MVP
is just another to‑do app. So the initiation, anti‑overwhelm, and reward pillars
appear from day one, in their simplest form.

Legend: **[MVP]** first shippable · **[v1]** the complete first public release ·
**[Later]** post‑launch.

---

## Capture & tasks

- **[MVP]** **Quick‑add with natural language.** Type `call dentist tomorrow 3pm
  #health !high` → parses date, time, list, priority. Nothing is mandatory but the
  text. *(P1)*
- **[MVP]** **Inbox.** Default landing bucket for anything captured without a home.
  *(P1, P2)*
- **[MVP]** **Task object:** title, optional notes, due date/time, reminder(s),
  list/project, priority, sub‑tasks, **time estimate**, **energy tag**, tags. *(P1)*
- **[MVP]** **Sub‑tasks / checklists** with progress. *(P2, P8)*
- **[MVP]** **Recurring tasks** (daily, weekly, "every 1st," "every weekday,"
  "every 3 days," after‑completion recurrence). *(P5)*
- **[v1]** **Voice capture** with NL parsing. *(P1)*
- **[v1]** **Share‑sheet capture** (iOS) — turn a link, email, or message into a task.
- **[v1]** **Windows global hotkey + tray quick‑add.** *(P1)*
- **[v1]** **Siri / App Intents + Lock Screen / Control Center capture** (iOS). *(P1)*
- **[Later]** **Email‑to‑task** address; **calendar‑event → task**; **paste a list**
  → multiple tasks.

## The daily loop (anti‑overwhelm core)

- **[MVP]** **"My Day" view** — the home screen (Any.do-inspired). Shows a *small*
  set: tasks you've **added to My Day** today + anything due/overdue. Backlog is *not*
  shown here. **My Day is a separate flag from the due date** (add a task to today's
  focus without inventing a deadline; auto-clears daily). A week strip lets you jump
  to any day's timeline. *(P2, P3)*
- **[MVP]** **Plan‑my‑day ritual.** A guided, swipe‑through triage: for each
  candidate task, *Today / Tomorrow / Later / Done*. Fast, one‑handed. *(P2, P7)*
- **[MVP]** **Soft daily capacity** with a gentle over‑commit warning. *(P2, P4)*
- **[v1]** **"Time committed vs time left today"** meter (uses time estimates). *(P4)*
- **[v1]** **Auto‑rollover** of undone tasks to tomorrow, framed kindly (opt‑in per
  list; never a red pile). *(P7)*
- **[v1]** **Bulk reschedule** ("move all undone → tomorrow"). *(P7)*

## Initiation engine (the signature layer)

- **[MVP]** **"Just start — 2 min"** button → starts a 2‑minute timer in Focus mode.
  *(P3)*
- **[MVP]** **Focus mode** — full‑screen single task, nothing else. *(P2, P3)*
- **[MVP]** **Energy & time‑estimate tags** + a **"fits my 10 minutes"** filter. *(P3, P4)*
- **[v1]** **Break it down** — model‑assisted decomposition of a vague task into
  concrete steps, first step phrased as a tiny physical action; fully editable. *(P3)*
- **[v1]** **"Pick something for me"** — Tempo chooses one task given time + energy +
  priority, removing the decision. *(P3)*
- **[Later]** **Body‑doubling sessions** (ambient/co‑working focus rooms). *(P3)*

## Focus & time (time‑blindness core)

- **[MVP]** **Pomodoro / focus timer** attached to a task, with a **visual
  shrinking ring**. Configurable work/break. *(P3, P4)*
- **[MVP]** **Big visible countdown** during any timed session. *(P4)*
- **[v1]** **Live Activity / lock‑screen timer** (iOS) and **taskbar/mini‑window
  timer** (Windows) so the running clock is always visible. *(P4)*
- **[v1]** **Actual‑vs‑estimated time logging** + gentle personal estimation
  feedback over time. *(P4)*
- **[Later]** **Focus stats** (time focused, best times of day) — insight, never
  judgement.

## Reminders & notifications

- **[MVP]** **Scheduled local notifications** (fire with no server). *(P5)*
- **[MVP]** **Multiple lead‑times** per task (e.g. day‑before + 1‑hour + at‑time). *(P5)*
- **[MVP]** **Actionable notifications:** Complete / Snooze / Start‑2‑min from the
  notification itself. *(P5)*
- **[MVP]** **Smart snooze** (contextual options). *(P5, P7)*
- **[v1]** **Time‑sensitive & (opt‑in) Critical alerts** for *important* tasks
  (break through Focus/DND). *(P5)*
- **[v1]** **Escalation / re‑nudge** if dismissed but not done. *(P5)*
- **[v1]** **Location reminders** (arrive/leave a place). *(P5)*
- **[Later]** **Smart timing** — learn when you actually act and time nudges for it.

## Reward & momentum

- **[MVP]** **Satisfying completion** animation + optional sound + haptic. *(P6)*
- **[MVP]** **"Done today"** visible accomplishment list. *(P6)*
- **[MVP]** **No‑shame defaults:** no overdue‑red, no doom badge, encouraging copy. *(P7)*
- **[v1]** **Streaks & momentum** for routines, with **forgiving grace days**. *(P6, P7)*
- **[v1]** **Milestone celebrations** on goals/projects. *(P6, P8)*
- **[Later]** **User‑defined rewards** attachable to dreaded tasks; **weekly "your
  wins" recap.** *(P6)*

## Lists, projects & organisation

- **[MVP]** **Lists** (e.g. Home, Work, Errands) with colour/emoji. *(P2)*
- **[MVP]** **Priority** (a simple 3‑level, not a 4‑quadrant matrix — restraint). *(P2)*
- **[v1]** **Projects** (a list with a goal + progress). *(P8)*
- **[v1]** **Views:** List + Calendar. *(deliberately fewer than TickTick — no
  Kanban/Eisenhower at launch; restraint over power.)* *(P2)*
- **[Later]** **Tags & saved smart filters** (opt‑in power‑user layer, hidden by
  default). **Kanban / timeline** if demanded.

## Goals & routines

- **[MVP]** **Simple goals** with a name, target, and linked tasks; surfaces the
  **next action**. *(P8)*
- **[MVP]** **Routines/habits** (recurring, with streaks). *(P6, P8)*
- **[v1]** **Goal → project → next‑action** hierarchy with visual progress rings. *(P8)*
- **[v1]** **Goal nudges in daily planning** ("pull a goal step into today?"). *(P8)*
- **[Later]** **Lightweight weekly review**; **goal templates** (fitness, study, admin). *(P8)*

## Calendar & scheduling

- **[v1]** **Two‑way calendar sync** (Google/Apple/Outlook) so tasks and events
  share one timeline (avoids the ADHD "two systems" split). *(P2, P4)*
- **[v1]** **Time‑blocking** — drag a task onto the calendar to reserve time. *(P4)*
- **[Later]** **Auto‑schedule** — Tempo proposes when to do tasks around your events.

## Cross‑platform, sync & account

- **[MVP]** **Offline‑first** local storage; the app is fully usable offline. *(P1)*
- **[MVP]** **Account + background sync** across iPhone and Windows. *(P7 — one brain)*
- **[v1]** **Home/Lock‑screen widgets** (iOS) and **Windows widget/mini‑window**. *(P1, P2)*
- **[v1]** **Apple Watch** quick‑add + reminders + timer. *(P1, P5)*
- **[Later]** **Web app**; **Android** (same Flutter codebase makes this cheap);
  **sharing/collaboration** on lists.

## Accessibility & personalisation (ADHD‑relevant, not optional polish)

- **[MVP]** **Reduce‑noise / minimal mode**, calm default theme, generous spacing,
  large tap targets. *(P2)*
- **[v1]** **Dark mode & high‑contrast**, **dyslexia‑friendly font option**,
  **reduce‑motion** respect, adjustable text size. *(broad accessibility)*
- **[v1]** **Notification intensity control** — from gentle to insistent — so each
  user tunes the nag/kind balance to themselves. *(P5, P7)*
- **[Later]** **Themes / customisation** as an *earned, contained* dopamine reward,
  not a setup burden.

---

## Explicitly *out of scope* (restraint is a feature)

To protect Pillar 2 (anti‑overwhelm) and a shippable scope, the first releases
**deliberately omit**: nested tag hierarchies, Eisenhower matrix, Kanban boards,
timeline/Gantt, heavy team collaboration, and a maze of settings. These can arrive
later, opt‑in and hidden by default — but the product's identity is *the calm one
that helps you start*, not *the one with the most features*. Every feature added is
weighed against the overwhelm it introduces.
