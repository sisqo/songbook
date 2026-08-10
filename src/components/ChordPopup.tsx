'use client'

import { useEffect } from 'react'

import { ChordDiagram } from '@/components/ChordDiagram'
import { IconClose } from '@/components/icons'
import { type Chord, type Notation, formatChord } from '@/lib/music/chord'
import { noteToItalian } from '@/lib/music/notes'
import { chordNoteNames, shapeFor } from '@/lib/music/shapes'

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
  onClose,
}: {
  chord: Chord
  notation: Notation
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const shape = shapeFor(chord)
  const notes = chordNoteNames(chord).map((note) =>
    notation === 'it' ? noteToItalian(note) : note,
  )

  return (
    <div className="chord-overlay" role="dialog" aria-modal="true" aria-label="Forma dell'accordo">
      <div className="chord-backdrop" onClick={onClose} aria-hidden />

      <div className="chord-card">
        <button type="button" className="chord-close" onClick={onClose} aria-label="Chiudi">
          <IconClose size={18} />
        </button>

        <p className="chord-name">{formatChord(chord, notation)}</p>

        {shape === null ? (
          <p className="mt-1 text-sm text-muted">Nessuna forma disponibile per questo accordo.</p>
        ) : (
          <ChordDiagram shape={shape} />
        )}

        <p className="chord-notes">{notes.join(' · ')}</p>

        {shape?.simplified === true && (
          <p className="mt-2 text-xs text-faint">
            Forma semplificata: contiene solo note dell&apos;accordo, ma non tutte quelle scritte.
          </p>
        )}

        {chord.bassName !== null && (
          <p className="mt-2 text-xs text-faint">
            Basso {notation === 'it' ? noteToItalian(chord.bassName) : chord.bassName}, da suonare
            sotto questa forma.
          </p>
        )}
      </div>
    </div>
  )
}
