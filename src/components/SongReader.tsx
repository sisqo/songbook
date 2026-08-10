import Link from 'next/link'

import { CanzoniereProvider } from '@/components/CanzoniereProvider'
import { CanzonierePicker } from '@/components/CanzonierePicker'
import { ControlBar } from '@/components/ControlBar'
import { PrefsProvider } from '@/components/PrefsProvider'
import { SongEditor } from '@/components/SongEditor'
import { SongSheet } from '@/components/SongSheet'
import { TopBar } from '@/components/TopBar'
import { IconChevronLeft, IconChevronRight } from '@/components/icons'
import type { CanzoniereState } from '@/lib/canzonieri/types'
import { parseChordPro } from '@/lib/chordpro'
import { type Song, repository } from '@/lib/data'

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
 *
 * The header carries the return link instead of the page repeating it below, so
 * the screen spends one row on navigation rather than two: vertical space here is
 * the product.
 */
export async function SongReader({
  song,
  setlist,
}: {
  song: Song
  setlist?: SetlistContext | null
}) {
  const parsed = parseChordPro(song.body)
  const canzonieri = await repository.listCanzonieri()

  const initial: CanzoniereState = {
    canzonieri,
    assignments: song.canzoniereSlug === null ? {} : { [song.slug]: song.canzoniereSlug },
  }

  return (
    <PrefsProvider songSlug={song.slug}>
      <CanzoniereProvider initial={initial} refreshOnMount={false}>
        <TopBar
          current={setlist ? 'scalette' : 'canzoni'}
          back={
            setlist
              ? {
                  href: `/scalette/${setlist.slug}`,
                  label: `${setlist.name} · ${setlist.position} di ${setlist.total}`,
                }
              : { href: '/', label: 'Tutte le canzoni' }
          }
        />

        <main className="mx-auto max-w-3xl px-4 pt-4">
          <header className="mb-5 border-b pb-4" style={{ borderColor: 'var(--line)' }}>
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">
              {song.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted">
              {song.artist !== null && <span>{song.artist}</span>}
              <CanzonierePicker songSlug={song.slug} />
            </p>
          </header>

          <SongSheet song={parsed} originalKey={song.originalKey} />

          {setlist && (
            <nav
              className="mt-10 flex items-stretch justify-between gap-3 border-t pt-4 text-sm"
              style={{ borderColor: 'var(--line)' }}
              aria-label="Navigazione nella scaletta"
            >
              {setlist.previous ? (
                <Link href={`/scalette/${setlist.slug}/${setlist.previous.slug}`} className="card flex-1 px-4 py-3">
                  <span className="flex items-center gap-1 text-faint">
                    <IconChevronLeft size={14} />
                    Precedente
                  </span>
                  <span className="mt-0.5 block font-medium">{setlist.previous.title}</span>
                </Link>
              ) : (
                <span className="flex-1" />
              )}

              {setlist.next ? (
                <Link
                  href={`/scalette/${setlist.slug}/${setlist.next.slug}`}
                  className="card flex-1 px-4 py-3 text-end"
                >
                  <span className="flex items-center justify-end gap-1 text-faint">
                    Successiva
                    <IconChevronRight size={14} />
                  </span>
                  <span className="mt-0.5 block font-medium">{setlist.next.title}</span>
                </Link>
              ) : (
                <span className="flex-1" />
              )}
            </nav>
          )}

          <SongEditor song={song} canzonieri={canzonieri} />

          <div className="bar-spacer" />
        </main>

        <ControlBar originalKey={song.originalKey} />
      </CanzoniereProvider>
    </PrefsProvider>
  )
}
