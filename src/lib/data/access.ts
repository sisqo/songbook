/**
 * Which account a song or songbook belongs to, for the one check that matters once a
 * reader reaches a page by its slug rather than by navigating their own account: is this
 * *their* content to see at all.
 *
 * Database-only. Without one there is a single local repertoire read straight from
 * `content/` for one developer (`lib/data/index.ts`) — no accounts table, no ownership to
 * ask about. Callers branch on `hasDatabase` themselves rather than this module
 * pretending an answer exists where the question does not.
 */

import { eq } from 'drizzle-orm'

import { db, hasDatabase } from '@/lib/db/client'
import { songbooks, songs } from '@/lib/db/schema'

export async function songbookAccountOf(slug: string): Promise<string | null> {
  if (!hasDatabase) return null

  const rows = await db()
    .select({ accountOwnerEmail: songbooks.accountOwnerEmail })
    .from(songbooks)
    .where(eq(songbooks.slug, slug))
    .limit(1)

  return rows[0]?.accountOwnerEmail ?? null
}

/** A song's account is its songbook's — one join, since `songs` carries no copy of its own. */
export async function songAccountOf(slug: string): Promise<string | null> {
  if (!hasDatabase) return null

  const rows = await db()
    .select({ accountOwnerEmail: songbooks.accountOwnerEmail })
    .from(songs)
    .innerJoin(songbooks, eq(songs.songbookSlug, songbooks.slug))
    .where(eq(songs.slug, slug))
    .limit(1)

  return rows[0]?.accountOwnerEmail ?? null
}
