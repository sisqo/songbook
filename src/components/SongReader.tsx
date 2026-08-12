import Link from 'next/link'

import { LiveControlBar, LiveSheet, SongHeading } from '@/components/LiveSong'
import { PrefsProvider } from '@/components/PrefsProvider'
import { SongProvider } from '@/components/SongProvider'
import { TopBar } from '@/components/TopBar'
import { IconPencil } from '@/components/icons'
import { parseChordPro } from '@/lib/chordpro'
import { type Song, repository } from '@/lib/data'

/** The canzoniere this song is in: where the header's way back leads. */
interface Home {
  slug: string
  name: string
}

/** Where a song sits among the others of its canzoniere. */
interface Series {
  position: number
  total: number
  previous: string | null
  next: string | null
}

/**
 * The canzoniere, and the song's place in it. Two answers, not one.
 *
 * They used to be computed together and returned as a single null-or-not, which was a
 * bug waiting for its first victim: a canzoniere holding one song has no sequence to
 * step through, and returning null for both would have taken away the way back as
 * well. The sequence needs two songs; the way back needs only a canzoniere.
 *
 * Both are built from build-time data, unlike the song's own words, which are refreshed
 * from the database as soon as the page opens. The difference is deliberate: these
 * arrows lead to other static pages, and each of those was generated from the same list
 * this one was. Reading the live assignment here would point the arrows at songs whose
 * own pages still think they belong somewhere else.
 *
 * So the neighbours are as stale as the pages they lead to — which is the only way for
 * them to agree — while what you are reading is not.
 */
async function placeOf(song: Song): Promise<{ home: Home | null; series: Series | null }> {
  if (song.canzoniereSlug === null) return { home: null, series: null }

  const [songs, canzonieri] = await Promise.all([
    repository.listSongs(),
    repository.listCanzonieri(),
  ])

  const found = canzonieri.find((entry) => entry.slug === song.canzoniereSlug)
  const home =
    found === undefined ? null : { slug: found.slug, name: found.name }

  const siblings = songs.filter((entry) => entry.canzoniereSlug === song.canzoniereSlug)
  const index = siblings.findIndex((entry) => entry.slug === song.slug)
  if (index === -1 || siblings.length < 2) return { home, series: null }

  const at = (position: number): string | null => siblings[position]?.slug ?? null

  return {
    home,
    series: {
      position: index + 1,
      total: siblings.length,
      previous: at(index - 1),
      next: at(index + 1),
    },
  }
}

/**
 * The reading shell.
 *
 * The ChordPro is parsed here, on the server, so the parse happens once at build
 * time and the client only ever formats an already-structured song.
 *
 * Stepping to the next song happens in the header and nowhere else. There used to be
 * two cards for it at the foot of the sheet as well, which meant the same two
 * destinations twice on one screen — and the copy at the bottom was the one you had
 * to scroll a whole song to reach, while the arrows are in reach the entire time.
 */
export async function SongReader({ song }: { song: Song }) {
  const parsed = parseChordPro(song.body)
  const { home, series } = await placeOf(song)

  return (
    <PrefsProvider songSlug={song.slug}>
      {/*
        * Keyed by slug: stepping to the next song lands on the same component in
        * the same place, and without a key React would keep the previous song's
        * state and show its words under the new title.
        */}
      <SongProvider key={song.slug} baked={song} bakedParsed={parsed}>
        <TopBar
          current="canzoni"
          /*
            * The way back to the canzoniere, which is not where the brand leads: the
            * brand goes to the list of canzonieri, one level above the one you came
            * from. A song with no canzoniere has nowhere in between, so it gets no
            * second link.
            */
          back={home === null ? undefined : { href: `/canzonieri/${home.slug}`, label: home.name }}
          steps={{
            previous: series?.previous ? `/canzoni/${series.previous}` : null,
            next: series?.next ? `/canzoni/${series.next}` : null,
          }}
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
              series === null || home === null
                ? null
                : { position: series.position, total: series.total, within: home.name }
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
