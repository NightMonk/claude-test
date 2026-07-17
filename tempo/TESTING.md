# Tempo — Responsive Testing Checklist

A quick, phone-runnable checklist to confirm the responsive redesign still holds.
Open **`/debuggrid`** in any window to see the live viewport size, active
breakpoint name, and pointer type while you resize or rotate.

## Breakpoint reference

| Token | Range (px) | Layout intent                                             |
|-------|------------|----------------------------------------------------------|
| base  | 0–479      | Small phones. Single column, bottom nav, FAB.            |
| sm    | 480–767    | Large phones. Still single column + bottom nav.          |
| md    | 768–1023   | Tablets. Sidebar + header "＋", right slide-over detail.  |
| lg    | 1024–1279  | Small desktops. Persistent 3-col detail; week grid.      |
| xl    | 1280–1439  | Desktops.                                                |
| xxl   | 1440+      | Large desktops. Shell capped at 1440 and centered.       |

## 1. No horizontal scroll

At each width, the page must not scroll sideways
(`document.documentElement.scrollWidth <= clientWidth`):

- [ ] 320  (smallest phones)
- [ ] 375  (iPhone SE / mini)
- [ ] 414  (iPhone Plus/Max)
- [ ] 768  (tablet / nav switch)
- [ ] 1024 (week grid / 3-col switch)
- [ ] 1280
- [ ] 1440 (shell cap)
- [ ] 1920 (large desktop — content stays centered, no stretch)

## 2. Navigation transforms at the right widths

- [ ] **< 768** — bottom tab bar + floating "＋" visible; sidebar hidden.
- [ ] **≥ 768** — sidebar visible; bottom tab bar + FAB hidden; header "＋" opens capture.
- [ ] **768–1199** — task opens in a **right slide-over** detail panel (with scrim).
- [ ] **≥ 1200** — task detail is a **persistent third column** (no scrim); "Next 7 Days" drops the detail column and uses the full-width week grid.

## 3. Quick-Add usable at every size

- [ ] Bottom sheet (mobile) / centered modal (desktop) opens from every "＋".
- [ ] "When" segmented control (Today / Tomorrow / Inbox) is tappable.
- [ ] List pills pick a destination in one tap.
- [ ] Typing "Call dentist tomorrow 3pm" yields a removable "Tomorrow 3pm" chip and leaves the title "Call dentist".
- [ ] Helper text is legible (not cramped) at 320.

## 4. Focus & keyboard (pointer: fine only)

- [ ] Tab order is sane: nav → main content → detail.
- [ ] Visible focus ring on every interactive element.
- [ ] Shortcuts work: `Q`/`N` new, `J`/`↓` down, `K`/`↑` up, `Enter` open, `E` edit, `Esc` close, `?` help.
- [ ] Shortcuts are **no-ops** on a coarse (touch) pointer — nothing hijacks typing.

## 5. Hit targets ≥ 44px on touch

- [ ] Every button / nav item / checkbox is at least 44×44 px on a touch device.
- [ ] Hover styling never *hides* an action (nothing is hover-only).

## 6. iPhone Safari regression guard

- [ ] Safe-area insets respected (notch / home indicator) in standalone PWA.
- [ ] Portrait layout at 390 is pixel-stable vs. the pre-redesign baseline.
- [ ] Touch gestures still work: swipe task card, long-press title (theme), drag-to-schedule, drag-reorder subtasks.

---

### How to run the width sweep quickly

Desktop browser: open DevTools → device toolbar → type each width from §1.
Phone: install to Home Screen, rotate, and use `/debuggrid` to confirm the
breakpoint label matches the layout you see.
