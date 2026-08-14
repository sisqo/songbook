'use client'

import { useEffect, useRef } from 'react'

import { listOfflineRoutes } from '@/lib/offline/sync'
import { useOnline } from '@/lib/useOnline'

/**
 * Warms this device's offline cache with the reader's own repertoire, in the background.
 *
 * Fetches nothing itself in the sense of storing anything — a plain `fetch()` for each
 * route is already enough, because it passes through the active service worker exactly
 * like a real visit would, and `sw.ts`'s own runtime caching (`NetworkFirst`) stores the
 * response the same way it would if the reader had opened that page themselves. This is
 * only what makes that happen *before* a connection is needed, rather than only after.
 *
 * Sequential, not `Promise.all`: a repertoire can be a few hundred songs, and a burst of
 * that many parallel requests is a worse use of a phone's radio and a rehearsal room's
 * upload-starved wifi than the extra seconds sequential fetches cost.
 */
export function OfflineSync() {
  const online = useOnline()
  const started = useRef(false)

  useEffect(() => {
    if (!online || started.current) return
    started.current = true

    let cancelled = false

    void (async () => {
      let routes: string[]
      try {
        routes = await listOfflineRoutes()
      } catch {
        started.current = false
        return
      }

      for (const route of routes) {
        if (cancelled) return
        try {
          await fetch(route)
        } catch {
          // Offline mid-sync, or a transient failure: the next time this runs picks up
          // whatever is still missing. Nothing here is worth interrupting the rest for.
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [online])

  return null
}
