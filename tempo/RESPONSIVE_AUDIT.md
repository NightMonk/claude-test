# Tempo — Responsive Audit (Phase 0)

*Read-only survey of the current layout. No behavior changed in this phase.*
Repo state: single-column, phone-first PWA. `public/index.html` + `public/styles.css`
(one file, ~705 lines, no media queries except `prefers-reduced-motion`) +
`public/app.js` (renders all views into `#view`).

## 1. The one structural fact that governs everything

The whole app is a **single centered column capped at 680px**:

| Element | Rule |
| --- | --- |
| `#app` | `max-width: 680px; margin: 0 auto; min-height: 100vh` |
| `.topbar` (header) | `position: sticky; top: 0; max-width: 680px; margin: 0 auto` |
| `.tabbar` (bottom nav) | `position: fixed; bottom: 0; left/right: 0; max-width: 680px; margin: 0 auto` |
| `.sheet` (quick-add / editors) | `max-width: 680px` slides up from bottom |

So on any screen wider than 680px it is **just a phone column centered in whitespace**.
Nothing overflows horizontally (see §4), but ~everything wider than a tablet is wasted
gutter. **This 680px cap is the single thing to lift for ≥768px layouts, and it must stay
untouched below 768px so the iPhone layout is pixel-stable.**

## 2. Fixed widths & dimensions

- **Layout caps (must become responsive):** `#app` 680, `.topbar` 680, `.tabbar` 680,
  `.sheet` 680, `.login-card` 360, `.review-scroll` 520, `.plan-card`/`.plan-choices` 330,
  `.fx-first` 300.
- **Intrinsic element sizes (fine — leave as-is):** icon buttons 40, FAB 56, check 22,
  dots 8–14, `.cal-head .navb` 36, `.ws-num` 32, `.sheet-grab` 40×4, AI button 38.
  These are control sizes, not layout widths; they don't cause overflow.
- **Timeline (Calendar → Day) hardcodes:** JS `TL_HOURH = 54` (row height), CSS
  `.tl-block { left: 56px; right: 8px }`, `.tl-now::before { left: 52px }`. Fixed offsets
  but contained; safe within the column. Widen gracefully later.

## 3. Fixed grids (proportional, so they scale — but note the extremes)

`grid-template-columns` uses `1fr` throughout, so columns stretch/shrink rather than
overflow: `.tabbar` repeat(5), `.segmented` repeat(4), `.month-grid`/`.week-strip`
repeat(7), `.year-grid` repeat(3), `.review-stats` repeat(3), `.row2`/`.plan-choices`
1fr 1fr. Watch two extremes:
- **≤340px:** 5 bottom-nav labels and the 7-col month/week cells get cramped.
- **≥768px (capped at 680):** these never get the room they could use — the 7-col week
  strip and month grid are the obvious candidates for a wider desktop treatment (Phase 4).

## 4. Horizontal-overflow risk assessment

**Currently there is no horizontal scrollbar** — `* { box-sizing: border-box }`,
`body { margin: 0 }`, no `100vw` anywhere, `#app` capped + `margin: 0 auto`, long text
guarded (`.task-body { min-width: 0 }`, `.task-title { word-wrap: break-word }`,
`.te-crumb` ellipsis). Deliberate horizontal scroll is scoped to `.filters` and
`.feed-url code` (`overflow-x: auto`, contained). **Risks to guard when widths change:**
- No `overflow-x: hidden` safety net on `html, body` — add one defensively in Phase 1.
- `.meta-chip { white-space: nowrap }` relies on the parent `.task-meta` flex-wrap; keep that.
- Absolutely-positioned timeline blocks (`left/right` px) must stay inside their grid.
- New multi-column layouts (Phase 3) must use `minmax(0, …)` so children can shrink.

## 5. Bottom-sheet / bottom-nav assumptions (Phase 2 targets)

- **Bottom nav** `.tabbar` is `position: fixed; bottom: 0` with 5 columns; `#app` reserves
  space via `padding-bottom: calc(var(--tabh) + safe-area)`.
- **Bottom sheet** `.sheet-backdrop`/`.sheet` slide up from the bottom (`@keyframes slideup`
  `translateY(100%)`), rounded top corners only — a phone gesture idiom. Used for quick-add
  **and** all editors (list/goal/task) and the More menu, pick-one, note→tasks, calendar-add.
- **FAB** `.fab` is `position: fixed; bottom: calc(tabh + safe-area + 16px); right`.
- **Header** has Back (`#back-btn`), title (`#title`), More (`#more-btn`). Navigation is
  driven by `state.tab` (bottom nav) + `state.sub` (drill-in) in `app.js`.

For ≥768px these become: sidebar (replacing bottom nav), header "+" opening a **centered
modal** (reusing the sheet's `#sheet-body` fields), and the FAB hidden.

## 6. Touch-only interactions (Phase 5 must add pointer/keyboard parity)

All are `pointer`-event based, so they *function* with a mouse, but they're designed for
touch and have **no keyboard equivalent**:
- **Swipe task card** right = complete, left = snooze (`attachSwipe`).
- **Long-press header title** cycles themes (`themeQuickSwitch`, 550ms).
- **Drag-to-schedule** on the Day timeline — drag an unscheduled chip onto an hour
  (`dragToSchedule`).
- **Drag-to-reorder subtasks** in the task editor (`attachSubReorder`).
- **Tap-to-toggle / tap-to-open** everywhere (fine; parity needed via Enter/E in Phase 5).

None are hover-dependent (there are **no `:hover` styles at all** yet — Phase 5 adds them,
never hover-only).

## 7. Safe-area-inset usage (must be preserved everywhere)

Already correct and must stay: `#app` bottom padding, `.topbar` top padding,
`.tabbar` bottom padding, `.fab` bottom, `.sheet` bottom padding, `.cap-add-wrap`,
`.focus-overlay .fx-close` top, `.review-scroll` top+bottom. Viewport meta is
`viewport-fit=cover` (correct). Keep all of these; only *add* insets for the new
sidebar/modal, never remove.

## 8. Proposed breakpoints (content-driven, matching the requested scale)

Mobile-first `min-width`. Chosen where the layout *can* do more, not arbitrary:

| Token | px | Why this is where it breaks | Behavior turned on |
| --- | --- | --- | --- |
| `--bp-sm` | 480 | large phones / phablets | slightly larger type/gutters; still one column + bottom nav |
| `--bp-md` | 768 | first width that fits a sidebar **and** readable content | **Nav → left sidebar; bottom nav hidden; quick-add → centered modal**; lift the 680 cap |
| `--bp-lg` | 1024 | room for a content rail + a second pane / a 7-col week | **Next 7 Days → week grid**; two-pane where useful |
| `--bp-xl` | 1280 | room for three panes | **rail + task list + persistent detail** |
| `--bp-xxl` | 1440 | beyond this, line length hurts | **cap total content width, center; spare width → week grid below** |

Also gate *interaction* (hover, shortcuts, drag affordances) behind
`@media (pointer: fine)` / `(hover: hover)` so a large touch screen keeps the touch UX.

## 9. Risks / regressions to watch

1. **iPhone pixel-stability:** every new rule must be inside `@media (min-width: …)`;
   the base (`<768`) stylesheet must not change. Phase 1 verifies this before proceeding.
2. **The 680 cap is referenced on four elements** — lifting it must be coordinated
   (topbar, tabbar, sheet, #app) or the header/nav will misalign.
3. **`#view` is one scroll container**; multi-column (Phase 3) needs independent scroll
   regions with their own `overflow-y` and `min-height: 0`.
4. **Sheet reuse:** editors share the bottom sheet; the ≥768 modal must reuse the same
   `#sheet-body` markup so we don't fork the forms.
5. **`100vh`** on `.login`/`#app`/overlays — fine on desktop, but keep an eye on mobile
   URL-bar behavior (already acceptable today; don't switch to `100dvh` without testing).

---

### Phasing summary (each commits separately)
- **P1** tokens + fluid units + overflow safety net (no visual change <768).
- **P2** sidebar + header-"+" modal ≥768.
- **P3** 2-col (768–1199) / 3-col (≥1200) / capped-center (≥1440).
- **P4** week grid ≥1024.
- **P5** hover + focus rings + keyboard shortcuts (pointer:fine / no-op on mobile).
- **P6** manifest `display_override`, custom install button, container queries, offline shell.
- **P7** `/debuggrid` + `TESTING.md`.
