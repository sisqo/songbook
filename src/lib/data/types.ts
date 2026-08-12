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
  canzoniereSlug: string | null
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
}

/** The canzoniere a song lands in when its file does not say. */
export const UNFILED = { slug: 'da-ordinare', name: 'Da ordinare' } as const
