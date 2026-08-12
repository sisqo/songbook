'use client'

import { usePrefs } from '@/components/PrefsProvider'
import { INSTRUMENTS, INSTRUMENT_LABEL } from '@/lib/music/shapes'

/**
 * Guitar or ukulele.
 *
 * It changes the shapes, not the chords: a C is a C either way, so nothing on the
 * sheet moves — what changes is the diagram you get when you tap one, and the strings
 * it is drawn on. That is also why this is not next to the notation in the reading
 * panel: it is answered once, for every song, like the theme.
 *
 * Unlike the theme it is a preference about the reader rather than about the screen,
 * so it goes to the database with the notation and the zoom and follows you to the
 * other device.
 */
export function InstrumentPicker() {
  const { global, setInstrument } = usePrefs()

  return (
    <div className="px-1.5 pb-1 pt-2">
      <span className="group-label mb-1.5">Instrument</span>

      <span className="segment w-full" role="group" aria-label="Instrument for chord shapes">
        {INSTRUMENTS.map((entry) => (
          <button
            key={entry}
            type="button"
            className={
              entry === global.instrument ? 'segment-button is-on flex-1' : 'segment-button flex-1'
            }
            aria-pressed={entry === global.instrument}
            onClick={() => setInstrument(entry)}
          >
            {INSTRUMENT_LABEL[entry]}
          </button>
        ))}
      </span>
    </div>
  )
}
