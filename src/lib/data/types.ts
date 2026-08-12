/**
 * Domain types shared by both data implementations.
 *
 * `body` stays raw ChordPro on purpose: parsing happens in the reading layer,
 * so the parser can change without a reseed and the database never holds a
 * derived shape that could drift from the source.
 */

export interface Canzoniere {
  /** Generated once from the initial name and then frozen. */
  slug: string
  name: string
}

/**
 * One division of a canzoniere. Every song is in exactly one.
 *
 * Keyed by a number rather than a slug, unlike everything else here: a section has no
 * page of its own, so nothing points at it by name and renaming stays free. Without a
 * database the file repository invents these ids — see `files.ts` — which is harmless
 * because in that mode nothing writes them back.
 */
export interface Section {
  id: number
  canzoniereSlug: string
  name: string
  /** 1..N within its canzoniere, in the order it is played through. */
  position: number
}

export interface Song {
  slug: string
  title: string
  artist: string | null
  tags: string[]
  /**
   * The canzoniere at build time. A snapshot, not the truth: names and
   * assignments can change at runtime, so the client refreshes this from the
   * mutable layer. Baking it in means the first paint is already right.
   */
  canzoniereSlug: string
  /**
   * The section of that canzoniere, same snapshot and same caveat.
   *
   * Null for one deploy only — see the column's comment in `db/schema.ts` — and
   * with no database, where sections are derived from the files and a song whose
   * file names none belongs to that canzoniere's «Brani».
   */
  sectionId: number | null
  body: string
  /**
   * When this version was written, as an ISO string, or null with no database.
   *
   * This is what the page was built from, and the only way to tell whether a copy
   * fetched at runtime is actually newer than what the reader is looking at. It
   * cannot be inferred from the build stamp: the stamp is written *before* the
   * build, so for the whole length of a deploy the database would claim a song is
   * published while every browser still holds the old page.
   */
  updatedAt: string | null
}

/** What the pages need from whichever implementation is active. */
export interface SongRepository {
  listSongs(): Promise<Song[]>
  getSong(slug: string): Promise<Song | null>
  listCanzonieri(): Promise<Canzoniere[]>
  listSections(): Promise<Section[]>
}

/** The canzoniere a song lands in when its file does not say. */
export const UNFILED = { slug: 'da-ordinare', name: 'Da ordinare' } as const

/**
 * The section a canzoniere is born with, and the one a song lands in when nothing says
 * otherwise.
 *
 * One name in one place, because four things have to agree on it: the migration that
 * gave every existing canzoniere its first section, `createCanzoniere`, the import's
 * fallback, and the file repository. A canzoniere that has no section is a canzoniere
 * nothing can be filed into.
 */
export const DEFAULT_SECTION = 'Brani'
