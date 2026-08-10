'use client'

import { Fragment, useMemo, useState } from 'react'

import { ChordPopup } from '@/components/ChordPopup'
import { usePrefs } from '@/components/PrefsProvider'
import type { Line, ParsedSong } from '@/lib/chordpro'
import { type Chord, type Notation, formatChord, parseChord, transposeChord } from '@/lib/music/chord'
import { type Key, C_MAJOR, parseKey, transposeKey } from '@/lib/music/notes'
import { ZOOM_STEPS } from '@/lib/prefs/types'

const BLANK = ' '

/**
 * Renders the sheet: chords above the syllable they belong to.
 *
 * The markup is what makes wrapping safe. Each word is one inline-block that
 * never breaks internally, and a real space sits between words — JSX drops
 * whitespace between elements on separate lines, so the space has to be written
 * explicitly or the words run together and the line stops wrapping at all.
 *
 * A chord is a button, so tapping it shows its shape. The button carries exactly
 * the box the span carried: no padding of its own, no border, and the font
 * inherited rather than the one browsers give buttons — anything else would move
 * where the lines wrap.
 *
 * In a song with chords, every line keeps the chord row above it whether it has
 * chords or not, so the spacing between lines is even.
 */
export function SongSheet({ song, originalKey }: { song: ParsedSong; originalKey: string | null }) {
  const { global, song: songPrefs } = usePrefs()
  const [shown, setShown] = useState<Chord | null>(null)

  const currentKey = useMemo(
    () => transposeKey(parseKey(originalKey) ?? C_MAJOR, songPrefs.semitones),
    [originalKey, songPrefs.semitones],
  )

  /**
   * Whether to leave room for chords above every line, decided for the whole song
   * rather than line by line.
   *
   * Per line, the lines without chords closed up against the ones above them and
   * the spacing came out ragged. Per song, every line in a song that has chords
   * sits on the same rhythm — and a song with no chords at all stays compact
   * instead of carrying an empty row above each line for nothing.
   */
  const roomForChords = useMemo(
    () =>
      song.sections.some((section) =>
        section.lines.some((line) => line.kind === 'lyrics' && line.hasChords),
      ),
    [song],
  )

  return (
    <>
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
                roomForChords={roomForChords}
                onPick={setShown}
              />
            ))}
          </section>
        ))}
      </div>

      {shown !== null && (
        <ChordPopup chord={shown} notation={global.notation} onClose={() => setShown(null)} />
      )}
    </>
  )
}

function SheetLine({
  line,
  semitones,
  notation,
  currentKey,
  roomForChords,
  onPick,
}: {
  line: Line
  semitones: number
  notation: Notation
  currentKey: Key
  roomForChords: boolean
  onPick: (chord: Chord) => void
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
                {roomForChords && (
                  <SheetChord
                    raw={part.chord}
                    semitones={semitones}
                    notation={notation}
                    currentKey={currentKey}
                    onPick={onPick}
                  />
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

/**
 * One chord slot above a syllable.
 *
 * Three cases share one box: nothing to show, a token that is not really a chord
 * — `[x2]`, `[assolo]` — and a chord. Only the last is a button; the others stay
 * inert text so nothing unhelpful ends up in the tab order.
 */
function SheetChord({
  raw,
  semitones,
  notation,
  currentKey,
  onPick,
}: {
  raw: string | null
  semitones: number
  notation: Notation
  currentKey: Key
  onPick: (chord: Chord) => void
}) {
  if (raw === null) {
    return (
      <span className="sheet-chord" aria-hidden>
        {BLANK}
      </span>
    )
  }

  const parsed = parseChord(raw)
  if (parsed === null) return <span className="sheet-chord">{raw}</span>

  const chord = transposeChord(parsed, semitones, currentKey)
  const label = formatChord(chord, notation)

  return (
    <button
      type="button"
      className="sheet-chord"
      onClick={() => onPick(chord)}
      aria-label={`${label}, mostra la forma`}
    >
      {label}
    </button>
  )
}
