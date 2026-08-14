import type { Songbook, Section } from '@/lib/data/types'

/**
 * The mutable layer.
 *
 * Everything that can change at runtime — the names, the divisions, and which section
 * each song is in — travels together and separately from the static pages. The pages
 * bake a snapshot of this so the first paint is already right; this overlay then
 * refreshes it.
 */
export interface SongbookState {
  songbooks: Songbook[]
  sections: Section[]
  /**
   * songSlug → sectionId. The songbook is *not* here: it is written on the section,
   * so asking twice would mean two answers that could disagree.
   *
   * A song missing from this map has no section yet, which can only happen in the one
   * deploy where the column is still nullable — see `db/schema.ts`. Such a song is
   * briefly absent from its songbook's page and from the home's count; the
   * contracting migration files it into «Songs» minutes later.
   */
  assignments: Record<string, number>
}

export type WriteFailure =
  | 'no-session'
  /** Signed in, but this account is not theirs to change. */
  | 'not-allowed'
  | 'no-database'
  /** The songbook still holds songs and no destination was given for them. */
  | 'not-empty'
  | 'not-found'
  | 'invalid-name'
  /** A section of this songbook already carries that name. */
  | 'duplicate-name'
  /** The songs or the sections sent no longer match what the songbook holds. */
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
  'no-session': 'Session expired. Reload the page and sign in again.',
  'not-allowed': 'Your role does not allow editing the repertoire.',
  'no-database': 'No database configured: changes cannot be saved.',
  'not-empty': 'Still contains songs.',
  'not-found': 'This songbook no longer exists.',
  'invalid-name': 'A name is required.',
  'duplicate-name': 'A section with this name already exists in this songbook.',
  stale: 'The songbook changed elsewhere. Reload the page and try again.',
  failed: 'Save failed. Please try again.',
}

/** The sections of one songbook, in the order it is played through. */
export function sectionsOf(state: SongbookState, songbookSlug: string): Section[] {
  return state.sections
    .filter((section) => section.songbookSlug === songbookSlug)
    .sort((one, other) => one.position - other.position)
}

/**
 * Which songbook a song is in, by way of its section.
 *
 * The one place that walk happens, so every screen answers it the same way — and
 * so the day the map holds something else, only this has to change.
 */
export function songbookOf(state: SongbookState, songSlug: string): string | null {
  const sectionId = state.assignments[songSlug]
  if (sectionId === undefined) return null

  return state.sections.find((section) => section.id === sectionId)?.songbookSlug ?? null
}

export function countBySlug(state: SongbookState): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of state.songbooks) counts[entry.slug] = 0

  const songbookById = new Map(
    state.sections.map((section) => [section.id, section.songbookSlug]),
  )

  for (const sectionId of Object.values(state.assignments)) {
    const slug = songbookById.get(sectionId)
    if (slug !== undefined) counts[slug] = (counts[slug] ?? 0) + 1
  }
  return counts
}
