'use client'

import { useState } from 'react'

import { useCanzonieri } from '@/components/CanzoniereProvider'
import { IconBooks, IconChevronDown } from '@/components/icons'
import { WRITE_MESSAGE } from '@/lib/canzonieri/types'

/**
 * Moves the song you are reading into another canzoniere, from the header where you
 * already are rather than from a management screen elsewhere.
 *
 * A real `<select>`: the phone opens its own picker, which beats anything hand-built
 * here. What is around it is only there to say that it can be opened at all.
 */
export function CanzonierePicker({ songSlug }: { songSlug: string }) {
  const { canzonieri, assignments, nameOf, move, online } = useCanzonieri()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Kept as undefined when the song has no assignment, rather than coerced to an
   * empty string: `nameOf('')` would look for a canzoniere whose slug is empty,
   * find none, and hide the name — including on the offline path, where showing
   * it is the whole point.
   */
  const current = assignments[songSlug]
  const name = nameOf(current)

  if (canzonieri.length === 0) return null

  /*
   * Offline, and when there is only one canzoniere to be in, the name is still worth
   * showing — as plain text, because in neither case is there anywhere to move to.
   */
  if (!online || canzonieri.length === 1) {
    return name === null ? null : (
      <span className="inline-flex items-center gap-1 text-faint">
        <IconBooks size={13} />
        {name}
      </span>
    )
  }

  return (
    <span className="inline-flex items-baseline gap-2">
      <label className="picker">
        <IconBooks size={14} />
        <span className="sr-only">Canzoniere di questo brano</span>
        <select
          className="picker-select"
          value={current ?? ''}
          disabled={busy}
          onChange={async (event) => {
            const next = event.target.value
            setBusy(true)
            setError(null)
            try {
              const result = await move(songSlug, next)
              if (!result.ok) setError(WRITE_MESSAGE[result.reason])
            } catch {
              setError(WRITE_MESSAGE.failed)
            } finally {
              setBusy(false)
            }
          }}
        >
          {current === undefined && <option value="">Senza canzoniere</option>}
          {canzonieri.map((canzoniere) => (
            <option key={canzoniere.slug} value={canzoniere.slug}>
              {canzoniere.name}
            </option>
          ))}
        </select>
        <IconChevronDown size={14} />
      </label>
      {error !== null && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
