'use server'

/**
 * Reading one songbook whole, for the printable booklet.
 *
 * Distinct from `exportOrganized` (`lib/import/actions.ts`) on purpose: that one
 * flattens the whole account into files named for a zip, one songbook at a time
 * was never its job. This reads exactly one songbook, structured rather than
 * flattened, because the booklet is built as a PDF document in the browser, not
 * written to disk.
 */

import { asc, eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { sections, songbooks, songs } from '@/lib/db/schema'
import { editableSongbook } from '@/lib/songbooks/access'

export interface BookletSong {
  title: string
  artist: string | null
  body: string
}

export interface BookletSection {
  name: string
  songs: BookletSong[]
}

export interface Booklet {
  songbookName: string
  sections: BookletSection[]
}

/**
 * `null` for "not found", "not this reader's", or "no database" alike — same
 * reasoning `editableSongbook` itself gives: a stranger's guess at a slug learns
 * nothing more from this than from any other refusal.
 */
export async function loadBooklet(songbookSlug: string): Promise<Booklet | null> {
  const target = await editableSongbook(songbookSlug)
  if (!target.ok) return null

  const [songbookRow] = await db()
    .select({ name: songbooks.name })
    .from(songbooks)
    .where(eq(songbooks.slug, songbookSlug))
    .limit(1)
  if (songbookRow === undefined) return null

  const rows = await db()
    .select({
      title: songs.title,
      artist: songs.artist,
      body: songs.body,
      sectionId: sections.id,
      sectionName: sections.name,
    })
    .from(songs)
    .innerJoin(sections, eq(songs.sectionId, sections.id))
    .where(eq(songs.songbookSlug, songbookSlug))
    .orderBy(asc(sections.position), asc(songs.position), asc(songs.title))

  // Sections in the order their first song was seen, which is already the
  // position order the query asked for — a `Map` keeps that order and lets a
  // section with no songs yet simply have nothing to show, rather than an
  // empty heading nobody asked for.
  const bySection = new Map<number, BookletSection>()
  for (const row of rows) {
    let section = bySection.get(row.sectionId)
    if (section === undefined) {
      section = { name: row.sectionName, songs: [] }
      bySection.set(row.sectionId, section)
    }
    section.songs.push({ title: row.title, artist: row.artist, body: row.body })
  }

  return { songbookName: songbookRow.name, sections: [...bySection.values()] }
}
