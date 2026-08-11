import type { Canzoniere } from '@/lib/data/types'

/**
 * The mutable layer.
 *
 * Everything that can change at runtime — the names, and which canzoniere each
 * song is in — travels together and separately from the static pages. The pages
 * bake a snapshot of this so the first paint is already right; this overlay then
 * refreshes it.
 */
export interface CanzoniereState {
  canzonieri: Canzoniere[]
  /** songSlug → canzoniereSlug */
  assignments: Record<string, string>
}

export type WriteFailure =
  | 'no-session'
  | 'no-database'
  /** The canzoniere still holds songs and no destination was given for them. */
  | 'not-empty'
  | 'not-found'
  | 'invalid-name'
  /** The songs sent for reordering are no longer the songs the canzoniere holds. */
  | 'stale'
  | 'failed'

export type WriteResult = { ok: true } | { ok: false; reason: WriteFailure }

/**
 * Creating one answers with its slug.
 *
 * The name is not enough to find it again: `uniqueSlug` may have had to number it,
 * and a caller that wants to *use* what it just made — the import screen files a
 * paste into it — would otherwise have to guess how. Assignable to `WriteResult`,
 * so callers that only care whether it worked need no change.
 */
export type CreateResult = { ok: true; slug: string } | { ok: false; reason: WriteFailure }

export const WRITE_MESSAGE: Record<WriteFailure, string> = {
  'no-session': 'Sessione scaduta. Ricarica la pagina ed entra di nuovo.',
  'no-database': 'Nessun database configurato: le modifiche non possono essere salvate.',
  'not-empty': 'Il canzoniere contiene ancora dei brani.',
  'not-found': 'Questo canzoniere non esiste più.',
  'invalid-name': 'Serve un nome.',
  stale: 'I brani del canzoniere sono cambiati altrove. Ricarica la pagina e riprova.',
  failed: 'Salvataggio non riuscito. Riprova.',
}

export function countBySlug(state: CanzoniereState): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const slug of state.canzonieri.map((entry) => entry.slug)) counts[slug] = 0
  for (const slug of Object.values(state.assignments)) {
    counts[slug] = (counts[slug] ?? 0) + 1
  }
  return counts
}
