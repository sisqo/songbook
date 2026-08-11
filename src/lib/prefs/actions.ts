'use server'

/**
 * Server actions for preferences. The database is the source of truth; the
 * client keeps a read cache so the sheet can paint in the right key and so the
 * app still remembers anything at all when offline.
 */

import { and, eq } from 'drizzle-orm'

import { auth } from '@/auth'
import { db, hasDatabase } from '@/lib/db/client'
import { userPrefs, userSongPrefs } from '@/lib/db/schema'

import {
  type GlobalPrefs,
  type SongPrefs,
  clampCapo,
  clampSemitones,
  clampSpeed,
  clampZoom,
  readInstrument,
} from './types'

/**
 * The outcome of a save, from the queue's point of view.
 *
 * `no-destination` and `failed` are not the same thing and must not be treated
 * alike: with nobody signed in or no database configured there is nothing to
 * sync to, so the write is finished and the queue must drop it. Only `failed` is
 * worth retrying.
 */
export type SaveResult = 'saved' | 'no-destination' | 'failed'

/** The signed-in address, or null when there is nobody or no database. */
async function currentEmail(): Promise<string | null> {
  if (!hasDatabase) return null

  const session = await auth()
  const email = session?.user?.email
  return email ? email.toLowerCase() : null
}

export interface LoadedPrefs {
  global: GlobalPrefs | null
  song: SongPrefs | null
}

export async function loadPrefs(songSlug: string | null): Promise<LoadedPrefs> {
  const email = await currentEmail()
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
        }

  return { global, song }
}

export async function saveGlobalPrefs(prefs: GlobalPrefs): Promise<SaveResult> {
  const email = await currentEmail()
  if (email === null) return 'no-destination'

  const values = {
    zoomStep: clampZoom(prefs.zoomStep),
    notation: prefs.notation === 'int' ? 'int' : 'it',
    instrument: readInstrument(prefs.instrument),
  }

  try {
    await db()
      .insert(userPrefs)
      .values({ userEmail: email, ...values })
      .onConflictDoUpdate({
        target: userPrefs.userEmail,
        set: { ...values, updatedAt: new Date() },
      })
    return 'saved'
  } catch (error) {
    console.error('saveGlobalPrefs failed', error)
    return 'failed'
  }
}

export async function saveSongPrefs(songSlug: string, prefs: SongPrefs): Promise<SaveResult> {
  const email = await currentEmail()
  if (email === null) return 'no-destination'

  const values = {
    semitones: clampSemitones(prefs.semitones),
    scrollSpeed: clampSpeed(prefs.scrollSpeed),
    capo: clampCapo(prefs.capo),
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
