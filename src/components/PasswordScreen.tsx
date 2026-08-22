'use client'

import { useCallback, useEffect, useState } from 'react'

import { IconOffline } from '@/components/icons'
import {
  loadAccount,
  removeOwnPassword,
  setOwnPassword,
} from '@/lib/auth/actions'
import { MIN_PASSWORD, PASSWORD_MESSAGE, type PasswordResult } from '@/lib/auth/types'
import { useOnline } from '@/lib/useOnline'

/**
 * Your own way in, set by you.
 *
 * Every signed-in reader has this screen, unconditionally — how you get in is your own
 * business, not something a role could ever gate. A global owner can also set or remove
 * the password of an address that has never signed in, from that account's own detail page
 * (`PasswordForm`), which is the one exception: there is no invite email in this
 * app, so it is the only way an address with no matching Google account ever gets a way
 * in at all. That path never touches this screen, though it can still reach a global
 * owner's own password — see `setPasswordFor`'s own comment on why that is not new risk.
 *
 * Nothing is baked in and nothing is cached: whether you have a password is a fact about
 * the server, and offline the honest answer is that it cannot be asked.
 */
export function PasswordScreen() {
  const online = useOnline()

  const [account, setAccount] = useState<{ email: string; hasPassword: boolean } | null>(null)
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [removing, setRemoving] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setAccount(await loadAccount())
    } catch {
      setAccount(null)
    } finally {
      setAsked(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (action: () => Promise<PasswordResult>, said: string) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await action()
      if (result.ok) {
        setDone(said)
        setCurrent('')
        setNext('')
        await refresh()
      } else {
        setError(PASSWORD_MESSAGE[result.reason])
      }
    } catch {
      setError(PASSWORD_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  if (!asked) return <p className="text-sm text-muted">One moment…</p>

  if (account === null) {
    return (
      <p className="notice notice-accent">
        <IconOffline />
        {online
          ? "Couldn't read your account. Reload the page."
          : 'You need a connection to change your password.'}
      </p>
    )
  }

  return (
    <div>
      {error !== null && (
        <p className="notice notice-error mb-4" role="alert">
          {error}
        </p>
      )}

      {done !== null && (
        <p className="notice notice-accent mb-4" role="status">
          {done}
        </p>
      )}

      <p className="mb-4 text-sm leading-[1.45] text-muted">
        You sign in as <strong>{account.email}</strong>.{' '}
        {account.hasPassword
          ? 'You can sign in with Google or with this password.'
          : "Right now you sign in with Google. A password is a second way in, not a replacement."}
      </p>

      <form
        className="grid max-w-sm gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void run(
            () => setOwnPassword(current, next),
            account.hasPassword ? 'Password changed.' : 'Password set.',
          )
        }}
      >
        {/*
          * Only when there is one to get wrong. Somebody who has only ever used Google has
          * no current password, and asking for it would leave them unable to set a first one.
          */}
        {account.hasPassword && (
          <label className="block">
            <span className="field-label">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              className="form-field"
              required
            />
          </label>
        )}

        <label className="block">
          <span className="field-label">
            New password — at least {MIN_PASSWORD} characters
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            className="form-field"
            required
            minLength={MIN_PASSWORD}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!online || busy || next.length < MIN_PASSWORD}
          >
            {account.hasPassword ? 'Change password' : 'Set password'}
          </button>

          {account.hasPassword && !removing && (
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!online || busy}
              onClick={() => setRemoving(true)}
            >
              Remove password
            </button>
          )}
        </div>
      </form>

      {removing && (
        <div className="panel mt-4 max-w-sm p-3.5 text-sm">
          <p>
            Remove the password? From then on you&apos;ll sign in only with Google, with this
            same address.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={async () => {
                await run(() => removeOwnPassword(), 'Password removed.')
                setRemoving(false)
              }}
            >
              Remove
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRemoving(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!online && (
        <p className="notice notice-accent mt-4">
          <IconOffline />
          The password can&apos;t be changed without a connection.
        </p>
      )}
    </div>
  )
}
