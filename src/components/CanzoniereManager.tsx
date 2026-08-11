'use client'

import { useState } from 'react'

import { useCanzonieri } from '@/components/CanzoniereProvider'
import {
  IconChevronDown,
  IconOffline,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@/components/icons'
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
        <p className="notice notice-accent mb-4">
          <IconOffline />
          Senza connessione i canzonieri si possono solo consultare. Sono una struttura
          condivisa, quindi le modifiche richiedono la rete.
        </p>
      )}

      {error !== null && (
        <p className="notice notice-error mb-4" role="alert">
          {error}
        </p>
      )}

      {/*
        * A card each. A canzoniere is a container, not a line in an index — and the
        * step that asks where its songs should go opens inside its own card, under
        * the row it belongs to, rather than in a list where it could belong to any.
        */}
      <ul className="card-stack">
        {canzonieri.map((canzoniere) => {
          const count = counts[canzoniere.slug] ?? 0
          const isRenaming = renaming === canzoniere.slug
          const isRemoving = removing === canzoniere.slug

          return (
            <li key={canzoniere.slug} className="card p-[0.875rem] sm:px-4">
              <div className="flex items-center gap-2.5">
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
                      className="form-field flex-1"
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
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
                      className="btn btn-quiet btn-sm"
                      onClick={() => setRenaming(null)}
                    >
                      Annulla
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{canzoniere.name}</span>
                      <span className="meta-chip mt-1.5">
                        {count} {count === 1 ? 'brano' : 'brani'}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={!online || busy}
                      onClick={() => {
                        setRenaming(canzoniere.slug)
                        setDraft(canzoniere.name)
                        setRemoving(null)
                        setError(null)
                      }}
                      aria-label={`Rinomina ${canzoniere.name}`}
                    >
                      <IconPencil size={17} />
                    </button>
                    {/*
                      * Turns red when its own confirmation is open, so it is clear
                      * which row the question under the list belongs to.
                      */}
                    <button
                      type="button"
                      className={isRemoving ? 'icon-button is-danger' : 'icon-button'}
                      disabled={!online || busy}
                      onClick={() => {
                        setRemoving(isRemoving ? null : canzoniere.slug)
                        setDestination(others(canzoniere.slug)[0]?.slug ?? '')
                        setRenaming(null)
                        setError(null)
                      }}
                      aria-label={`Rimuovi ${canzoniere.name}`}
                      aria-expanded={isRemoving}
                    >
                      <IconTrash size={17} />
                    </button>
                  </>
                )}
              </div>

              {isRemoving && (
                <div className="panel mt-3.5 p-3.5 text-sm">
                  {count === 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">Rimuovere «{canzoniere.name}»? È vuoto.</span>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
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
                        className="btn btn-quiet btn-sm"
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
                      <label className="picker picker-raised">
                        <span className="sr-only">Canzoniere di destinazione</span>
                        <select
                          value={destination}
                          onChange={(event) => setDestination(event.target.value)}
                          className="picker-select"
                        >
                          {others(canzoniere.slug).map((entry) => (
                            <option key={entry.slug} value={entry.slug}>
                              {entry.name}
                            </option>
                          ))}
                        </select>
                        <IconChevronDown size={14} />
                      </label>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
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
                        className="btn btn-quiet btn-sm"
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
        className="mt-4 flex gap-2"
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
            className="form-field min-h-12 rounded-pill px-[1.125rem]"
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary min-h-12 px-5"
          disabled={!online || busy || newName.trim() === ''}
        >
          <IconPlus size={16} />
          Crea
        </button>
      </form>
    </div>
  )
}
