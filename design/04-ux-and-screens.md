# 04 · UX & screens

The interface is where the ADHD principles become real. The visual language and
navigation are as much a feature as the timers and reminders.

## Visual & interaction language

- **Calm by default.** Lots of whitespace, one clear focal point per screen, a
  restrained palette. The opposite of a dense dashboard. (Pillar 2)
- **Large tap targets, thumb‑reachable.** Primary actions live in the lower third
  of the phone screen. One‑handed operation is a requirement, not a nicety.
- **One primary action per screen.** Every screen answers "what now?" with an
  obvious next move; secondary actions recede.
- **Motion with meaning.** Satisfying completion animations (reward, P6); gentle,
  never frantic; fully respects Reduce Motion.
- **Colour = state, used sparingly.** Green for done/momentum, a warm accent for
  "now/focus." **No aggressive red for overdue** — muted, never alarming (P7).
- **Progressive disclosure.** Cards are simple; detail expands on demand (P2).
- **Consistent across platforms, native where it counts.** iPhone and Windows share
  layout and logic, but each respects platform conventions (iOS sheets/haptics;
  Windows keyboard‑first, resizable windows, tray).

## Navigation model

**iPhone — a bottom tab bar of five, plus an omnipresent capture button:**

```
┌─────────────────────────────────────┐
│                                     │
│            (screen content)          │
│                                     │
│                                     │
├─────────────────────────────────────┤
│  ⌂        ▤        ⊕        ◎      ✱ │
│ Today  Upcoming  ADD    Goals   More │
└─────────────────────────────────────┘
        the big ⊕ ADD is always one thumb away  (P1)
```

- **Today** (home) · **Upcoming** (calendar/agenda) · **⊕ Add** (center, prominent,
  the capture hero) · **Goals** · **More** (Lists, Focus stats, Done, Settings).
- Backlog/Inbox live *inside* More/Lists, **not** on the home screen — the wall is
  off the main path by design.

**Windows — a left sidebar + a persistent top capture bar + global hotkey:**

```
┌───────────┬─────────────────────────────────────────────┐
│ + Add task…            (global: Ctrl+Alt+Space)          │  ← always‑present capture bar
├───────────┼─────────────────────────────────────────────┤
│ ⌂ Today   │                                             │
│ ▤ Upcoming│              (main content)                   │
│ ◎ Goals   │                                             │
│ ⧉ Lists   │                                             │
│ ⏱ Focus   │                                             │
│ ✓ Done    │                                             │
│ ⚙ Settings│                                             │
└───────────┴─────────────────────────────────────────────┘
```

Windows is keyboard‑first: quick‑add hotkey, arrow/enter to triage, a resizable
mini "focus/timer" window that can float over other apps (P4).

---

## The screens that matter

### 1 · Today (home) — the anti‑overwhelm surface

The most important screen. It must feel *achievable at a glance*, never a wall.

```
┌─────────────────────────────────┐
│  Good morning, Alex             │   friendly, human (P7)
│  Tuesday 7 July                 │
│                                 │
│  ┌───────────────────────────┐  │
│  │  ◔  3 of 5 done today      │  │   momentum, visible progress (P6)
│  │  ~1h 10m left of your plan │  │   time made visible (P4)
│  └───────────────────────────┘  │
│                                 │
│  TODAY                          │
│  ○ Email school re: trip  ⚡ 5m  │   estimate + energy shown (P3,P4)
│     └ [ Just start · 2 min ]    │   initiation, right on the card (P3)
│  ○ Quarterly report      🔋 45m │
│     └ [ Just start ] [ Break ↴ ]│   break‑it‑down inline (P3)
│  ✓ Move the car                 │   done stays visible, satisfying (P6)
│                                 │
│  ⌄ 2 more                       │   the rest is folded away (P2)
│                                 │
│  [ ✨ Pick something for me ]   │   defeats choice paralysis (P3)
│                                 │
└─────────────────────────────────┘
```

Design notes:
- Only a *few* items visible; "2 more" keeps the load low (P2).
- Each card carries its **initiation affordance** ("Just start") and, for vague
  tasks, "Break it down" — *the help to act is on the task itself* (P3).
- The header sells **momentum and time**, not a backlog count (P4, P6).
- **No red, no overdue pile.** Yesterday's undone arrives folded in as "still to
  do," not as failure (P7).

### 2 · Quick capture (the ⊕) — 3‑second entry

```
┌─────────────────────────────────┐
│  What's on your mind?            │
│  ┌───────────────────────────┐  │
│  │ call dentist tomorrow 3pm │  │  ← types OR 🎤 speaks
│  └───────────────────────────┘  │
│   📅 Tomorrow 15:00  #Health     │  ← NL parse preview, editable (P1)
│                                 │
│   🎤  📎        [ Add ]  [ +… ]  │  ← Add = done; +… = optional detail
└─────────────────────────────────┘
```

- Opens straight to a focused text field with the keyboard up (or mic ready).
- **Nothing required but the text.** Parsed date/list/priority shown as removable
  chips. "Add" and you're out — organising is for later (P1).
- Same bar is the Windows global‑hotkey popover and the iOS Lock‑Screen entry.

### 3 · Focus mode — one thing, and the clock

```
┌─────────────────────────────────┐
│                                 │
│         Quarterly report        │   the ONLY thing on screen (P2)
│                                 │
│            ╭───────╮            │
│           │  17:42  │           │   big shrinking ring (P3,P4)
│            ╰───────╯            │
│                                 │
│   First step: open last quarter │   the tiny first action (P3)
│   doc and copy the template     │
│                                 │
│   [ Pause ]   [ Done ✓ ]        │
│   ambient sound: rain ▸ (opt)   │   body‑doubling vibe (P3)
└─────────────────────────────────┘
```

- Everything else disappears. The visible shrinking ring fights time blindness (P4).
- Completing here triggers the full reward moment (P6).
- On Windows this can be the floating mini‑window that stays visible over other apps.

### 4 · Plan‑my‑day — the morning ritual

A swipeable, one‑card‑at‑a‑time triage (Any.do's ritual, made lighter):

```
┌─────────────────────────────────┐
│   Plan your day   ▮▮▮▯▯  3/5     │
│                                 │
│   ┌───────────────────────────┐ │
│   │  Reply to landlord        │ │
│   │  from Inbox · ⚡ 5m        │ │
│   └───────────────────────────┘ │
│                                 │
│   ← Later    ↓ Tomorrow         │
│         ↑ Today   ✓ Done        │  swipe a direction; fast, one‑handed
│                                 │
│   You've planned ~2h 40m today  │  capacity feedback (P2,P4)
└─────────────────────────────────┘
```

- One decision at a time (anti‑overwhelm, P2). Ends with a calm, complete Today.
- Skippable, never forced; if you miss it, no penalty (P7).

### 5 · Upcoming — agenda + calendar

A gentle agenda list by day, toggleable to a month calendar. Tasks and (v1)
synced calendar events on one timeline so there's a single source of truth (P4).
"Time until" is shown concretely and gains visual weight as it nears (P4).

### 6 · Goals

```
┌─────────────────────────────────┐
│  Learn Spanish        ◕ 34%     │  visible progress ring (P6,P8)
│  Next: 5‑min lesson today  →    │  the crucial NEXT ACTION (P8)
│                                 │
│  Launch side project  ◔ 12%     │
│  Next: register the domain →    │
│                                 │
│  Get fit              ◑ 50% 🔥7  │  routine streak feeds the goal (P6,P8)
│  Next: gym today (Mon/Wed/Fri)  │
└─────────────────────────────────┘
```

Every goal always shows **one next physical action** — never just an abstract
target — and its progress is a filling ring you *feel* advance (P8, P6).

### 7 · Done / Wins

A running, celebratory list of completed tasks (today, this week) — the "look
what I actually did" surface that a normal app never gives an ADHD brain (P6).

---

## Signature flows (the make‑or‑break moments)

**A. Capture (must be < 3s, zero blockers).**
Lock Screen / hotkey / ⊕ → field is focused, keyboard/mic ready → type/speak →
NL parse preview → **Add** → back where you were. Never a network wait, never a
required field. (P1)

**B. Start a dreaded task (the signature).**
Task looks like a wall → **Break it down** → accept/edit steps → **Just start
(2 min)** → Focus mode with only that task + shrinking ring → 2‑min ping: *keep
going?* → **Done** → reward moment → lands in Done today. (P3, P4, P6)

**C. Plan the day without overwhelm.**
Morning nudge → Plan‑my‑day swipe triage → capacity feedback if over‑committing →
a small, finite Today. (P2, P7)

**D. A reminder that lands.**
Time‑sensitive ping (breaks through DND if important) → swipe‑dismissed on reflex
→ re‑nudge after N minutes because still undone → **Complete** *from the
notification*. (P5)

**E. Guilt‑free end of day.**
Undone tasks → one tap "move to tomorrow," framed kindly → Done/Wins shows the
day's accomplishments → no red, no reset, no shame. (P6, P7)
