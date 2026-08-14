/**
 * Postgres-backed repository. Used at build time to generate the static song
 * pages, which is why nothing here needs to be fast at runtime.
 */

import { asc, eq } from 'drizzle-orm'

import { db } from '../db/client'
import { songbooks, sections, songs } from '../db/schema'
import type { Songbook, Section, Song, SongRepository } from './types'

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
    songbookSlug: row.songbookSlug,
    sectionId: row.sectionId,
    body: row.body,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const dbRepository: SongRepository = {
  /**
   * In the order the songbooks are played through: section by section, and inside
   * each section the order the songs were put in, then by title.
   *
   * `position` is null until someone arranges a section, and Postgres sorts nulls last
   * in an ascending order — so a section nobody has arranged is alphabetical, and one
   * that has been arranged keeps the songs added since at the end. This order is what
   * the arrows in the song header step through, which is why it is fixed here rather
   * than in the component: those arrows lead to other static pages, and every one of
   * them was generated from this same list.
   *
   * A **left** join, not an inner one. For one deploy `section_id` can be null — a song
   * imported by the code already in production, between the additive migration and this
   * code going live — and an inner join would drop it from the static params and from
   * the index, which is to say delete it from the app without deleting it from the
   * database. Nulls sort last, so it waits at the end until someone files it.
   */
  async listSongs() {
    const rows = await db()
      .select({ song: songs, sectionPosition: sections.position })
      .from(songs)
      .leftJoin(sections, eq(songs.sectionId, sections.id))
      .orderBy(asc(sections.position), asc(songs.position), asc(songs.title))

    return rows.map((row) => rowToSong(row.song))
  },

  async getSong(slug) {
    const rows = await db().select().from(songs).where(eq(songs.slug, slug)).limit(1)
    return rows.length > 0 ? rowToSong(rows[0]) : null
  },

  async listSongbooks() {
    const rows = await db()
      .select({ slug: songbooks.slug, name: songbooks.name })
      .from(songbooks)
      .orderBy(asc(songbooks.name))

    return rows satisfies Songbook[]
  },

  async listSections() {
    const rows = await db()
      .select({
        id: sections.id,
        songbookSlug: sections.songbookSlug,
        name: sections.name,
        position: sections.position,
      })
      .from(sections)
      .orderBy(asc(sections.songbookSlug), asc(sections.position))

    return rows satisfies Section[]
  },
}

/**
 * The same three lists as `dbRepository`, scoped to one account (v3.0) — for the pages
 * rendered at request time rather than at build time, which is every page that shows more
 * than the one song or songbook a direct link already named. A song's account is its
 * songbook's, so scoping `listSongs`/`listSections` means joining to `songbooks`; scoping
 * `listSongbooks` is a plain `where`.
 */
export async function listSongbooksForAccount(accountOwnerEmail: string): Promise<Songbook[]> {
  const rows = await db()
    .select({ slug: songbooks.slug, name: songbooks.name })
    .from(songbooks)
    .where(eq(songbooks.accountOwnerEmail, accountOwnerEmail))
    .orderBy(asc(songbooks.name))

  return rows satisfies Songbook[]
}

export async function listSectionsForAccount(accountOwnerEmail: string): Promise<Section[]> {
  const rows = await db()
    .select({
      id: sections.id,
      songbookSlug: sections.songbookSlug,
      name: sections.name,
      position: sections.position,
    })
    .from(sections)
    .innerJoin(songbooks, eq(sections.songbookSlug, songbooks.slug))
    .where(eq(songbooks.accountOwnerEmail, accountOwnerEmail))
    .orderBy(asc(sections.songbookSlug), asc(sections.position))

  return rows satisfies Section[]
}

/** See `dbRepository.listSongs` for the join and ordering this mirrors. */
export async function listSongsForAccount(accountOwnerEmail: string): Promise<Song[]> {
  const rows = await db()
    .select({ song: songs, sectionPosition: sections.position })
    .from(songs)
    .innerJoin(songbooks, eq(songs.songbookSlug, songbooks.slug))
    .leftJoin(sections, eq(songs.sectionId, sections.id))
    .where(eq(songbooks.accountOwnerEmail, accountOwnerEmail))
    .orderBy(asc(sections.position), asc(songs.position), asc(songs.title))

  return rows.map((row) => rowToSong(row.song))
}
