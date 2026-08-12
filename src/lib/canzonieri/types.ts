import type { Canzoniere, Section } from '@/lib/data/types'

/**
 * The mutable layer.
 *
 * Everything that can change at runtime — the names, the divisions, and which section
 * each song is in — travels together and separately from the static pages. The pages
 * bake a snapshot of this so the first paint is already right; this overlay then
 * refreshes it.
 */
export interface CanzoniereState {
  canzonieri: Canzoniere[]
  sections: Section[]
  /**
   * songSlug → sectionId. The canzoniere is *not* here: it is written on the section,
   * so asking twice would mean two answers that could disagree.
   *
   * A song missing from this map has no section yet, which can only happen in the one
   * deploy where the column is still nullable — see `db/schema.ts`. Such a song is
   * briefly absent from its canzoniere's page and from the home's count; the
   * contracting migration files it into «Brani» minutes later.
   */
  assignments: Record<string, number>
}

export type WriteFailure =
  | 'no-session'
  /** Signed in, but this is not theirs to change: a viewer. */
  | 'not-allowed'
  | 'no-database'
  /** The canzoniere still holds songs and no destination was given for them. */
  | 'not-empty'
  | 'not-found'
  | 'invalid-name'
  /** A section of this canzoniere already carries that name. */
  | 'duplicate-name'
  /** The songs or the sections sent no longer match what the canzoniere holds. */
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

/**
 * Creating a section answers with its id, for the same reason and one more: the import
 * screen creates a section and then has to file the whole paste into it, and a section
 * has no readable key to look itself up by.
 */
export type CreateSectionResult = { ok: true; id: number } | { ok: false; reason: WriteFailure }

export const WRITE_MESSAGE: Record<WriteFailure, string> = {
  'no-session': 'Sessione scaduta. Ricarica la pagina ed entra di nuovo.',
  'not-allowed': 'Il tuo ruolo non permette di modificare il repertorio.',
  'no-database': 'Nessun database configurato: le modifiche non possono essere salvate.',
  'not-empty': 'Contiene ancora dei brani.',
  'not-found': 'Questo canzoniere non esiste più.',
  'invalid-name': 'Serve un nome.',
  'duplicate-name': 'C’è già una sezione con questo nome in questo canzoniere.',
  stale: 'Il canzoniere è cambiato altrove. Ricarica la pagina e riprova.',
  failed: 'Salvataggio non riuscito. Riprova.',
}

/** The sections of one canzoniere, in the order it is played through. */
export function sectionsOf(state: CanzoniereState, canzoniereSlug: string): Section[] {
  return state.sections
    .filter((section) => section.canzoniereSlug === canzoniereSlug)
    .sort((one, other) => one.position - other.position)
}

/**
 * Which canzoniere a song is in, by way of its section.
 *
 * The one place that walk happens, so every screen answers it the same way — and
 * so the day the map holds something else, only this has to change.
 */
export function canzoniereOf(state: CanzoniereState, songSlug: string): string | null {
  const sectionId = state.assignments[songSlug]
  if (sectionId === undefined) return null

  return state.sections.find((section) => section.id === sectionId)?.canzoniereSlug ?? null
}

export function countBySlug(state: CanzoniereState): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of state.canzonieri) counts[entry.slug] = 0

  const canzoniereById = new Map(
    state.sections.map((section) => [section.id, section.canzoniereSlug]),
  )

  for (const sectionId of Object.values(state.assignments)) {
    const slug = canzoniereById.get(sectionId)
    if (slug !== undefined) counts[slug] = (counts[slug] ?? 0) + 1
  }
  return counts
}
