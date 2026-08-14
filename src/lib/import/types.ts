import type { Song } from '@/lib/data/types'

export interface SongInput {
  /** Present when editing an existing song, absent when importing a new one. */
  slug?: string
  title: string
  artist: string | null
  tags: string[]
  songbookSlug: string
  /**
   * The section within it, or null for «wherever this songbook files things first».
   *
   * Nullable so a caller that has no opinion does not have to invent one: the import
   * screen and the editor both ask, but the fallback is a real place — see
   * `resolveSection` — rather than a song with no section at all.
   */
  sectionId: number | null
  body: string
}

export interface DuplicateOf {
  slug: string
  title: string
  artist: string | null
}

export type SaveFailure =
  | 'no-session'
  /** Signed in, but this is not theirs to change: a viewer. */
  | 'not-allowed'
  | 'no-database'
  | 'invalid-title'
  | 'empty-body'
  | 'not-found'
  | 'failed'

/**
 * A save carries back the row it wrote, not just its slug.
 *
 * The screen shows that row immediately, so it has to be the row the database
 * holds rather than the values that were sent: `songbookSlug` can come back
 * different when the one asked for does not exist, and `updatedAt` is the
 * database's own clock — the value every later comparison is made against. Echoing
 * the input with a timestamp from the browser would risk a guess that outranks the
 * truth and then wins forever, since it gets cached.
 */
export type SaveResult =
  | { ok: true; song: Song }
  /** Same title and artist already exist; the caller must decide what to do. */
  | { ok: false; reason: 'duplicate'; existing: DuplicateOf }
  | { ok: false; reason: SaveFailure }

export type DeleteResult = { ok: true; slug: string } | { ok: false; reason: SaveFailure }

/** What to do when a save hits a song with the same title and artist. */
export type Decision = 'replace' | 'add'

export const SAVE_MESSAGE: Record<SaveFailure | 'duplicate', string> = {
  'no-session': 'Session expired. Reload the page and sign in again.',
  'not-allowed': 'Your role does not allow editing the repertoire.',
  'no-database': 'No database configured: cannot save.',
  'invalid-title': 'A title is required.',
  'empty-body': 'The text is empty.',
  'not-found': 'This song no longer exists.',
  duplicate: 'A song with this title and artist already exists.',
  failed: 'Save failed. Please try again.',
}
