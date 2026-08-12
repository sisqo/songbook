/**
 * Postgres-backed repository. Used at build time to generate the static song
 * pages, which is why nothing here needs to be fast at runtime.
 */

import { asc, eq } from 'drizzle-orm'

import { db } from '../db/client'
import { canzonieri, songs } from '../db/schema'
import type { Canzoniere, Song, SongRepository } from './types'

/**
 * One row as the app's `Song`.
 *
 * Exported because the write actions need the same mapping: what they return
 * after a save is compared against what a page was built with, so the two have to
 * be the same shape produced the same way.
 */
export function rowToSong(row: typeof songs.$inferSelect): Song {
  return {
    slug: row.slug,
    title: row.title,
    artist: row.artist,
    tags: row.tags,
    canzoniereSlug: row.canzoniereSlug,
    body: row.body,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const dbRepository: SongRepository = {
  /**
   * In the order the canzonieri were put in, then by title.
   *
   * `position` is null until someone drags a song, and Postgres sorts nulls last in
   * an ascending order — so a canzoniere nobody has arranged is alphabetical, and one
   * that has been arranged keeps the songs added since at the end. This order is what
   * the arrows in the song header step through, which is why it is fixed here rather
   * than in the component: those arrows lead to other static pages, and every one of
   * them was generated from this same list.
   */
  async listSongs() {
    const rows = await db()
      .select()
      .from(songs)
      .orderBy(asc(songs.position), asc(songs.title))

    return rows.map(rowToSong)
  },

  async getSong(slug) {
    const rows = await db().select().from(songs).where(eq(songs.slug, slug)).limit(1)
    return rows.length > 0 ? rowToSong(rows[0]) : null
  },

  async listCanzonieri() {
    const rows = await db()
      .select({ slug: canzonieri.slug, name: canzonieri.name })
      .from(canzonieri)
      .orderBy(asc(canzonieri.name))

    return rows satisfies Canzoniere[]
  },
}
