'use server'

/**
 * "Sing Together": one broadcast per person, and the token that lets someone with no
 * account watch it.
 *
 * The row this module owns is `sing_along_sessions` — see its own doc comment in
 * `db/schema.ts` for why it is keyed by owner rather than by token, and why only the
 * owner's own actions keep it alive. Everything a guest is allowed to *read* with a
 * token lives in `./guestReads`, deliberately kept apart from what only a signed-in
 * owner may *write* here.
 */

import { randomBytes } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'

import { accessTo, asEditor, currentUser } from '@/lib/auth/session'
import { songAccountOf } from '@/lib/data/access'
import { db, hasDatabase } from '@/lib/db/client'
import { singAlongSessions } from '@/lib/db/schema'

/**
 * How long a broadcast survives with nobody at the wheel.
 *
 * Long enough to outlast a set's intermission, short enough that a link shared once
 * and forgotten does not stay a standing, unauthenticated way to read the whole
 * repertoire for weeks.
 */
const IDLE_HOURS = 8

export interface BroadcastState {
  token: string
  songSlug: string | null
  semitones: number
}

function freshToken(): string {
  return randomBytes(24).toString('base64url')
}

function isFresh(lastActiveAt: Date): boolean {
  return Date.now() - lastActiveAt.getTime() <= IDLE_HOURS * 60 * 60 * 1000
}

/**
 * The one row that answers to this email, unless its owner has gone idle long enough
 * for it to count as over — checked here, at the moment it is read, rather than by a
 * cleanup job: nothing else in this app runs on a schedule, and a row a few hours past
 * its time costs nothing sitting there unread.
 */
async function activeRowByOwner(email: string) {
  if (!hasDatabase) return null

  const rows = await db()
    .select()
    .from(singAlongSessions)
    .where(eq(singAlongSessions.ownerEmail, email))
    .limit(1)

  if (rows.length === 0 || !isFresh(rows[0].lastActiveAt)) return null
  return rows[0]
}

/** Same question, asked with the guest's token instead of the owner's address. */
async function activeRowByToken(token: string) {
  if (!hasDatabase) return null

  const rows = await db()
    .select()
    .from(singAlongSessions)
    .where(eq(singAlongSessions.token, token))
    .limit(1)

  if (rows.length === 0 || !isFresh(rows[0].lastActiveAt)) return null
  return rows[0]
}

/** Whether a guest's token still resolves to a live broadcast. Used by `./guestReads`. */
export async function isTokenActive(token: string): Promise<boolean> {
  return (await activeRowByToken(token)) !== null
}

/**
 * Which account's repertoire a guest's token grants a read of, or null if the token does
 * not resolve to a live broadcast. Every guest read in `./guestReads` is scoped to this
 * and nothing wider — a token proves the broadcaster started a broadcast, not that a
 * stranger may browse every account in the installation.
 */
export async function broadcastAccountForToken(token: string): Promise<string | null> {
  const row = await activeRowByToken(token)
  return row?.broadcastAccountEmail ?? null
}

/** The signed-in reader's own broadcast, so the menu can redraw the QR/link it already made. */
export async function getMyBroadcast(): Promise<BroadcastState | null> {
  const user = await currentUser()
  if (user === null) return null

  const row = await activeRowByOwner(user.email)
  if (row === null) return null

  return { token: row.token, songSlug: row.currentSongSlug, semitones: row.currentSemitones }
}

/**
 * Starts a broadcast of the reader's **current account**, or restarts this reader's own:
 * a fresh token, nothing showing yet.
 *
 * Requires editor or admin on that account (v3.0) — reading a repertoire together is not
 * editing it, which is why any role may *follow* one, but exposing one to strangers with
 * a link is closer to publishing than to reading, and a viewer's account may not be
 * theirs to expose that way.
 *
 * Restarting rather than refusing when one already exists: the previous link stops
 * working the moment a new one is made, so there is never more than one live link per
 * person, and never a question of which of several is the real one.
 */
export async function startBroadcast(): Promise<{ ok: true; token: string } | { ok: false }> {
  const editor = await asEditor()
  if (!editor.ok || !hasDatabase) return { ok: false }

  const token = freshToken()

  try {
    await db()
      .insert(singAlongSessions)
      .values({ ownerEmail: editor.email, token, broadcastAccountEmail: editor.accountOwnerEmail })
      .onConflictDoUpdate({
        target: singAlongSessions.ownerEmail,
        set: {
          token,
          broadcastAccountEmail: editor.accountOwnerEmail,
          currentSongSlug: null,
          currentSemitones: 0,
          lastActiveAt: sql`now()`,
        },
      })

    return { ok: true, token }
  } catch (error) {
    console.error('startBroadcast failed', error)
    return { ok: false }
  }
}

export async function stopBroadcast(): Promise<{ ok: boolean }> {
  const user = await currentUser()
  if (user === null || !hasDatabase) return { ok: false }

  try {
    await db().delete(singAlongSessions).where(eq(singAlongSessions.ownerEmail, user.email))
    return { ok: true }
  } catch (error) {
    console.error('stopBroadcast failed', error)
    return { ok: false }
  }
}

/**
 * Called when the reader presses play: this song, at this key, is what the broadcast
 * shows now. Silently does nothing if this reader has no *active* broadcast — pressing
 * play on an ordinary read must never start one by accident, and must never revive one
 * that has already gone idle past `IDLE_HOURS` either. Without that second check, an
 * unrelated play press on any song, days later, would quietly resurrect a broadcast — and
 * the link that was shared and long forgotten — under the exact same old token.
 *
 * Also silently does nothing if `songSlug` is not on the shelf the broadcast is actually
 * showing (v3.0): a reader who collaborates on more than one account could otherwise read
 * a private song from account B while broadcasting account A, and have it pushed straight
 * to A's guests. The broadcast shows only what it was started on, never whatever the
 * reader's browser tab happens to have open.
 */
export async function broadcastPlay(songSlug: string, semitones: number): Promise<void> {
  const user = await currentUser()
  if (user === null || !hasDatabase) return

  try {
    const active = await activeRowByOwner(user.email)
    if (active === null) return
    if ((await songAccountOf(songSlug)) !== active.broadcastAccountEmail) return
    if ((await accessTo(active.broadcastAccountEmail)) === null) return

    await db()
      .update(singAlongSessions)
      .set({ currentSongSlug: songSlug, currentSemitones: semitones, lastActiveAt: sql`now()` })
      .where(eq(singAlongSessions.ownerEmail, user.email))
  } catch (error) {
    console.error('broadcastPlay failed', error)
  }
}

/**
 * Called when the reader changes key on the song already showing.
 *
 * Checked against what the broadcast is currently showing, not assumed: retuning some
 * other song — one open locally but never played to the broadcast — must not silently
 * make the broadcast claim to be showing it. Guarded by the same freshness check as
 * `broadcastPlay`, for the same reason: an idle broadcast must stay over, not be nudged
 * back to life by a change of key on whatever the reader happens to be reading.
 */
export async function broadcastTranspose(songSlug: string, semitones: number): Promise<void> {
  const user = await currentUser()
  if (user === null || !hasDatabase) return

  try {
    const active = await activeRowByOwner(user.email)
    if (active === null) return
    if ((await songAccountOf(songSlug)) !== active.broadcastAccountEmail) return

    await db()
      .update(singAlongSessions)
      .set({ currentSemitones: semitones, lastActiveAt: sql`now()` })
      .where(
        and(
          eq(singAlongSessions.ownerEmail, user.email),
          eq(singAlongSessions.currentSongSlug, songSlug),
        ),
      )
  } catch (error) {
    console.error('broadcastTranspose failed', error)
  }
}

/**
 * What a guest's link is currently showing.
 *
 * The one failure this reports is `expired` — whether the token never existed or has
 * simply gone idle too long is not a distinction a guest can act on differently, so
 * there is one reason rather than two.
 */
export async function pollBroadcast(
  token: string,
): Promise<
  { ok: true; songSlug: string | null; semitones: number } | { ok: false; reason: 'expired' }
> {
  const row = await activeRowByToken(token)
  if (row === null) return { ok: false, reason: 'expired' }

  return { ok: true, songSlug: row.currentSongSlug, semitones: row.currentSemitones }
}
