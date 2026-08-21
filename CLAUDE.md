# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository. See also the top-level `/home/user/git/CLAUDE.md` for cross-project conventions
(new-project setup, DNS on `sisqo.dev`, the GitHub/Vercel `sisqo` account) — those apply here
too and are not repeated below.

## What this is

Strumfolio — a private, invite-only PWA for reading a musician's own lyrics/chords on stage:
zoom, auto-scroll, transposition, capo, offline. Next.js 15 App Router, React 19, TypeScript,
Tailwind v3, Postgres on Neon via Drizzle ORM, NextAuth v5, Serwist for the service worker.
Deployed on Vercel (`sisqo` account), production at https://strumfolio.com. Full product
framing lives in `PRODUCT.md`, the visual language in `DESIGN.md`, and the running log of
decisions in `PLAN.md` / `PLAN-pagamenti.md` (payments/billing).

## Commands

```bash
npm run dev       # next dev, http://localhost:3000
npm test          # tsx --test over every src/**/*.test.ts and scripts/**/*.test.ts
npm run lint      # eslint
npm run build     # tsx scripts/precache-routes.ts, then next build
npm run db:migrate  # tsx scripts/migrate.ts — applies drizzle/*.sql to $DATABASE_URL
npm run db:generate # drizzle-kit generate, after changing src/lib/db/schema.ts
npm run seed      # tsx scripts/seed.ts
```

Without `DATABASE_URL` set, the app reads songs straight from `content/` — the normal way to
work locally; no database is needed to see the app run. `npm test` is plain `node:test` over
pure functions only — there is no React component test runner in this repo, so logic worth
testing belongs in a plain module (see `src/lib/plans/testCard.ts` next to `checkout.ts` for
why: a `'use server'` module may only export async functions, so a synchronous check or
constant that needs testing lives in a plain sibling file instead).

## Before pushing: verify against the committed snapshot, not the working tree

Always run the full check — `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build` —
against what was actually **committed**, not the working tree, right before `git push`:

```bash
SCRATCH=/tmp/claude-*/…/scratchpad/push-check   # anywhere outside the repo
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH"
git archive HEAD | tar -x -C "$SCRATCH"
ln -s "$(pwd)/node_modules" "$SCRATCH/node_modules"
cd "$SCRATCH" && npx tsc --noEmit && npm test && npm run build
```

A working-tree build (even an `rsync`'d copy) can pass while the actual commit is broken if a
file was edited after `git add` and never re-staged. This happened once for real: a commit
that deleted `LightThemeOnly.tsx` still imported and rendered it on `/login`, discovered only
by `git show HEAD:path | grep` on the pushed commit, and fixed in a follow-up commit. Doing
the `git archive HEAD` check first is what would have caught it before the push.

Push once verified — don't wait for a separate "go ahead" on the push step itself for an
ordinary forward commit. This does not relax the usual rules: stage explicit paths (never
`git add -A`), confirm `gh auth status` shows the `sisqo` account, and still treat genuinely
destructive git operations (force-push, `reset --hard`, amending a pushed commit) as needing
explicit confirmation first.

## Dev server / build collision

Every `next dev` in this repo — regardless of port (3000, 3001, 3002…) — binds to the same
`.next` directory. A second `next dev`, or a `npm run build` run while one is live, corrupts
whichever was already serving: stale HTML referencing 404ing chunk hashes, or a React Client
Manifest error, sometimes surviving even `rm -rf .next`. Check `ss -ltnp | grep 300` before
running a build for verification — if a dev server owns port 3000, either verify a different
way or be ready to `rm -rf .next` and restart it afterward (`nohup npm run dev > log 2>&1 &
disown`). This machine tends to accumulate orphaned `next dev` processes across sessions;
clean up your own before leaving.

## Plans, entitlements and the mock checkout (`src/lib/plans/`)

- `types.ts` — `Plan`, `PLANS` (the limits table), `PLAN_RANK` (generosity order, not price).
- `prices.ts` — what each paid plan costs (`PRICES`, `LIFETIME`); deliberately separate from
  `types.ts` because a price changes on a different clock than a limit does.
- `entitlements.ts` — `resolveSubscription`/`liveSubscription`: pure functions that collapse a
  scheduled downgrade/cancellation the instant `now` passes its date. Called at every read
  site instead of a cron job — there is no background job anywhere in this repo.
- `checkout.ts` (`'use server'`) — the mock checkout: `mockPurchase`, `mockCancel`,
  `clearPendingChange`, `forceExpireNow` (test-only). Writes the same `plan`/`planStatus`/
  `planExpiresAt`/`pendingPlan`/`pendingCycle` columns a real Paddle webhook will one day
  write, and logs every mutation to `paddle_events` (`history.ts`) under an `eventType`
  prefixed `mock.` — the same table and reading code a real integration will reuse.
- `resolve.ts` — two env-driven feature flags, read fresh at call time (no caching): 
  `plansEnforced()` (`SONGBOOK_PLANS=on`) gates whether limits are actually enforced;
  `mockCheckoutEnabled()` (`SONGBOOK_MOCK_CHECKOUT=on`) gates whether `/checkout` and the
  "Choose <plan>" buttons on `/pricing` are live. **Neither is a security boundary** — while
  the mock checkout is on, any signed-in reader can give their own account any plan for free.
  Both are currently `on` in Vercel production; that's why `/pricing` shows working buy
  buttons and why a stale "not on sale yet" notice was a real bug, not just a copy nit.
- `testCard.ts` — the mock checkout's own "processor": `isAcceptedTestCard` accepts only
  `4111 1111 1111 1111` (digits compared, formatting ignored); every other number declines
  client-side in `CheckoutScreen.tsx`, before `mockPurchase` is ever called.
- `SONGBOOK_FORCE_PLAN` — a separate, deliberately risky local-only escape hatch (forces every
  read to one plan); never meant to run in production.

## Design fidelity from Claude Design handoffs

Design mocks arrive in the Parallels shared folder `/media/psf/Download/songbook/` (macOS
host; not under `~/git`, not in this repo). It's a Claude Design handoff bundle: `README.md`
plus `project/<Name>.dc.html` (an HTML/CSS prototype with inline styles), `support.js`, and a
rendered `.thumbnail` preview. Read the `.dc.html` file directly rather than rendering it —
every pixel value (font sizes, radii, spacing, colors) is in the inline styles. When asked to
implement a redesign, match it **literally** — exact font sizes, exact card/table structure,
exact copy — rather than preserving prior "more accurate" wording; ask before quietly keeping
something the mock removed, but default to matching the mock over defending the status quo.

`DESIGN.md`'s frontmatter and prose are the living design-token source (colors, radius scale,
typography) — kept in sync by hand with what the app actually ships, including the current
font (Outfit, replacing DM Sans as of August 2026).

Chromium here is a snap and cannot write into `/tmp/claude-*` — pass `--screenshot=` a path
under `$HOME` (e.g. `~/songbook-shots`) if a visual comparison is ever needed.

## A known, understood data quirk

Accounts created before commit `02ac495` ("Niente più ospiti", 2026-08-14) — from the era of
shared accounts with view-only member roles — can get stuck unable to edit their own account.
The current permission code (`src/lib/roles.ts`, `src/lib/accounts/current.ts`) is correct and
tested; the failure is leftover data on those specific old rows, not a logic bug. Fix is to
delete and recreate the account from the Accounts admin page, not to debug the permission
code again.
