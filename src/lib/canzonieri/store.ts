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
    /*
     * A cache written before sections existed has no `sections` and its assignments
     * point at canzoniere slugs rather than section ids. Both are caught here, and
     * that is the whole migration: an unrecognised shape is discarded and the state
     * falls back to the snapshot baked into the page. No key to version.
     */
    if (!Array.isArray(parsed.sections)) return null

    return {
      canzonieri: parsed.canzonieri.filter(
        (entry) => typeof entry?.slug === 'string' && typeof entry?.name === 'string',
      ),
      sections: parsed.sections.filter(
        (entry) =>
          typeof entry?.id === 'number' &&
          typeof entry?.canzoniereSlug === 'string' &&
          typeof entry?.name === 'string' &&
          typeof entry?.position === 'number',
      ),
      assignments: Object.fromEntries(
        Object.entries(parsed.assignments).filter(([, id]) => typeof id === 'number'),
      ) as Record<string, number>,
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
