'use server'

/**
 * Server actions for import, editing, deletion and export.
 *
 * Every call needs an **editor** — on the song's own account, not merely on whichever
 * account the caller currently has open (v3.0): a direct edit reaches a song by slug, and
 * that song's account is the one to check against, the same reasoning `accessTo` and the
 * dynamic song/songbook pages already apply.
 *
 * Publishing is gone (v3.0): every page here is dynamic now, so a save is live the moment
 * it commits — there is no build for anything to wait for. What is offline is a separate
 * question, answered per reader by the sync in `lib/offline/sync.ts`, not by a deploy.
 */

import { and, asc, eq, isNull, max, or, sql } from 'drizzle-orm'

import { accessTo, asEditor } from '@/lib/auth/session'
import { songAccountOf } from '@/lib/data/access'
import { placeAfter } from '@/lib/songbooks/order'
import { rowToSong } from '@/lib/data/db'
import { DEFAULT_SECTION, UNFILED, type Song } from '@/lib/data/types'
import { db, hasDatabase } from '@/lib/db/client'
import { songbooks, sections, songs } from '@/lib/db/schema'
import { revalidateSong } from '@/lib/revalidate'
import { canEdit } from '@/lib/roles'
import { uniqueSlug } from '@/lib/slug'

import {
  choproFilename,
  type ExportedFile,
  type ExportGranularity,
  type ExportRow,
  organizeExport,
  toChoproFile,
} from './export'
import type { Decision, DeleteResult, SaveFailure, SaveResult, SongInput } from './types'

/**
 * The export answers **null** when refused rather than an empty list, and the difference
 * is the same one `listMembers` and `loadSongContent` make: an empty answer is a fact
 * about the repertoire, and a refusal is not an answer at all. Returning `[]` would hand
 * somebody a zip of nothing when their role had just been taken away with the page still
 * open.
 */

/**
 * Finds a section named `name` within `songbookSlug`, or creates it at the end.
 *
 * Used to honour a paste's own `{division: ...}` in `resolveSection` below: two
 * songs from the same paste can both name a section that doesn't exist yet, so
 * this re-reads after a losing insert rather than risk two sections of the
 * same name racing each other into existence.
 */
async function findOrCreateSection(songbookSlug: string, name: string): Promise<number> {
  const database = db()
  const trimmed = name.trim()

  const existing = await database
    .select({ id: sections.id })
    .from(sections)
    .where(and(eq(sections.songbookSlug, songbookSlug), eq(sections.name, trimmed)))
    .limit(1)

  if (existing.length > 0) return existing[0].id

  const last = await database
    .select({ position: max(sections.position) })
    .from(sections)
    .where(eq(sections.songbookSlug, songbookSlug))

  const inserted = await database
    .insert(sections)
    .values({ songbookSlug, name: trimmed, position: (last[0]?.position ?? 0) + 1 })
    .onConflictDoNothing({ target: [sections.songbookSlug, sections.name] })
    .returning({ id: sections.id })

  if (inserted.length > 0) return inserted[0].id

  const retry = await database
    .select({ id: sections.id })
    .from(sections)
    .where(and(eq(sections.songbookSlug, songbookSlug), eq(sections.name, trimmed)))
    .limit(1)

  return retry[0].id
}

/**
 * A songbook and a section of it that certainly exist.
 *
 * Both columns are a foreign key — one composite, so they are checked *together* — and
 * an empty or unknown value would fail the insert and surface as a generic "could not
 * save" with nothing to act on. Answering with something real turns that into a song
 * that simply needs filing.
 *
 * The section decides when it is a real one, because it carries its songbook with it
 * and it is the more specific of the two answers: the editor's two menus cannot
 * disagree, since choosing a songbook repopulates the sections, so a pair that does
 * disagree is a stale form rather than a decision. Failing that: `sectionName` — a
 * paste's own `{division: ...}` — found or created within the songbook already settled
 * on (never a different one: `{songbook: ...}` is answered by `songbookSlug` above, not
 * by this function reaching for a different one); and only once neither an id nor a
 * name has answered it, the songbook asked for, or the unfiled one, and its first
 * section — created as «Brani» if it somehow has none, which is the same section the
 * migration and `createSongbook` make. An explicit `sectionId` is always a caller's own
 * decision and is tried first, ahead of `sectionName`, for exactly that reason.
 *
 * Everything here is scoped to `accountOwnerEmail` (v3.0), including the fallback: a
 * songbook slug named by a stale form that no longer belongs to this account is treated
 * the same as none being named at all, rather than filing the song under someone else's
 * songbook. The Unfiled songbook itself is found **by name** within the account, not by
 * `UNFILED.slug` — that constant is one fixed slug, and slugs are unique across every
 * account (see `songbooks`' own comment), so a second account's Unfiled songbook needs a
 * slug of its own, minted by `uniqueSlug` exactly like the Example songbook's clone is.
 */
async function resolveSection(
  accountOwnerEmail: string,
  songbookSlug: string,
  sectionId: number | null,
  sectionName?: string | null,
): Promise<{ songbookSlug: string; sectionId: number }> {
  const database = db()

  if (sectionId !== null) {
    const found = await database
      .select({ id: sections.id, songbookSlug: sections.songbookSlug })
      .from(sections)
      .innerJoin(songbooks, eq(sections.songbookSlug, songbooks.slug))
      .where(and(eq(sections.id, sectionId), eq(songbooks.accountOwnerEmail, accountOwnerEmail)))
      .limit(1)

    if (found.length > 0) return { songbookSlug: found[0].songbookSlug, sectionId: found[0].id }
  }

  const wanted = songbookSlug.trim()
  let slug: string | null = null

  if (wanted !== '') {
    const found = await database
      .select({ slug: songbooks.slug })
      .from(songbooks)
      .where(and(eq(songbooks.slug, wanted), eq(songbooks.accountOwnerEmail, accountOwnerEmail)))
      .limit(1)

    if (found.length > 0) slug = found[0].slug
  }

  if (slug === null) {
    const unfiled = await database
      .select({ slug: songbooks.slug })
      .from(songbooks)
      .where(and(eq(songbooks.name, UNFILED.name), eq(songbooks.accountOwnerEmail, accountOwnerEmail)))
      .limit(1)

    if (unfiled.length > 0) {
      slug = unfiled[0].slug
    } else {
      const taken = (await database.select({ slug: songbooks.slug }).from(songbooks)).map((row) => row.slug)
      slug = uniqueSlug(UNFILED.name, taken)

      const last = await database
        .select({ position: max(songbooks.position) })
        .from(songbooks)
        .where(eq(songbooks.accountOwnerEmail, accountOwnerEmail))

      await database
        .insert(songbooks)
        .values({ slug, name: UNFILED.name, accountOwnerEmail, position: (last[0]?.position ?? 0) + 1 })
    }
  }

  const declared = sectionName?.trim()
  if (declared) {
    return { songbookSlug: slug, sectionId: await findOrCreateSection(slug, declared) }
  }

  const first = await database
    .select({ id: sections.id })
    .from(sections)
    .where(eq(sections.songbookSlug, slug))
    .orderBy(asc(sections.position))
    .limit(1)

  if (first.length > 0) return { songbookSlug: slug, sectionId: first[0].id }

  const created = await database
    .insert(sections)
    .values({ songbookSlug: slug, name: DEFAULT_SECTION, position: 1 })
    .returning({ id: sections.id })

  return { songbookSlug: slug, sectionId: created[0].id }
}

function saved(song: Song): SaveResult {
  revalidateSong(song.slug, song.songbookSlug)
  return { ok: true, song }
}

/**
 * Gives an arriving song the place after the ones already in its section.
 *
 * Without this, importing five songs would file them alphabetically the moment the
 * page reloaded, which is not what pasting them in an order means. The songs already
 * there may have to be numbered for that to be possible — see `placeAfter` — and
 * numbering them changes no song, so none of these updates touches `updated_at`:
 * they would otherwise all appear in the publish list with nothing new to publish.
 *
 * The section, not the songbook, since v2.3: `position` counts within one division,
 * so numbering a whole songbook here would number songs against songs they are not
 * ordered against.
 */
async function placeLast(
  tx: Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0],
  sectionId: number,
  slug: string,
): Promise<number> {
  const siblings = await tx
    .select({ slug: songs.slug, position: songs.position })
    .from(songs)
    .where(eq(songs.sectionId, sectionId))
    // Display order, which is the order the numbering must preserve.
    .orderBy(asc(songs.position), asc(songs.title))

  const writes = placeAfter(
    siblings.filter((row) => row.slug !== slug),
    [slug],
  )

  for (const write of writes) {
    if (write.slug === slug) continue
    await tx.update(songs).set({ position: write.position }).where(eq(songs.slug, write.slug))
  }

  return writes[writes.length - 1].position
}

/** Same title and artist, ignoring case and surrounding space. */
function sameSong(title: string, artist: string | null) {
  const normalisedTitle = sql`lower(trim(${songs.title})) = ${title.trim().toLowerCase()}`

  if (artist === null || artist.trim() === '') {
    return and(normalisedTitle, or(isNull(songs.artist), eq(songs.artist, '')))
  }
  return and(normalisedTitle, sql`lower(trim(coalesce(${songs.artist}, ''))) = ${artist.trim().toLowerCase()}`)
}

/**
 * Which account this save is against, and whether the caller may edit it.
 *
 * Two different questions depending on whether a song already exists: creating one is
 * always for the caller's **current** account (there is nothing else it could mean), but
 * editing one reaches it by slug, and that slug's own account is the one to check — the
 * same reasoning `accessTo` and the dynamic song pages already apply, so that a link to
 * someone else's song cannot be used to edit it merely by also being an editor somewhere.
 */
async function accountForSave(
  slug: string | undefined,
): Promise<{ ok: true; accountOwnerEmail: string } | { ok: false; reason: SaveFailure }> {
  if (slug === undefined) {
    const editor = await asEditor()
    return editor.ok
      ? { ok: true, accountOwnerEmail: editor.accountOwnerEmail }
      : { ok: false, reason: editor.reason }
  }

  const owner = await songAccountOf(slug)
  if (owner === null) return { ok: false, reason: 'not-found' }

  const editor = await accessTo(owner)
  if (editor === null || !canEdit(editor.role)) {
    return { ok: false, reason: 'not-found' }
  }
  return { ok: true, accountOwnerEmail: owner }
}

export async function saveSong(input: SongInput, decision?: Decision): Promise<SaveResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const target = await accountForSave(input.slug)
  if (!target.ok) return target
  const { accountOwnerEmail } = target

  const title = input.title.trim()
  if (title === '') return { ok: false, reason: 'invalid-title' }
  if (input.body.trim() === '') return { ok: false, reason: 'empty-body' }

  try {
    const database = db()

    const values = {
      title,
      artist: input.artist === null || input.artist.trim() === '' ? null : input.artist.trim(),
      tags: input.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''),
      ...(await resolveSection(accountOwnerEmail, input.songbookSlug, input.sectionId, input.sectionName)),
      body: input.body,
      /**
       * The database's clock, not this server's.
       *
       * This column is the version the reading page compares itself against, and a
       * comparison is only sound if both sides were stamped by the same clock. Two
       * app instances a second apart would otherwise be enough for a real edit to
       * look older than the page it is meant to replace, and it would then be
       * ignored — the exact bug this was written to fix.
       */
      updatedAt: sql`now()`,
    }

    // Editing a known song: update in place and keep the slug, which is what
    // keeps that song's saved transposition and speed attached to it.
    if (input.slug !== undefined) {
      const updated = await database.transaction(async (tx) => {
        const before = await tx
          .select({ sectionId: songs.sectionId })
          .from(songs)
          .where(eq(songs.slug, input.slug as string))
          .limit(1)

        if (before.length === 0) return []

        /*
         * A song sent to another section arrives unplaced, so it lands at the end
         * of it — the same place an import would. Keeping the old number would have
         * it claim a place among songs it has never been ordered against, tying with
         * whichever song already holds that number. The section is what is asked
         * about rather than the songbook: changing songbook changes section too,
         * and moving between two sections of one songbook moves it just as much.
         */
        const moved = before[0].sectionId !== values.sectionId

        return tx
          .update(songs)
          .set(moved ? { ...values, position: null } : values)
          .where(eq(songs.slug, input.slug as string))
          .returning()
      })

      if (updated.length === 0) return { ok: false, reason: 'not-found' }
      return saved(rowToSong(updated[0]))
    }

    const twin = await database
      .select({
        slug: songs.slug,
        title: songs.title,
        artist: songs.artist,
        sectionId: songs.sectionId,
      })
      .from(songs)
      .innerJoin(songbooks, eq(songs.songbookSlug, songbooks.slug))
      // Scoped to this account: the same title and artist landing twice in two
      // different accounts is a coincidence, not a duplicate to warn anyone about.
      .where(and(sameSong(title, values.artist), eq(songbooks.accountOwnerEmail, accountOwnerEmail)))
      .limit(1)

    if (twin.length > 0 && decision === undefined) {
      return { ok: false, reason: 'duplicate', existing: twin[0] }
    }

    if (twin.length > 0 && decision === 'replace') {
      const updated = await database.transaction(async (tx) => {
        /*
         * Replacing a song's words is not moving it: one that already lives here keeps
         * the place it was given. Only one arriving from another section is placed,
         * and then at the end, like any other arrival.
         */
        if (twin[0].sectionId === values.sectionId) {
          return tx.update(songs).set(values).where(eq(songs.slug, twin[0].slug)).returning()
        }

        const place = await placeLast(tx, values.sectionId, twin[0].slug)
        return tx
          .update(songs)
          .set({ ...values, position: place })
          .where(eq(songs.slug, twin[0].slug))
          .returning()
      })

      return saved(rowToSong(updated[0]))
    }

    const taken = (await database.select({ slug: songs.slug }).from(songs)).map((row) => row.slug)
    const slug = uniqueSlug(title, taken)

    /*
     * One transaction: the place is worked out from what the songbook holds, and a
     * second import landing between that read and this insert would be given the same
     * number.
     */
    const inserted = await database.transaction(async (tx) => {
      const place = await placeLast(tx, values.sectionId, slug)
      return tx
        .insert(songs)
        .values({ slug, ...values, position: place })
        .returning()
    })

    return saved(rowToSong(inserted[0]))
  } catch (error) {
    console.error('saveSong failed', error)
    return { ok: false, reason: 'failed' }
  }
}

export async function deleteSong(slug: string): Promise<DeleteResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const owner = await songAccountOf(slug)
  if (owner === null) return { ok: false, reason: 'not-found' }
  const editor = await accessTo(owner)
  if (editor === null || !canEdit(editor.role)) {
    return { ok: false, reason: 'not-found' }
  }

  try {
    const removed = await db()
      .delete(songs)
      .where(eq(songs.slug, slug))
      // The songbook comes back with the deletion because the page that lists this
      // song has to be dropped too, and afterwards there is no row left to ask.
      .returning({ slug: songs.slug, songbookSlug: songs.songbookSlug })

    if (removed.length === 0) return { ok: false, reason: 'not-found' }

    revalidateSong(slug, removed[0].songbookSlug)
    return { ok: true, slug: removed[0].slug }
  } catch (error) {
    console.error('deleteSong failed', error)
    return { ok: false, reason: 'failed' }
  }
}

export type { ExportedFile } from './export'

/**
 * Every song of the caller's **current account** as a `.chopro`, ready to be zipped by
 * the browser.
 *
 * These are the files `npm run seed` reads, so this archive is also the restore
 * path: put them back in `content/`, run the seed, and what is missing returns.
 */
export async function exportAll(): Promise<ExportedFile[] | null> {
  const editor = await asEditor()
  if (!editor.ok) return null

  const database = db()
  const [rows, names, divisions] = await Promise.all([
    database
      .select({ song: songs })
      .from(songs)
      .innerJoin(songbooks, eq(songs.songbookSlug, songbooks.slug))
      .where(eq(songbooks.accountOwnerEmail, editor.accountOwnerEmail))
      .orderBy(songs.slug)
      .then((result) => result.map((row) => row.song)),
    database
      .select({ slug: songbooks.slug, name: songbooks.name })
      .from(songbooks)
      .where(eq(songbooks.accountOwnerEmail, editor.accountOwnerEmail)),
    database
      .select({ id: sections.id, name: sections.name })
      .from(sections)
      .innerJoin(songbooks, eq(sections.songbookSlug, songbooks.slug))
      .where(eq(songbooks.accountOwnerEmail, editor.accountOwnerEmail)),
  ])

  const nameBySlug = new Map(names.map((row) => [row.slug, row.name]))
  const nameById = new Map(divisions.map((row) => [row.id, row.name]))

  return rows.map((row) => ({
    name: choproFilename(row.slug),
    content: toChoproFile(
      rowToSong(row),
      nameBySlug.get(row.songbookSlug) ?? null,
      row.sectionId === null ? null : (nameById.get(row.sectionId) ?? null),
    ),
  }))
}

/**
 * Every song of the caller's **current account**, organized into the folders and
 * numbered names a person would browse or print from — one folder per songbook, a
 * numbered section subfolder inside it, and, depending on `granularity`, either one
 * numbered `.chopro` per song or one numbered `.chopro` per section with every one
 * of its songs pasted in behind it.
 *
 * Distinct from `exportAll` on purpose: that one is also the restore path `npm run
 * seed` reads back — flat, one slug-named file per song — and folders or numbered
 * names would break it. This export never feeds back into the app; see
 * `organizeExport`'s own comment for how the numbering and the grouping work.
 */
export async function exportOrganized(granularity: ExportGranularity): Promise<ExportedFile[] | null> {
  const editor = await asEditor()
  if (!editor.ok) return null

  const rows = await db()
    .select({ song: songs, songbookName: songbooks.name, sectionName: sections.name })
    .from(songs)
    .innerJoin(songbooks, eq(songs.songbookSlug, songbooks.slug))
    .innerJoin(sections, eq(songs.sectionId, sections.id))
    .where(eq(songbooks.accountOwnerEmail, editor.accountOwnerEmail))
    .orderBy(asc(songbooks.position), asc(sections.position), asc(songs.position), asc(songs.title))

  const exportRows: ExportRow[] = rows.map((row) => ({
    song: rowToSong(row.song),
    songbookName: row.songbookName,
    sectionName: row.sectionName,
  }))

  return organizeExport(exportRows, granularity)
}
