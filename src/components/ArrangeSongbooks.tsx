'use client'

import { useEffect, useRef, useState } from 'react'

import { useSongbooks } from '@/components/SongbookProvider'
import { IconGrip } from '@/components/icons'
import { type Band, bandAt, moveItem, sameMembers } from '@/lib/songbooks/order'
import { WRITE_MESSAGE } from '@/lib/songbooks/types'

interface Row {
  slug: string
  name: string
  count: number
}

/**
 * The reader's own songbooks, in your hands: the one order this app was still missing —
 * a songbook's sections and songs already drag (`ArrangeSongbook.tsx`), and this is the
 * same gesture one level up.
 *
 * A flat list, not that file's two-level one: there is no group here for a songbook to
 * cross into, just where it sits among the others, so the arithmetic is `moveItem` and
 * `bandAt` alone — the pair of `order.ts` primitives that were already generic enough
 * to need no two-level machinery of their own. Renaming and removing stay on the plain
 * list this replaces while arranging; this screen has one job.
 */
export function ArrangeSongbooks({
  rows: server,
  onDone,
}: {
  rows: Row[]
  onDone: () => void
}) {
  const state = useSongbooks()

  const [layout, setLayout] = useState<Row[]>(server)
  const [dragging, setDragging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const elements = useRef(new Map<string, HTMLLIElement>())
  /** Measured once per drag: re-measuring mid-drag is the bug this freezes against. */
  const start = useRef<{ layout: Row[]; bands: Band[] } | null>(null)
  /** Saves run one after another, so the last layout let go is the last one written. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  // Adopts the server's list again when a songbook arrives or leaves elsewhere, but
  // keeps the local order while it is still the same set — same reasoning as
  // `ArrangeSongbook`'s own effect.
  useEffect(() => {
    setLayout((current) => {
      if (sameMembers(current.map((row) => row.slug), server.map((row) => row.slug))) {
        return current
      }
      return server
    })
  }, [server])

  const bandOf = (slug: string): Band => {
    const rect = elements.current.get(slug)?.getBoundingClientRect()
    return { top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 }
  }

  const save = (next: Row[]) => {
    const key = (rows: Row[]) => rows.map((row) => row.slug).join(',')
    if (key(next) === key(server)) return

    setError(null)
    queue.current = queue.current.then(async () => {
      try {
        const result = await state.arrangeSongbooks(next.map((row) => row.slug))
        if (!result.ok) {
          setError(WRITE_MESSAGE[result.reason])
          setLayout(server)
        }
      } catch {
        setError(WRITE_MESSAGE.failed)
        setLayout(server)
      }
    })
  }

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>, slug: string) => {
    start.current = { layout, bands: layout.map((row) => bandOf(row.slug)) }
    // Capture, so the row keeps following a finger that has slid off the handle.
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(slug)
  }

  const onMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const from = start.current
    if (dragging === null || from === null) return

    const at = bandAt(from.bands, event.clientY)
    const index = from.layout.findIndex((row) => row.slug === dragging)
    if (index !== -1) setLayout(moveItem(from.layout, index, at))
  }

  const endDrag = () => {
    if (dragging === null) return
    setDragging(null)
    start.current = null
    save(layout)
  }

  const arrowKeys = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    // Or the page scrolls instead of the row moving.
    event.preventDefault()
    const next = moveItem(layout, index, index + (event.key === 'ArrowUp' ? -1 : 1))
    if (next === layout) return
    setLayout(next)
    save(next)
  }

  return (
    <div className="card pt-2.5">
      {error !== null && (
        <p className="notice notice-error mx-2.5 mb-2.5" role="alert">
          {error}
        </p>
      )}

      <ul>
        {layout.map((row, index) => (
          <li
            key={row.slug}
            ref={(element) => {
              if (element === null) elements.current.delete(row.slug)
              else elements.current.set(row.slug, element)
            }}
            className={`row px-2.5 ${dragging === row.slug ? 'row-dragging' : ''}`}
          >
            <button
              type="button"
              className="drag-handle"
              onPointerDown={(event) => beginDrag(event, row.slug)}
              onPointerMove={onMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => arrowKeys(event, index)}
              aria-label={`Move ${row.name}: ${index + 1} of ${layout.length}`}
            >
              <IconGrip size={17} />
            </button>

            <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
            <span className="count-badge">{row.count}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[1.125rem] pb-4 pt-3.5">
        <button type="button" className="btn btn-sm" onClick={onDone}>
          Done
        </button>
        <span className="text-xs text-muted">Saved right away.</span>
      </div>
    </div>
  )
}
