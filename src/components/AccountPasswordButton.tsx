'use client'

import { useState } from 'react'

import { IconKey } from '@/components/icons'
import { removePasswordFor, setPasswordFor } from '@/lib/auth/actions'
import { MIN_PASSWORD, PASSWORD_MESSAGE, type PasswordResult } from '@/lib/auth/types'
import { useOnline } from '@/lib/useOnline'

/**
 * A global owner setting or removing the password of an account they are not signed in
 * as — the only way in for an address with no matching Google account, since this app
 * sends no invite email (see `setPasswordFor`'s own comment). No "current password"
 * field, unlike the self-service `PasswordScreen`: a global owner is not proving they
 * already know it, only that they may act on this account at all.
 */
export function AccountPasswordButton({ ownerEmail }: { ownerEmail: string }) {
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (!open) {
    return (
      <button
        type="button"
        className="icon-button"
        disabled={!online}
        onClick={() => setOpen(true)}
        aria-label={`Set password for ${ownerEmail}`}
      >
        <IconKey size={17} />
      </button>
    )
  }

  const close = () => {
    setOpen(false)
    setPassword('')
    setError(null)
    setDone(null)
  }

  const run = async (action: () => Promise<PasswordResult>, said: string) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await action()
      if (result.ok) {
        setDone(said)
        setPassword('')
      } else {
        setError(PASSWORD_MESSAGE[result.reason])
      }
    } catch {
      setError(PASSWORD_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel mt-2 w-full basis-full p-3.5 text-sm">
      <p className="mb-2">
        Password for <strong>{ownerEmail}</strong>.
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

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void run(() => setPasswordFor(ownerEmail, password), 'Password set.')
        }}
      >
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={`At least ${MIN_PASSWORD} characters`}
          aria-label={`New password for ${ownerEmail}`}
          className="form-field min-w-0 flex-1"
          minLength={MIN_PASSWORD}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={!online || busy || password.length < MIN_PASSWORD}
        >
          Set
        </button>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={!online || busy}
          onClick={() => void run(() => removePasswordFor(ownerEmail), 'Password removed.')}
        >
          Remove
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={close}>
          Close
        </button>
      </form>
    </div>
  )
}
