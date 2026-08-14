'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { IconTrash } from '@/components/icons'
import { deleteAccount } from '@/lib/accounts/actions'
import { ACCOUNT_MESSAGE } from '@/lib/accounts/types'
import { useOnline } from '@/lib/useOnline'

/**
 * The one safety net for an otherwise unblocked, immediate cascade (see `PLAN.md`,
 * *Niente più ospiti*, point 7): retyping the account's own address before the button
 * does anything. Enforced here for the same reason `deleteAccount` also checks it
 * server-side — a disabled button is a hint, not a guarantee, so both layers ask.
 */
export function DeleteAccountButton({ ownerEmail }: { ownerEmail: string }) {
  const router = useRouter()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = confirmEmail.trim().toLowerCase() === ownerEmail.toLowerCase()

  if (!open) {
    return (
      <button
        type="button"
        className="icon-button"
        disabled={!online}
        onClick={() => setOpen(true)}
        aria-label={`Delete ${ownerEmail}`}
      >
        <IconTrash size={17} />
      </button>
    )
  }

  const cancel = () => {
    setOpen(false)
    setConfirmEmail('')
    setError(null)
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await deleteAccount(ownerEmail, confirmEmail)
      if (result.ok) router.refresh()
      else setError(ACCOUNT_MESSAGE[result.reason])
    } catch {
      setError(ACCOUNT_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel mt-2 w-full basis-full p-3.5 text-sm">
      <p className="mb-2">
        This deletes every songbook, section and song in <strong>{ownerEmail}</strong> — not just
        the account, everything in it. Type the address to confirm.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={confirmEmail}
          onChange={(event) => setConfirmEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel()
          }}
          placeholder={ownerEmail}
          aria-label={`Retype ${ownerEmail} to confirm deletion`}
          className="form-field min-w-0 flex-1"
        />
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={!matches || busy}
          onClick={confirm}
        >
          Delete
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={cancel}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="notice notice-error mt-2.5" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
