'use server'

/**
 * What the browser may ask about its own account, and do to it.
 *
 * The role is here because a screen has to know what to leave out. The passwords are here
 * because they are one subject — how somebody proves who they are — and splitting them
 * between this file and the members screen would put the rule about owners in two places.
 */

import { isOwner, normalizeEmail } from '@/lib/allowlist'
import {
  deletePasswordHash,
  readPasswordHash,
  writePasswordHash,
} from '@/lib/auth/credentials'
import { hashPassword, isPasswordAcceptable, verifyPassword } from '@/lib/auth/password'
import { asAdmin, currentUser } from '@/lib/auth/session'
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
 * every role may do this, including a viewer, because your own way of getting in is not
 * something shared.
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

/**
 * Sets somebody else's password: an admin giving an invited member their first way in, or
 * replacing one that was forgotten.
 *
 * **Not for another owner.** An owner's access answers to the environment, and their
 * identity is Google's to vouch for; letting an admin write a password for one would be a
 * way to sign in as somebody who cannot be removed or demoted. Your own address is the
 * exception, and it is not really an exception — that is `setOwnPassword`'s territory,
 * allowed here so an owner can set their first password from the same screen.
 */
export async function setPasswordFor(email: string, password: string): Promise<PasswordResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const admin = await asAdmin()
  if (!admin.ok) return { ok: false, reason: admin.reason }

  const address = normalizeEmail(email)
  if (!isPasswordAcceptable(password)) return { ok: false, reason: 'weak-password' }
  if (address !== admin.email && isOwner(address, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'is-owner' }
  }

  try {
    await writePasswordHash(address, await hashPassword(password))
    return { ok: true }
  } catch (error) {
    console.error('setPasswordFor failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/** Takes a password away, leaving Google — or nothing, for someone who has no Google account. */
export async function removePasswordFor(email: string): Promise<PasswordResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const admin = await asAdmin()
  if (!admin.ok) return { ok: false, reason: admin.reason }

  const address = normalizeEmail(email)
  if (address !== admin.email && isOwner(address, process.env.ALLOWED_EMAILS)) {
    return { ok: false, reason: 'is-owner' }
  }

  try {
    if ((await readPasswordHash(address)) === null) {
      return { ok: false, reason: 'no-password' }
    }

    await deletePasswordHash(address)
    return { ok: true }
  } catch (error) {
    console.error('removePasswordFor failed', error)
    return { ok: false, reason: 'failed' }
  }
}
