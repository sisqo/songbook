'use server'

/**
 * Server actions for preferences. The database is the source of truth; the
 * client keeps a read cache so the sheet can paint in the right key and so the
 * app still remembers anything at all when offline.
 */

import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import { currentUser } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { songbooks, songs, userPrefs, userSongPrefs } from '@/lib/db/schema'
import type { Instrument } from '@/lib/music/shapes'
import { entitlementsOf } from '@/lib/plans/resolve'

import {
  type GlobalPrefs,
  type SongPrefs,
  clampCapo,
  clampSemitones,
  clampSpeed,
  clampZoom,
  readChordDisplay,
  readInstrument,
} from './types'

/**
 * The outcome of a save, from the queue's point of view.
 *
 * `no-destination` and `failed` are not the same thing and must not be treated
 * alike: with nobody signed in or no database configured there is nothing to
 * sync to, so the write is finished and the queue must drop it. Only `failed` is
 * worth retrying.
 *
 * `not-in-plan` is the third of those "finished, nothing to retry" answers, and it is its
 * own value rather than `saved` or `failed` for the same reason the other two are apart:
 * the row *was* written, but not with the instrument that was asked for, and a queue that
 * read that as `failed` would resend the same refused value every fifteen seconds for as
 * long as the app stayed open. Nothing renders it yet — the reading panel's instrument
 * picker is client-side and hiding it is a later step — so today its only job is to be
 * distinguishable in that flush and to stop this returning `saved` about a preference it
 * did not save.
 */
export type SaveResult = 'saved' | 'no-destination' | 'not-in-plan' | 'failed'

/**
 * Preferences belong to an address, so `currentUser` is asked for the address rather than
 * for a yes: null means nobody, no database, or somebody whose access has since been
 * taken away. All three are `no-destination` and none is `failed` — there is nothing to
 * sync to, so the queue drops the write instead of retrying it for ninety days.
 *
 * **No role is checked here, and that is the design.** A transposition, a capo, a scroll
 * speed and a font size are not modifications of anything shared: they are how this one
 * reader reads, on their own screen. Someone who could not save them would be someone
 * who cannot use the app on stage, which is the only place it gets used.
 */

export interface LoadedPrefs {
  global: GlobalPrefs | null
  song: SongPrefs | null
}

export async function loadPrefs(songSlug: string | null): Promise<LoadedPrefs> {
  const email = (await currentUser())?.email ?? null
  if (email === null) return { global: null, song: null }

  const database = db()

  const globalRows = await database
    .select()
    .from(userPrefs)
    .where(eq(userPrefs.userEmail, email))
    .limit(1)

  const global =
    globalRows.length === 0
      ? null
      : {
          zoomStep: clampZoom(globalRows[0].zoomStep),
          notation: globalRows[0].notation === 'int' ? ('int' as const) : ('it' as const),
          instrument: readInstrument(globalRows[0].instrument),
          chordDisplay: readChordDisplay(globalRows[0].chordDisplay),
        }

  if (songSlug === null) return { global, song: null }

  const songRows = await database
    .select()
    .from(userSongPrefs)
    .where(and(eq(userSongPrefs.userEmail, email), eq(userSongPrefs.songSlug, songSlug)))
    .limit(1)

  const song =
    songRows.length === 0
      ? null
      : {
          semitones: clampSemitones(songRows[0].semitones),
          scrollSpeed: clampSpeed(songRows[0].scrollSpeed),
          capo: clampCapo(songRows[0].capo),
          note: songRows[0].note,
        }

  return { global, song }
}

/**
 * The one server-side control point for the ukulele, which is otherwise a soft gate: the
 * chord diagrams are drawn in the browser from a table that ships with the app, so nothing
 * can stop a determined reader seeing ukulele shapes. What *can* be refused is storing the
 * choice, which is what makes it stick across devices and sessions — so that is what is
 * refused, on a plan whose matrix says no ukulele.
 *
 * Refused narrowly, and the narrowness is the decision. The instrument shares one row with
 * the zoom, the notation and the chord display, and this function's result goes to the
 * offline queue rather than to a screen: returning early would throw away a font-size
 * change the reader made in the same breath, with no way to tell them why. So the row is
 * written with the instrument the plan allows, and the answer says the instrument did not
 * take. The reader's own screen keeps showing what they picked until the page is reloaded —
 * the client-side half of this gate is a later step, deliberately not invented here.
 *
 * The plan is resolved **only** when a non-guitar instrument is actually asked for. This
 * runs on every zoom step and every notation press, and those must not each pay for two
 * count queries to answer a question they never raise.
 */
export async function saveGlobalPrefs(prefs: GlobalPrefs): Promise<SaveResult> {
  const user = await currentUser()
  if (user === null) return 'no-destination'
  const email = user.email

  const asked = readInstrument(prefs.instrument)
  let instrument: Instrument = asked
  if (asked !== 'guitar') {
    const entitlements = await entitlementsOf(user.accountOwnerEmail)
    if (entitlements.refused.ukulele !== null) instrument = 'guitar'
  }

  const values = {
    zoomStep: clampZoom(prefs.zoomStep),
    notation: prefs.notation === 'int' ? 'int' : 'it',
    instrument,
    chordDisplay: readChordDisplay(prefs.chordDisplay),
  }

  try {
    await db()
      .insert(userPrefs)
      .values({ userEmail: email, ...values })
      .onConflictDoUpdate({
        target: userPrefs.userEmail,
        set: { ...values, updatedAt: new Date() },
      })
    return instrument === asked ? 'saved' : 'not-in-plan'
  } catch (error) {
    console.error('saveGlobalPrefs failed', error)
    return 'failed'
  }
}

export async function saveSongPrefs(songSlug: string, prefs: SongPrefs): Promise<SaveResult> {
  const email = (await currentUser())?.email ?? null
  if (email === null) return 'no-destination'

  const values = {
    semitones: clampSemitones(prefs.semitones),
    scrollSpeed: clampSpeed(prefs.scrollSpeed),
    capo: clampCapo(prefs.capo),
    note: prefs.note,
  }

  try {
    await db()
      .insert(userSongPrefs)
      .values({ userEmail: email, songSlug, ...values })
      .onConflictDoUpdate({
        target: [userSongPrefs.userEmail, userSongPrefs.songSlug],
        set: { ...values, updatedAt: new Date() },
      })
    return 'saved'
  } catch (error) {
    console.error('saveSongPrefs failed', error)
    return 'failed'
  }
}

/**
 * Marks this song as opened by this reader, right now — the one fact "Recently
 * played" on the home screen is built from.
 *
 * Deliberately not folded into `saveSongPrefs`: that one only runs when a real
 * preference changes, and a song read start to finish without ever touching the
 * key or the capo must still count as opened. No result to report and nothing
 * queued or retried if it fails — missing an occasional "recently played" entry
 * is a cosmetic gap, not one worth the offline queue's own complexity.
 */
export async function recordSongOpened(songSlug: string): Promise<void> {
  const email = (await currentUser())?.email ?? null
  if (email === null) return

  try {
    await db()
      .insert(userSongPrefs)
      .values({ userEmail: email, songSlug, lastOpenedAt: new Date() })
      .onConflictDoUpdate({
        target: [userSongPrefs.userEmail, userSongPrefs.songSlug],
        set: { lastOpenedAt: new Date() },
      })
  } catch (error) {
    console.error('recordSongOpened failed', error)
  }
}

/**
 * Empties this reader's "Recently played" — the undo for `recordSongOpened` above.
 *
 * **An UPDATE that nulls one column, never a DELETE**, and that is the whole of what makes this
 * safe rather than destructive: `lastOpenedAt` shares its row with `semitones`, `capo`,
 * `scrollSpeed` and `note` (see `userSongPrefs` in `db/schema.ts`), so deleting the rows would
 * throw away the key this reader sings each song in, the fret their capo sits on and the
 * reminder they wrote themselves — to clear a list of shortcuts. One column is the only thing
 * anybody is asking to forget.
 *
 * Scoped by `userEmail` **and** the account the songs belong to, matching `listRecentlyOpened`
 * (`lib/data/db.ts`) clause for clause and for its own stated reason: a global owner's rows can
 * point at songs in any account they have ever switched into, and a button that says it clears
 * *this* list must not also clear entries that list never showed. Clearing while switched into
 * somebody else's account leaves the reader's own account's history alone, and the other way
 * round.
 *
 * `isNotNull` in the predicate is not decoration either: without it this would touch every
 * preference row this reader owns in the account — every saved transposition, most of which were
 * never "recently played" — writing them all for nothing.
 *
 * No confirmation step in front of it, deliberately, on the same reasoning `setGrant`'s "Remove
 * gift" gives for having none: the retype-to-confirm net is for the irreversible cascades that
 * destroy songs. This forgets an ordering hint, and reading a song puts it back.
 */
export async function clearRecentlyOpened(): Promise<
  { ok: true } | { ok: false; reason: 'no-session' | 'failed' }
> {
  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    /* The songs of the account being looked at, as a subquery rather than a first round trip:
       the set is only ever used as the right-hand side of this one predicate. */
    const songsInThisAccount = db()
      .select({ slug: songs.slug })
      .from(songs)
      .innerJoin(songbooks, eq(songs.songbookSlug, songbooks.slug))
      .where(eq(songbooks.accountOwnerEmail, user.accountOwnerEmail))

    await db()
      .update(userSongPrefs)
      .set({ lastOpenedAt: null })
      .where(
        and(
          eq(userSongPrefs.userEmail, user.email),
          inArray(userSongPrefs.songSlug, songsInThisAccount),
          isNotNull(userSongPrefs.lastOpenedAt),
        ),
      )

    return { ok: true }
  } catch (error) {
    console.error('clearRecentlyOpened failed', error)
    return { ok: false, reason: 'failed' }
  }
}
