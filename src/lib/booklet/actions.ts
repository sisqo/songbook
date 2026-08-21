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
import { bookletBrandLine } from '@/lib/plans/entitlements'
import type { LimitReason } from '@/lib/plans/types'
import { editableSongbook } from '@/lib/songbooks/access'

export interface BookletSong {
  title: string
  artist: string | null
  link1: string | null
  link2: string | null
  link3: string | null
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
 * A result union rather than `Booklet | null`, for two reasons that arrived together.
 *
 * `not-found` still collapses "not found", "not this reader's" and "no database" into one
 * answer — the reasoning `editableSongbook` gives, that a stranger's guess at a slug must
 * learn nothing from a refusal. What cannot be folded in with them is a plan refusal: the
 * export panel's one message for a null is «the server did not respond, or your role does
 * not allow it», which for a plan that has no booklet at all is false on every count and
 * invites somebody to retry something that will never work.
 *
 * The success branch carries `brandLine`, which the caller needs anyway and must not
 * decide for itself: the document is rendered in the browser, so what it prints about
 * itself is the server's answer, not the browser's.
 */
export type BookletResult =
  | { ok: true; booklet: Booklet; brandLine: boolean }
  | { ok: false; reason: 'not-found' | LimitReason }

export async function loadBooklet(songbookSlug: string): Promise<BookletResult> {
  const target = await editableSongbook(songbookSlug)
  if (!target.ok) return { ok: false, reason: 'not-found' }

  /*
   * `refused.booklet`, never `!limits.booklet`: that field is a tier string, so the
   * negation of it is `!'no'` — always false, and free would print a booklet with the
   * compiler none the wiser. The freeze does not reach this: printing changes nothing, so
   * an account over its caps may still print (see `entitlementsFor`).
   */
  const refused = target.entitlements.refused.booklet
  if (refused !== null) return { ok: false, reason: refused }

  const [songbookRow] = await db()
    .select({ name: songbooks.name })
    .from(songbooks)
    .where(eq(songbooks.slug, songbookSlug))
    .limit(1)
  if (songbookRow === undefined) return { ok: false, reason: 'not-found' }

  const rows = await db()
    .select({
      title: songs.title,
      artist: songs.artist,
      link1: songs.link1,
      link2: songs.link2,
      link3: songs.link3,
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
    section.songs.push({
      title: row.title,
      artist: row.artist,
      link1: row.link1,
      link2: row.link2,
      link3: row.link3,
      body: row.body,
    })
  }

  return {
    ok: true,
    booklet: { songbookName: songbookRow.name, sections: [...bySection.values()] },
    brandLine: bookletBrandLine(target.entitlements),
  }
}
