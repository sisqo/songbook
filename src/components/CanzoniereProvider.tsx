'use client'

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'

import { useOnline } from '@/lib/useOnline'

import {
  createCanzoniere,
  loadCanzonieri,
  moveSong,
  removeCanzoniere,
  renameCanzoniere,
} from '@/lib/canzonieri/actions'
import { readCanzoniereCache, writeCanzoniereCache } from '@/lib/canzonieri/store'
import type { CanzoniereState, CreateResult, WriteResult } from '@/lib/canzonieri/types'

interface CanzoniereContextValue extends CanzoniereState {
  /** False while the browser reports no connection: management is disabled. */
  online: boolean
  /** Re-reads the layer. Exposed because saving a song can change its canzoniere. */
  refresh: () => Promise<void>

  create: (name: string) => Promise<CreateResult>
  rename: (slug: string, name: string) => Promise<WriteResult>
  remove: (slug: string, moveTo: string | null) => Promise<WriteResult>
  move: (songSlug: string, canzoniereSlug: string) => Promise<WriteResult>
  nameOf: (slug: string | null | undefined) => string | null
}

const CanzoniereContext = createContext<CanzoniereContextValue | null>(null)

/**
 * Holds the mutable canzoniere layer.
 *
 * Three sources, applied in this order: the snapshot baked into the static page,
 * then the local cache (which can be newer than the last build), then the
 * server, which is authoritative. Reading the cache in a layout effect keeps it
 * out of render — that would differ from the server markup and trip hydration —
 * while still landing before the browser paints.
 */
export function CanzoniereProvider({
  initial,
  refreshOnMount = true,
  children,
}: {
  /** Snapshot from build time, so the first paint is already right. */
  initial: CanzoniereState
  /**
   * False on the reading pages, where the round trip is spent on the song itself.
   *
   * A song page asks the server for its own content, because words and chords that
   * disagree with the database are the bug this layer exists to prevent. Which
   * canzoniere the song sits in is a different matter: the header would then name
   * a canzoniere whose songs the arrows still step through as they were at build
   * time, so one strip of the page would contradict the pages it links to.
   *
   * A write refreshes anyway — including a save that moves the song — because then
   * there is something new to learn.
   */
  refreshOnMount?: boolean
  children: ReactNode
}) {
  const [state, setState] = useState<CanzoniereState>(initial)
  const online = useOnline()

  useLayoutEffect(() => {
    const cached = readCanzoniereCache()
    if (cached !== null) setState(cached)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const fresh = await loadCanzonieri()
      if (fresh !== null) {
        setState(fresh)
        writeCanzoniereCache(fresh)
      }
    } catch {
      // Offline or signed out: the cache and the baked snapshot still stand.
    }
  }, [])

  useEffect(() => {
    if (refreshOnMount) void refresh()
  }, [refresh, refreshOnMount])

  /**
   * Writes go to the server and the whole layer is re-read afterwards, rather
   * than patched locally. There is no offline queue here on purpose: this is
   * shared structure, where a last-write-wins between devices is not as harmless
   * as it is on one reader's transposition.
   */
  const afterWrite = useCallback(
    // Generic so a create can carry its new slug back out through here.
    async <T extends WriteResult | CreateResult>(result: T): Promise<T> => {
      if (result.ok) await refresh()
      return result
    },
    [refresh],
  )

  const value = useMemo<CanzoniereContextValue>(
    () => ({
      ...state,
      online,
      refresh,
      create: async (name) => afterWrite(await createCanzoniere(name)),
      rename: async (slug, name) => afterWrite(await renameCanzoniere(slug, name)),
      remove: async (slug, moveTo) => afterWrite(await removeCanzoniere(slug, moveTo)),
      move: async (songSlug, canzoniereSlug) =>
        afterWrite(await moveSong(songSlug, canzoniereSlug)),
      nameOf: (slug) =>
        slug == null ? null : (state.canzonieri.find((entry) => entry.slug === slug)?.name ?? null),
    }),
    [state, online, refresh, afterWrite],
  )

  return <CanzoniereContext.Provider value={value}>{children}</CanzoniereContext.Provider>
}

export function useCanzonieri(): CanzoniereContextValue {
  const context = useContext(CanzoniereContext)
  if (context === null) {
    throw new Error('useCanzonieri must be used inside a CanzoniereProvider')
  }
  return context
}
