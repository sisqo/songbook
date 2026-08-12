'use server'

/**
 * Server actions for import, editing, deletion, publishing and export.
 *
 * Every call needs an **editor**. Nothing here has an offline queue: saving needs the
 * database and publishing needs a deploy, so there is nothing that could work without a
 * network and nothing worth holding.
 */

import { and, asc, desc, eq, gt, isNull, or, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { asEditor } from '@/lib/auth/session'
import { placeAfter } from '@/lib/canzonieri/order'
import { rowToSong } from '@/lib/data/db'
import { DEFAULT_SECTION, UNFILED, type Song } from '@/lib/data/types'
import { db, hasDatabase } from '@/lib/db/client'
import { builds, canzonieri, sections, songs } from '@/lib/db/schema'
import { uniqueSlug } from '@/lib/slug'

import { choproFilename, toChoproFile } from './export'
import type {
  Decision,
  DeleteResult,
  PendingSong,
  PublishResult,
  SaveResult,
  SongInput,
} from './types'

/**
 * Everything in this file changes the repertoire or acts on it as a whole, so all of it
 * needs an editor — including the two reads: the pending list and the export belong to the
 * import screen, which a viewer has no way to reach in the first place.
 *
 * Those two answer **null** when refused rather than an empty list, and the difference is
 * the same one `listMembers` and `loadSongContent` make: an empty answer is a fact about
 * the repertoire, and a refusal is not an answer at all. Returning `[]` would have the
 * screen say "nothing waiting to be published" to somebody whose role had just been taken
 * away with the page still open, and hand them a zip of nothing when they asked for an
 * export.
 */

/**
 * A canzoniere and a section of it that certainly exist.
 *
 * Both columns are a foreign key — one composite, so they are checked *together* — and
 * an empty or unknown value would fail the insert and surface as a generic "could not
 * save" with nothing to act on. Answering with something real turns that into a song
 * that simply needs filing.
 *
 * The section decides when it is a real one, because it carries its canzoniere with it
 * and it is the more specific of the two answers: the editor's two menus cannot
 * disagree, since choosing a canzoniere repopulates the sections, so a pair that does
 * disagree is a stale form rather than a decision. Failing that: the canzoniere asked
 * for, or the unfiled one, and its first section — created as «Brani» if it somehow has
 * none, which is the same section the migration and `createCanzoniere` make.
 */
async function resolveSection(
  canzoniereSlug: string,
  sectionId: number | null,
): Promise<{ canzoniereSlug: string; sectionId: number }> {
  const database = db()

  if (sectionId !== null) {
    const found = await database
      .select({ id: sections.id, canzoniereSlug: sections.canzoniereSlug })
      .from(sections)
      .where(eq(sections.id, sectionId))
      .limit(1)

    if (found.length > 0) return { canzoniereSlug: found[0].canzoniereSlug, sectionId: found[0].id }
  }

  const wanted = canzoniereSlug.trim()
  let slug: string = UNFILED.slug

  if (wanted !== '') {
    const found = await database
      .select({ slug: canzonieri.slug })
      .from(canzonieri)
      .where(eq(canzonieri.slug, wanted))
      .limit(1)

    if (found.length > 0) slug = found[0].slug
  }

  if (slug === UNFILED.slug) {
    await database
      .insert(canzonieri)
      .values({ slug: UNFILED.slug, name: UNFILED.name })
      .onConflictDoNothing({ target: canzonieri.slug })
  }

  const first = await database
    .select({ id: sections.id })
    .from(sections)
    .where(eq(sections.canzoniereSlug, slug))
    .orderBy(asc(sections.position))
    .limit(1)

  if (first.length > 0) return { canzoniereSlug: slug, sectionId: first[0].id }

  const created = await database
    .insert(sections)
    .values({ canzoniereSlug: slug, name: DEFAULT_SECTION, position: 1 })
    .returning({ id: sections.id })

  return { canzoniereSlug: slug, sectionId: created[0].id }
}

/**
 * Drops the server's cached copy of every page this song appears on.
 *
 * Three: its own, the canzoniere that lists it, and the home, whose counts change when
 * a song arrives or leaves. The canzoniere is passed in rather than looked up, because
 * a delete has already removed the row by the time this runs.
 *
 * This is not what makes an edit visible: a browser that installed the app keeps
 * serving the page precached at the last deploy, and only the runtime overlay
 * gets past that. It is for the other kind of visit — a desktop browser with no
 * service worker, or a phone that never installed it — which would otherwise be
 * handed the old page from the server's cache until the next deploy.
 *
 * Failing here must not fail the write. The row is already committed by this
 * point, and reporting failure would invite a retry that, for a new song, would
 * save it twice.
 */
function revalidateSong(slug: string, canzoniereSlug: string | null): void {
  try {
    revalidatePath(`/canzoni/${slug}`)
    if (canzoniereSlug !== null) revalidatePath(`/canzonieri/${canzoniereSlug}`)
    revalidatePath('/')
  } catch (error) {
    console.warn(`could not revalidate ${slug}; the server keeps its cached page`, error)
  }
}

function saved(song: Song): SaveResult {
  revalidateSong(song.slug, song.canzoniereSlug)
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
 * The section, not the canzoniere, since v2.3: `position` counts within one division,
 * so numbering a whole canzoniere here would number songs against songs they are not
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

export async function saveSong(input: SongInput, decision?: Decision): Promise<SaveResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }

  const title = input.title.trim()
  if (title === '') return { ok: false, reason: 'invalid-title' }
  if (input.body.trim() === '') return { ok: false, reason: 'empty-body' }

  try {
    const database = db()

    const values = {
      title,
      artist: input.artist === null || input.artist.trim() === '' ? null : input.artist.trim(),
      tags: input.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''),
      ...(await resolveSection(input.canzoniereSlug, input.sectionId)),
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
         * about rather than the canzoniere: changing canzoniere changes section too,
         * and moving between two sections of one canzoniere moves it just as much.
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
      .where(sameSong(title, values.artist))
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
     * One transaction: the place is worked out from what the canzoniere holds, and a
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
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }

  try {
    const removed = await db()
      .delete(songs)
      .where(eq(songs.slug, slug))
      // The canzoniere comes back with the deletion because the page that lists this
      // song has to be dropped too, and afterwards there is no row left to ask.
      .returning({ slug: songs.slug, canzoniereSlug: songs.canzoniereSlug })

    if (removed.length === 0) return { ok: false, reason: 'not-found' }

    revalidateSong(slug, removed[0].canzoniereSlug)
    return { ok: true, slug: removed[0].slug }
  } catch (error) {
    console.error('deleteSong failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Songs written since the last build, and therefore not yet on the site.
 *
 * Derived from the build stamp rather than a flag, so it reflects what the build
 * actually saw. With no stamp at all — a database that has never been built
 * from — everything counts as pending, which is the truthful answer.
 */
export async function loadPending(): Promise<PendingSong[] | null> {
  if (!(await asEditor()).ok) return null

  const database = db()
  const stamp = await database
    .select({ builtAt: builds.builtAt })
    .from(builds)
    .orderBy(desc(builds.builtAt))
    .limit(1)

  const rows =
    stamp.length === 0
      ? await database
          .select({
            slug: songs.slug,
            title: songs.title,
            artist: songs.artist,
            updatedAt: songs.updatedAt,
          })
          .from(songs)
      : await database
          .select({
            slug: songs.slug,
            title: songs.title,
            artist: songs.artist,
            updatedAt: songs.updatedAt,
          })
          .from(songs)
          .where(gt(songs.updatedAt, stamp[0].builtAt))

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    artist: row.artist,
    updatedAt: row.updatedAt.toISOString(),
  }))
}

/** Triggers a rebuild, which is what turns pending songs into pages. */
export async function publish(): Promise<PublishResult> {
  const editor = await asEditor()
  if (!editor.ok) return { ok: false, reason: editor.reason }

  const hook = process.env.DEPLOY_HOOK_URL
  if (hook === undefined || hook === '') return { ok: false, reason: 'no-hook' }

  try {
    const response = await fetch(hook, { method: 'POST' })
    return response.ok ? { ok: true } : { ok: false, reason: 'failed' }
  } catch (error) {
    console.error('publish failed', error)
    return { ok: false, reason: 'failed' }
  }
}

export interface ExportedFile {
  name: string
  content: string
}

/**
 * Every song as a `.chopro`, ready to be zipped by the browser.
 *
 * These are the files `npm run seed` reads, so this archive is also the restore
 * path: put them back in `content/`, run the seed, and what is missing returns.
 */
export async function exportAll(): Promise<ExportedFile[] | null> {
  if (!(await asEditor()).ok) return null

  const database = db()
  const [rows, names, divisions] = await Promise.all([
    database.select().from(songs).orderBy(songs.slug),
    database.select({ slug: canzonieri.slug, name: canzonieri.name }).from(canzonieri),
    database.select({ id: sections.id, name: sections.name }).from(sections),
  ])

  const nameBySlug = new Map(names.map((row) => [row.slug, row.name]))
  const nameById = new Map(divisions.map((row) => [row.id, row.name]))

  return rows.map((row) => ({
    name: choproFilename(row.slug),
    content: toChoproFile(
      rowToSong(row),
      nameBySlug.get(row.canzoniereSlug) ?? null,
      row.sectionId === null ? null : (nameById.get(row.sectionId) ?? null),
    ),
  }))
}
