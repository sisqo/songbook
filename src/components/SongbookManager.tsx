'use client'

import { useState } from 'react'

import { useSongbooks } from '@/components/SongbookProvider'
import { RoleNotice } from '@/components/RoleNotice'
import { useRole } from '@/components/RoleProvider'
import {
  IconChevronDown,
  IconOffline,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@/components/icons'
import { WRITE_MESSAGE, type WriteResult, countBySlug } from '@/lib/songbooks/types'

/**
 * Create, rename and remove songbooks.
 *
 * Removal never destroys anything: a songbook holding songs asks where to move
 * them first. The database enforces the same rule with `on delete restrict`, so
 * this UI is the explanation, not the guarantee.
 */
export function SongbookManager() {
  const state = useSongbooks()
  const { songbooks, online } = state
  const { known, mayEdit } = useRole()
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

  const others = (slug: string) => songbooks.filter((entry) => entry.slug !== slug)

  // Reading a songbook is what the home is for; this screen only changes them.
  if (!known) return null
  if (!mayEdit) return <RoleNotice needed="Editor" what="create, rename or remove songbooks" />

  return (
    <div>
      {!online && (
        <p className="notice notice-accent mb-4">
          <IconOffline />
          Without a connection, songbooks can only be viewed. They&apos;re a shared structure,
          so changes require a connection.
        </p>
      )}

      {error !== null && (
        <p className="notice notice-error mb-4" role="alert">
          {error}
        </p>
      )}

      {/*
        * A card each. A songbook is a container, not a line in an index — and the
        * step that asks where its songs should go opens inside its own card, under
        * the row it belongs to, rather than in a list where it could belong to any.
        */}
      <ul className="card-stack">
        {songbooks.map((songbook) => {
          const count = counts[songbook.slug] ?? 0
          const isRenaming = renaming === songbook.slug
          const isRemoving = removing === songbook.slug

          return (
            <li key={songbook.slug} className="card p-[0.875rem] sm:px-4">
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
                      aria-label={`New name for ${songbook.name}`}
                      className="form-field flex-1"
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy || draft.trim() === ''}
                      onClick={async () => {
                        if (await run(() => state.rename(songbook.slug, draft))) {
                          setRenaming(null)
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{songbook.name}</span>
                      <span className="meta-chip mt-1.5">
                        {count} {count === 1 ? 'song' : 'songs'}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={!online || busy}
                      onClick={() => {
                        setRenaming(songbook.slug)
                        setDraft(songbook.name)
                        setRemoving(null)
                        setError(null)
                      }}
                      aria-label={`Rename ${songbook.name}`}
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
                        setRemoving(isRemoving ? null : songbook.slug)
                        setDestination(others(songbook.slug)[0]?.slug ?? '')
                        setRenaming(null)
                        setError(null)
                      }}
                      aria-label={`Remove ${songbook.name}`}
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
                      <span className="flex-1">Remove &quot;{songbook.name}&quot;? It&apos;s empty.</span>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busy}
                        onClick={async () => {
                          if (await run(() => state.remove(songbook.slug, null))) {
                            setRemoving(null)
                          }
                        }}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => setRemoving(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : others(songbook.slug).length === 0 ? (
                    <span>
                      Contains {count} {count === 1 ? 'song' : 'songs'} and there&apos;s no other
                      songbook to move them to. Create one before removing this one.
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">
                        Contains {count} {count === 1 ? 'song' : 'songs'}. Move them to:
                      </span>
                      <label className="picker picker-raised">
                        <span className="sr-only">Destination songbook</span>
                        <select
                          value={destination}
                          onChange={(event) => setDestination(event.target.value)}
                          className="picker-select"
                        >
                          {others(songbook.slug).map((entry) => (
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
                          if (await run(() => state.remove(songbook.slug, destination))) {
                            setRemoving(null)
                          }
                        }}
                      >
                        Move and remove
                      </button>
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => setRemoving(null)}
                      >
                        Cancel
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
          <span className="sr-only">New songbook name</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New songbook"
            className="form-field min-h-12 rounded-pill px-[1.125rem]"
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary min-h-12 px-5"
          disabled={!online || busy || newName.trim() === ''}
        >
          <IconPlus size={16} />
          Create
        </button>
      </form>
    </div>
  )
}
