'use client'

import { useState } from 'react'

import { useCanzonieri } from '@/components/CanzoniereProvider'
import { WRITE_MESSAGE } from '@/lib/canzonieri/types'

/**
 * Moves the song you are reading into another canzoniere, from the header where
 * you already are rather than from a management screen elsewhere.
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

  // Offline the name is still worth showing; only changing it is unavailable.
  if (!online || canzonieri.length === 1) {
    return name === null ? null : <span className="text-faint">{name}</span>
  }

  return (
    <span className="inline-flex items-baseline gap-2">
      <label>
        <span className="sr-only">Canzoniere di questo brano</span>
        <select
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
          className="rounded-md border px-2 py-1"
          style={{
            // 16px: smaller makes iOS zoom the viewport on focus, the exact thing
            // the 44px targets elsewhere exist to avoid.
            fontSize: '1rem',
            background: 'var(--surface-2)',
            borderColor: 'var(--line)',
            color: 'var(--muted)',
          }}
        >
          {current === undefined && <option value="">Senza canzoniere</option>}
          {canzonieri.map((canzoniere) => (
            <option key={canzoniere.slug} value={canzoniere.slug}>
              {canzoniere.name}
            </option>
          ))}
        </select>
      </label>
      {error !== null && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
