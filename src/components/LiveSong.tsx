'use client'

/**
 * The parts of the reading page that have to follow the song rather than the page.
 *
 * Each is a few lines around a component that still takes plain props, so the
 * pieces themselves stay testable and reusable — the preview inside the editing
 * form renders the same sheet with no provider anywhere near it.
 */

import { ControlBar } from '@/components/ControlBar'
import { usePrefs } from '@/components/PrefsProvider'
import { SongSheet } from '@/components/SongSheet'
import { useSong } from '@/components/SongProvider'
import { IconNote } from '@/components/icons'
import { chordTokens } from '@/lib/chordpro'

/**
 * Where this song sits in the sequence it is being read in.
 *
 * `within` names that sequence. It used to be left unset when the song was read
 * from a canzoniere, because the chip beside it already named one and "1 di 12"
 * between the two would have looked like it belonged to the chip. That chip is
 * gone, so the name has nowhere else to be said and this is where it is said.
 */
export interface Place {
  position: number
  total: number
  within: string | null
}

/**
 * Title, artist, and where the song sits in whatever led here.
 *
 * No rule under it any more. The title sits on the same sheet as the words and is
 * the first thing on it, so a line drawn between them was separating a song from
 * itself; the space does the work.
 */
export function SongHeading({ place }: { place: Place | null }) {
  const { song, deleted } = useSong()

  return (
    <header className="mb-4">
      <h1 className="text-[1.6875rem] font-medium leading-[1.12] tracking-[-0.03em]">
        {song.title}
      </h1>
      <p className="mt-2.5 flex flex-wrap items-center gap-2 text-base text-muted">
        {song.artist !== null && <span>{song.artist}</span>}
        {place !== null && (
          <span className="text-faint">
            {place.position} di {place.total}
            {place.within !== null && ` in ${place.within}`}
          </span>
        )}
      </p>

      <CapoNote />

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

/**
 * That there is a capo on, and therefore that the chords are shapes.
 *
 * The one thing on this screen that has to be here rather than in the reading panel:
 * the panel is shut almost all the time, and a capo kept from yesterday renames every
 * chord on the page. Without this line the sheet would say Do where it said Re and
 * nothing would explain why — the sort of silent surprise this app avoids elsewhere.
 *
 * It no longer names the key that comes out, because nothing on this screen names a
 * key any more. What it has to say is the half that was doing the work: the letters
 * below are what the hand does, and the capo accounts for the difference.
 *
 * Nothing at all when there is no capo, because then there is nothing to explain.
 */
function CapoNote() {
  const { song: prefs } = usePrefs()

  if (prefs.capo === 0) return null

  return (
    <p className="capo-note mt-2.5">
      <IconNote size={13} />
      capotasto {prefs.capo}° tasto · gli accordi sono già quelli da fare
    </p>
  )
}

export function LiveSheet() {
  const { parsed } = useSong()
  return <SongSheet song={parsed} />
}

/**
 * The chords are handed to the bar because a capo worth suggesting depends on which
 * chords the song actually holds — and they come from the live copy, so a chord added
 * in the editor counts the moment it is saved.
 */
export function LiveControlBar() {
  const { parsed } = useSong()
  return <ControlBar chords={chordTokens(parsed)} />
}
