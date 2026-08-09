/**
 * Postgres-backed repository. Used at build time to generate the static song
 * pages, which is why nothing here needs to be fast at runtime.
 */

import { asc, eq } from 'drizzle-orm'

import { db } from '../db/client'
import { setlistSongs, setlists, songs } from '../db/schema'
import type { Setlist, Song, SongRepository } from './types'

function toSong(row: typeof songs.$inferSelect): Song {
  return {
    slug: row.slug,
    title: row.title,
    artist: row.artist,
    originalKey: row.originalKey,
    tags: row.tags,
    body: row.body,
  }
}

async function songsOf(setlistSlug: string): Promise<string[]> {
  const rows = await db()
    .select({ songSlug: setlistSongs.songSlug })
    .from(setlistSongs)
    .where(eq(setlistSongs.setlistSlug, setlistSlug))
    .orderBy(asc(setlistSongs.position))

  return rows.map((row) => row.songSlug)
}

export const dbRepository: SongRepository = {
  async listSongs() {
    const rows = await db().select().from(songs).orderBy(asc(songs.title))
    return rows.map(toSong)
  },

  async getSong(slug) {
    const rows = await db().select().from(songs).where(eq(songs.slug, slug)).limit(1)
    return rows.length > 0 ? toSong(rows[0]) : null
  },

  async listSetlists() {
    const rows = await db()
      .select()
      .from(setlists)
      .orderBy(asc(setlists.position), asc(setlists.name))

    return Promise.all(
      rows.map(async (row) => ({
        slug: row.slug,
        name: row.name,
        position: row.position,
        songs: await songsOf(row.slug),
      })),
    )
  },

  async getSetlist(slug) {
    const rows = await db().select().from(setlists).where(eq(setlists.slug, slug)).limit(1)
    if (rows.length === 0) return null

    const row = rows[0]
    return {
      slug: row.slug,
      name: row.name,
      position: row.position,
      songs: await songsOf(row.slug),
    } satisfies Setlist
  },
}
