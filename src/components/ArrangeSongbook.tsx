'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { useSongbooks } from '@/components/SongbookProvider'
import {
  IconChevronDown,
  IconGrip,
  IconPencil,
  IconPlus,
  IconTrash,
} from '@/components/icons'
import {
  type ArrangeRow,
  type ArrangedSection,
  type Band,
  arrangementKey,
  arrangementOf,
  bandAt,
  moveItem,
  moveSongTo,
  nudgeSong,
  placeAt,
  rowsOf,
  sameMembers,
} from '@/lib/songbooks/order'
import { WRITE_MESSAGE, type WriteFailure } from '@/lib/songbooks/types'
import type { SongIndexRow } from '@/lib/search-index'

/** One key per drawn row, so a ref survives the rows moving under it. */
function keyOf(row: ArrangeRow): string {
  return row.kind === 'song' ? `song:${row.slug}` : `${row.kind}:${row.sectionId}`
}

/**
 * A songbook with its divisions in your hands: the order of the sections, the order of
 * the songs, and which section each song is in.
 *
 * Dragging is done with pointer events rather than the HTML drag-and-drop API, which does
 * not exist on a touchscreen — and a touchscreen is where this app is used. The same
 * handles answer the arrow keys when they have focus, so a songbook can be arranged
 * without a pointer at all; dragging alone would have made this the one thing in the app
 * a keyboard cannot do.
 *
 * **A song crosses a heading by being carried over it.** One gesture for two things —
 * where the song sits and which section it is in — because they are one fact. The
 * arithmetic for it is in `lib/songbooks/order.ts` and under test there: which row the
 * finger is over, and what place that row means, are the two things a screenshot cannot
 * check.
 *
 * The bands are measured once, when the drag starts, and the layout each move produces is
 * computed from the layout as it was *then* — not from the previous move's result. So the
 * same finger position always means the same arrangement, and a slow drag cannot
 * accumulate a different answer than a fast one.
 */
export function ArrangeSongbook({
  songbookSlug,
  rows: songs,
  onDone,
  onApplied,
}: {
  songbookSlug: string
  /** Every song, in the order the index holds them; the layout is read off these. */
  rows: SongIndexRow[]
  onDone: () => void
  /** A saved order, flattened, for the list around this one to adopt. */
  onApplied: (slugs: string[]) => void
}) {
  const state = useSongbooks()
  const { assignments, divisionsOf } = state

  const divisions = useMemo(() => divisionsOf(songbookSlug), [divisionsOf, songbookSlug])
  const nameById = useMemo(
    () => new Map(divisions.map((section) => [section.id, section.name])),
    [divisions],
  )
  const titleBySlug = useMemo(
    () => new Map(songs.map((song) => [song.slug, song])),
    [songs],
  )

  /** What the database is known to hold, as far as this screen has been told. */
  const server = useMemo(
    () => arrangementOf(divisions, songs, assignments),
    [divisions, songs, assignments],
  )

  const [layout, setLayout] = useState<ArrangedSection[]>(server)
  const [dragging, setDragging] = useState<
    { kind: 'song'; slug: string } | { kind: 'section'; id: number } | null
  >(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [removing, setRemoving] = useState<number | null>(null)
  const [destination, setDestination] = useState('')
  const [newName, setNewName] = useState('')

  const elements = useRef(new Map<string, HTMLLIElement>())
  /** Measured once per drag: see `bandAt` for why they must not be measured again. */
  const start = useRef<{ layout: ArrangedSection[]; rows: ArrangeRow[]; bands: Band[] } | null>(
    null,
  )
  /** Saves run one after another, so the last layout let go is the last one written. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  /*
   * Adopt the songbook again when its parts change under us — an import, a song moved
   * out, a section removed on another device — but keep the local order while they are the
   * same parts. Comparing membership rather than order is what makes that possible: the
   * order on screen is deliberately ahead of the order the server has been told about.
   */
  useEffect(() => {
    setLayout((current) => {
      const sameSections = sameMembers(
        current.map((group) => group.sectionId),
        server.map((group) => group.sectionId),
      )
      const sameSongs = sameMembers(
        current.flatMap((group) => group.slugs),
        server.flatMap((group) => group.slugs),
      )

      return sameSections && sameSongs ? current : server
    })
  }, [server])

  const rows = useMemo(() => rowsOf(layout), [layout])

  const save = (next: ArrangedSection[]) => {
    if (arrangementKey(next) === arrangementKey(server)) return

    setError(null)
    queue.current = queue.current.then(async () => {
      try {
        const result = await state.arrange(songbookSlug, next)
        if (result.ok) {
          onApplied(next.flatMap((group) => group.slugs))
          return
        }

        setError(WRITE_MESSAGE[result.reason])
        // Back to the layout the database is known to hold.
        setLayout(server)
      } catch {
        setError(WRITE_MESSAGE.failed)
        setLayout(server)
      }
    })
  }

  const run = async (action: () => Promise<{ ok: boolean; reason?: WriteFailure }>) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (!result.ok && result.reason !== undefined) setError(WRITE_MESSAGE[result.reason])
      return result.ok
    } catch {
      setError(WRITE_MESSAGE.failed)
      return false
    } finally {
      setBusy(false)
    }
  }

  const bandOf = (key: string): Band => {
    const rect = elements.current.get(key)?.getBoundingClientRect()
    return { top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 }
  }

  const beginSong = (event: React.PointerEvent<HTMLButtonElement>, slug: string) => {
    start.current = {
      layout,
      rows,
      bands: rows.map((row) => bandOf(keyOf(row))),
    }
    // Capture, so the row keeps following a finger that has slid off the handle.
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging({ kind: 'song', slug })
  }

  /**
   * A section's band is its whole block — heading and songs together — because that is
   * what the eye sees moving, and a heading alone is a target too small to aim a thumb at.
   */
  const beginSection = (event: React.PointerEvent<HTMLButtonElement>, id: number) => {
    start.current = {
      layout,
      rows,
      bands: layout.map((group) => {
        const keys = rowsOf([group]).map(keyOf)
        const first = bandOf(keys[0])
        const last = bandOf(keys[keys.length - 1])
        return { top: first.top, bottom: last.bottom }
      }),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging({ kind: 'section', id })
  }

  const onMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const from = start.current
    if (dragging === null || from === null) return

    const at = bandAt(from.bands, event.clientY)

    if (dragging.kind === 'song') {
      const place = placeAt(from.layout, dragging.slug, from.rows[at])
      if (place !== null) setLayout(moveSongTo(from.layout, dragging.slug, place))
      return
    }

    const index = from.layout.findIndex((group) => group.sectionId === dragging.id)
    if (index !== -1) setLayout(moveItem(from.layout, index, at))
  }

  const endDrag = () => {
    if (dragging === null) return
    setDragging(null)
    start.current = null
    save(layout)
  }

  const arrowKeys = (event: React.KeyboardEvent, act: (delta: number) => void) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    // Or the page scrolls instead of the row moving.
    event.preventDefault()
    act(event.key === 'ArrowUp' ? -1 : 1)
  }

  const others = (id: number) => divisions.filter((section) => section.id !== id)

  return (
    <div className="card pt-2.5">
      {error !== null && (
        <p className="notice notice-error mx-2.5 mb-2.5" role="alert">
          {error}
        </p>
      )}

      <ul>
        {rows.map((row) => {
          const key = keyOf(row)

          if (row.kind === 'section') {
            const name = nameById.get(row.sectionId) ?? ''
            const held = layout.find((group) => group.sectionId === row.sectionId)?.slugs ?? []
            const isRenaming = renaming === row.sectionId
            const isRemoving = removing === row.sectionId
            const place = layout.findIndex((group) => group.sectionId === row.sectionId)

            return (
              <li
                key={key}
                ref={(element) => {
                  if (element === null) elements.current.delete(key)
                  else elements.current.set(key, element)
                }}
                className={`row px-2.5 ${
                  dragging?.kind === 'section' && dragging.id === row.sectionId
                    ? 'row-dragging'
                    : ''
                }`}
              >
                {isRenaming ? (
                  <>
                    <input
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenaming(null)
                      }}
                      aria-label={`New name for ${name}`}
                      className="form-field flex-1"
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy || draft.trim() === ''}
                      onClick={async () => {
                        if (await run(() => state.renameSection(row.sectionId, draft))) {
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
                    <button
                      type="button"
                      className="drag-handle"
                      onPointerDown={(event) => beginSection(event, row.sectionId)}
                      onPointerMove={onMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onKeyDown={(event) =>
                        arrowKeys(event, (delta) => {
                          const next = moveItem(layout, place, place + delta)
                          if (next === layout) return
                          setLayout(next)
                          save(next)
                        })
                      }
                      aria-label={`Move section ${name}: ${place + 1} of ${layout.length}`}
                    >
                      <IconGrip size={17} />
                    </button>

                    <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                    <span className="count-badge">{held.length}</span>

                    <button
                      type="button"
                      className="icon-button"
                      disabled={busy}
                      onClick={() => {
                        setRenaming(row.sectionId)
                        setDraft(name)
                        setRemoving(null)
                        setError(null)
                      }}
                      aria-label={`Rename ${name}`}
                    >
                      <IconPencil size={17} />
                    </button>
                    {/* Red while its own question is open, so it is clear whose it is. */}
                    <button
                      type="button"
                      className={isRemoving ? 'icon-button is-danger' : 'icon-button'}
                      disabled={busy}
                      onClick={() => {
                        setRemoving(isRemoving ? null : row.sectionId)
                        setDestination(String(others(row.sectionId)[0]?.id ?? ''))
                        setRenaming(null)
                        setError(null)
                      }}
                      aria-label={`Remove ${name}`}
                      aria-expanded={isRemoving}
                    >
                      <IconTrash size={17} />
                    </button>
                  </>
                )}
              </li>
            )
          }

          if (row.kind === 'gap') {
            return (
              <li
                key={key}
                ref={(element) => {
                  if (element === null) elements.current.delete(key)
                  else elements.current.set(key, element)
                }}
                className="row row-nested text-sm text-faint"
              >
                {/* A line to aim at: a section with no row could never be filled. */}
                Empty. Drag a song here.
              </li>
            )
          }

          const song = titleBySlug.get(row.slug)
          const inside = layout.find((group) => group.sectionId === row.sectionId)?.slugs ?? []

          return (
            <li
              key={key}
              ref={(element) => {
                if (element === null) elements.current.delete(key)
                else elements.current.set(key, element)
              }}
              className={`row row-nested ${
                dragging?.kind === 'song' && dragging.slug === row.slug ? 'row-dragging' : ''
              }`}
            >
              <button
                type="button"
                className="drag-handle"
                onPointerDown={(event) => beginSong(event, row.slug)}
                onPointerMove={onMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(event) =>
                  arrowKeys(event, (delta) => {
                    const next = nudgeSong(layout, row.slug, delta)
                    if (arrangementKey(next) === arrangementKey(layout)) return
                    setLayout(next)
                    save(next)
                  })
                }
                aria-label={`Move ${song?.title ?? row.slug}: ${
                  inside.indexOf(row.slug) + 1
                } of ${inside.length} in ${nameById.get(row.sectionId) ?? ''}`}
              >
                <IconGrip size={17} />
              </button>

              <span className="min-w-0 flex-1">
                <span className="block truncate">{song?.title ?? row.slug}</span>
                {song?.artist != null && (
                  <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                    {song.artist}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {removing !== null && (
        <div className="panel mx-2.5 mb-2.5 p-3.5 text-sm">
          {(() => {
            const id = removing
            const name = nameById.get(id) ?? ''
            const held = layout.find((group) => group.sectionId === id)?.slugs.length ?? 0
            const elsewhere = others(id)

            if (held === 0) {
              return (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">Remove &quot;{name}&quot;? It&apos;s empty.</span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busy}
                    onClick={async () => {
                      if (await run(() => state.removeSection(id, null))) setRemoving(null)
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

            if (elsewhere.length === 0) {
              return (
                <span>
                  Contains {held} {held === 1 ? 'song' : 'songs'} and there&apos;s no other
                  section to move them to. Create one before removing this one.
                </span>
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
                    {elsewhere.map((section) => (
                      <option key={section.id} value={String(section.id)}>
                        {section.name}
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
                    if (await run(() => state.removeSection(id, Number(destination)))) {
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
            )
          })()}
        </div>
      )}

      <form
        className="flex gap-2 px-2.5 pb-3.5"
        onSubmit={async (event) => {
          event.preventDefault()
          if (await run(() => state.addSection(songbookSlug, newName))) setNewName('')
        }}
      >
        <label className="flex-1">
          <span className="sr-only">New section name</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="New section"
            className="form-field"
          />
        </label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || newName.trim() === ''}>
          <IconPlus size={16} />
          Add
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[1.125rem] pb-4">
        <button type="button" className="btn btn-sm" onClick={onDone}>
          Done
        </button>
        {/*
          * The layout is this screen's own, and it is saved as soon as a row lands. What
          * waits for a rebuild is the pair of arrows inside a song, and the section named
          * in its header, which come from the pages themselves.
          */}
        <span className="text-xs text-faint">
          Saved right away. The arrows inside the song follow it after the next rebuild.
        </span>
      </div>
    </div>
  )
}
