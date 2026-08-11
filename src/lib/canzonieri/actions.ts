'use server'

/**
 * Server actions for canzonieri: the app's first write path.
 *
 * Deliberately a small surface — names and membership, never song content — and
 * every call requires a session from the allowlist, since canzonieri are shared
 * library structure rather than per-reader preferences.
 */

import { asc, eq, sql } from 'drizzle-orm'

import { auth } from '@/auth'
import { db, hasDatabase } from '@/lib/db/client'
import { canzonieri, songs } from '@/lib/db/schema'
import { uniqueSlug } from '@/lib/slug'

import type { CanzoniereState, WriteResult } from './types'

async function authorized(): Promise<boolean> {
  if (!hasDatabase) return false
  const session = await auth()
  return Boolean(session?.user?.email)
}

/** Reads the whole mutable layer. Null when there is nothing to read from. */
export async function loadCanzonieri(): Promise<CanzoniereState | null> {
  if (!(await authorized())) return null

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

export async function createCanzoniere(name: string): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (!(await authorized())) return { ok: false, reason: 'no-session' }

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
    return { ok: true }
  } catch (error) {
    console.error('createCanzoniere failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/** Renames without touching the slug, so nothing that points at it moves. */
export async function renameCanzoniere(slug: string, name: string): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (!(await authorized())) return { ok: false, reason: 'no-session' }

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
  if (!(await authorized())) return { ok: false, reason: 'no-session' }

  try {
    const updated = await db()
      .update(songs)
      .set({ canzoniereSlug, updatedAt: sql`now()` })
      .where(eq(songs.slug, songSlug))
      .returning({ slug: songs.slug })

    return updated.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    console.error('moveSong failed', error)
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
  if (!(await authorized())) return { ok: false, reason: 'no-session' }
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
          .set({ canzoniereSlug: moveTo, updatedAt: sql`now()` })
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
