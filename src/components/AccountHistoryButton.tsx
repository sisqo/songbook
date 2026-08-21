'use client'

import { useState } from 'react'

import { PaymentHistoryTable } from '@/components/PaymentHistoryTable'
import { loadAccountHistory } from '@/lib/accounts/actions'
import type { PaymentHistoryLine } from '@/lib/plans/history'
import { useOnline } from '@/lib/useOnline'

type Status = { state: 'idle' } | { state: 'loading' } | { state: 'error' } | { state: 'ready'; lines: PaymentHistoryLine[] }

/**
 * Read-only, deliberately — the one place `/accounts` shows a payment history, with no form
 * beside it. `PLAN-pagamenti.md` decided the admin side gets visibility here and no direct
 * write lever over any account's subscription, so unlike `AccountPlanButton` this panel has
 * nothing to submit: an operator who needs to act on an account still does it by switching
 * into it (already existing) and using the checkout/billing screens there, the same as any
 * other reader would.
 *
 * Loaded on open, not on page load, for the same reason `AccountPlanButton` reads a prop
 * already on the row instead of fetching a second time: most rows on this screen are never
 * opened, and a history query for every account in the installation on every render of
 * `/accounts` would pay for almost all of them for nothing.
 */
export function AccountHistoryButton({ ownerEmail }: { ownerEmail: string }) {
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>({ state: 'idle' })

  const openPanel = () => {
    setOpen(true)
    if (status.state !== 'idle') return

    setStatus({ state: 'loading' })
    void loadAccountHistory(ownerEmail).then((result) => {
      setStatus(result.ok ? { state: 'ready', lines: result.history } : { state: 'error' })
    })
  }

  const close = () => setOpen(false)

  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        disabled={!online}
        aria-expanded={open}
        onClick={() => (open ? close() : openPanel())}
      >
        History
      </button>

      {open && (
        <div className="panel mt-2 w-full basis-full p-3.5 text-sm">
          <p className="mb-2">
            Payment history for <strong>{ownerEmail}</strong>.
          </p>

          {status.state === 'loading' && <p className="text-muted">Loading…</p>}
          {status.state === 'error' && (
            <p className="notice notice-error" role="alert">
              Could not read the history.
            </p>
          )}
          {status.state === 'ready' && <PaymentHistoryTable lines={status.lines} />}

          <button type="button" className="btn btn-quiet btn-sm mt-3" onClick={close}>
            Close
          </button>
        </div>
      )}
    </>
  )
}
