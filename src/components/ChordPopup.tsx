'use client'

import { useEffect } from 'react'

import { ChordDiagram } from '@/components/ChordDiagram'
import { IconClose } from '@/components/icons'
import { type Chord, type Notation, formatChord } from '@/lib/music/chord'
import { noteToItalian } from '@/lib/music/notes'
import { type Instrument, chordNoteNames, shapeFor } from '@/lib/music/shapes'

/**
 * The shape of the chord you tapped.
 *
 * Shows the chord as it is currently displayed — transposed, in the reader's
 * notation — because that is the chord to play, not the one the file was written
 * with. When the suffix is outside the table there is still something useful to
 * say, so the notes are always listed and the diagram is what may be missing.
 */
export function ChordPopup({
  chord,
  notation,
  instrument,
  capo,
  onClose,
}: {
  chord: Chord
  notation: Notation
  /** Whose fingerings to draw. The chord itself is the same on either. */
  instrument: Instrument
  /** The fret the capo is on: the shape is the same, but it starts from there. */
  capo: number
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const shape = shapeFor(chord, instrument)
  const notes = chordNoteNames(chord).map((note) =>
    notation === 'it' ? noteToItalian(note) : note,
  )

  return (
    <div className="chord-overlay" role="dialog" aria-modal="true" aria-label="Chord shape">
      <div className="chord-backdrop" onClick={onClose} aria-hidden />

      <div className="chord-card">
        <button type="button" className="chord-close" onClick={onClose} aria-label="Close">
          <IconClose size={18} />
        </button>

        <p className="chord-name">{formatChord(chord, notation)}</p>

        {shape === null ? (
          <p className="mt-1 text-sm text-muted">
            {instrument === 'ukulele'
              ? 'No shape for this chord on four strings.'
              : 'No shape available for this chord.'}
          </p>
        ) : (
          <ChordDiagram shape={shape} capo={capo} />
        )}

        <p className="chord-notes">{notes.join(' · ')}</p>

        {shape?.simplified === true && (
          <p className="mt-2 text-xs text-muted">
            Simplified shape: contains only notes of the chord, not all the ones written.
          </p>
        )}

        {chord.bassName !== null && (
          <p className="mt-2 text-xs text-muted">
            Bass {notation === 'it' ? noteToItalian(chord.bassName) : chord.bassName}, to be
            played beneath this shape.
          </p>
        )}
      </div>
    </div>
  )
}
