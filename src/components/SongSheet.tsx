'use client'

import { Fragment, useMemo, useState } from 'react'

import { ChordDiagram } from '@/components/ChordDiagram'
import { ChordPopup } from '@/components/ChordPopup'
import { usePrefs } from '@/components/PrefsProvider'
import { type Line, type ParsedSong, chordTokens } from '@/lib/chordpro'
import { type Chord, type Notation, formatChord, parseChord, transposeChord } from '@/lib/music/chord'
import { readKey, readShift } from '@/lib/music/capo'
import { estimateKey } from '@/lib/music/key'
import { type Key, C_MAJOR } from '@/lib/music/notes'
import { type Instrument, shapeFor } from '@/lib/music/shapes'
import { type ChordDisplay, ZOOM_STEPS } from '@/lib/prefs/types'

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
export function SongSheet({ song }: { song: ParsedSong }) {
  const { global, song: songPrefs } = usePrefs()
  const [shown, setShown] = useState<Chord | null>(null)

  /*
   * The key the song is written in, read off its own chords.
   *
   * Nothing stores this and nothing shows it. It exists for one decision: moved chords
   * have to be spelled either sharp or flat, and the key they land in is what settles
   * that — so a song in Bb transposed up gets `Ab`, not `G#`. Memoised on the song
   * rather than on the shift, because the written key does not move when the reader does.
   */
  const written = useMemo(() => estimateKey(chordTokens(song)) ?? C_MAJOR, [song])

  /*
   * The key whose letters go on the page, which is not always the key that sounds.
   *
   * Transposing moves both; a capo moves only this one, downwards, because the shapes
   * you finger behind a capo are lower than what comes out of the instrument — see
   * `lib/music/capo.ts`, where the two shifts are named and tested.
   */
  const shift = readShift(songPrefs.semitones, songPrefs.capo)
  const currentKey = useMemo(
    () => readKey(written, songPrefs.semitones, songPrefs.capo),
    [written, songPrefs.semitones, songPrefs.capo],
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
                shift={shift}
                notation={global.notation}
                chordDisplay={global.chordDisplay}
                instrument={global.instrument}
                capo={songPrefs.capo}
                currentKey={currentKey}
                roomForChords={roomForChords}
                onPick={setShown}
              />
            ))}
          </section>
        ))}
      </div>

      {shown !== null && (
        <ChordPopup
          chord={shown}
          notation={global.notation}
          instrument={global.instrument}
          capo={songPrefs.capo}
          onClose={() => setShown(null)}
        />
      )}
    </>
  )
}

function SheetLine({
  line,
  shift,
  notation,
  chordDisplay,
  instrument,
  capo,
  currentKey,
  roomForChords,
  onPick,
}: {
  line: Line
  /** Transposition and capo together: how far the written chords move to reach the page. */
  shift: number
  notation: Notation
  chordDisplay: ChordDisplay
  instrument: Instrument
  /** The fret the capo is on, for the shape's own capo bar — the shape unchanged, see `ChordDiagram`. */
  capo: number
  currentKey: Key
  roomForChords: boolean
  onPick: (chord: Chord) => void
}) {
  if (line.kind === 'comment') {
    return <p className="sheet-comment">{line.text}</p>
  }

  /*
   * Verbatim, in the app's own monospace — the same font the ChordPro editor
   * measures words in (`layout.tsx`'s own comment on `--font-mono`), not a
   * chord-notation matter: transposing moves a chord's name, not where a finger
   * sits on a fret, so a tab ignores `shift`/`notation`/`currentKey` entirely.
   */
  if (line.kind === 'tab') {
    return <pre className="sheet-tab">{line.rows.join('\n')}</pre>
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
                    shift={shift}
                    notation={notation}
                    chordDisplay={chordDisplay}
                    instrument={instrument}
                    capo={capo}
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
  shift,
  notation,
  chordDisplay,
  instrument,
  capo,
  currentKey,
  onPick,
}: {
  raw: string | null
  shift: number
  notation: Notation
  chordDisplay: ChordDisplay
  instrument: Instrument
  capo: number
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

  const chord = transposeChord(parsed, shift, currentKey)
  const label = formatChord(chord, notation)

  /*
   * Falls back to the name whenever there is no shape to draw — an exotic suffix
   * outside the table (`shapeFor`'s own comment) — rather than tapping leading
   * nowhere: the button still opens `ChordPopup`, which says as much on its own.
   */
  const shape = chordDisplay === 'shape' ? shapeFor(chord, instrument) : null

  return (
    <button
      type="button"
      className="sheet-chord"
      onClick={() => onPick(chord)}
      aria-label={shape !== null ? `${label}, tap for the fingering` : `${label}, show the shape`}
    >
      {shape !== null ? (
        <ChordDiagram shape={shape} capo={capo} className="sheet-chord-shape" />
      ) : (
        label
      )}
    </button>
  )
}
