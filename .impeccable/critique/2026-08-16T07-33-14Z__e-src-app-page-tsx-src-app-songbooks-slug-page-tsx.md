---
target: songbooks list and detail page
total_score: 32
p0_count: 0
p1_count: 1
timestamp: 2026-08-16T07-33-14Z
slug: e-src-app-page-tsx-src-app-songbooks-slug-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No loading indicator anywhere for the two force-dynamic routes; a click into a songbook (or the first load of `/`) shows nothing until the full server round-trip resolves |
| 2 | Match System / Real World | 4 | Plain-language copy throughout ("Remove X? It's empty.", "Contains N songs. Move them to:") |
| 3 | User Control and Freedom | 4 | Escape cancels every inline edit, every destructive action is cancelable, purge requires a second explicit tap |
| 4 | Consistency and Standards | 3 | Offline state is explained on the list page but silently hidden on the detail page; "Arrange" disappears offline while its sibling "New songbook" stays visible-but-disabled |
| 5 | Error Prevention | 4 | Disabled submit states, online-gating on writes, two-step confirmation on destructive purge |
| 6 | Recognition Rather Than Recall | 3 | Section folds and arrival-scroll are excellent; row actions depend on a hover-only `title` for their label |
| 7 | Flexibility and Efficiency | 3 | Arrow-key reorder alongside drag is a real accelerator; no bulk actions, no search shortcut |
| 8 | Aesthetic and Minimalist Design | 4 | Single reserved accent, no decorative clutter, one purpose per screen |
| 9 | Error Recovery | 4 | Errors are plain-language, placed inline, non-blocking (state is preserved) |
| 10 | Help and Documentation | 1 | No contextual help reachable from inside either screen |
| **Total** | | **32/40** | **Good** |

## Anti-Patterns Verdict

**LLM assessment**: Nothing here reads as AI-generated. No gradient text, no side-stripe accents, no uppercase eyebrows, no identical-card grids, no hero-metric template. The corner-radius scale is job-based rather than uniform, the accent color is visibly rationed (chords first, everything else quieter), and the interaction logic (mutually-exclusive rename/remove/copy state, arrow-key reorder with a positional `aria-label`) is bespoke, not templated.

**Deterministic scan**: `detect.mjs --json` across `src/app/page.tsx`, `src/components/HomeScreen.tsx`, `src/components/ArrangeSongbooks.tsx`, `src/app/songbooks/[slug]/page.tsx`, `src/components/SongbookSongs.tsx`, `src/components/ArrangeSongbook.tsx`, and `src/components/SongRow.tsx` returned **zero findings** (exit 0). No false positives to report — the scan was simply clean.

**Visual overlays**: Not available. This environment has no connected browser-automation tool (no `claude-in-chrome`/MCP browser tool present), and both routes require an authenticated session against a live Neon-backed multi-tenant database I have no test credentials for — `/` and `/songbooks/[slug]` both redirect to `/login` without one. I could not start a live-server injection pass. Everything below comes from a source-level review (TSX + the shared `globals.css`/`DESIGN.md` tokens), not a rendered screenshot pass. If you can share a way to authenticate a local session (a seeded test account, or a way to bypass `hasDatabase` locally), a follow-up visual pass would catch anything source review can't (actual rendered contrast in context, real touch-target spacing, real transition timing).

## Overall Impression

This is a well-built, deliberately restrained pair of screens — genuinely one of the more careful codebases I've reviewed, with a state machine (rename/remove/copy, mutually exclusive, always cancelable) that's identical and correct across both pages. The gap isn't craft, it's two specific, fixable things: a contrast token that measurably fails its own accessibility bar, and total silence during the one moment (a route transition) where the user most needs to know something is happening.

## What's Working

- **Arrow-key reorder next to drag-and-drop** (`ArrangeSongbooks.tsx`): the drag handle also answers `ArrowUp`/`ArrowDown`, announcing `"Move {name}: {index} of {total}"` via `aria-label` on every move. This is a keyboard/screen-reader-equivalent path to a gesture that's usually mouse/touch-only, done properly rather than bolted on.
- **The rename/remove/copy interaction**: identical shape on the songbooks list and the songbook detail's sections, always mutually exclusive (opening one closes the others), and destructive removal never silently loses data — it offers "move songs to…" first and requires a second explicit tap for "delete everything instead."
- **Section disclosure** (`SongbookSongs.tsx`): closed by default (an index, not a wall of text), but a songbook with one section opens it automatically, and arriving from a specific song opens (and scrolls to) its section — cognitive-load reduction that adapts to context instead of a blanket "all open" or "all closed" rule.

## Priority Issues

**[P1] The `--faint` token fails WCAG AA contrast everywhere it's used on these two screens.**
- **Why it matters**: `--faint` (`#8d939c` light / `#5f666f` dark) measures **2.84:1** against the page background and **3.09:1** against a white card in light mode, and **2.97–3.23:1** against dark surfaces — all well under the 4.5:1 floor for regular-size text. On these two screens it's the color of the search placeholder ("Search title, artist, or lyrics"), `.screen-subtitle` ("3 songbooks · 12 songs"), `.row-count` under every songbook name, and the `.back-plain` "Songbooks" caption. PRODUCT.md's own accessibility line says contrast is "checked across both hand-tuned themes" — this token measurably isn't, and it's the exact failure mode called out by name in this skill's own color rules ("muted gray body text on a tinted near-white… the single biggest reason AI designs feel hard to read"). It also cuts against the app's own stated use case — a lit rehearsal room or bright stage is exactly where marginal contrast disappears first.
- **Fix**: Darken `--faint` (light) and lighten it (dark) until both hit ≥4.5:1 against every surface it's actually painted on (`--bg`, `--surface`, `--surface-2`), or reserve the current `--faint` for truly decorative/aria-hidden glyphs only and promote every real caption (`screen-subtitle`, `row-count`, `back-plain`, `::placeholder`) to `--muted`, which already passes (5.6–6.5:1) everywhere tested.
- **Suggested command**: `/impeccable audit` (to sweep every other use of `--faint` app-wide, not just these two screens) or `/impeccable colorize`.

**[P2] Route transitions give zero feedback.**
- **Why it matters**: Both `/` and `/songbooks/[slug]` are `force-dynamic` — every navigation re-runs an auth check plus 2–3 database queries before anything renders. There is no `loading.tsx` anywhere in `src/app`, and no client-side pending indicator (`useTransition`, a progress bar) anywhere in the codebase. Tapping a songbook, or opening the app cold, does *nothing visible* until the whole round-trip lands — indistinguishable from a missed tap or a frozen app, especially on the kind of venue Wi-Fi this app's own users are actually on. This is Nielsen's #1 heuristic by name, and it's also a direct miss on this skill's own product-register rule: "Skeleton states for loading, not spinners in the middle of content" — right now there's neither, just nothing.
- **Fix**: Add a `loading.tsx` for `/` and `/songbooks/[slug]` (a skeleton echoing `.row-list`/`.card` shapes costs little and matches the existing surface language), or wrap the `<Link>` taps in `useTransition` and show a thin top-of-bar progress indicator consistent with `.top-bar`'s sticky position.
- **Suggested command**: `/impeccable optimize` or `/impeccable polish`.

**[P2] Offline state is explained inconsistently.**
- **Why it matters**: Two related gaps. First, across pages: the songbooks list shows an explicit banner when offline ("Without a connection, songbooks can only be viewed. They're a shared structure, so changes require a connection.") before hiding edit affordances — but the songbook detail page hides its equivalent "Arrange"/"Add song" actions (`{online && mayEdit && (...)}`) with *no explanation at all*. An editor who lands directly on a songbook while offline has no way to know why those buttons are missing. Second, within the list page itself: "New songbook" stays visible but `disabled` when offline, while its sibling "Arrange" button disappears from the DOM entirely under the identical condition — two different patterns for the same cause, in the same button group.
- **Fix**: Reuse the list page's `notice-accent` offline banner on the detail page too, and pick one pattern (disabled-with-reason is more informative than vanishing) for both "Arrange" and "New songbook."
- **Suggested command**: `/impeccable clarify` (offline messaging copy) then `/impeccable polish` (visual consistency pass).

**[P3] Row actions have no visible label for a touch user.**
- **Why it matters**: Rename/Duplicate/Delete on a songbook row, and Rename/Delete on a section row, are icon-only buttons whose only text label lives in a `title` attribute — a hover tooltip that never fires on a touchscreen. `aria-label` covers screen-reader users, but a sighted person tapping on a phone or tablet (this app's stated primary context) has to guess the pencil/trash/copy glyphs correctly the first time, with no fallback.
- **Fix**: Given the row already has room (these are full-width rows, not a dense toolbar), consider a "..." overflow menu with text labels for edit actions instead of three bare icons, or reveal labels at ≥768px where horizontal space allows it.
- **Suggested command**: `/impeccable clarify`.

## Persona Red Flags

**Casey (Distracted Mobile User)** — the closest match to this app's actual stated audience (tablet/phone, hands often full):
- Tapping a songbook row on a spotty venue connection gives no feedback that anything happened until the dynamic page finishes loading (see P2 above) — exactly Casey's "does this work on a slow connection" failure mode.
- Row action icons (rename/duplicate/delete) have no visible label to tap-and-confirm against — Casey has to guess right the first time on a touchscreen, where the `title` tooltip never appears.
- What works for Casey: every tappable control measured here (`.icon-button`, `.drag-handle`, `.row`) hits the 44px+ touch-target floor, and the primary action ("New songbook"/"Add song") is consistently the one with visual weight.

**Sam (Accessibility-Dependent User)**:
- The `--faint` contrast failure (2.8–3.2:1, see P1) directly hits Sam if they have any residual vision rather than full screen-reader use — the search placeholder, the songbook counts, and the back-caption are all below AA on both screens.
- What works for Sam: every disclosure (`isRemoving`, `isCopying`, the section fold) is backed by a real `aria-expanded`, every icon button has an `aria-label` distinct from its `title`, and focus-visible rings are global, not just on some controls.

**Alex (Impatient Power User)**:
- Arrow-key reorder next to drag is a genuine accelerator (see What's Working) — no complaint there.
- No bulk actions: moving several songs to a different songbook, or deleting more than one songbook, is strictly one-at-a-time. No keyboard shortcut jumps focus to search from elsewhere on the list page (no `/`, no Cmd+K).

## Minor Observations

- The songbook detail page's empty state ("No songs in this songbook.") doesn't vary by `mayEdit` the way the songbooks list's empty state does (which tells editors specifically where to look, and viewers something different) — a small inconsistency between two otherwise tightly-matched screens.
- The "Duplicate" destination picker (global-owner-only, copy a songbook into another account) lists raw account emails in a plain `<select>` with no name/avatar — fine at a handful of accounts, would get harder to scan if the account list grows.

## Questions to Consider

- What would these two screens feel like with an instant, non-blocking transition (a skeleton or a slim progress line) instead of the current all-or-nothing wait?
- The list page tells an offline editor *why* editing is unavailable; the detail page just goes quiet. Was that difference intentional, or is the detail page missing a sentence it should have?
- Is icon-only labeling on row actions a deliberate density choice for a crowded row, or worth an always-visible label given how much horizontal room a full-width row actually has?
