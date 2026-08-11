import Link from 'next/link'

import { LiveControlBar, LiveSheet, SongHeading } from '@/components/LiveSong'
import { PrefsProvider } from '@/components/PrefsProvider'
import { SongProvider } from '@/components/SongProvider'
import { TopBar } from '@/components/TopBar'
import { IconPencil } from '@/components/icons'
import { parseChordPro } from '@/lib/chordpro'
import { type Song, repository } from '@/lib/data'

export interface SetlistContext {
  slug: string
  name: string
  /** One-based position of this song in the setlist. */
  position: number
  total: number
  /** Slugs only: the header arrows need somewhere to go, not something to say. */
  previous: string | null
  next: string | null
}

/** Where a song sits among the others of its canzoniere. */
interface Series {
  name: string
  position: number
  total: number
  previous: string | null
  next: string | null
}

/**
 * The songs of this song's canzoniere, in the order the list has them.
 *
 * Built from build-time data, unlike the song's own words, which are refreshed
 * from the database as soon as the page opens. The difference is deliberate: these
 * arrows lead to other static pages, and each of those was generated with the same
 * list this one was. Reading the live assignment here would point the arrows at
 * songs whose own pages still think they belong somewhere else.
 *
 * So the neighbours are as stale as the pages they lead to — which is the only way
 * for them to agree — while what you are reading is not.
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

  const at = (position: number): string | null => siblings[position]?.slug ?? null

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
 * Stepping to the next song happens in the header and nowhere else. There used to be
 * two cards for it at the foot of the sheet as well, which meant the same two
 * destinations twice on one screen — and the copy at the bottom was the one you had
 * to scroll a whole song to reach, while the arrows are in reach the entire time.
 * They also cost two extra queries per page at build time, to fetch titles nobody
 * needs now.
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
  const series = setlist ? null : await seriesFor(song)

  const steps = setlist
    ? {
        previous: setlist.previous && `/scalette/${setlist.slug}/${setlist.previous}`,
        next: setlist.next && `/scalette/${setlist.slug}/${setlist.next}`,
      }
    : {
        previous: series?.previous ? `/canzoni/${series.previous}` : null,
        next: series?.next ? `/canzoni/${series.next}` : null,
      }

  return (
    <PrefsProvider songSlug={song.slug}>
      {/*
        * Keyed by slug: stepping to the next song lands on the same component in
        * the same place, and without a key React would keep the previous song's
        * state and show its words under the new title.
        */}
      <SongProvider key={song.slug} baked={song} bakedParsed={parsed}>
        <TopBar
          current={setlist ? 'scalette' : 'canzoni'}
          /*
            * Only inside a setlist, where going back means the setlist and not
            * the whole repertoire. On its own a song needs no return link: the
            * brand next to it already leads to the list of everything.
            *
            * The name alone, without the position it used to carry: with the brand
            * back in the bar there is no room for both, and a truncating chip cut
            * the number rather than the name. The position is under the title now,
            * where it is never abbreviated.
            */
          back={setlist ? { href: `/scalette/${setlist.slug}`, label: setlist.name } : undefined}
          steps={steps}
        />

        {/*
          * The sheet is a card that runs off the bottom of the screen, so
          * everything that belongs to the song is inside it: the title, the words,
          * the way to the next song, and the way into the editor. Nothing sits on
          * the page beside it — a second surface next to the one you are reading
          * would be a second thing to look at.
          */}
        <main className="song-card">
          <SongHeading
            place={
              setlist
                ? { position: setlist.position, total: setlist.total, within: setlist.name }
                : series === null
                  ? null
                  : { position: series.position, total: series.total, within: series.name }
            }
          />

          <LiveSheet />

          {/*
            * A link, not a form: the editor is a page of its own, and two ways to
            * change a song would be two things to keep in step. It needs a network
            * to save, so it needs one to open.
            */}
          <div className="mt-10 border-t pt-4" style={{ borderColor: 'var(--surface-2)' }}>
            <Link href={`/canzoni/${song.slug}/modifica`} className="btn is-inset">
              <IconPencil size={16} />
              Modifica
            </Link>
          </div>

          <div className="bar-spacer" />
        </main>

        <LiveControlBar />
      </SongProvider>
    </PrefsProvider>
  )
}
