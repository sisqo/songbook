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

  const current = assignments[songSlug] ?? ''
  const name = nameOf(current)

  if (canzonieri.length === 0) return null

  // Offline the name is still worth showing; only changing it is unavailable.
  if (!online || canzonieri.length === 1) {
    return name === null ? null : <span style={{ color: 'var(--faint)' }}>{name}</span>
  }

  return (
    <span className="inline-flex items-baseline gap-1">
      <label>
        <span className="sr-only">Canzoniere di questo brano</span>
        <select
          value={current}
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
          className="rounded-md border px-1 py-0.5 text-sm"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--line)',
            color: 'var(--muted)',
          }}
        >
          {current === '' && <option value="">Senza canzoniere</option>}
          {canzonieri.map((canzoniere) => (
            <option key={canzoniere.slug} value={canzoniere.slug}>
              {canzoniere.name}
            </option>
          ))}
        </select>
      </label>
      {error !== null && (
        <span className="text-xs" style={{ color: 'var(--accent)' }} role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
