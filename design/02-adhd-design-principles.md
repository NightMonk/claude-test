# 02 · The ADHD design engine

This is the document that makes Tempo *Tempo*. Everything in the feature spec
traces back to one of these eight pillars. Each pillar states the neuroscience in
plain terms, then the concrete product features it drives.

The through‑line: **ADHD is an executive‑function and dopamine‑regulation
difference, not a knowledge problem.** People with ADHD usually *know* what to do.
The app's job is to scaffold the *doing* — initiation, time, memory, emotion —
not to store more information.

---

## Pillar 1 — Frictionless capture (protect working memory)

**Why.** ADHD working memory is leaky: an idea or obligation that isn't recorded
in the first few seconds is often genuinely gone, not merely forgotten. So the
cost of capture must be *lower than the cost of trying to hold it in your head*.
Any moment of friction — unlock, find app, pick a list, fill fields — is where the
thought dies.

**Features it drives:**
- **3‑second capture, one thumb.** Launch straight into a text field. Type or
  speak. Done. No mandatory list, date, or priority — those are optional and
  editable later.
- **Voice capture** ("Remind me to move the car before 6") with on‑device‑grade
  natural‑language parsing of the date/time/list.
- **Capture from everywhere:** iOS Lock Screen widget + Control Center + Action
  Button + Siri/App Intents ("Hey Siri, add to Tempo…"); Share Sheet (turn any
  link/message into a task); on **Windows**, a **global hotkey** (e.g. `Ctrl+Alt+Space`)
  that pops a capture bar over any app, plus tray quick‑add.
- **Inbox, not filing.** Everything captured lands in a single **Inbox**. Sorting
  into lists/projects is a *separate, optional, later* activity — decoupling
  capture from organisation is the whole point.
- **Natural language everywhere:** `"pay rent every 1st #home !high"` parses to a
  recurring high‑priority task in the Home list.

> Design rule: **capture must never show a spinner, require a network, or ask a
> question.** If sync is down, it queues locally and still succeeds.

---

## Pillar 2 — Anti‑overwhelm (protect against the wall)

**Why.** A long visible list triggers overwhelm → the freeze/avoidance response →
nothing gets done → shame. The list, meant to help, becomes the obstacle. ADHD
brains need a *small, finite, achievable‑looking* set of choices.

**Features it drives:**
- **"Today" shows a deliberately small set.** The default focus is *today's plan*,
  not the backlog. Everything else is one tap away but out of sight by default.
- **A soft daily capacity.** You pick (or the app suggests) how many tasks / how
  many "focus points" today can hold. Try to overload it and Tempo gently pushes
  back: *"That's a big day — move something to tomorrow?"* — a suggestion, never a
  block.
- **One thing at a time — "Focus mode."** A full‑screen view of a *single* task
  and nothing else. The ultimate anti‑overwhelm surface.
- **Progressive disclosure.** Sub‑tasks, notes, and metadata are collapsed until
  asked for. The default card is calm.
- **Hide, don't delete.** Backlog, "someday," and snoozed items are genuinely out
  of view — not greyed at the bottom of the same list creating visual noise.
- **No count‑of‑doom badges by default.** An app icon reading "47" is a punishment.
  Badges are opt‑in and default to *today only*, or off.

---

## Pillar 3 — Initiation help (the "just start" engine)

**Why.** The single most disabling ADHD symptom for tasks is **initiation** — the
gap between intending to start and actually starting. It's not motivation; the
brain struggles to *engage the starter motor*, especially for boring or ambiguous
tasks. **No mainstream task app addresses this at all.** This is Tempo's signature.

**Features it drives:**
- **"Just start — 2 minutes" button** on every task. One tap starts a 2‑minute
  timer and drops you into Focus mode with only that task. The deal with yourself:
  *just two minutes, then you may stop.* (Usually you don't — starting was the
  whole barrier.)
- **Auto‑breakdown → first physical action.** Tap **"Break it down"** on a vague
  task ("do taxes") and Tempo proposes concrete sub‑steps, with the crucial first
  one phrased as a *tiny physical action* ("open the folder marked Tax"). Powered
  by an on‑device/served model; fully editable. This defeats the "I don't know
  where to begin" freeze.
- **"What can I do right now?" / Pick‑for‑me.** Overwhelmed by choosing? One tap
  and Tempo *chooses a single task for you* based on energy, time available, and
  priority — removing the decision, which is itself the barrier.
- **Energy & effort tags** (⚡low / medium / 🔋high, and a rough time estimate).
  When you have "10 minutes and low energy," Tempo shows only tasks that fit —
  matching task to current state instead of demanding willpower.
- **Body‑doubling / focus sessions** (v1+): start a timed focus session, optionally
  with ambient sound or a virtual "co‑working" presence — the well‑documented ADHD
  trick of working alongside someone.

---

## Pillar 4 — Make time visible (fight time blindness)

**Why.** ADHD comes with a distorted sense of time: poor estimation, and — the
big one — **time is "now" or "not now."** A deadline three days out feels
non‑existent until it's suddenly today. Elapsed time during a task is invisible,
so "quick" tasks devour hours. The fix is to make time *perceptible and spatial*.

**Features it drives:**
- **Visual countdown timers** — a shrinking ring/bar you can *see*, not just digits.
  Used for focus sessions and time‑boxed tasks. (Inspired by the Time Timer, a
  staple ADHD tool.)
- **Time estimates on tasks**, and a running **"time committed today vs time
  left in your day."** If you've scheduled 9 hours of tasks into a 5‑hour evening,
  you *see* it — the classic ADHD over‑commitment made visible.
- **"Time until" made concrete.** Instead of only "due Thursday," show
  "due in 2 days" and, as it nears, escalate the visual weight — so *not now*
  gradually becomes *now* before the surprise.
- **Elapsed‑time awareness.** During a focus session, a gentle visible/optional
  audible marker of how long you've been going, countering hyperfocus black‑holes.
- **Estimation feedback loop.** Log actual vs estimated time; over weeks Tempo
  gently shows your personal "you usually take ~2× your estimate" so planning
  slowly gets more realistic — without judgement.

---

## Pillar 5 — Reminders that actually break through

**Why.** A single notification is useless to an ADHD brain: it's dismissed
reflexively before it's even read, and then — out of sight — it never existed. And
during hyperfocus, one ping won't land at all. Reminders must be **persistent,
escalating, and hard to silently lose**, while never becoming so annoying they get
disabled.

**Features it drives:**
- **Time‑sensitive & (opt‑in) critical alerts.** Mark a task *important* and its
  reminder is delivered time‑sensitive (breaks through Focus/DND on iOS); the most
  important can use Critical Alerts to sound even on silent. Used sparingly, by the
  user's choice.
- **Escalation & re‑nudge.** If a reminder is dismissed but the task isn't done,
  Tempo can nudge again after a chosen interval ("still need to do this?") instead
  of giving up after one ping. Configurable, and easy to turn off per task.
- **Location reminders** ("when I leave home," "when I arrive at the office") — for
  tasks bound to place, not time.
- **Multiple lead‑times** without fuss: a nudge the day before *and* an hour before
  *and* at the time — because one warning isn't enough.
- **Actionable notifications.** Complete, Snooze (5m/1h/tonight/tomorrow), or
  "Start 2‑min focus" *directly from the notification* — because opening the app is
  itself a friction point where the intention dies.
- **Smart, humane snooze.** Snoozing is expected, not a failure. Snooze options are
  contextual ("tomorrow morning," "this evening").

---

## Pillar 6 — Reward the brain (dopamine by design)

**Why.** ADHD is characterised by lower baseline dopamine and a hunger for
immediate reward; delayed, abstract payoffs (a tidy list, "being responsible")
don't motivate. So completion has to deliver an *immediate, felt* hit, and progress
must be *visible and tangible*.

**Features it drives:**
- **Deeply satisfying completion.** A great check animation, an optional sound, a
  little haptic on iPhone. Completing a task should feel *good*, on purpose.
- **"Done today" list.** Completed tasks don't vanish — they move to a visible
  **Done** trophy area so you can *see the pile of things you accomplished.* This
  is powerful for a brain that otherwise remembers only what it didn't do.
- **Momentum, streaks & gentle gamification.** Daily momentum, streaks for routines,
  small celebratory milestones. **Crucially: streak breaks are forgiving** — a
  "streak freeze"/grace day, and never a shaming reset — because punishing gamification
  backfires hard for ADHD.
- **Progress you can feel** on goals and projects — filling rings/bars, not just
  "3/10." Visual progress is a reward in itself.
- **Optional rewards you define.** Let the user attach their own reward to finishing
  a dreaded task ("then I get an episode") — self‑administered dopamine.

> Design rule: **reward for done; never punish for not‑done.** No red overdue
> counters, no guilt copy, no broken‑heart streak imagery.

---

## Pillar 7 — Be kind (no‑shame architecture)

**Why.** ADHD comes bundled with years of accumulated failure‑shame around exactly
this domain ("Rejection Sensitive Dysphoria"). A tool that scolds, piles up red
"overdue," or makes the user feel behind will be *deleted* — abandonment is an
emotional self‑protection, not a usability failure. Kindness is retention.

**Features it drives:**
- **Overdue tasks roll forward gently** as "still to do," not a growing red wall of
  shame. No punitive overdue styling.
- **Encouraging, human copy.** "Nice — that's done," "Big day, want to lighten it?"
  Never "You have 12 overdue tasks."
- **Easy, guilt‑free rescheduling.** Bulk "move everything I didn't do to
  tomorrow" in one tap. Life happens.
- **A "someday / maybe" home** for aspirational tasks so they're captured without
  nagging.
- **Missed a day of planning?** No penalty, no red — just "welcome back, here's
  today" when you return.

---

## Pillar 8 — Goals that reach down to today

**Why.** Long‑term, abstract goals are the hardest thing for an ADHD brain to act
on: the payoff is distant (low dopamine) and the path is ambiguous (initiation
freeze). Goals fail not from lack of desire but from never connecting to a
concrete *next physical action today*. TickTick barely does this; Any.do doesn't.

**Features it drives:**
- **Goal → Project → Next action hierarchy.** A goal ("get fit," "launch the side
  project") holds projects/milestones, which hold tasks — and Tempo always surfaces
  **the single next action** for each goal, so a goal is never a vague cloud.
- **Goals visible in the daily loop.** During daily planning, Tempo can nudge:
  *"You have a goal 'learn Spanish' — want to pull its next step into today?"* so
  goals don't rot in a folder.
- **Milestones with visible progress** and reward moments when hit.
- **Routines/habits as goal engines.** Recurring routines ("gym Mon/Wed/Fri")
  attach to goals, so the daily grind visibly feeds the big picture.
- **Reflection, lightweight & optional.** A gentle weekly review — what moved, what
  to carry forward — designed to take two minutes, not become another chore.

---

## How the pillars combine — a day in the life

1. **07:40, bus stop.** A task pops into your head. Long‑press the Lock Screen
   widget, say *"email the school about the trip form by Friday."* Captured in 3s,
   parsed to Friday, dropped in Inbox. *(P1)*
2. **09:00, at your PC.** Windows notification: *"Plan your day?"* You spend 90
   seconds dragging 5 things into Today — Tempo warns the 6th would overload you.
   *(P2, P7)*
3. **11:00.** "Do quarterly report" is a wall. Tap **Break it down** → first step
   "open last quarter's doc and copy the template." Tap **Just start (2 min).**
   Focus mode fills the screen; a shrinking ring shows the time. *(P3, P4)*
4. **11:26.** You finish. Big satisfying check + haptic; it slides into **Done
   today**, which now shows 4 wins. *(P6)*
5. **17:30.** You'd forgotten the school email. The reminder fires, you swipe it
   away on reflex — but it's marked important, so 10 minutes later it *nudges again*.
   This time you tap **Complete** from the notification. *(P5)*
6. **21:00.** Two tasks undone. No red, no guilt — one tap rolls them to tomorrow.
   Your "learn Spanish" goal ring ticked up because you did a 5‑minute lesson. *(P7, P8)*

Every one of those moments is a place a normal task app loses an ADHD user. Tempo
is the sum of not losing them.
