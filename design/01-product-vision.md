# 01 · Product vision

## The problem

Task apps are designed for brains that already have the executive function to use
them. The unspoken assumptions in almost every to‑do app are:

- *You will remember to open the app.*
- *You will process your inbox and organise tasks into the right lists.*
- *Seeing a task written down will help you start it.*
- *A due date is enough of a nudge.*
- *A long list is a neutral thing to look at.*

For roughly 1 in 20 adults with ADHD, **every one of those assumptions is false.**
The result is a graveyard of abandoned productivity apps and a background hum of
shame. The failure isn't laziness or lack of trying — it's that the tools fight
the way the brain works instead of scaffolding around it.

The specific breakdowns, in the user's own experience:

| The moment | What actually happens with ADHD | What most apps do |
| --- | --- | --- |
| An idea/task appears | It's *urgent to capture* — if not caught in seconds it's gone (working memory) | Make you open the app, pick a list, set fields |
| Opening the list later | 40 items, no obvious start → overwhelm → freeze → close app | Show everything, sorted by date |
| Trying to start a task | "Do taxes" is a wall; can't find the first physical step | Just displays the task text |
| A reminder fires | Dismissed reflexively in 0.5s, instantly forgotten | Fires once, silently gives up |
| Losing track of time | 20 min "quick check" becomes 3 hours; deadlines arrive by surprise | Static due dates, no sense of *elapsed/remaining* |
| Finishing something | No reward registered; the win evaporates | A line quietly disappears |
| A long‑term goal | Too abstract to act on; avoided until it's a crisis | A folder you never open |

## Who it's for

**Primary:** adults with ADHD (diagnosed or self‑identified) who have *tried and
bounced off* mainstream task apps. They are motivated, often intelligent and
capable, and specifically underserved by tools that assume intact executive
function. The user commissioning this is exactly this person.

**Secondary, who benefit from the same design:**
- People with anxiety/overwhelm around task lists.
- Anyone who wants a calmer, lower‑friction planner (good ADHD design is just
  good design — the curb‑cut effect).
- Students and knowledge workers juggling many small commitments.

**Explicitly *not* the target:** power users who want maximal configurability,
nested tags, and dense information. Tempo makes a deliberate trade: **less to
configure, more that just works.** That is a feature, not a limitation.

## Product principles

These are the tie‑breakers. When a design decision is unclear, the earlier
principle wins.

1. **Reduce friction to near zero at the moment of intent.** Capturing and
   starting must be effortless. Organising can be as fiddly as you like *later* —
   never in the hot path.
2. **Protect the user from their own list.** Never show an overwhelming wall.
   Default to *less visible*. The full backlog exists but is opt‑in to look at.
3. **Help the user *act*, not just record.** Every screen should answer "what do
   I do *right now*?" A perfectly organised list that produces no action is a
   failure.
4. **Externalise memory and time.** Assume the user will forget everything and
   has no internal clock. The app is the prosthetic. Make time *visible*.
5. **Be kind. No shame, ever.** Missed tasks roll forward gently. No red guilt
   badges, no "you failed" language, no punishing streak resets. Encouragement
   beats nagging.
6. **Reward completion so the brain feels it.** Dopamine is the currency. Make
   finishing genuinely satisfying — sound, motion, momentum, visible proof of
   done.
7. **One brain, everywhere.** iPhone and Windows are the same brain in two places.
   Instant, invisible sync. What you capture on your phone at the bus stop is on
   your PC when you sit down.

## Competitive read: TickTick vs Any.do (and where Tempo sits)

We're explicitly building "a crossover of the two." Here's the honest read of
what each does well and where each leaves the ADHD user unsupported.

### TickTick — the powerful one

**Take the best of:**
- **Natural‑language task entry** — type "call dentist tomorrow 3pm #health" and
  it parses date, time, and list. This is *gold* for low‑friction capture. Tempo
  matches and extends it (voice).
- **Built‑in Pomodoro / focus timer** tied to tasks. Directly serves focus and
  time‑blindness. Tempo makes it more visual and central.
- **Habit tracking** alongside tasks. Useful; Tempo folds this into "routines."
- **Multiple views** (list, calendar, Kanban, Eisenhower matrix, timeline).
- **Powerful recurring rules** and a real calendar.

**Where it leaves ADHD users behind:**
- **Feature density = overwhelm.** So many views, settings, and fields that setup
  itself is a task you'll avoid. Choice paralysis.
- **The list can still become a 50‑item wall.** No mechanism that *protects* you
  from your own backlog.
- **Doesn't help you start.** Great at storing and scheduling, silent on initiation.
- **Reminders are ordinary** — one ping, easily dismissed and forgotten.

### Any.do — the calm one

**Take the best of:**
- **"My Day" / Plan‑my‑day ritual** — each morning you triage tasks into today or
  later. A lightweight daily planning habit that fights the "everything at once"
  problem. Tempo makes this the centre of gravity.
- **Clean, minimal, friendly UI.** Low visual load. Fewer decisions.
- **Fast quick‑capture and voice entry.** Good friction profile.
- **Nice moments** (the satisfying swipe‑to‑complete, the "clear my day" gesture).

**Where it leaves ADHD users behind:**
- **Power is paywalled and shallow** — recurring reminders and many basics sit
  behind premium; the free tier frustrates.
- **Weak focus/time tooling** — no strong Pomodoro/time‑visualisation story.
- **Goals are thin.** Little structure for long‑term goals → next actions.
- **Reminders again fire once and give up.**

### Tempo's position

> **Take Any.do's calm daily‑planning ritual and low friction, add TickTick's
> natural‑language capture, focus timer and structured power — and then add the
> layer neither has: an ADHD‑specific engine for *starting*, *time perception*,
> *breakthrough reminders*, and *reward*.**

|  | TickTick | Any.do | **Tempo** |
| --- | --- | --- | --- |
| Low‑friction capture | ◑ (typed NL) | ● | ● (typed NL **+ voice + lock‑screen + hotkey**) |
| Daily planning ritual | ◑ | ● | ● (**central**, and it *limits* today's load) |
| Protects from overwhelm | ○ | ◑ | ● (**core mechanic**) |
| Helps you *start* | ○ | ○ | ● (**2‑min start, auto‑breakdown**) |
| Time‑blindness aids | ◑ (timer) | ○ | ● (**visual timers, time estimates, "time left today"**) |
| Breakthrough reminders | ◑ | ◑ | ● (**escalating, time‑sensitive, re‑nudge**) |
| Reward / dopamine | ◑ | ◑ | ● (**designed for it**) |
| Goals → next action | ◑ | ○ | ● |
| Cross‑platform iOS+Windows | ● | ◑ | ● |
| Not overwhelming to *set up* | ○ | ● | ● |

○ = weak/absent ◑ = partial ● = strong

The winning combination is **Any.do's restraint + TickTick's capability +
an ADHD engine that is genuinely novel.** The restraint is what keeps the
capability from becoming overwhelm.
