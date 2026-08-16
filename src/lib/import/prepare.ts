/**
 * Turns one paste into the songs it holds, ready for the screen to show.
 *
 * The three guesses — where the songs are cut, what is chords and what is words,
 * which lines are a heading — happen here, once, and everything after this point
 * works on the result rather than on the text. That is what lets the screen show
 * what it understood *before* anything is saved, which is the only real defence
 * against a heuristic: not being right every time, but being visible when wrong.
 */

import { type InputFormat, convert } from './convert'
import { deduce } from './deduce'
import { splitSongs } from './split'

export interface PreparedSong {
  /** Stable through edits and removals, so React keeps each row's own state. */
  id: number
  title: string
  artist: string
  /** Comma-separated, as the fields hold them. */
  tags: string
  body: string
  format: InputFormat
  /**
   * The songbook the source claims, when it claims one.
   *
   * Not obeyed — the destination chosen on the screen is — but worth saying out
   * loud: re-importing an export means every song carries the filing it had, and
   * silently overruling all of it would be a surprise the next morning.
   */
  declares: string | null
  /**
   * The section it claims, when it claims one — obeyed, unlike `declares` above:
   * see `resolveSection`'s own comment on why a section name can win over the
   * chosen destination when a songbook name never does.
   */
  declaresSection: string | null
}

export function prepareSongs(text: string): PreparedSong[] {
  return splitSongs(text).map((piece, index) => {
    const converted = convert(piece)
    const found = deduce(converted.body)

    return {
      id: index,
      title: found.title,
      artist: found.artist ?? '',
      tags: found.tags.join(', '),
      body: found.body,
      format: converted.format,
      declares: found.songbookName,
      declaresSection: found.sectionName,
    }
  })
}
