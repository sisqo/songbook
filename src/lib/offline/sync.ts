'use server'

/**
 * What a signed-in reader's device should have cached for offline use — computed fresh
 * per reader, unlike the old build-time precache list this replaces (v3.0).
 *
 * Songs and songbooks stopped being safe to bake into one shared, build-time manifest
 * the moment they became private per account: that manifest was one list, identical for
 * every device, with no reader to check it against. This is the opposite shape — asked
 * by `OfflineSync` after the reader is already known, over exactly the accounts they can
 * see — so the runtime cache in `sw.ts` ends up holding only what they were ever allowed
 * to open in the first place.
 */

import { auth } from '@/auth'
import { accessibleAccountsFor } from '@/lib/accounts/current'
import { normalizeEmail } from '@/lib/allowlist'
import { listSongbooksForAccount, listSongsForAccount } from '@/lib/data/db'
import { hasDatabase } from '@/lib/db/client'
import { listMembershipsFor } from '@/lib/members/read'

export async function listOfflineRoutes(): Promise<string[]> {
  if (!hasDatabase) return []

  const session = await auth()
  const email = session?.user?.email
  if (!email) return []
  const normalized = normalizeEmail(email)

  const memberships = await listMembershipsFor(normalized)
  const ownAccounts = accessibleAccountsFor(normalized, memberships)

  const routes: string[] = []
  for (const account of ownAccounts) {
    const [songbooks, songs] = await Promise.all([
      listSongbooksForAccount(account),
      listSongsForAccount(account),
    ])
    for (const songbook of songbooks) routes.push(`/songbooks/${songbook.slug}`)
    for (const song of songs) routes.push(`/songs/${song.slug}`)
  }
  return routes
}
