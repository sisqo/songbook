'use client'

/**
 * Write queue for preferences.
 *
 * A change takes effect on screen immediately and the save is queued. If the
 * network is gone the queue holds it and drains when the connection returns, so
 * transposing a song in a rehearsal room with no signal works and is not lost
 * quietly.
 *
 * The queue lives in memory only. That is the deliberate limit of keeping the
 * database as the single source of truth: reloading the page while still offline
 * loses a queued change. It is a small, understood cost, and it is why the
 * indicator in the control bar exists — a pending write is visible.
 */

import type { SaveResult } from './actions'
import type { GlobalPrefs, SongPrefs } from './types'

type Pending =
  | { kind: 'global'; prefs: GlobalPrefs }
  | { kind: 'song'; slug: string; prefs: SongPrefs }

export type QueueKey = 'global' | `song:${string}`

const DEBOUNCE_MS = 2000
/** Longer than the debounce: a failing server should not be hammered. */
const RETRY_MS = 15000

export interface QueueHandlers {
  saveGlobal: (prefs: GlobalPrefs) => Promise<SaveResult>
  saveSong: (slug: string, prefs: SongPrefs) => Promise<SaveResult>
}

/**
 * Built as a factory rather than module-level state so it can be tested without
 * a backdoor to reset globals.
 */
export function createPrefsQueue(options: { debounceMs?: number; retryMs?: number } = {}) {
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS
  const retryMs = options.retryMs ?? RETRY_MS

  /**
   * At most one pending write per target: only the latest value matters, so a
   * reader tapping +1 five times produces one save, not five.
   */
  const pending = new Map<QueueKey, Pending>()
  const listeners = new Set<(count: number) => void>()

  let timer: ReturnType<typeof setTimeout> | null = null
  let flushing = false
  let handlers: QueueHandlers | null = null
  let wired = false

  function notify() {
    for (const listener of listeners) listener(pending.size)
  }

  function schedule(delay: number) {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, delay)

    // In Node the timer would otherwise hold the event loop open, which hangs
    // the test run. Browsers return a plain number and are unaffected.
    if (typeof timer === 'object' && typeof timer.unref === 'function') timer.unref()
  }

  async function flush(): Promise<void> {
    if (flushing || handlers === null || pending.size === 0) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return

    flushing = true
    let retry = false

    try {
      // Snapshot the keys: an entry replaced while we were away must not be
      // dropped, so only the exact value we sent is removed.
      for (const [key, entry] of [...pending.entries()]) {
        let result: SaveResult
        try {
          result =
            entry.kind === 'global'
              ? await handlers.saveGlobal(entry.prefs)
              : await handlers.saveSong(entry.slug, entry.prefs)
        } catch {
          // Offline, or the request never arrived.
          retry = true
          break
        }

        if (result === 'failed') {
          retry = true
          break
        }

        /**
         * Both 'saved' and 'no-destination' clear the entry. Without the second
         * case the queue would never empty when there is nobody signed in or no
         * database configured — and the indicator that exists to promise
         * "nothing is lost in silence" would sit there lying.
         */
        if (pending.get(key) === entry) {
          pending.delete(key)
          notify()
        }
      }
    } finally {
      flushing = false
    }

    // A failure needs its own retry: otherwise the write waits for the app to be
    // backgrounded or the connection to drop and return.
    if (retry) schedule(retryMs)
  }

  return {
    setHandlers(next: QueueHandlers) {
      handlers = next
    },

    subscribe(listener: (count: number) => void): () => void {
      listeners.add(listener)
      listener(pending.size)
      return () => listeners.delete(listener)
    },

    enqueueGlobal(prefs: GlobalPrefs) {
      pending.set('global', { kind: 'global', prefs })
      notify()
      schedule(debounceMs)
    },

    enqueueSong(slug: string, prefs: SongPrefs) {
      pending.set(`song:${slug}`, { kind: 'song', slug, prefs })
      notify()
      schedule(debounceMs)
    },

    /** True while a change for this scope has not reached the server yet. */
    hasPending(key: QueueKey): boolean {
      return pending.has(key)
    },

    size(): number {
      return pending.size
    },

    flush,

    /** Drains the queue when the connection comes back. */
    watchConnection() {
      if (wired || typeof window === 'undefined') return
      wired = true

      window.addEventListener('online', () => void flush())
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void flush()
      })
    },
  }
}

export const prefsQueue = createPrefsQueue()
