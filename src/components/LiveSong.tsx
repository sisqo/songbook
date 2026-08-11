'use client'

/**
 * The parts of the reading page that have to follow the song rather than the page.
 *
 * Each is a few lines around a component that still takes plain props, so the
 * pieces themselves stay testable and reusable — the preview inside the editing
 * form renders the same sheet with no provider anywhere near it.
 */

import { CanzonierePicker } from '@/components/CanzonierePicker'
import { ControlBar } from '@/components/ControlBar'
import { SongSheet } from '@/components/SongSheet'
import { useSong } from '@/components/SongProvider'

/** Title, artist and where the song sits in its canzoniere. */
export function SongHeading({ series }: { series: { position: number; total: number } | null }) {
  const { song, deleted } = useSong()

  return (
    <header className="mb-5 border-b pb-4" style={{ borderColor: 'var(--line)' }}>
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{song.title}</h1>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted">
        {song.artist !== null && <span>{song.artist}</span>}
        <CanzonierePicker songSlug={song.slug} />
        {series !== null && (
          <span className="text-faint">
            {series.position} di {series.total}
          </span>
        )}
      </p>

      {/*
        * Said only when the server has answered that the row is gone — never
        * because it could not be reached, which is the ordinary state offline.
        */}
      {deleted && (
        <p className="notice notice-accent mt-3" role="status">
          Questo brano è stato eliminato. Resta leggibile qui, ma sparirà dall’elenco.
        </p>
      )}
    </header>
  )
}

export function LiveSheet() {
  const { song, parsed } = useSong()
  return <SongSheet song={parsed} originalKey={song.originalKey} />
}

/** The key the bar transposes from is the song's, so it follows an edited key. */
export function LiveControlBar() {
  const { song } = useSong()
  return <ControlBar originalKey={song.originalKey} />
}
