'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'

import { ArrangeSongbook } from '@/components/ArrangeSongbook'
import { ImportIntoSongbook } from '@/components/ImportIntoSongbook'
import { useSongbooks } from '@/components/SongbookProvider'
import { useRole } from '@/components/RoleProvider'
import { SongRow } from '@/components/SongRow'
import {
  IconBooks,
  IconChevronDown,
  IconChevronRight,
  IconGrip,
  IconImport,
  IconOffline,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@/components/icons'
import { createSong } from '@/lib/import/actions'
import { saveMessage } from '@/lib/import/types'
import { loadSongIndex } from '@/lib/library/actions'
import { applyOrder } from '@/lib/songbooks/order'
import { useLiveRows } from '@/lib/library/useLiveSongs'
import type { SongIndexRow } from '@/lib/search-index'
import { type Folds, readFolds, songFromHash, writeFolds } from '@/lib/sections/folds'
import { writeMessage, type WriteResult } from '@/lib/songbooks/types'

/**
 * The songs of one songbook, under the section each belongs to.
 *
 * Which songs those are, and which section holds them, comes from the mutable layer
 * rather than from the page: a song moved since the last build belongs where it is now,
 * and the page it was baked into cannot know that. The order comes from the same query
 * the build used, so this list and the arrows inside a song agree about what "next"
 * means.
 *
 * Sections open and close, and they start **closed**: a songbook reads as an index of
 * its parts, and you open the part you need. Two exceptions keep that from being
 * annoying, and both give way to anything the reader has actually chosen:
 *
 * 1. a songbook with a single section opens it — a fold with one compartment is not a
 *    choice, and it is the state of every songbook until somebody divides it;
 * 2. arriving from a song opens the section that song is in, so the way back lands you
 *    where you were rather than in front of a closed list.
 *
 * Arranging, and now importing too, are modes rather than a handle on every row (or a
 * form) for the rest of the app's life, because this is a list you read far more often
 * than you rearrange or add to. The two are mutually exclusive: there is one reason to
 * leave the plain list at a time.
 */
export function SongbookSongs({
  slug,
  songs: baked,
}: {
  slug: string
  songs: SongIndexRow[]
}) {
  const router = useRouter()
  const state = useSongbooks()
  const { assignments, online, divisionsOf, nameOf } = state
  const { mayEdit } = useRole()

  const [rows, setRows] = useLiveRows(baked)
  const [mode, setMode] = useState<'list' | 'organizing' | 'importing'>('list')

  /*
   * A blank song is a single title (plus a section, if there's more than one
   * to choose from) followed by a redirect straight into the editor — not
   * its own screen the way Arrange and Add song are, since there's nothing
   * left to show here once it's created. An inline panel, same shape as
   * renaming a section just above, fits that better than a third `mode`.
   */
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newSectionId, setNewSectionId] = useState('')
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [folds, setFolds] = useState<Folds>({})
  /** The song a link asked for, if one did. The *song*, not its section: see below. */
  const [asked, setAsked] = useState<string | null>(null)

  /*
   * Renaming and removing a section, right on this row — the same interaction a
   * songbook gets on the screen above this one, not something only reachable
   * through Arrange.
   */
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [removing, setRemoving] = useState<number | null>(null)
  const [destination, setDestination] = useState('')
  /** Set once "Delete everything instead" is tapped, to ask for it a second time. */
  const [purging, setPurging] = useState<number | null>(null)

  const divisions = useMemo(() => divisionsOf(slug), [divisionsOf, slug])

  const run = async (action: () => Promise<WriteResult>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (!result.ok) setError(writeMessage(result))
      return result.ok
    } catch {
      setError(writeMessage({ reason: 'failed' }))
      return false
    } finally {
      setBusy(false)
    }
  }

  const others = (id: number) => divisions.filter((section) => section.id !== id)

  /**
   * This songbook's songs, grouped by section, in the order the list holds them.
   *
   * Membership is asked of the mutable layer rather than of the rows, because that is
   * where the answer changes: a song can be moved into another section without its own
   * row changing at all. The rows arrive already ordered by section and then by place, so
   * filtering each section out of them keeps that order without sorting anything again.
   */
  const groups = useMemo<{ section: (typeof divisions)[number]; songs: SongIndexRow[] }[]>(
    () =>
      divisions.map((section) => ({
        section,
        songs: rows.filter((row) => assignments[row.slug] === section.id),
      })),
    [divisions, rows, assignments],
  )

  const total = useMemo(
    () => groups.reduce((count, group) => count + group.songs.length, 0),
    [groups],
  )

  /*
   * Both memories are read in a layout effect: reading them during render would produce
   * markup the server never sent and trip hydration, and reading them after paint would
   * show every section closed for a frame first. The hash is read here for the same
   * reason and at the same moment.
   */
  useLayoutEffect(() => {
    setFolds(readFolds(slug))
    setAsked(songFromHash(window.location.hash))
  }, [slug])

  /**
   * The section to open on arrival, worked out from the song rather than fixed when the
   * link was followed.
   *
   * It has to be derived, not stored: layout effects run child before parent, so at the
   * moment the hash is read the assignments are still the ones baked into the page — and
   * for a song moved since the last build that is the section it *used* to be in. Deriving
   * it means the right section opens as soon as the live answer lands, a beat later.
   */
  const arrived = asked === null ? null : (assignments[asked] ?? null)

  /** Closed unless the reader said otherwise, or one of the two exceptions applies. */
  const isOpen = useCallback(
    (id: number) => folds[String(id)] ?? (divisions.length === 1 || id === arrived),
    [folds, divisions.length, arrived],
  )

  const toggle = (id: number) => {
    const next = { ...folds, [String(id)]: !isOpen(id) }
    setFolds(next)
    writeFolds(slug, next)
  }

  // Bring the row you came back from into view, once the section holding it is open.
  useEffect(() => {
    if (arrived === null || asked === null) return

    document.getElementById(`song-${asked}`)?.scrollIntoView({ block: 'center' })
  }, [arrived, asked])

  /**
   * What Arrange gets for free from dragging a row, Import has to ask for: a song it
   * just saved has no way to patch itself into `rows`, so the only way to make it
   * show up without a reload is to read the live index again, the same way this list
   * read it the first time.
   */
  const refreshRows = useCallback(async () => {
    try {
      const live = await loadSongIndex()
      if (live !== null) setRows(live)
    } catch {
      // Offline or signed out: the list stays as it was.
    }
  }, [setRows])

  if (mode === 'organizing') {
    return (
      <ArrangeSongbook
        songbookSlug={slug}
        rows={rows}
        onDone={() => setMode('list')}
        onApplied={(order) => setRows((current) => applyOrder(current, order))}
      />
    )
  }

  if (mode === 'importing') {
    // Never actually null here — the button that reaches this mode only exists once
    // the songbook itself has loaded — but the lookup is nullable, so a fallback is
    // still needed to satisfy the type.
    return (
      <ImportIntoSongbook
        songbookSlug={slug}
        songbookName={nameOf(slug) ?? ''}
        onDone={() => setMode('list')}
        onImported={refreshRows}
      />
    )
  }

  const name = nameOf(slug) ?? ''

  return (
    <>
      {/*
        * The name and its counts live here, not on the static page above: they come
        * from the same live layer the cards below read, so a section added a moment
        * ago is already counted here too rather than waiting for the next rebuild.
        */}
      <div className="screen-header">
        <div className="min-w-0">
          <h1 className="screen-title flex items-center gap-3.5">
            <span className="row-icon row-icon-lg" aria-hidden>
              <IconBooks size={21} />
            </span>
            <span className="min-w-0 truncate">{name}</span>
          </h1>
          <p className="screen-subtitle">
            <span>
              {total} {total === 1 ? 'song' : 'songs'}
            </span>
            {divisions.length > 0 && (
              <>
                <span className="screen-subtitle-dot" aria-hidden />
                <span>
                  {divisions.length} {divisions.length === 1 ? 'section' : 'sections'}
                </span>
              </>
            )}
          </p>
        </div>

        {/*
          * Both need a network — one to save the layout, the other to save a song —
          * and both are for someone whose songbook this is, not a reader. No minimum
          * number of songs for Arrange: with sections there is a layout to change with
          * one song — moving it to another section — and with none at all, which is
          * making the first division. Adding a song has no minimum either: an empty
          * songbook is exactly the case it exists for.
          *
          * Both render regardless of `online` and go `disabled` instead — same pattern
          * as the songbooks list's own header actions, so an editor sees why these two
          * are inert (the notice below says so) instead of finding them simply gone.
          */}
        {mayEdit && (
          <div className="screen-header-actions">
            <button
              type="button"
              className="btn btn-sm"
              disabled={!online}
              onClick={() => setMode('organizing')}
            >
              <IconGrip size={16} />
              Arrange
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={!online}
              onClick={() => {
                setCreating(true)
                setNewTitle('')
                setNewSectionId(String(divisions[0]?.id ?? ''))
                setCreateError(null)
              }}
            >
              <IconPlus size={16} />
              New song
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!online}
              onClick={() => setMode('importing')}
            >
              <IconImport size={16} />
              Add song
            </button>
          </div>
        )}
      </div>

      {mayEdit && !online && (
        <p className="notice notice-accent mt-4">
          <IconOffline />
          Without a connection, this songbook can only be viewed. Arranging it or adding
          songs needs a connection.
        </p>
      )}

      {mayEdit && creating && (
        <div className="panel mt-4 p-3.5">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[0.84375rem] text-muted">Title</span>
              <input
                autoFocus
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setCreating(false)
                }}
                placeholder="Song title"
                className="form-field min-w-0 flex-1"
              />
            </label>
            {divisions.length > 1 && (
              <label className="picker picker-raised">
                <span className="sr-only">Section</span>
                <select
                  value={newSectionId}
                  onChange={(event) => setNewSectionId(event.target.value)}
                  className="picker-select"
                >
                  {divisions.map((section) => (
                    <option key={section.id} value={String(section.id)}>
                      {section.name}
                    </option>
                  ))}
                </select>
                <IconChevronDown size={14} />
              </label>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={creatingBusy || newTitle.trim() === ''}
              onClick={async () => {
                setCreatingBusy(true)
                setCreateError(null)
                try {
                  const result = await createSong(
                    newTitle,
                    slug,
                    newSectionId === '' ? null : Number(newSectionId),
                  )
                  if (!result.ok) {
                    setCreateError(saveMessage(result))
                    return
                  }
                  router.push(`/songs/${result.song.slug}/edit`)
                } catch {
                  setCreateError(saveMessage({ reason: 'failed' }))
                } finally {
                  setCreatingBusy(false)
                }
              }}
            >
              Create
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
          {createError !== null && (
            <p className="notice notice-error mt-2" role="alert">
              {createError}
            </p>
          )}
        </div>
      )}

      {mayEdit && error !== null && (
        <p className="notice notice-error mt-4" role="alert">
          {error}
        </p>
      )}

      {divisions.length === 0 && total === 0 ? (
        /*
         * No section at all is reachable now, not just no songs: `removeSection`
         * lets Arrange delete the last one while it is empty, and the old escape
         * from here — the standalone import screen's own songbook picker, which
         * could reach this songbook and its "new section" shortcut regardless of
         * what this page was showing — is gone with that screen. So the buttons
         * above render regardless of this message: an editor's only way back to a
         * section is Arrange or Add song, both of which can make one.
         */
        <p className="panel mt-4 p-3.5 text-sm text-muted">No songs in this songbook.</p>
      ) : (
        <>
          {/*
            * A card each. A section is a thing that opens and closes, with its own name and
            * its own songs, so it gets its own card rather than a hairline inside a shared
            * one — and a fold then has a visible container to happen in.
            */}
          <ul className="card-stack mt-4">
            {groups.map(({ section, songs }) => {
              const open = isOpen(section.id)
              const isRenaming = renaming === section.id
              const isRemoving = removing === section.id

              return (
                <li key={section.id} className="card p-2">
                  <div className="flex items-center gap-1">
                    {isRenaming ? (
                      <>
                        <div className="row min-w-0 flex-1">
                          <input
                            autoFocus
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') setRenaming(null)
                            }}
                            aria-label={`New name for ${section.name}`}
                            className="form-field min-w-0 flex-1"
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busy || draft.trim() === ''}
                          onClick={async () => {
                            if (await run(() => state.renameSection(section.id, draft))) {
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
                        {/*
                          * Same shape as a songbook's row on the screen above: name, count,
                          * then the arrow — here it folds the section open rather than
                          * navigating, so it stays a button, but the order matches.
                          */}
                        <button
                          type="button"
                          className="row min-w-0 flex-1 text-left"
                          onClick={() => toggle(section.id)}
                          aria-expanded={open}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {section.name}
                          </span>
                          <span className="text-[0.84375rem] text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {songs.length} {songs.length === 1 ? 'song' : 'songs'}
                          </span>
                          {open ? (
                            <IconChevronDown size={18} className="text-faint" />
                          ) : (
                            <IconChevronRight size={18} className="text-faint" />
                          )}
                        </button>

                        {mayEdit && (
                          <>
                            <button
                              type="button"
                              className="icon-button"
                              disabled={!online || busy}
                              onClick={() => {
                                setRenaming(section.id)
                                setDraft(section.name)
                                setRemoving(null)
                                setError(null)
                              }}
                              title="Rename section"
                              aria-label={`Rename ${section.name}`}
                            >
                              <IconPencil size={17} />
                            </button>
                            {/* Turns red when its own confirmation is open, same as a songbook's. */}
                            <button
                              type="button"
                              className={isRemoving ? 'icon-button is-danger' : 'icon-button'}
                              disabled={!online || busy}
                              onClick={() => {
                                setRemoving(isRemoving ? null : section.id)
                                setDestination(String(others(section.id)[0]?.id ?? ''))
                                setPurging(null)
                                setRenaming(null)
                                setError(null)
                              }}
                              title="Delete section"
                              aria-label={`Remove ${section.name}`}
                              aria-expanded={isRemoving}
                            >
                              <IconTrash size={17} />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {isRemoving && (
                    <div className="panel mx-2 mb-2 mt-2 p-3.5 text-sm">
                      {(() => {
                        const held = songs.length
                        const elsewhere = others(section.id)

                        if (held === 0) {
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex-1">
                                Remove &quot;{section.name}&quot;? It&apos;s empty.
                              </span>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={busy}
                                onClick={async () => {
                                  if (await run(() => state.removeSection(section.id, null))) {
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
                          )
                        }

                        // A second tap of "Delete everything instead", asked once more
                        // because nothing here destroys anything quietly.
                        if (purging === section.id) {
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex-1">
                                Delete &quot;{section.name}&quot; and all {held}{' '}
                                {held === 1 ? 'song' : 'songs'} in it? This can&apos;t be undone.
                              </span>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={busy}
                                onClick={async () => {
                                  if (await run(() => state.purgeSection(section.id))) {
                                    setRemoving(null)
                                    setPurging(null)
                                  }
                                }}
                              >
                                Delete everything
                              </button>
                              <button
                                type="button"
                                className="btn btn-quiet btn-sm"
                                onClick={() => setPurging(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          )
                        }

                        if (elsewhere.length === 0) {
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex-1">
                                Contains {held} {held === 1 ? 'song' : 'songs'} and there&apos;s no
                                other section to move them to.
                              </span>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => setPurging(section.id)}
                              >
                                Delete everything
                              </button>
                              <button
                                type="button"
                                className="btn btn-quiet btn-sm"
                                onClick={() => setRemoving(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          )
                        }

                        return (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex-1">
                              Contains {held} {held === 1 ? 'song' : 'songs'}. Move them to:
                            </span>
                            <label className="picker picker-raised">
                              <span className="sr-only">Destination section</span>
                              <select
                                value={destination}
                                onChange={(event) => setDestination(event.target.value)}
                                className="picker-select"
                              >
                                {elsewhere.map((entry) => (
                                  <option key={entry.id} value={String(entry.id)}>
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
                                if (
                                  await run(() =>
                                    state.removeSection(section.id, Number(destination)),
                                  )
                                ) {
                                  setRemoving(null)
                                }
                              }}
                            >
                              Move and remove
                            </button>
                            <button
                              type="button"
                              className="btn btn-quiet btn-sm"
                              onClick={() => setPurging(section.id)}
                            >
                              Delete everything instead
                            </button>
                            <button
                              type="button"
                              className="btn btn-quiet btn-sm"
                              onClick={() => setRemoving(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {open &&
                    (songs.length === 0 ? (
                      <p className="px-[0.875rem] pb-2 pt-1 text-sm text-muted">
                        No songs in this section.
                      </p>
                    ) : (
                      <ul>
                        {songs.map((song, index) => (
                          // The id is what the way back from a song points at.
                          <li key={song.slug} id={`song-${song.slug}`}>
                            <SongRow song={song} index={index + 1} />
                          </li>
                        ))}
                      </ul>
                    ))}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
