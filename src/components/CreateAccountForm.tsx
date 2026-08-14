'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { IconPlus } from '@/components/icons'
import { createAccount } from '@/lib/accounts/actions'
import { ACCOUNT_MESSAGE } from '@/lib/accounts/types'
import { useOnline } from '@/lib/useOnline'

/**
 * A global owner giving an address its own account ahead of its first sign-in.
 *
 * `router.refresh()` re-renders the page's server components against the `revalidatePath`
 * `createAccount` already did, so the new row appears in the list below without losing
 * whatever this form (or the rest of the page) held in client state.
 */
export function CreateAccountForm() {
  const router = useRouter()
  const online = useOnline()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await createAccount(email)
      if (result.ok) {
        setEmail('')
        router.refresh()
      } else {
        setError(ACCOUNT_MESSAGE[result.reason])
      }
    } catch {
      setError(ACCOUNT_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form className="flex gap-2" onSubmit={submit}>
        <label className="flex-1">
          <span className="sr-only">New account&apos;s email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="person@example.com"
            className="form-field min-h-12 rounded-pill px-[1.125rem]"
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary min-h-12 px-5"
          disabled={!online || busy || email.trim() === ''}
        >
          <IconPlus size={16} />
          Create
        </button>
      </form>
      {error && (
        <p className="notice notice-error mt-2.5" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
