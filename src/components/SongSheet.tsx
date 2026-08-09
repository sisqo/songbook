'use client'

import { Fragment, useMemo } from 'react'

import { usePrefs } from '@/components/PrefsProvider'
import type { Line, ParsedSong } from '@/lib/chordpro'
import { type Notation, renderChord } from '@/lib/music/chord'
import { type Key, C_MAJOR, parseKey, transposeKey } from '@/lib/music/notes'
import { ZOOM_STEPS } from '@/lib/prefs/types'

const BLANK = ' '

/**
 * Renders the sheet: chords above the syllable they belong to.
 *
 * The markup is what makes wrapping safe. Each word is one inline-block that
 * never breaks internally, and a real space sits between words — JSX drops
 * whitespace between elements on separate lines, so the space has to be written
 * explicitly or the words run together and the line stops wrapping at all.
 */
export function SongSheet({ song, originalKey }: { song: ParsedSong; originalKey: string | null }) {
  const { global, song: songPrefs } = usePrefs()

  const currentKey = useMemo(
    () => transposeKey(parseKey(originalKey) ?? C_MAJOR, songPrefs.semitones),
    [originalKey, songPrefs.semitones],
  )

  return (
    <div className="song-sheet" style={{ fontSize: `${ZOOM_STEPS[global.zoomStep]}px` }}>
      {song.sections.map((section, sectionIndex) => (
        <section key={sectionIndex} className={`sheet-section is-${section.kind}`}>
          {section.lines.map((line, lineIndex) => (
            <SheetLine
              key={lineIndex}
              line={line}
              semitones={songPrefs.semitones}
              notation={global.notation}
              currentKey={currentKey}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

function SheetLine({
  line,
  semitones,
  notation,
  currentKey,
}: {
  line: Line
  semitones: number
  notation: Notation
  currentKey: Key
}) {
  if (line.kind === 'comment') {
    return <p className="sheet-comment">{line.text}</p>
  }

  return (
    <p className="sheet-line">
      {line.words.map((word, wordIndex) => (
        <Fragment key={wordIndex}>
          {/* The one break opportunity in the line: between words, never inside. */}
          {wordIndex > 0 && ' '}
          <span className="sheet-word">
            {word.parts.map((part, partIndex) => (
              <span key={partIndex} className="sheet-part">
                {line.hasChords && (
                  <span className="sheet-chord" aria-hidden={part.chord === null}>
                    {part.chord === null
                      ? BLANK
                      : renderChord(part.chord, semitones, notation, currentKey)}
                  </span>
                )}
                <span className="sheet-lyric">{part.text === '' ? BLANK : part.text}</span>
              </span>
            ))}
          </span>
        </Fragment>
      ))}
    </p>
  )
}
