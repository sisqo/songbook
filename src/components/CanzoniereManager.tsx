'use client'

import { useState } from 'react'

import { useCanzonieri } from '@/components/CanzoniereProvider'
import { WRITE_MESSAGE, type WriteResult, countBySlug } from '@/lib/canzonieri/types'

/**
 * Create, rename and remove canzonieri.
 *
 * Removal never destroys anything: a canzoniere holding songs asks where to move
 * them first. The database enforces the same rule with `on delete restrict`, so
 * this UI is the explanation, not the guarantee.
 */
export function CanzoniereManager() {
  const state = useCanzonieri()
  const { canzonieri, online } = state
  const counts = countBySlug(state)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [destination, setDestination] = useState('')

  const run = async (action: () => Promise<WriteResult>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (!result.ok) setError(WRITE_MESSAGE[result.reason])
      return result.ok
    } catch {
      setError(WRITE_MESSAGE.failed)
      return false
    } finally {
      setBusy(false)
    }
  }

  const others = (slug: string) => canzonieri.filter((entry) => entry.slug !== slug)

  return (
    <div>
      {!online && (
        <p
          className="mb-4 rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          role="status"
        >
          Senza connessione i canzonieri si possono solo consultare. Sono una struttura
          condivisa, quindi le modifiche richiedono la rete.
        </p>
      )}

      {error !== null && (
        <p
          className="mb-4 rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          role="alert"
        >
          {error}
        </p>
      )}

      <ul>
        {canzonieri.map((canzoniere) => {
          const count = counts[canzoniere.slug] ?? 0
          const isRenaming = renaming === canzoniere.slug
          const isRemoving = removing === canzoniere.slug

          return (
            <li key={canzoniere.slug} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <div className="flex items-center gap-2 py-3">
                {isRenaming ? (
                  <>
                    <input
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenaming(null)
                      }}
                      aria-label={`Nuovo nome per ${canzoniere.name}`}
                      className="flex-1 rounded-lg border px-3 py-2"
                      style={{
                        background: 'var(--surface)',
                        borderColor: 'var(--line)',
                        color: 'var(--ink)',
                      }}
                    />
                    <button
                      type="button"
                      className="control-button"
                      disabled={busy || draft.trim() === ''}
                      onClick={async () => {
                        if (await run(() => state.rename(canzoniere.slug, draft))) {
                          setRenaming(null)
                        }
                      }}
                    >
                      Salva
                    </button>
                    <button
                      type="button"
                      className="control-button"
                      onClick={() => setRenaming(null)}
                    >
                      Annulla
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1">
                      <span className="font-medium">{canzoniere.name}</span>
                      <span className="block text-xs" style={{ color: 'var(--faint)' }}>
                        {count} {count === 1 ? 'brano' : 'brani'}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="control-button"
                      disabled={!online || busy}
                      onClick={() => {
                        setRenaming(canzoniere.slug)
                        setDraft(canzoniere.name)
                        setRemoving(null)
                        setError(null)
                      }}
                    >
                      Rinomina
                    </button>
                    <button
                      type="button"
                      className="control-button"
                      disabled={!online || busy}
                      onClick={() => {
                        setRemoving(isRemoving ? null : canzoniere.slug)
                        setDestination(others(canzoniere.slug)[0]?.slug ?? '')
                        setRenaming(null)
                        setError(null)
                      }}
                    >
                      Rimuovi
                    </button>
                  </>
                )}
              </div>

              {isRemoving && (
                <div
                  className="mb-3 rounded-lg p-3 text-sm"
                  style={{ background: 'var(--surface)' }}
                >
                  {count === 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">
                        Rimuovere «{canzoniere.name}»? È vuoto.
                      </span>
                      <button
                        type="button"
                        className="control-button"
                        disabled={busy}
                        onClick={async () => {
                          if (await run(() => state.remove(canzoniere.slug, null))) {
                            setRemoving(null)
                          }
                        }}
                      >
                        Rimuovi
                      </button>
                      <button
                        type="button"
                        className="control-button"
                        onClick={() => setRemoving(null)}
                      >
                        Annulla
                      </button>
                    </div>
                  ) : others(canzoniere.slug).length === 0 ? (
                    <span>
                      Contiene {count} {count === 1 ? 'brano' : 'brani'} e non c&apos;è un altro
                      canzoniere dove spostarli. Creane uno prima di rimuovere questo.
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">
                        Contiene {count} {count === 1 ? 'brano' : 'brani'}. Spostali in:
                      </span>
                      <label>
                        <span className="sr-only">Canzoniere di destinazione</span>
                        <select
                          value={destination}
                          onChange={(event) => setDestination(event.target.value)}
                          className="rounded-lg border px-2 py-2"
                          style={{
                            background: 'var(--bg)',
                            borderColor: 'var(--line)',
                            color: 'var(--ink)',
                          }}
                        >
                          {others(canzoniere.slug).map((entry) => (
                            <option key={entry.slug} value={entry.slug}>
                              {entry.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="control-button"
                        disabled={busy || destination === ''}
                        onClick={async () => {
                          if (await run(() => state.remove(canzoniere.slug, destination))) {
                            setRemoving(null)
                          }
                        }}
                      >
                        Sposta e rimuovi
                      </button>
                      <button
                        type="button"
                        className="control-button"
                        onClick={() => setRemoving(null)}
                      >
                        Annulla
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <form
        className="mt-6 flex gap-2 border-t pt-4"
        style={{ borderColor: 'var(--line)' }}
        onSubmit={async (event) => {
          event.preventDefault()
          if (await run(() => state.create(newName))) setNewName('')
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Nome del nuovo canzoniere</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nuovo canzoniere"
            className="w-full rounded-lg border px-3 py-2"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--line)',
              color: 'var(--ink)',
            }}
          />
        </label>
        <button
          type="submit"
          className="control-button"
          disabled={!online || busy || newName.trim() === ''}
        >
          Crea
        </button>
      </form>
    </div>
  )
}
