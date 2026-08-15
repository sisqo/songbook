'use server'

/**
 * Server actions for songbooks: the app's first write path.
 *
 * Deliberately a small surface — names, membership and order, never song content — and
 * every write requires an **editor** (`canEdit`, the account's admin), since songbooks
 * are shared library structure rather than per-reader preferences. Reading the layer
 * needs only a session: any signed-in reader's home is drawn from it, and so is the
 * name in the way back from a song. One export breaks that pattern on purpose:
 * `copySongbook`, a **global owner** power over two accounts at once, the same
 * distinction `deleteAccount` and `listAllAccounts` (`lib/accounts/`) already draw
 * between an account's own admin and the installation's.
 *
 * The sections of a songbook are next door, in `lib/sections/actions.ts`. The line
 * between the two files is which thing is being changed: the containers here, what is
 * inside them there.
 */

import { asc, eq, inArray, max, sql } from 'drizzle-orm'

import { auth } from '@/auth'
import { isOwner, normalizeEmail } from '@/lib/allowlist'
import { accessTo, asEditor, currentUser } from '@/lib/auth/session'
import { songAccountOf } from '@/lib/data/access'
import { listSectionsForAccount, listSongbooksForAccount } from '@/lib/data/db'
import { DEFAULT_SECTION } from '@/lib/data/types'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, songbooks, sections, songs } from '@/lib/db/schema'
import { revalidateSongbook } from '@/lib/revalidate'
import { canEdit } from '@/lib/roles'
import { uniqueSlug } from '@/lib/slug'

import { editableSongbook } from './access'
import type { SongbookState, CreateResult, WriteResult } from './types'

/**
 * Reads the whole mutable layer for the reader's **current** account. Null when there is
 * nothing to read from.
 *
 * No edit permission required, deliberately — moot besides, now that the only role
 * there is to hold is admin (v3.1). This is where the names come from — the rows on
 * the home, the label on the way back from a song — so nothing more than a session is
 * needed to know which account to read them from.
 */
export async function loadSongbooks(): Promise<SongbookState | null> {
  const user = await currentUser()
  if (user === null) return null

  const [entries, divisions, assigned] = await Promise.all([
    listSongbooksForAccount(user.accountOwnerEmail),
    listSectionsForAccount(user.accountOwnerEmail),
    db()
      .select({ slug: songs.slug, sectionId: songs.sectionId })
      .from(songs)
      .innerJoin(songbooks, eq(songs.songbookSlug, songbooks.slug))
      .where(eq(songbooks.accountOwnerEmail, user.accountOwnerEmail)),
  ])

  const assignments: Record<string, number> = {}
  for (const row of assigned) {
    if (row.sectionId !== null) assignments[row.slug] = row.sectionId
  }

  return { songbooks: entries, sections: divisions, assignments }
}

/**
 * Creates a songbook, and with it the section it is born with.
 *
 * Both or neither, in one transaction. A songbook with no sections would be a
 * songbook nothing can be filed into: its page shows «no songs» and the import
 * would have to invent a section behind the reader's back. Being born with one also
 * means the invariant — every song in exactly one section — holds for every songbook
 * from its first instant, rather than from its first import.
 */
export async function createSongbook(name: string): Promise<CreateResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }

  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: 'invalid-name' }

  try {
    return await db().transaction(async (tx) => {
      // Global, deliberately: slugs are unique across every account, not just this one —
      // see `songbooks`' own comment in `db/schema.ts` on why (static generation has no
      // account to disambiguate a route by).
      const existing = await tx.select({ slug: songbooks.slug }).from(songbooks)

      // The slug is generated once, here, and never changes again.
      const slug = uniqueSlug(
        trimmed,
        existing.map((row) => row.slug),
      )

      await tx.insert(songbooks).values({ slug, name: trimmed, accountOwnerEmail: editor.accountOwnerEmail })
      await tx
        .insert(sections)
        .values({ songbookSlug: slug, name: DEFAULT_SECTION, position: 1 })

      return { ok: true, slug } as CreateResult
    })
  } catch (error) {
    console.error('createSongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/** Renames without touching the slug, so nothing that points at it moves. */
export async function renameSongbook(slug: string, name: string): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: 'invalid-name' }

  const target = await editableSongbook(slug)
  if (!target.ok) return target

  try {
    const updated = await db()
      .update(songbooks)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(songbooks.slug, slug))
      .returning({ slug: songbooks.slug })

    return updated.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    console.error('renameSongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Sends one song to a section — of this songbook or of another one.
 *
 * The songbook is not a parameter: it is read from the section, so the two columns
 * cannot be set to disagree. The composite foreign key would refuse the row anyway,
 * which is the point of it, but refusing here means the caller gets `not-found`
 * instead of a constraint violation.
 */
export async function moveSong(songSlug: string, sectionId: number): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const songOwner = await songAccountOf(songSlug)
  if (songOwner === null) return { ok: false, reason: 'not-found' }
  const editor = await accessTo(songOwner)
  if (editor === null || !canEdit(editor.role)) {
    return { ok: false, reason: 'not-found' }
  }

  try {
    const database = db()

    const destination = await database
      .select({ songbookSlug: sections.songbookSlug, accountOwnerEmail: songbooks.accountOwnerEmail })
      .from(sections)
      .innerJoin(songbooks, eq(sections.songbookSlug, songbooks.slug))
      .where(eq(sections.id, sectionId))
      .limit(1)

    if (destination.length === 0) return { ok: false, reason: 'not-found' }
    // A song may only move within its own account's songbooks — the destination section
    // has to be one of theirs too, not merely any section that happens to exist.
    if (destination[0].accountOwnerEmail !== songOwner) return { ok: false, reason: 'not-found' }

    const updated = await database
      .update(songs)
      // Unplaced in its new section, so it arrives at the end: the number it held
      // was a place among other songs, and those are not these songs.
      .set({
        songbookSlug: destination[0].songbookSlug,
        sectionId,
        position: null,
        updatedAt: sql`now()`,
      })
      .where(eq(songs.slug, songSlug))
      .returning({ slug: songs.slug })

    return updated.length === 0 ? { ok: false, reason: 'not-found' } : { ok: true }
  } catch (error) {
    console.error('moveSong failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Removes a songbook, moving its songs first when a destination is given.
 *
 * Refuses outright if it still holds songs and no destination was named. The
 * database would refuse anyway — the foreign key is `on delete restrict` — but
 * checking here is what lets the UI explain the situation and offer the move
 * instead of surfacing a constraint violation.
 *
 * **Its sections travel with it.** Removing «Natale 2024» into «Feste» makes «Messa»
 * and «Cena» sections of «Feste», at the end, with their songs in the order they were
 * in — the division is not lost, and nothing has to be rearranged by hand afterwards.
 * A section whose name is already taken over there hands its songs to that one instead
 * of arriving as a twin, which is also the only thing the unique constraint allows.
 *
 * The songs themselves are barely touched: moving a section carries them, because the
 * composite key cascades on update, and their `position` is already relative to the
 * section they are in.
 */
export async function removeSongbook(
  slug: string,
  moveTo: string | null,
): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (moveTo === slug) return { ok: false, reason: 'invalid-name' }

  const target = await editableSongbook(slug)
  if (!target.ok) return target

  try {
    const database = db()

    return await database.transaction(async (tx) => {
      const held = await tx
        .select({ slug: songs.slug })
        .from(songs)
        .where(eq(songs.songbookSlug, slug))

      const mine = await tx
        .select({ id: sections.id, name: sections.name, position: sections.position })
        .from(sections)
        .where(eq(sections.songbookSlug, slug))
        .orderBy(asc(sections.position))

      if (held.length > 0) {
        if (moveTo === null) return { ok: false, reason: 'not-empty' } as WriteResult

        const destination = await tx
          .select({ slug: songbooks.slug, accountOwnerEmail: songbooks.accountOwnerEmail })
          .from(songbooks)
          .where(eq(songbooks.slug, moveTo))
          .limit(1)

        // Merging into a songbook of a different account would hand that account's
        // songs to this one's — refused the same way a songbook nobody owns here is.
        if (destination.length === 0 || destination[0].accountOwnerEmail !== target.accountOwnerEmail) {
          return { ok: false, reason: 'not-found' } as WriteResult
        }

        const theirs = await tx
          .select({ id: sections.id, name: sections.name })
          .from(sections)
          .where(eq(sections.songbookSlug, moveTo))

        const idByName = new Map(theirs.map((row) => [row.name, row.id]))
        const last = await tx
          .select({ position: max(sections.position) })
          .from(sections)
          .where(eq(sections.songbookSlug, moveTo))

        let next = (last[0]?.position ?? 0) + 1

        for (const section of mine) {
          const twin = idByName.get(section.name)

          if (twin === undefined) {
            // Nothing of that name over there: the section itself moves, songs and all.
            await tx
              .update(sections)
              .set({ songbookSlug: moveTo, position: next })
              .where(eq(sections.id, section.id))
            next += 1

            /*
             * The songs came along without being written — the composite key cascades —
             * so they are stamped here on purpose. **Stamping follows the songbook,
             * not the section**: a song that changed songbook is on a different page
             * now and belongs in the publish list, which is the same line the existing
             * code drew between moving a song and merely reordering one.
             */
            await tx
              .update(songs)
              .set({ updatedAt: sql`now()` })
              .where(eq(songs.sectionId, section.id))
            continue
          }

          /*
           * A section of that name already exists there, so these songs join it —
           * unplaced, at the end, exactly as a single moved song arrives. The now empty
           * section is deleted below with the rest.
           */
          await tx
            .update(songs)
            .set({
              songbookSlug: moveTo,
              sectionId: twin,
              position: null,
              updatedAt: sql`now()`,
            })
            .where(eq(songs.sectionId, section.id))
        }
      }

      /*
       * Whatever is left of this songbook's sections is empty by now — either it never
       * held songs, or they were handed to a section of the same name over there. Empty
       * sections are the songbook's own, so they go with it.
       */
      const leftovers = await tx
        .select({ id: sections.id })
        .from(sections)
        .where(eq(sections.songbookSlug, slug))

      if (leftovers.length > 0) {
        await tx.delete(sections).where(
          inArray(
            sections.id,
            leftovers.map((row) => row.id),
          ),
        )
      }

      const removed = await tx
        .delete(songbooks)
        .where(eq(songbooks.slug, slug))
        .returning({ slug: songbooks.slug })

      return (removed.length === 0
        ? { ok: false, reason: 'not-found' }
        : { ok: true }) as WriteResult
    })
  } catch (error) {
    console.error('removeSongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Deletes a songbook outright — itself, its sections, and every song any of them held.
 * Nothing moves anywhere first.
 *
 * `removeSongbook` above always insists on somewhere for the songs to go, which is right
 * for tidying a repertoire up but leaves no way through for someone who wants none of
 * these songs kept at all: today that reader's only option is to invent a decoy songbook
 * just to satisfy `on delete restrict`. This is that door instead. The deletion order is
 * the same the `restrict` foreign keys already force on `removeAccountAndContent`
 * (`accounts/actions.ts`, the same cascade for a whole account) — songs, then sections,
 * then the songbook itself — just scoped to one songbook rather than every one an account
 * owns.
 */
export async function purgeSongbook(slug: string): Promise<WriteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const target = await editableSongbook(slug)
  if (!target.ok) return target

  try {
    const result = await db().transaction(async (tx) => {
      const deletedSongs = await tx
        .delete(songs)
        .where(eq(songs.songbookSlug, slug))
        .returning({ slug: songs.slug })
      await tx.delete(sections).where(eq(sections.songbookSlug, slug))

      const removed = await tx
        .delete(songbooks)
        .where(eq(songbooks.slug, slug))
        .returning({ slug: songbooks.slug })

      return {
        write: (removed.length === 0
          ? { ok: false, reason: 'not-found' }
          : { ok: true }) as WriteResult,
        deletedSlugs: deletedSongs.map((row) => row.slug),
      }
    })

    if (result.write.ok) revalidateSongbook(slug, result.deletedSlugs)
    return result.write
  } catch (error) {
    console.error('purgeSongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Copies a songbook — its sections and every song in them — into another account,
 * leaving the original exactly as it was.
 *
 * Authorized with `isOwner` directly, the same way `deleteAccount` and
 * `listAllAccounts` are (`lib/accounts/`), and for the same reason: every account's own
 * owner is already the one editor it can have (v3.1), so "only the owner may copy a
 * songbook elsewhere" would restrict nothing at all if it meant that owner — the only
 * reading that draws an actual line is the installation's global owner, who alone may
 * reach across two accounts at once.
 *
 * Slugs stay globally unique, songbook and song alike (see `songbooks`' and `songs`' own
 * comments in `db/schema.ts` on why `/songs/[slug]` and `/songbooks/[slug]` need that),
 * so the clone itself is the same one `provisionAccount` already does for a brand-new
 * account's Example songbook: `uniqueSlug` at both levels, and an old-section-id →
 * new-section-id map, since a section's id is a surrogate a copy cannot reuse.
 */
export async function copySongbook(
  sourceSlug: string,
  targetAccountOwnerEmail: string,
): Promise<CreateResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'not-allowed' }
  }

  const target = normalizeEmail(targetAccountOwnerEmail)

  try {
    return await db().transaction(async (tx) => {
      const source = await tx
        .select()
        .from(songbooks)
        .where(eq(songbooks.slug, sourceSlug))
        .limit(1)
      if (source.length === 0) return { ok: false, reason: 'not-found' } as CreateResult

      // Copying into the songbook's own account is a duplicate, not a copy "elsewhere" —
      // the one thing this action is for — so it is refused rather than quietly allowed.
      if (source[0].accountOwnerEmail === target) {
        return { ok: false, reason: 'same-account' } as CreateResult
      }

      const destination = await tx
        .select({ ownerEmail: accounts.ownerEmail })
        .from(accounts)
        .where(eq(accounts.ownerEmail, target))
        .limit(1)
      if (destination.length === 0) return { ok: false, reason: 'not-found' } as CreateResult

      const takenSongbookSlugs = (await tx.select({ slug: songbooks.slug }).from(songbooks)).map(
        (row) => row.slug,
      )
      const copiedSlug = uniqueSlug(source[0].slug, takenSongbookSlugs)

      await tx.insert(songbooks).values({
        accountOwnerEmail: target,
        slug: copiedSlug,
        name: source[0].name,
        // Never the clone flag: the partial unique index allows exactly one across the
        // whole installation, and copying the Example songbook itself must not collide
        // with the row that already carries it.
        isExampleTemplate: false,
      })

      const sourceSections = await tx
        .select()
        .from(sections)
        .where(eq(sections.songbookSlug, sourceSlug))

      const sectionIdMap = new Map<number, number>()
      for (const section of sourceSections) {
        const [copied] = await tx
          .insert(sections)
          .values({ songbookSlug: copiedSlug, name: section.name, position: section.position })
          .returning({ id: sections.id })
        sectionIdMap.set(section.id, copied.id)
      }

      const sourceSongs = await tx.select().from(songs).where(eq(songs.songbookSlug, sourceSlug))
      const takenSongSlugs = new Set(
        (await tx.select({ slug: songs.slug }).from(songs)).map((row) => row.slug),
      )

      for (const song of sourceSongs) {
        const newSectionId = sectionIdMap.get(song.sectionId)
        // Would mean a song pointed at a section outside its own songbook, which the
        // composite foreign key on `songs` already makes impossible.
        if (newSectionId === undefined) continue

        const copiedSongSlug = uniqueSlug(song.slug, takenSongSlugs)
        takenSongSlugs.add(copiedSongSlug)

        await tx.insert(songs).values({
          slug: copiedSongSlug,
          title: song.title,
          artist: song.artist,
          tags: song.tags,
          body: song.body,
          songbookSlug: copiedSlug,
          sectionId: newSectionId,
          position: song.position,
        })
      }

      return { ok: true, slug: copiedSlug } as CreateResult
    })
  } catch (error) {
    console.error('copySongbook failed', error)
    return { ok: false, reason: 'failed' }
  }
}
