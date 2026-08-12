'use server'

/**
 * Server actions for canzonieri: the app's first write path.
 *
 * Deliberately a small surface — names, membership and order, never song content — and
 * every write requires an **editor**, since canzonieri are shared library structure
 * rather than per-reader preferences. Reading the layer needs only a session: a viewer's
 * home is drawn from it, and so is the name in the way back from a song.
 */

import { asc, eq, sql } from 'drizzle-orm'

import { asEditor, currentUser } from '@/lib/auth/session'
import { db, hasDatabase } from '@/lib/db/client'
import { canzonieri, songs } from '@/lib/db/schema'
import { uniqueSlug } from '@/lib/slug'

import { sameMembers } from './order'
import type { CanzoniereState, CreateResult, WriteResult } from './types'

/**
 * Reads the whole mutable layer. Null when there is nothing to read from.
 *
 * Any role, deliberately. This is where the names come from — the rows on the home, the
 * label on the way back from a song — so gating it to editors would leave a viewer
 * looking at a screen full of nameless containers.
 */
export async function loadCanzonieri(): Promise<CanzoniereState | null> {
  if ((await currentUser()) === null) return null

  const database = db()

  const [entries, assigned] = await Promise.all([
    database
      .select({ slug: canzonieri.slug, name: canzonieri.name })
      .from(canzonieri)
      .orderBy(asc(canzonieri.name)),
    database.select({ slug: songs.slug, canzoniereSlug: songs.canzoniereSlug }).from(songs),
  ])

  const assignments: Record<string, string> = {}
  for (const row of assigned) {
    if (row.canzoniereSlug !== null) assignments[row.slug] = row.canzoniereSlug
  }

  return { canzonieri: entries, assignments }
}

export async function createCanzoniere(name: string): Promise<CreateResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }

  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: 'invalid-name' }

  try {
    const database = db()
    const existing = await database.select({ slug: canzonieri.slug }).from(canzonieri)

    // The slug is generated once, here, and never changes again.
    const slug = uniqueSlug(
      trimmed,
      existing.map((row) => row.slug),
    )

    await database.insert(canzonieri).values({ slug, name: trimmed })
    return { ok: true, slug }
  } catch (error) {
    console.error('createCanzoniere failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/** Renames without touching the slug, so nothing that points at it moves. */
export async function renameCanzoniere(slug: string, name: string): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }

  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: 'invalid-name' }

  try {
    const updated = await db()
      .update(canzonieri)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(canzonieri.slug, slug))
      .returning({ slug: canzonieri.slug })

    return updated.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    console.error('renameCanzoniere failed', error)
    return { ok: false, reason: 'failed' }
  }
}

export async function moveSong(songSlug: string, canzoniereSlug: string): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }

  try {
    const updated = await db()
      .update(songs)
      // Unplaced in its new canzoniere, so it arrives at the end: the number it held
      // was a place among other songs, and those are not these songs.
      .set({ canzoniereSlug, position: null, updatedAt: sql`now()` })
      .where(eq(songs.slug, songSlug))
      .returning({ slug: songs.slug })

    return updated.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    console.error('moveSong failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Writes the order of one canzoniere's songs.
 *
 * The whole canzoniere is renumbered 1..N from the list given, rather than patching
 * the rows that moved: gaps and ties are then impossible by construction, and a
 * canzoniere that had never been arranged — every position null — needs no separate
 * first-time path.
 *
 * It refuses if the list is not exactly the canzoniere's songs. That is not
 * defensiveness about a bad caller; it is the case where a song was imported into
 * this canzoniere, or moved out of it, since the screen last read it. Numbering what
 * the browser remembers would then leave the newcomer at null while everything else
 * has a place, which reads as the song jumping to the end for no reason.
 *
 * `updated_at` is deliberately untouched. It answers "is this song's *content* in the
 * site yet", and reordering changes no song — it changes the set. Stamping twenty
 * rows for one drag would fill the publish list with songs that have nothing new to
 * publish. What the new order does need is a rebuild, since the arrows on each song's
 * page come from the build; that is what «Ricostruisci ora» is for.
 */
export async function reorderCanzoniere(slug: string, order: string[]): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }

  try {
    return await db().transaction(async (tx) => {
      const held = await tx
        .select({ slug: songs.slug })
        .from(songs)
        .where(eq(songs.canzoniereSlug, slug))

      if (held.length === 0) return { ok: false, reason: 'not-found' } as WriteResult
      if (!sameMembers(held.map((row) => row.slug), order)) {
        return { ok: false, reason: 'stale' } as WriteResult
      }

      for (const [index, songSlug] of order.entries()) {
        await tx
          .update(songs)
          .set({ position: index + 1 })
          .where(eq(songs.slug, songSlug))
      }

      return { ok: true } as WriteResult
    })
  } catch (error) {
    console.error('reorderCanzoniere failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Removes a canzoniere, moving its songs first when a destination is given.
 *
 * Refuses outright if it still holds songs and no destination was named. The
 * database would refuse anyway — the foreign key is `on delete restrict` — but
 * checking here is what lets the UI explain the situation and offer the move
 * instead of surfacing a constraint violation.
 */
export async function removeCanzoniere(
  slug: string,
  moveTo: string | null,
): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }
  if (moveTo === slug) return { ok: false, reason: 'invalid-name' }

  try {
    const database = db()

    return await database.transaction(async (tx) => {
      const held = await tx
        .select({ slug: songs.slug })
        .from(songs)
        .where(eq(songs.canzoniereSlug, slug))

      if (held.length > 0) {
        if (moveTo === null) return { ok: false, reason: 'not-empty' } as WriteResult

        const destination = await tx
          .select({ slug: canzonieri.slug })
          .from(canzonieri)
          .where(eq(canzonieri.slug, moveTo))
          .limit(1)

        if (destination.length === 0) return { ok: false, reason: 'not-found' } as WriteResult

        await tx
          .update(songs)
          // Same as a single move: unplaced where they land, so they queue at the end.
          .set({ canzoniereSlug: moveTo, position: null, updatedAt: sql`now()` })
          .where(eq(songs.canzoniereSlug, slug))
      }

      const removed = await tx
        .delete(canzonieri)
        .where(eq(canzonieri.slug, slug))
        .returning({ slug: canzonieri.slug })

      return (removed.length === 0
        ? { ok: false, reason: 'not-found' }
        : { ok: true }) as WriteResult
    })
  } catch (error) {
    console.error('removeCanzoniere failed', error)
    return { ok: false, reason: 'failed' }
  }
}
