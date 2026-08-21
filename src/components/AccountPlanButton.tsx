'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { IconChevronDown } from '@/components/icons'
import { setGrant } from '@/lib/accounts/actions'
import { GRANT_MESSAGE, MAX_GRANT_NOTE } from '@/lib/accounts/types'
import type { AccountPlanLine } from '@/lib/accounts/read'
import type { GrantResult } from '@/lib/accounts/types'
import { PLAN_VALUES } from '@/lib/plans/types'
import { useOnline } from '@/lib/useOnline'

/**
 * The plans an operator may give. `free` is excluded and that is a rule, not a shortening of
 * the list: rank 0 can never beat a live subscription, and against a dead one it resolves to
 * the same `free` the account already had, so it would be a gift that says something was given
 * and changes nothing. Taking a gift away is `Remove gift`. Derived from `PLAN_VALUES` rather
 * than typed out so a sixth plan appears here the day it is added, and `setGrant` refuses
 * `free` server-side too — a `<select>` is a suggestion to a browser, not a guarantee about an
 * action anything holding the session cookie can call.
 */
const GIVEABLE = PLAN_VALUES.filter((plan) => plan !== 'free')

/**
 * The subscription side as one sentence: what was bought and where it stands.
 *
 * Printed even when the gift is the side in force, because the alternative — show only the
 * winner — is unreadable as a control panel. A live premium gift under a live premium
 * subscription reports `source: 'subscription'` (the tie goes to the subscription,
 * `planStateFor`), and a winner-only panel would tell the operator their gift was never saved.
 */
function subscriptionLine(line: AccountPlanLine): string {
  if (line.status === 'expired') return `Subscription — ${line.plan}, expired`
  // `grace` deliberately says nothing about the date: a failing card is virtually always
  // already past period end, which is the whole reason `liveSubscription` ignores dates here.
  if (line.status === 'grace') return `Subscription — ${line.plan}, payment retrying`
  if (line.planExpiresOn === null) {
    return line.plan === 'free' ? 'Subscription — free' : `Subscription — ${line.plan}, no end`
  }
  return `Subscription — ${line.plan}, until ${line.planExpiresOn}`
}

/**
 * The gift side as one sentence.
 *
 * `grantedPlan === null` has **two** meanings and they must not be printed the same way: never
 * gifted, and gifted then withdrawn — `grantedBy` is what tells them apart, because `setGrant`
 * records the caller and the moment on the clear path too. (A departure from this screen's
 * original copy list, which had only «No gift.»; it follows from clearing keeping the audit,
 * and without the second sentence the record of a withdrawal would be in the row and on no
 * screen.) `grantEnded` is the third case: a gift that is still written down but whose own date
 * has passed, which must never be printed as "no end".
 */
function giftLine(line: AccountPlanLine): string {
  if (line.grantedPlan === null) {
    return line.grantedBy === null ? 'No gift.' : 'No gift: the last one was removed.'
  }
  if (line.grantedUntilOn === null) return `Gift — ${line.grantedPlan}, no end`
  if (line.grantEnded) return `Gift — ${line.grantedPlan}, ended ${line.grantedUntilOn}`
  return `Gift — ${line.grantedPlan} until ${line.grantedUntilOn}`
}

/** Who decided, and when — the giving or the taking away, whichever the row last recorded. */
function auditLine(line: AccountPlanLine): string | null {
  if (line.grantedBy === null || line.grantedOn === null) return null
  const verb = line.grantedPlan === null ? 'Removed' : 'Given'
  return `${verb} by ${line.grantedBy} on ${line.grantedOn}.`
}

/** Which of the two sides actually decides this account's limits right now. */
function inForceLine(line: AccountPlanLine): string {
  if (line.effectivePlan === 'free') return 'In force: free.'
  const side = line.source === 'grant' ? 'the gift' : 'the subscription'
  return `In force: ${line.effectivePlan}, from ${side}.`
}

/**
 * A global owner giving an account a plan by hand, or taking the gift back — the write half of
 * the plan clause the row already prints.
 *
 * Modelled on `AccountPasswordButton`: the same `useOnline` + `busy`/`error`/`done` triple, the
 * same `run(action, said)` wrapper, the same recessed `panel mt-2 w-full basis-full p-3.5
 * text-sm` in the row's flex-wrap slot, and no coordination with the other two panels on the
 * row — each of the three owns its own `open`, exactly as those two already do.
 *
 * Three deliberate departures. The trigger is a `btn btn-sm` reading `Plan` and not a third
 * `icon-button`, because the icon inventory has no gift, plan, badge or star glyph and every
 * plausible borrow means something else on this very row — `IconKey` is the password button two
 * slots away, `IconSettings` means preferences, `IconCheck` means "current". The trigger stays
 * rendered while the panel is open, where both siblings replace theirs, so that `aria-expanded`
 * describes something real and a second press closes. And success calls `router.refresh()`,
 * which the password button has no reason to: the row's own plan clause has to change.
 *
 * `AccountPlanLine` crosses as a **type-only** import. It lives in a `'use server'` module, so
 * a value import from it would pull a server module into the client bundle; the type erases at
 * compile time. Nothing but strings, booleans and plan names crosses either way — no `Date`,
 * and never an `Entitlements`, which never leaves the server at all.
 *
 * The winner is not re-derived here: `effectivePlan`/`source`/`untilOn` arrive already decided
 * by `planStateFor`. A second copy of the tie rule on the client is a copy that disagrees with
 * the gates after the first edit to either.
 */
export function AccountPlanButton({ ownerEmail, plan }: { ownerEmail: string; plan: AccountPlanLine }) {
  const router = useRouter()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  /*
   * Prefilled from what the row already holds, which is what makes editing the note without
   * moving the date possible — the reason this is a date field and not a "1 month / 1 year"
   * duration picker: a duration re-derives the end from `now` at every save, so fixing a typo
   * in the reason would silently extend the gift.
   */
  // `'free'` is storable in `granted_plan` but not giveable, so it must not seed the picker:
  // a `value` with no matching `<option>` shows the first one while state still says `free`,
  // and `Give` would then be refused for a plan nobody chose.
  const [giving, setGiving] = useState<string>(
    plan.grantedPlan !== null && plan.grantedPlan !== 'free' ? plan.grantedPlan : 'premium',
  )
  const [until, setUntil] = useState(plan.grantedUntilOn ?? '')
  const [note, setNote] = useState(plan.grantedNote ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const close = () => {
    setOpen(false)
    setError(null)
    setDone(null)
  }

  const run = async (action: () => Promise<GrantResult>, said: string, saved?: () => void) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await action()
      if (result.ok) {
        setDone(said)
        saved?.()
        // The row's plan clause is server-rendered, so only a refresh can make it agree with
        // what was just written. The panel keeps its own state across it (`CreateAccountForm`).
        router.refresh()
      } else {
        setError(GRANT_MESSAGE[result.reason])
      }
    } catch {
      setError(GRANT_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  const escapes = (event: { key: string }) => {
    if (event.key === 'Escape') close()
  }

  const audit = auditLine(plan)

  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        disabled={!online}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Plan
      </button>

      {open && (
        <div className="panel mt-2 w-full basis-full p-3.5 text-sm">
          <p className="mb-2">
            Plan for <strong>{ownerEmail}</strong>.
          </p>

          {error && (
            <p className="notice notice-error mb-2.5" role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className="notice notice-accent mb-2.5" role="status">
              {done}
            </p>
          )}

          <div className="mb-2.5 text-muted">
            <p>{subscriptionLine(plan)}</p>
            <p>{giftLine(plan)}</p>
            {audit && <p>{audit}</p>}
            {plan.grantedNote && <p>“{plan.grantedNote}”</p>}
            <p className="mt-1.5">{inForceLine(plan)}</p>
          </div>

          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void run(
                () => setGrant(ownerEmail, { plan: giving, until: until === '' ? null : until, note }),
                'Gift given.',
              )
            }}
          >
            <label className="picker picker-raised">
              <span className="sr-only">Plan to give</span>
              <select
                value={giving}
                onChange={(event) => setGiving(event.target.value)}
                onKeyDown={escapes}
                className="picker-select"
              >
                {GIVEABLE.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <IconChevronDown size={14} />
            </label>

            <input
              type="date"
              value={until}
              onChange={(event) => setUntil(event.target.value)}
              onKeyDown={escapes}
              aria-label="Gift ends on"
              className="form-field"
            />

            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={escapes}
              placeholder="Why — a refund, a review, a friend"
              aria-label="Why this was given"
              className="form-field min-w-0 flex-1"
              // The client half of a rule `setGrant` also enforces: an attribute is a hint to a
              // form, not a guarantee about a server action.
              maxLength={MAX_GRANT_NOTE}
            />

            <button
              type="submit"
              className="btn btn-primary btn-sm"
              // Disabled while the reason is empty *and* refused server-side as `note-required`:
              // both layers ask, for the reason `DeleteAccountButton` gives about its retype.
              disabled={!online || busy || note.trim().length === 0}
            >
              Give
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              // No retype-to-confirm: that net is for the irreversible cascades, which destroy
              // songs. A gift is three fields and fifteen seconds to re-enter.
              disabled={!online || busy || plan.grantedPlan === null}
              /*
               * The reason belonged to the gift that has just been taken away, so it is cleared
               * with it: left in the field, it would be re-submitted as the reason for the *next*
               * gift by anyone who pressed Give afterwards. The date and the picker are left
               * alone — they are a starting point, not a record of anything.
               */
              onClick={() => void run(() => setGrant(ownerEmail, null), 'Gift removed.', () => setNote(''))}
            >
              Remove gift
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={close}>
              Close
            </button>
          </form>

          <p className="mt-2 text-[0.8125rem] text-muted">Leave the date empty for a gift that never ends.</p>
        </div>
      )}
    </>
  )
}
