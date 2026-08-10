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

import {
  createCanzoniere,
  loadCanzonieri,
  moveSong,
  removeCanzoniere,
  renameCanzoniere,
} from '@/lib/canzonieri/actions'
import { readCanzoniereCache, writeCanzoniereCache } from '@/lib/canzonieri/store'
import type { CanzoniereState, WriteResult } from '@/lib/canzonieri/types'

interface CanzoniereContextValue extends CanzoniereState {
  /** False while the browser reports no connection: management is disabled. */
  online: boolean
  create: (name: string) => Promise<WriteResult>
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
  children,
}: {
  /** Snapshot from build time, so the first paint is already right. */
  initial: CanzoniereState
  children: ReactNode
}) {
  const [state, setState] = useState<CanzoniereState>(initial)
  const [online, setOnline] = useState(true)

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
    void refresh()
  }, [refresh])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()

    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  /**
   * Writes go to the server and the whole layer is re-read afterwards, rather
   * than patched locally. There is no offline queue here on purpose: this is
   * shared structure, where a last-write-wins between devices is not as harmless
   * as it is on one reader's transposition.
   */
  const afterWrite = useCallback(
    async (result: WriteResult) => {
      if (result.ok) await refresh()
      return result
    },
    [refresh],
  )

  const value = useMemo<CanzoniereContextValue>(
    () => ({
      ...state,
      online,
      create: async (name) => afterWrite(await createCanzoniere(name)),
      rename: async (slug, name) => afterWrite(await renameCanzoniere(slug, name)),
      remove: async (slug, moveTo) => afterWrite(await removeCanzoniere(slug, moveTo)),
      move: async (songSlug, canzoniereSlug) =>
        afterWrite(await moveSong(songSlug, canzoniereSlug)),
      nameOf: (slug) =>
        slug == null ? null : (state.canzonieri.find((entry) => entry.slug === slug)?.name ?? null),
    }),
    [state, online, afterWrite],
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
