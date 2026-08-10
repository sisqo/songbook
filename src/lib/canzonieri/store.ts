'use client'

/**
 * Local cache for the mutable canzoniere layer.
 *
 * Same role as the preferences cache: the database stays the source of truth,
 * but the pages are static and precached, so without a local copy a rename would
 * only appear after a rebuild, and offline the app would show whatever the last
 * build happened to bake in.
 */

import type { CanzoniereState } from './types'

const KEY = 'songs:canzonieri'

export function readCanzoniereCache(): CanzoniereState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return null

    const parsed = JSON.parse(raw) as Partial<CanzoniereState>
    if (!Array.isArray(parsed.canzonieri) || typeof parsed.assignments !== 'object') return null
    if (parsed.assignments === null) return null

    return {
      canzonieri: parsed.canzonieri.filter(
        (entry) => typeof entry?.slug === 'string' && typeof entry?.name === 'string',
      ),
      assignments: parsed.assignments as Record<string, string>,
    }
  } catch {
    // Disabled storage, or a shape from an older version: fall back to the
    // snapshot baked into the page.
    return null
  }
}

export function writeCanzoniereCache(state: CanzoniereState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // The cache is optional by design.
  }
}
