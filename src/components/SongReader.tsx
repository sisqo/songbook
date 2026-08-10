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

interface Neighbour {
  slug: string
  title: string
}

export interface SetlistContext {
  slug: string
  name: string
  /** One-based position of this song in the setlist. */
  position: number
  total: number
  previous: Neighbour | null
  next: Neighbour | null
}

/** Where a song sits among the others of its canzoniere. */
interface Series {
  name: string
  position: number
  total: number
  previous: Neighbour | null
  next: Neighbour | null
}

/**
 * The songs of this song's canzoniere, in the order the list has them.
 *
 * Built from the same build-time data as everything else on this page, on
 * purpose: the assignment can change in the database afterwards, and then the
 * header picker will show the new canzoniere while these neighbours still belong
 * to the old one — exactly as stale as the rest of the site, until a publish.
 * Wiring this to the live provider instead would make one strip of the page
 * disagree with the pages it links to.
 */
async function seriesFor(song: Song): Promise<Series | null> {
  const [songs, canzonieri] = await Promise.all([
    repository.listSongs(),
    repository.listCanzonieri(),
  ])

  const siblings = songs.filter((entry) => entry.canzoniereSlug === song.canzoniereSlug)
  if (siblings.length < 2) return null

  const index = siblings.findIndex((entry) => entry.slug === song.slug)
  if (index === -1) return null

  const at = (position: number): Neighbour | null => {
    const found = siblings[position]
    return found === undefined ? null : { slug: found.slug, title: found.title }
  }

  const name =
    song.canzoniereSlug === null
      ? 'Senza canzoniere'
      : (canzonieri.find((entry) => entry.slug === song.canzoniereSlug)?.name ?? 'Canzoniere')

  return {
    name,
    position: index + 1,
    total: siblings.length,
    previous: at(index - 1),
    next: at(index + 1),
  }
}

/**
 * The reading shell, shared by the standalone song route and the setlist route.
 *
 * The ChordPro is parsed here, on the server, so the parse happens once at build
 * time and the client only ever formats an already-structured song.
 *
 * The header carries the return link instead of the page repeating it below, so
 * the screen spends one row on navigation rather than two: vertical space here is
 * the product. It also carries the two arrows, because since the home page stopped
 * listing songs those arrows are how the rest of a canzoniere is reached.
 *
 * Inside a setlist the setlist wins: stepping through it is why you opened it.
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
  const series = setlist ? null : await seriesFor(song)

  const initial: CanzoniereState = {
    canzonieri,
    assignments: song.canzoniereSlug === null ? {} : { [song.slug]: song.canzoniereSlug },
  }

  const steps = setlist
    ? {
        previous: setlist.previous && `/scalette/${setlist.slug}/${setlist.previous.slug}`,
        next: setlist.next && `/scalette/${setlist.slug}/${setlist.next.slug}`,
      }
    : {
        previous: series?.previous ? `/canzoni/${series.previous.slug}` : null,
        next: series?.next ? `/canzoni/${series.next.slug}` : null,
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
          steps={steps}
        />

        <main className="mx-auto max-w-3xl px-4 pt-4">
          <header className="mb-5 border-b pb-4" style={{ borderColor: 'var(--line)' }}>
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">
              {song.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted">
              {song.artist !== null && <span>{song.artist}</span>}
              <CanzonierePicker songSlug={song.slug} />
              {series !== null && (
                <span className="text-faint">
                  {series.position} di {series.total}
                </span>
              )}
            </p>
          </header>

          <SongSheet song={parsed} originalKey={song.originalKey} />

          {setlist && (
            <StepNav
              label="Navigazione nella scaletta"
              previous={setlist.previous}
              next={setlist.next}
              href={(slug) => `/scalette/${setlist.slug}/${slug}`}
            />
          )}

          {series && (
            <StepNav
              label={`Navigazione in ${series.name}`}
              previous={series.previous}
              next={series.next}
              href={(slug) => `/canzoni/${slug}`}
            />
          )}

          <SongEditor song={song} canzonieri={canzonieri} />

          <div className="bar-spacer" />
        </main>

        <ControlBar originalKey={song.originalKey} />
      </CanzoniereProvider>
    </PrefsProvider>
  )
}

/** The previous and next song, as two cards under the sheet. */
function StepNav({
  label,
  previous,
  next,
  href,
}: {
  label: string
  previous: Neighbour | null
  next: Neighbour | null
  href: (slug: string) => string
}) {
  return (
    <nav
      className="mt-10 flex items-stretch justify-between gap-3 border-t pt-4 text-sm"
      style={{ borderColor: 'var(--line)' }}
      aria-label={label}
    >
      {previous ? (
        <Link href={href(previous.slug)} className="card min-w-0 flex-1 px-4 py-3">
          <span className="flex items-center gap-1 text-faint">
            <IconChevronLeft size={14} />
            Precedente
          </span>
          <span className="mt-0.5 block truncate font-medium">{previous.title}</span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}

      {next ? (
        <Link href={href(next.slug)} className="card min-w-0 flex-1 px-4 py-3 text-end">
          <span className="flex items-center justify-end gap-1 text-faint">
            Successiva
            <IconChevronRight size={14} />
          </span>
          <span className="mt-0.5 block truncate font-medium">{next.title}</span>
        </Link>
      ) : (
        <span className="flex-1" />
      )}
    </nav>
  )
}
