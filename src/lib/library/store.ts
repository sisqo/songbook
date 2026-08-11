'use client'

/**
 * Local copy of the songs whose database version is newer than the page.
 *
 * Kept for the same reason as the preferences and canzonieri caches: the pages
 * are static and precached, so without it an edit would be visible until the tab
 * was closed and then apparently lost again — which is exactly the bug this
 * layer exists to fix.
 *
 * Only song *content* is cached, never the song list. An edit here is a fresher
 * version of a page that certainly exists, so it is safe offline; a list, on the
 * other hand, would offer rows for songs imported since the build, and those have
 * no precached page to open. The list stays as the build left it whenever the
 * server cannot be reached.
 */

import type { Song } from '@/lib/data/types'

const KEY = 'songs:edits'

type Edits = Record<string, Song>

function looksLikeSong(value: unknown): value is Song {
  const song = value as Partial<Song> | null
  return (
    song !== null &&
    typeof song === 'object' &&
    typeof song.slug === 'string' &&
    typeof song.title === 'string' &&
    typeof song.body === 'string' &&
    Array.isArray(song.tags)
  )
}

export function readEdits(): Edits {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return {}

    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return {}

    const edits: Edits = {}
    for (const [slug, value] of Object.entries(parsed)) {
      if (looksLikeSong(value)) edits[slug] = value
    }
    return edits
  } catch {
    // Disabled storage, or a shape from an older version: the page's own copy
    // and the fetch on mount are both still there.
    return {}
  }
}

export function readEdit(slug: string): Song | null {
  return readEdits()[slug] ?? null
}

export function writeEdit(song: Song): void {
  save({ ...readEdits(), [song.slug]: song })
}

/** Called once a build has caught up, so the cache does not grow forever. */
export function dropEdit(slug: string): void {
  const edits = readEdits()
  if (!(slug in edits)) return

  delete edits[slug]
  save(edits)
}

function save(edits: Edits): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(edits))
  } catch {
    // The cache is optional by design.
  }
}
