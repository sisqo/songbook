'use client'

import { useEffect, useState } from 'react'

/**
 * Whether the browser thinks it has a connection.
 *
 * True until the first effect runs, deliberately: the server cannot know, and a
 * screen that renders "offline" for one frame on every visit would be lying more
 * often than it was right.
 *
 * `navigator.onLine` only promises that *something* is reachable, which is why no
 * write depends on this — every action reports its own failure. This is for the
 * controls that would otherwise look available and quietly do nothing.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true)

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

  return online
}
