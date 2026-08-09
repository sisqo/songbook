import Link from 'next/link'

import { ControlBar } from '@/components/ControlBar'
import { PrefsProvider } from '@/components/PrefsProvider'
import { SongSheet } from '@/components/SongSheet'
import { parseChordPro } from '@/lib/chordpro'
import type { Song } from '@/lib/data'

export interface SetlistContext {
  slug: string
  name: string
  /** One-based position of this song in the setlist. */
  position: number
  total: number
  previous: { slug: string; title: string } | null
  next: { slug: string; title: string } | null
}

/**
 * The reading shell, shared by the standalone song route and the setlist route.
 *
 * The ChordPro is parsed here, on the server, so the parse happens once at build
 * time and the client only ever formats an already-structured song.
 */
export function SongReader({
  song,
  setlist,
}: {
  song: Song
  setlist?: SetlistContext | null
}) {
  const parsed = parseChordPro(song.body)

  return (
    <PrefsProvider songSlug={song.slug}>
      <main className="mx-auto max-w-3xl px-4 pt-4">
        <header className="mb-5 border-b pb-3" style={{ borderColor: 'var(--line)' }}>
          <nav className="mb-2 text-sm" style={{ color: 'var(--muted)' }}>
            {setlist ? (
              <Link href={`/scalette/${setlist.slug}`} className="underline-offset-2 hover:underline">
                ‹ {setlist.name} · {setlist.position} di {setlist.total}
              </Link>
            ) : (
              <Link href="/" className="underline-offset-2 hover:underline">
                ‹ Tutte le canzoni
              </Link>
            )}
          </nav>

          <h1 className="text-2xl font-semibold tracking-tight">{song.title}</h1>
          {song.artist !== null && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {song.artist}
            </p>
          )}
        </header>

        <SongSheet song={parsed} originalKey={song.originalKey} />

        {setlist && (
          <nav
            className="mt-10 flex items-stretch justify-between gap-3 border-t pt-4 text-sm"
            style={{ borderColor: 'var(--line)' }}
            aria-label="Navigazione nella scaletta"
          >
            {setlist.previous ? (
              <Link
                href={`/scalette/${setlist.slug}/${setlist.previous.slug}`}
                className="flex-1 rounded-lg px-3 py-3"
                style={{ background: 'var(--surface)' }}
              >
                <span style={{ color: 'var(--faint)' }}>‹ Precedente</span>
                <br />
                {setlist.previous.title}
              </Link>
            ) : (
              <span className="flex-1" />
            )}

            {setlist.next ? (
              <Link
                href={`/scalette/${setlist.slug}/${setlist.next.slug}`}
                className="flex-1 rounded-lg px-3 py-3 text-right"
                style={{ background: 'var(--surface)' }}
              >
                <span style={{ color: 'var(--faint)' }}>Successiva ›</span>
                <br />
                {setlist.next.title}
              </Link>
            ) : (
              <span className="flex-1" />
            )}
          </nav>
        )}
      </main>

      <ControlBar originalKey={song.originalKey} />
    </PrefsProvider>
  )
}
