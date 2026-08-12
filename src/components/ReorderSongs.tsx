'use client'

import { useEffect, useRef, useState } from 'react'

import { IconGrip } from '@/components/icons'
import { reorderCanzoniere } from '@/lib/canzonieri/actions'
import { type Band, bandAt, moveItem, sameMembers } from '@/lib/canzonieri/order'
import { WRITE_MESSAGE } from '@/lib/canzonieri/types'
import type { SongIndexRow } from '@/lib/search-index'

/**
 * The songs of one canzoniere, in the order you put them.
 *
 * Dragging is done with pointer events rather than the HTML drag-and-drop API,
 * which does not exist on a touchscreen — and a touchscreen is where this app is
 * used. The same handle also answers the arrow keys when it has focus, so the list
 * can be arranged without a pointer at all; dragging alone would have made this the
 * one thing in the app a keyboard cannot do.
 *
 * The rows move as the finger passes them, and the row order on screen is always the
 * order that would be saved. Nothing is written until the finger comes up.
 */
export function ReorderSongs({
  songs,
  canzoniereSlug,
  onApplied,
}: {
  songs: SongIndexRow[]
  canzoniereSlug: string
  /** A saved order, for the list around this one to adopt. */
  onApplied: (slugs: string[]) => void
}) {
  const [order, setOrder] = useState(songs)
  const [dragging, setDragging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useRef(new Map<string, HTMLLIElement>())
  /** Measured once per drag: see `bandAt` for why they must not be measured again. */
  const bands = useRef<Band[]>([])
  /** Saves run one after another, so the last order pressed is the last one written. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  /*
   * Adopt the list again when its membership changes under us — an import into this
   * canzoniere, or a song moved out of it, while the rows were open. The local order
   * is then about songs that are no longer these songs, and the server would refuse
   * it anyway.
   */
  useEffect(() => {
    setOrder((current) =>
      sameMembers(
        current.map((song) => song.slug),
        songs.map((song) => song.slug),
      )
        ? current
        : songs,
    )
  }, [songs])

  const save = (next: SongIndexRow[]) => {
    const slugs = next.map((song) => song.slug)
    if (slugs.join('\n') === songs.map((song) => song.slug).join('\n')) return

    setError(null)
    queue.current = queue.current.then(async () => {
      try {
        const result = await reorderCanzoniere(canzoniereSlug, slugs)
        if (result.ok) {
          onApplied(slugs)
          return
        }

        setError(WRITE_MESSAGE[result.reason])
        // Back to the last order the database is known to hold.
        setOrder(songs)
      } catch {
        setError(WRITE_MESSAGE.failed)
        setOrder(songs)
      }
    })
  }

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, slug: string) => {
    bands.current = order.map((song) => {
      const rect = rows.current.get(song.slug)?.getBoundingClientRect()
      return { top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 }
    })

    // Capture, so the row keeps following a finger that has slid off the handle.
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(slug)
  }

  const onMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragging === null) return

    const to = bandAt(bands.current, event.clientY)
    setOrder((current) => {
      const from = current.findIndex((song) => song.slug === dragging)
      return from === -1 || from === to ? current : moveItem(current, from, to)
    })
  }

  const endDrag = () => {
    if (dragging === null) return
    setDragging(null)
    save(order)
  }

  const nudge = (slug: string, delta: number) => {
    const from = order.findIndex((song) => song.slug === slug)
    if (from === -1) return

    const next = moveItem(order, from, from + delta)
    if (next === order) return

    setOrder(next)
    save(next)
  }

  return (
    <div>
      {error !== null && (
        <p className="notice notice-error mx-2.5 mb-2.5" role="alert">
          {error}
        </p>
      )}

      <ul>
        {order.map((song, index) => (
          <li
            key={song.slug}
            ref={(element) => {
              if (element === null) rows.current.delete(song.slug)
              else rows.current.set(song.slug, element)
            }}
            className={`row row-nested ${dragging === song.slug ? 'row-dragging' : ''}`}
          >
            <button
              type="button"
              className="drag-handle"
              onPointerDown={(event) => startDrag(event, song.slug)}
              onPointerMove={onMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                // Or the page scrolls instead of the row moving.
                event.preventDefault()
                nudge(song.slug, event.key === 'ArrowUp' ? -1 : 1)
              }}
              aria-label={`Sposta ${song.title}: ${index + 1} di ${order.length}`}
            >
              <IconGrip size={17} />
            </button>

            <span className="min-w-0 flex-1">
              <span className="block truncate">{song.title}</span>
              {song.artist !== null && (
                <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                  {song.artist}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
