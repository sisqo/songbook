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
 * Here rather than only in `/utenti` because a password only an admin can change is a
 * password the admin knows. Every role has this screen — how you get in is your own
 * business, and a viewer needs it as much as an admin.
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

  if (!asked) return <p className="text-sm text-muted">Un momento…</p>

  if (account === null) {
    return (
      <p className="notice notice-accent">
        <IconOffline />
        {online
          ? 'Non è stato possibile leggere il tuo account. Ricarica la pagina.'
          : 'Serve la rete per cambiare la password.'}
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
        Entri come <strong>{account.email}</strong>.{' '}
        {account.hasPassword
          ? 'Puoi entrare con Google o con questa password.'
          : 'Adesso entri con Google. Una password è un secondo modo, non un sostituto.'}
      </p>

      <form
        className="grid max-w-sm gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void run(
            () => setOwnPassword(current, next),
            account.hasPassword ? 'Password cambiata.' : 'Password impostata.',
          )
        }}
      >
        {/*
          * Only when there is one to get wrong. Somebody who has only ever used Google has
          * no current password, and asking for it would leave them unable to set a first one.
          */}
        {account.hasPassword && (
          <label className="block">
            <span className="field-label">Password attuale</span>
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
            Nuova password — almeno {MIN_PASSWORD} caratteri
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
            {account.hasPassword ? 'Cambia password' : 'Imposta password'}
          </button>

          {account.hasPassword && !removing && (
            <button
              type="button"
              className="btn btn-quiet"
              disabled={!online || busy}
              onClick={() => setRemoving(true)}
            >
              Rimuovi la password
            </button>
          )}
        </div>
      </form>

      {removing && (
        <div className="panel mt-4 max-w-sm p-3.5 text-sm">
          <p>
            Rimuovere la password? Da quel momento entri solo con Google, con questo stesso
            indirizzo.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={async () => {
                await run(() => removeOwnPassword(), 'Password rimossa.')
                setRemoving(false)
              }}
            >
              Rimuovi
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRemoving(false)}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {!online && (
        <p className="notice notice-accent mt-4">
          <IconOffline />
          Senza connessione la password non si può cambiare.
        </p>
      )}
    </div>
  )
}
