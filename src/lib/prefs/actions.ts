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
  clampSemitones,
  clampSpeed,
  clampZoom,
} from './types'

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
        }

  return { global, song }
}

export async function saveGlobalPrefs(prefs: GlobalPrefs): Promise<boolean> {
  const email = await currentEmail()
  if (email === null) return false

  const values = {
    zoomStep: clampZoom(prefs.zoomStep),
    notation: prefs.notation === 'int' ? 'int' : 'it',
  }

  await db()
    .insert(userPrefs)
    .values({ userEmail: email, ...values })
    .onConflictDoUpdate({
      target: userPrefs.userEmail,
      set: { ...values, updatedAt: new Date() },
    })

  return true
}

export async function saveSongPrefs(songSlug: string, prefs: SongPrefs): Promise<boolean> {
  const email = await currentEmail()
  if (email === null) return false

  const values = {
    semitones: clampSemitones(prefs.semitones),
    scrollSpeed: clampSpeed(prefs.scrollSpeed),
  }

  await db()
    .insert(userSongPrefs)
    .values({ userEmail: email, songSlug, ...values })
    .onConflictDoUpdate({
      target: [userSongPrefs.userEmail, userSongPrefs.songSlug],
      set: { ...values, updatedAt: new Date() },
    })

  return true
}
