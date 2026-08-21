import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

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

export const metadata: Metadata = { title: 'Accounts' }

/** Rendered per request: which accounts exist, and which is current, both depend on who is asking. */
export const dynamic = 'force-dynamic'

/**
 * The answer to «why is this account on premium», short enough to sit on the row.
 *
 * On the row and not behind the disclosure because the operator's commonest visit is a scan of
 * the whole list, and one panel per row is one click per row. It reuses the second muted line
 * the row already has, so it costs no structure and no class: `2 sign-ins · premium · gift
 * until 2026-12-31`.
 *
 * `free` is printed bare, with no side named. A free row is a live subscription of `free`
 * (`planStateFor` reports `source: 'subscription'` for it), and «free · subscription» on the
 * vast majority of rows would be a wall of noise hiding the one row that matters. The date is
 * the winning side's own — never the later of the two — because that is what `untilOn` carries.
 * A gift with no end says so, where an open-ended subscription does not: `lifetime` already
 * means no end, whereas a gift that never runs out is the fact an operator would want to see
 * without opening anything.
 *
 * `grace` is the one state that names itself instead of a date, and the row has to agree with
 * `AccountPlanButton.subscriptionLine` about it because they are read one after the other —
 * the panel is opened *from* the row it contradicts. A failing card is virtually always
 * already past period end (which is the whole reason `liveSubscription` ignores dates for
 * `grace`), so `untilOn` here is a day that has gone by while the plan is genuinely still in
 * force: «premium · subscription until 2026-06-30» reads as lapsed and invites an operator to
 * re-gift a plan the customer already holds. Checked before the `untilOn` branch and not
 * inside it, which also covers the dateless `grace` row that would otherwise print a bare
 * «premium · subscription» and say nothing about the retry. Fixed here and not in
 * `planStateFor`: `state.until` being that past date is the deliberate answer to "when does
 * the paid period end", pinned by `entitlements.test.ts`, and only its rendering is wrong.
 */
function planClause(line: AccountPlanLine): string {
  if (line.effectivePlan === 'free') return 'free'

  const side = line.source === 'grant' ? 'gift' : 'subscription'
  if (line.status === 'grace' && line.source === 'subscription') {
    return `${line.effectivePlan} · subscription, payment retrying`
  }
  if (line.untilOn !== null) return `${line.effectivePlan} · ${side} until ${line.untilOn}`
  return line.source === 'grant' ? `${line.effectivePlan} · gift, no end` : `${line.effectivePlan} · subscription`
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
                      <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                        {account.signInCount === 0
                          ? 'Never signed in'
                          : `${account.signInCount} sign-in${account.signInCount === 1 ? '' : 's'}`}
                        {line !== null && ` · ${planClause(line)}`}
                      </span>
                    </span>
                    <EnterButton
                      ownerEmail={account.ownerEmail}
                      isCurrent={user?.accountOwnerEmail === account.ownerEmail}
                    />
                    {line !== null && <AccountPlanButton ownerEmail={account.ownerEmail} plan={line} />}
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
