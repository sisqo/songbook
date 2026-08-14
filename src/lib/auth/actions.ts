'use server'

/**
 * What the browser may ask about its own account, and do to it.
 *
 * The role is here because a screen has to know what to leave out. The passwords are here
 * because proving who you are is entirely your own business now (v3.1) — nobody else's
 * password is ever set from this file, or from anywhere else in the app.
 */

import {
  deletePasswordHash,
  readPasswordHash,
  writePasswordHash,
} from '@/lib/auth/credentials'
import { hashPassword, isPasswordAcceptable, verifyPassword } from '@/lib/auth/password'
import { currentUser } from '@/lib/auth/session'
import type { PasswordResult } from '@/lib/auth/types'
import { hasDatabase } from '@/lib/db/client'
import type { Role } from '@/lib/roles'

/** The signed-in reader's role, or null when there is nobody or nobody allowed. */
export async function loadRole(): Promise<Role | null> {
  return (await currentUser())?.role ?? null
}

/**
 * Your own account, for the screen that manages it: who you are, what you may do, and
 * whether you can already get in without Google.
 *
 * Not whether the password is any good and certainly not what it is — only that one exists,
 * which is what decides whether the form asks for the current one.
 */
export async function loadAccount(): Promise<{
  email: string
  role: Role
  hasPassword: boolean
} | null> {
  const user = await currentUser()
  if (user === null) return null

  return { ...user, hasPassword: (await readPasswordHash(user.email)) !== null }
}

/**
 * Changes your own password.
 *
 * The address comes from the session and nowhere else — there is no parameter for it, so
 * there is nothing for a caller to substitute. That is the whole of the authorisation:
 * anyone signed in may do this, because your own way of getting in is not something
 * shared.
 *
 * The current password is required when there is one. Someone who has only ever used
 * Google has none, and asking them for it would leave them unable to set a first one.
 */
export async function setOwnPassword(
  current: string,
  next: string,
): Promise<PasswordResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  if (!isPasswordAcceptable(next)) return { ok: false, reason: 'weak-password' }

  try {
    const stored = await readPasswordHash(user.email)
    if (stored !== null && !(await verifyPassword(current, stored))) {
      return { ok: false, reason: 'wrong-password' }
    }

    await writePasswordHash(user.email, await hashPassword(next))
    return { ok: true }
  } catch (error) {
    console.error('setOwnPassword failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/** Forgets your own password, leaving Google as the way in. */
export async function removeOwnPassword(): Promise<PasswordResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  try {
    if ((await readPasswordHash(user.email)) === null) {
      return { ok: false, reason: 'no-password' }
    }

    await deletePasswordHash(user.email)
    return { ok: true }
  } catch (error) {
    console.error('removeOwnPassword failed', error)
    return { ok: false, reason: 'failed' }
  }
}
