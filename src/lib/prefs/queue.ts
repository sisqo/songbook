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

import type { GlobalPrefs, SongPrefs } from './types'

type Pending =
  | { kind: 'global'; prefs: GlobalPrefs }
  | { kind: 'song'; slug: string; prefs: SongPrefs }

const DEBOUNCE_MS = 2000

/**
 * At most one pending write per target: only the latest value matters, so a
 * reader tapping +1 five times produces one save, not five.
 */
const pending = new Map<string, Pending>()

let timer: ReturnType<typeof setTimeout> | null = null
let flushing = false

type Listener = (count: number) => void
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener(pending.size)
}

export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener)
  listener(pending.size)
  return () => listeners.delete(listener)
}

export interface QueueHandlers {
  saveGlobal: (prefs: GlobalPrefs) => Promise<boolean>
  saveSong: (slug: string, prefs: SongPrefs) => Promise<boolean>
}

let handlers: QueueHandlers | null = null

export function setQueueHandlers(next: QueueHandlers): void {
  handlers = next
}

export function enqueueGlobal(prefs: GlobalPrefs): void {
  pending.set('global', { kind: 'global', prefs })
  notify()
  schedule()
}

export function enqueueSong(slug: string, prefs: SongPrefs): void {
  pending.set(`song:${slug}`, { kind: 'song', slug, prefs })
  notify()
  schedule()
}

/** True while a change for this scope has not reached the server yet. */
export function hasPending(key: 'global' | `song:${string}`): boolean {
  return pending.has(key)
}

function schedule() {
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, DEBOUNCE_MS)
}

export async function flush(): Promise<void> {
  if (flushing || handlers === null || pending.size === 0) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  flushing = true
  try {
    // Snapshot the keys: an entry replaced while we are away must not be
    // dropped, so only the exact value we sent is removed.
    for (const [key, entry] of [...pending.entries()]) {
      try {
        const saved =
          entry.kind === 'global'
            ? await handlers.saveGlobal(entry.prefs)
            : await handlers.saveSong(entry.slug, entry.prefs)

        if (saved && pending.get(key) === entry) {
          pending.delete(key)
          notify()
        }
      } catch {
        // Offline, or the server refused: keep it queued and try again later.
        break
      }
    }
  } finally {
    flushing = false
  }
}

let wired = false

/** Drains the queue when the connection comes back. */
export function watchConnection(): void {
  if (wired || typeof window === 'undefined') return
  wired = true

  window.addEventListener('online', () => void flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush()
  })
}
