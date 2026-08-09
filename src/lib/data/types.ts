/**
 * Domain types shared by both data implementations.
 *
 * `body` stays raw ChordPro on purpose: parsing happens in the reading layer,
 * so the parser can change without a reseed and the database never holds a
 * derived shape that could drift from the source.
 */

export interface Song {
  slug: string
  title: string
  artist: string | null
  /** Key as written in the source, e.g. `Bb` or `F#m`. */
  originalKey: string | null
  tags: string[]
  body: string
}

export interface Setlist {
  slug: string
  name: string
  position: number
  /** Song slugs, in performance order. */
  songs: string[]
}

/** What the pages need from whichever implementation is active. */
export interface SongRepository {
  listSongs(): Promise<Song[]>
  getSong(slug: string): Promise<Song | null>
  listSetlists(): Promise<Setlist[]>
  getSetlist(slug: string): Promise<Setlist | null>
}
