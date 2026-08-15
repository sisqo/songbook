/**
 * Drops the server's cached copy of the pages a song or songbook write touches.
 *
 * Not what makes a change visible to an app already installed: a browser running the
 * service worker keeps serving whatever was precached at the last deploy regardless,
 * and only the runtime overlay (`SongbookProvider`'s `refresh`, and the live song
 * index) gets past that. This is for the other kind of visit — a desktop browser with
 * no service worker, or a phone that never installed it — which would otherwise be
 * handed the old page from the server's cache until the next deploy.
 *
 * Failing here must never fail the write it follows: the rows are already committed by
 * the time either function runs, and reporting failure would invite a retry that could
 * repeat the write itself.
 */

import { revalidatePath } from 'next/cache'

/** One song's own page, the songbook that lists it, and the home (its counts change). */
export function revalidateSong(slug: string, songbookSlug: string | null): void {
  try {
    revalidatePath(`/songs/${slug}`)
    if (songbookSlug !== null) revalidatePath(`/songbooks/${songbookSlug}`)
    revalidatePath('/')
  } catch (error) {
    console.warn(`could not revalidate ${slug}; the server keeps its cached page`, error)
  }
}

/**
 * Every page a songbook-wide change touches at once: each song's own page — gone, or
 * merely moved off the songbook — its own page, and the home. For a write that changes
 * several songs together (a purge, a merge), rather than calling `revalidateSong` once
 * per song, which would revalidate the same songbook and home pages that many times
 * over for nothing gained.
 */
export function revalidateSongbook(songbookSlug: string, songSlugs: readonly string[]): void {
  try {
    for (const slug of songSlugs) revalidatePath(`/songs/${slug}`)
    revalidatePath(`/songbooks/${songbookSlug}`)
    revalidatePath('/')
  } catch (error) {
    console.warn(`could not revalidate ${songbookSlug}; the server keeps its cached pages`, error)
  }
}
