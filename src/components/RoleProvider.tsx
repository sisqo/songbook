'use client'

import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'

import { mayShowAccountSwitcher } from '@/lib/accounts/read'
import { loadIdentity } from '@/lib/auth/actions'
import { type Role, canEdit } from '@/lib/roles'

interface RoleContextValue {
  email: string | null
  role: Role | null
  /** Whether the server has answered yet. Before that, nothing is offered. */
  known: boolean
  mayEdit: boolean
  /**
   * A true, installation-wide owner (`isOwner`) — what decides whether to offer the
   * account switcher in `NavMenu` (nobody else ever has more than their own account
   * to switch to) and whether to show the user menu's "Owner" badge (v3.3, same
   * question, different reader).
   */
  isGlobalOwner: boolean
}

const RoleContext = createContext<RoleContextValue>({
  email: null,
  role: null,
  known: false,
  mayEdit: false,
  isGlobalOwner: false,
})

/**
 * The reader's role, for the screens that have to leave things out.
 *
 * It arrives after mount, like preferences do, because there is nowhere earlier it could:
 * these pages are generated at build time and served from a precache, so no render knows
 * who is looking. It sits in the root layout, so one answer serves every screen and
 * survives navigation between them.
 *
 * **Nothing is cached, deliberately.** A remembered "admin" would draw buttons for
 * somebody whose account had since been deleted, or whose global-owner status had since
 * been revoked — buttons that refuse when pressed, which is worse than buttons that were
 * never there. And the cost of not caching is nothing: everything a role unlocks needs
 * the network anyway.
 *
 * Which is also why the answer is *hide until known* rather than show-then-hide. A
 * control that appears and vanishes is a control someone will have already reached for;
 * one that arrives a moment late is a control that is simply not there yet — and offline,
 * where it never arrives, it is a control that could not have worked.
 *
 * This is not the permission. Every action re-reads the table on the server: this only
 * decides what to draw.
 */
export function RoleProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [known, setKnown] = useState(false)
  const [switcher, setSwitcher] = useState(false)

  useEffect(() => {
    let alive = true

    const ask = async () => {
      try {
        const [identity, showSwitcher] = await Promise.all([loadIdentity(), mayShowAccountSwitcher()])
        if (alive) {
          setEmail(identity?.email ?? null)
          setRole(identity?.role ?? null)
          setSwitcher(showSwitcher)
          setKnown(true)
        }
      } catch {
        // Offline, or signed out: nothing is offered, which is the safe direction.
      }
    }

    void ask()

    /*
     * And again when the network comes back.
     *
     * Without this, one failed attempt was the last word for the life of the document: open
     * the app in a tunnel and an editor would have no way into the editor even after the
     * signal returned, until they reloaded by hand. Asking again on `online` also picks up a
     * role changed while the tab sat open — the actions were already re-checking it, so this
     * only brings the screen into line with what the server would have said anyway.
     */
    window.addEventListener('online', ask)
    return () => {
      alive = false
      window.removeEventListener('online', ask)
    }
  }, [])

  const value = useMemo<RoleContextValue>(
    () => ({
      email,
      role,
      known,
      mayEdit: known && canEdit(role),
      isGlobalOwner: known && switcher,
    }),
    [email, role, known, switcher],
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole(): RoleContextValue {
  return useContext(RoleContext)
}
