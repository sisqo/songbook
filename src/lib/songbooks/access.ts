/**
 * Whether the signed-in reader may change a given songbook or section — shared by
 * `songbooks/actions.ts` and `sections/actions.ts`, which both need the same answer to
 * the same question before touching a row named only by slug or by id.
 *
 * `not-found` rather than `not-allowed` when the thing exists but under an account the
 * caller has no business in: the alternative would confirm to a stranger that a given
 * slug or id exists somewhere, which is not this app's to tell them.
 */

import { eq } from 'drizzle-orm'

import { accessTo } from '@/lib/auth/session'
import { songbookAccountOf } from '@/lib/data/access'
import { db } from '@/lib/db/client'
import { sections } from '@/lib/db/schema'
import { canEdit } from '@/lib/roles'

import type { WriteFailure } from './types'

type EditableSongbook =
  | { ok: true; accountOwnerEmail: string }
  | { ok: false; reason: WriteFailure }

type EditableSection =
  | { ok: true; accountOwnerEmail: string; songbookSlug: string }
  | { ok: false; reason: WriteFailure }

export async function editableSongbook(slug: string): Promise<EditableSongbook> {
  const owner = await songbookAccountOf(slug)
  if (owner === null) return { ok: false, reason: 'not-found' }

  const editor = await accessTo(owner)
  if (editor === null) return { ok: false, reason: 'not-found' }
  if (!canEdit(editor.role)) return { ok: false, reason: 'not-allowed' }

  return { ok: true, accountOwnerEmail: owner }
}

/** Same question, starting from a section's id: resolved to its songbook first. */
export async function editableSection(id: number): Promise<EditableSection> {
  const rows = await db()
    .select({ songbookSlug: sections.songbookSlug })
    .from(sections)
    .where(eq(sections.id, id))
    .limit(1)

  if (rows.length === 0) return { ok: false, reason: 'not-found' }

  const target = await editableSongbook(rows[0].songbookSlug)
  if (!target.ok) return target

  return { ok: true, accountOwnerEmail: target.accountOwnerEmail, songbookSlug: rows[0].songbookSlug }
}
