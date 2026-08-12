'use server'

/**
 * Reads that keep a static page honest.
 *
 * The pages are generated at build time, so between deploys the database is the
 * only place an edit exists. These two actions are how the browser finds out:
 * one song in full for the page that is being read, and the list without bodies
 * for the page that lists them.
 *
 * Both need a session, like every other action here. Neither is on the critical
 * path — the page has already painted from its own copy by the time they answer.
 */

import { asc, eq } from 'drizzle-orm'

import { currentMember } from '@/lib/auth/session'
import { rowToSong } from '@/lib/data/db'
import { db } from '@/lib/db/client'
import { songs } from '@/lib/db/schema'

import type { SongIndexRow } from '@/lib/search-index'

import type { SongContent } from './overlay'

async function authorized(): Promise<boolean> {
  return (await currentMember()) !== null
}

/**
 * The current version of one song.
 *
 * The three answers are kept apart on purpose. `missing` means the row is gone
 * and the reader is looking at a song that no longer exists; `unavailable` means
 * the question could not be asked, which is the normal state offline and must
 * never be mistaken for a deletion.
 */
export async function loadSongContent(slug: string): Promise<SongContent> {
  if (!(await authorized())) return { state: 'unavailable' }

  try {
    const rows = await db().select().from(songs).where(eq(songs.slug, slug)).limit(1)
    if (rows.length === 0) return { state: 'missing' }

    return { state: 'found', song: rowToSong(rows[0]) }
  } catch (error) {
    console.error('loadSongContent failed', error)
    return { state: 'unavailable' }
  }
}

/**
 * Every song as it is now, without bodies.
 *
 * Bodies are what make a repertoire heavy and the list does not show them, so
 * this stays small enough to ask for on every visit to the list. Null means the
 * question could not be asked and the list should keep what the build gave it.
 */
export async function loadSongIndex(): Promise<SongIndexRow[] | null> {
  if (!(await authorized())) return null

  try {
    const rows = await db()
      .select({
        slug: songs.slug,
        title: songs.title,
        artist: songs.artist,
        tags: songs.tags,
        updatedAt: songs.updatedAt,
      })
      .from(songs)
      // The same order as the build used, or the list would rearrange itself the
      // moment this answers.
      .orderBy(asc(songs.position), asc(songs.title))

    return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }))
  } catch (error) {
    console.error('loadSongIndex failed', error)
    return null
  }
}
