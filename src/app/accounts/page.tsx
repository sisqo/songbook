import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AccountHistoryButton } from '@/components/AccountHistoryButton'
import { AccountPasswordButton } from '@/components/AccountPasswordButton'
import { AccountPlanButton } from '@/components/AccountPlanButton'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { CreateAccountForm } from '@/components/CreateAccountForm'
import { DeleteAccountButton } from '@/components/DeleteAccountButton'
import { IconCheck } from '@/components/icons'
import { auth } from '@/auth'
import { switchAccount } from '@/lib/accounts/actions'
import { listAccountPlans, listAllAccounts } from '@/lib/accounts/read'
import type { AccountPlanLine } from '@/lib/accounts/read'
import { isOwner } from '@/lib/allowlist'
import { currentUser } from '@/lib/auth/session'
import { forcedPlanNotice, plansEnforced } from '@/lib/plans/resolve'
import { PLAN_LABEL } from '@/lib/plans/types'
import type { Plan } from '@/lib/plans/types'

export const metadata: Metadata = { title: 'Accounts' }

/** Rendered per request: which accounts exist, and which is current, both depend on who is asking. */
export const dynamic = 'force-dynamic'

/**
 * Which `.plan-badge-*` modifier (`globals.css`) names a given plan's own color, combined with
 * `.badge` for shape — the badge itself, not this row's detail text, is now what answers «why
 * is this account on premium» at a glance (PLAN-attivazione.md). Free carries no color of its
 * own on purpose: see DESIGN.md's "Plan Badges" section.
 */
const PLAN_BADGE_CLASS: Record<Plan, string> = {
  free: 'plan-badge-free',
  standard: 'plan-badge-standard',
  plus: 'plan-badge-plus',
  premium: 'plan-badge-premium',
  lifetime: 'plan-badge-lifetime',
}

/**
 * The status detail that sits beside the plan badge: dates, which side is winning, a scheduled
 * change — everything the badge's plain plan name does not already say. Split off from what
 * used to be a single `planClause` string once the plan name itself moved into its own colored
 * badge (PLAN-attivazione.md); the name is never repeated here.
 *
 * On the row and not behind the disclosure because the operator's commonest visit is a scan of
 * the whole list, and one panel per row is one click per row.
 *
 * `free` carries no detail at all — a free row is a live subscription of `free` (`planStateFor`
 * reports `source: 'subscription'` for it), and "subscription" on the vast majority of rows
 * would be noise beside a badge that already says "Free". A gift with no end says so, where an
 * open-ended subscription does not: `lifetime` already means no end, whereas a gift that never
 * runs out is the fact an operator would want to see without opening anything.
 *
 * `grace` is the one state that names itself instead of a date, and the row has to agree with
 * `AccountPlanButton.subscriptionLine` about it because they are read one after the other —
 * the panel is opened *from* the row it contradicts. A failing card is virtually always
 * already past period end (which is the whole reason `liveSubscription` ignores dates for
 * `grace`), so `untilOn` here is a day that has gone by while the plan is genuinely still in
 * force: "subscription until 2026-06-30" reads as lapsed and invites an operator to re-gift a
 * plan the customer already holds. Checked before the `untilOn` branch and not inside it, which
 * also covers the dateless `grace` row that would otherwise print a bare "subscription" and say
 * nothing about the retry. Fixed here and not in `planStateFor`: `state.until` being that past
 * date is the deliberate answer to "when does the paid period end", pinned by
 * `entitlements.test.ts`, and only its rendering is wrong.
 */
function planDetail(line: AccountPlanLine): string {
  if (line.effectivePlan === 'free') return ''

  const side = line.source === 'grant' ? 'gift' : 'subscription'
  // Only on the subscription side, and only ahead of its own date: a scheduled downgrade on
  // the subscription while a grant currently wins would not even take effect the day it
  // fires, and naming it here would suggest a change to what the row is showing right now.
  const pendingClause = side === 'subscription' && line.pendingPlan !== null ? `, then ${line.pendingPlan}` : ''
  if (line.status === 'grace' && line.source === 'subscription') return 'subscription, payment retrying'
  if (line.untilOn !== null) return `${side} until ${line.untilOn}${pendingClause}`
  return line.source === 'grant' ? 'gift, no end' : `subscription${pendingClause}`
}

function EnterButton({ ownerEmail, isCurrent }: { ownerEmail: string; isCurrent: boolean }) {
  if (isCurrent) {
    return (
      <span className="meta-chip">
        <IconCheck size={13} /> current
      </span>
    )
  }

  const enter = async () => {
    'use server'
    await switchAccount(ownerEmail)
  }

  return (
    <form action={enter}>
      <button type="submit" className="btn btn-sm">
        Enter
      </button>
    </form>
  )
}

/**
 * Every account in the installation, and the only screen that can create or delete one —
 * a **global owner** question through and through, with a single public now (v3.1). The
 * old second audience, a collaborator switching between accounts they were invited into,
 * is gone along with collaboration itself: nobody has more than their own account to
 * switch to any more, so there is nothing left to show them here. `notFound()` rather
 * than a role notice, same reasoning as every other slug-reached page in this app —
 * "this does not exist" and "this is not yours" should look identical from outside.
 */
export default async function AccountsPage() {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  /*
   * Three reads, not one widened query. `listAccountPlans` names migration 0024's columns and
   * therefore fails until it has been applied — with its own null, which costs the plan clause
   * and the `Plan` button and nothing else. Widening `listAllAccounts` instead would have put
   * the whole screen behind that same migration, and the screen that has lost itself is the one
   * an operator would open to find out why.
   */
  const [user, all, plans] = await Promise.all([currentUser(), listAllAccounts(), listAccountPlans()])

  /*
   * Read once, here, for the two notices below. `plansEnforced()` first and not merely
   * alongside: `entitlementsOf` returns `UNGATED` before it ever reads the override, so with
   * the switch off there is no forced plan to warn about — the notice about the switch itself
   * is the whole truth then, and these two are mutually exclusive by construction.
   */
  const forced = plansEnforced() ? forcedPlanNotice() : null

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="accounts" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Accounts</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Every account in the installation. Entering one changes what Home and Sing
            Together show, until you switch again.
          </p>
        </header>

        <section className="mb-7">
          <h2 className="section-title">Create</h2>
          <p className="mb-2.5 text-sm leading-[1.45] text-muted">
            Gives an address its own empty account, before it has ever signed in.
          </p>
          <CreateAccountForm />
        </section>

        <section>
          <h2 className="section-title">Every account</h2>

          {/*
            The only place `SONGBOOK_PLANS` reaches a screen anywhere in this app. Without it,
            «I gifted premium and nothing changed» is a support call with no visible cause:
            `entitlementsOf` returns `UNGATED` before it touches the database, so every account is
            ungated whatever these rows say. A notice and not a gate — setting the gifts up before
            enforcement is turned on is a reasonable order to work in, and the rows keep showing
            their real stored values so that preparation is possible at all.
          */}
          {!plansEnforced() && (
            <p className="notice notice-accent mt-2.5" role="status">
              Plans are off in this deployment: every account gets everything, whatever it says here.
            </p>
          )}

          {/*
            The second half of the same duty, for the other variable that makes every row on this
            screen inert. With `SONGBOOK_FORCE_PLAN` set, `entitlementsOf` throws the stored row
            away and gates *every* account as the forced plan, so this list can report a premium
            gift the panel calls «In force: premium, from the gift.» while that customer's forty
            songs are frozen to deletions-only — the screen naming the cause of the freeze and
            stating its opposite. Until now the only trace was one `console.warn` per process,
            which is not the screen the operator is looking at.

            The plan is interpolated and not spelled out, because the override can name any of
            the five and a notice reading 'free' while the gate says 'standard' is the same class
            of bug this notice exists to prevent. `notice-error`, where the off switch above gets
            `notice-accent`: preparing gifts before enforcement is turned on is normal working
            order, whereas an override that silently freezes real accounts is something to undo.
            `role="status"` all the same — it is a standing condition of the deployment, not a
            response to anything the operator just did.
          */}
          {forced !== null && (
            <p className="notice notice-error mt-2.5" role="status">
              SONGBOOK_FORCE_PLAN is set: every account is being gated as <strong>{forced}</strong>,
              whatever it says here.
            </p>
          )}

          {all === null ? (
            <p className="mt-2.5 text-sm text-muted">Could not read the accounts. Reload the page.</p>
          ) : (
            <ul className="card-stack mt-2.5">
              {all.map((account) => {
                /*
                 * Absorbed per row, exactly as `listSignIns`' null already is: a plans map that
                 * could not be read costs this row its plan clause and its `Plan` button, and
                 * costs the rest of the row nothing. ` · ` is this codebase's in-line meta
                 * separator (`SongRow`, `ImportIntoSongbook`).
                 */
                const line = plans?.get(account.ownerEmail) ?? null

                return (
                  <li
                    key={account.ownerEmail}
                    className="card flex flex-wrap items-center gap-3 px-4 py-3.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{account.ownerEmail}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span className="truncate text-[0.8125rem] text-muted">
                          {account.signInCount === 0
                            ? 'Never signed in'
                            : `${account.signInCount} sign-in${account.signInCount === 1 ? '' : 's'}`}
                        </span>
                        {line !== null && (
                          <>
                            <span className={`badge ${PLAN_BADGE_CLASS[line.effectivePlan]}`}>
                              {PLAN_LABEL[line.effectivePlan]}
                            </span>
                            {/* Only on a row this query actually read — see `AccountPlanLine.planChosen`'s
                                own comment on why an unreadable row (`line === null`, handled above) must
                                never render this same word: the two nulls mean opposite things here. */}
                            {!line.planChosen && <span className="badge plan-badge-unchosen">Not activated</span>}
                            {planDetail(line) !== '' && (
                              <span className="text-[0.8125rem] text-muted">{planDetail(line)}</span>
                            )}
                          </>
                        )}
                      </span>
                    </span>
                    <EnterButton
                      ownerEmail={account.ownerEmail}
                      isCurrent={user?.accountOwnerEmail === account.ownerEmail}
                    />
                    {line !== null && <AccountPlanButton ownerEmail={account.ownerEmail} plan={line} />}
                    <AccountHistoryButton ownerEmail={account.ownerEmail} />
                    <AccountPasswordButton ownerEmail={account.ownerEmail} />
                    <DeleteAccountButton ownerEmail={account.ownerEmail} />
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <Footer />
      </main>
    </PrefsProvider>
  )
}
