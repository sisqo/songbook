/**
 * Giving a newly-admitted email its own account.
 *
 * Called from `signIn` in `auth.ts`, next to `recordSignIn` — the one place a new session
 * is created, and so the one place a first sign-in can be told apart from every one after
 * it. Idempotent by checking existence rather than by distinguishing "the first" call:
 * that is what lets it run on every sign-in with no cost once the account already exists,
 * the same shape as `recordSignIn` itself.
 *
 * This runs for **every** email that clears `admitted()`, not only for owners: someone
 * invited as a collaborator on someone else's account still gets their own, empty except
 * for the clone, on this same sign-in — see PLAN.md, *Account (v3.0)*, point 8.
 */

import { eq } from 'drizzle-orm'

import { normalizeEmail } from '@/lib/allowlist'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, sections, songbooks, songs } from '@/lib/db/schema'
import { uniqueSlug } from '@/lib/slug'

/**
 * Creates the account if it does not exist yet, cloning the one songbook flagged
 * `isExampleTemplate` — its sections and songs along with it — into it.
 *
 * Silent no-op with no database, same as `recordSignIn`: local work from `content/` has
 * no accounts table to write. Failures are logged, not thrown — a sign-in must still
 * succeed even if provisioning trips, the same reasoning `recordSignIn` already applies.
 */
export async function provisionAccount(email: string): Promise<void> {
  if (!hasDatabase) return

  const ownerEmail = normalizeEmail(email)

  try {
    await db().transaction(async (tx) => {
      const existing = await tx
        .select({ ownerEmail: accounts.ownerEmail })
        .from(accounts)
        .where(eq(accounts.ownerEmail, ownerEmail))
        .limit(1)
      if (existing.length > 0) return

      await tx.insert(accounts).values({ ownerEmail })

      const template = await tx
        .select()
        .from(songbooks)
        .where(eq(songbooks.isExampleTemplate, true))
        .limit(1)
      // No Example songbook flagged yet: the account still exists, just empty. Not an
      // error — see PLAN.md's own open question about writing this songbook's content.
      if (template.length === 0) return
      const source = template[0]

      /*
       * Slugs stay globally unique (`songbooks`/`songs`' own comments explain why:
       * `/songs/[slug]` and `/songbooks/[slug]` are generated once, at build time, with
       * no account to disambiguate by). Every account cloning the same Example songbook
       * would otherwise all reach for the same slug; `uniqueSlug` is the same tool
       * `createSongbook` already uses when a *name* collides, reused here for a slug that
       * does.
       */
      const takenSongbookSlugs = (await tx.select({ slug: songbooks.slug }).from(songbooks)).map(
        (row) => row.slug,
      )
      const clonedSongbookSlug = uniqueSlug(source.slug, takenSongbookSlugs)

      await tx.insert(songbooks).values({
        accountOwnerEmail: ownerEmail,
        slug: clonedSongbookSlug,
        name: source.name,
        isExampleTemplate: false,
      })

      const sourceSections = await tx
        .select()
        .from(sections)
        .where(eq(sections.songbookSlug, source.slug))

      // Old section id → new section id, since a section's id is a surrogate that a
      // clone cannot and should not reuse (`sections.id` is shared across every account).
      const sectionIdMap = new Map<number, number>()
      for (const section of sourceSections) {
        const [cloned] = await tx
          .insert(sections)
          .values({
            songbookSlug: clonedSongbookSlug,
            name: section.name,
            position: section.position,
          })
          .returning({ id: sections.id })
        sectionIdMap.set(section.id, cloned.id)
      }

      const sourceSongs = await tx.select().from(songs).where(eq(songs.songbookSlug, source.slug))
      const takenSongSlugs = new Set((await tx.select({ slug: songs.slug }).from(songs)).map((row) => row.slug))

      for (const song of sourceSongs) {
        const newSectionId = sectionIdMap.get(song.sectionId)
        // Would mean a song pointed at a section outside its own songbook, which the
        // composite foreign key on `songs` already makes impossible.
        if (newSectionId === undefined) continue

        const clonedSlug = uniqueSlug(song.slug, takenSongSlugs)
        takenSongSlugs.add(clonedSlug)

        await tx.insert(songs).values({
          slug: clonedSlug,
          title: song.title,
          artist: song.artist,
          tags: song.tags,
          body: song.body,
          songbookSlug: clonedSongbookSlug,
          sectionId: newSectionId,
          position: song.position,
        })
      }
    })
  } catch (error) {
    console.error('provisionAccount failed', error)
  }
}
