'use client'

import { useMemo } from 'react'

import { usePrefs } from '@/components/PrefsProvider'
import { IconPause, IconPlay } from '@/components/icons'
import { formatKey } from '@/lib/music/chord'
import { C_MAJOR, parseKey, transposeKey } from '@/lib/music/notes'
import { SCROLL_SPEEDS, ZOOM_STEPS } from '@/lib/prefs/types'
import { useAutoScroll } from '@/lib/useAutoScroll'

/**
 * The reading controls, fixed to the bottom of the screen.
 *
 * Everything used while playing is one tap away and always visible: stopping the
 * scroll or moving up a semitone must never cost hunting through a menu. Notation
 * lives here as a plain toggle rather than behind an overflow menu, which is a
 * small departure from the plan — one tap and no popover to manage.
 *
 * The clusters wrap onto a second line below ~480px rather than scrolling
 * sideways: on a phone in one hand, a control that has scrolled out of view is a
 * control you cannot reach. Their order decides where the line breaks — scroll,
 * speed and key stay together on the first row, because those are the ones
 * touched while playing; zoom and notation, set once and left alone, drop below.
 */
export function ControlBar({ originalKey }: { originalKey: string | null }) {
  const { global, song, pending, setZoomStep, setNotation, setSemitones, setScrollSpeed } =
    usePrefs()
  const { running, toggle } = useAutoScroll(song.scrollSpeed)

  const keys = useMemo(() => {
    const base = parseKey(originalKey) ?? C_MAJOR
    return {
      current: formatKey(transposeKey(base, song.semitones), global.notation),
      original: formatKey(base, global.notation),
    }
  }, [originalKey, song.semitones, global.notation])

  return (
    <nav className="control-bar" aria-label="Controlli di lettura">
      <div className="control-cluster">
        <button
          type="button"
          className={running ? 'control-button control-play is-active' : 'control-button control-play'}
          onClick={toggle}
          aria-pressed={running}
          aria-label={running ? 'Ferma lo scorrimento' : 'Avvia lo scorrimento'}
        >
          {running ? <IconPause size={16} /> : <IconPlay size={16} />}
        </button>

        <div className="segment">
          <button
            type="button"
            className="control-button"
            onClick={() => setScrollSpeed(song.scrollSpeed - 1)}
            disabled={song.scrollSpeed === 0}
            aria-label="Rallenta lo scorrimento"
          >
            <span aria-hidden>−</span>
          </button>

          <div
            className="speed-dots"
            role="img"
            aria-label={`Velocità ${song.scrollSpeed + 1} di ${SCROLL_SPEEDS.length}`}
          >
            {SCROLL_SPEEDS.map((_, index) => (
              <span
                key={index}
                className={index <= song.scrollSpeed ? 'speed-dot is-on' : 'speed-dot'}
              />
            ))}
          </div>

          <button
            type="button"
            className="control-button"
            onClick={() => setScrollSpeed(song.scrollSpeed + 1)}
            disabled={song.scrollSpeed === SCROLL_SPEEDS.length - 1}
            aria-label="Accelera lo scorrimento"
          >
            <span aria-hidden>+</span>
          </button>
        </div>
      </div>

      <div className="control-cluster">
        <div className="segment">
          <button
            type="button"
            className="control-button"
            onClick={() => setSemitones(song.semitones - 1)}
            aria-label="Abbassa di un semitono"
          >
            <span aria-hidden>−1</span>
          </button>

          <button
            type="button"
            className="control-button control-readout"
            onClick={() => setSemitones(0)}
            disabled={song.semitones === 0}
            aria-label={
              song.semitones === 0
                ? `Tonalità ${keys.current}, originale`
                : `Tonalità ${keys.current}, originale ${keys.original}. Torna all'originale`
            }
          >
            <strong>{keys.current}</strong>
            <span>{song.semitones === 0 ? 'originale' : `orig. ${keys.original}`}</span>
          </button>

          <button
            type="button"
            className="control-button"
            onClick={() => setSemitones(song.semitones + 1)}
            aria-label="Alza di un semitono"
          >
            <span aria-hidden>+1</span>
          </button>
        </div>

        {/* A queued change is visible, so nothing is ever lost in silence. */}
        {pending > 0 && (
          <span
            className="pending-dot"
            role="status"
            aria-label="Modifica non ancora salvata: verrà salvata al ritorno della rete"
            title="Non salvato"
          />
        )}
      </div>

      <div className="control-cluster">
        <div className="segment">
          <button
            type="button"
            className="control-button"
            onClick={() => setZoomStep(global.zoomStep - 1)}
            disabled={global.zoomStep === 0}
            aria-label="Riduci il testo"
          >
            <span aria-hidden>A−</span>
          </button>
          <button
            type="button"
            className="control-button"
            onClick={() => setZoomStep(global.zoomStep + 1)}
            disabled={global.zoomStep === ZOOM_STEPS.length - 1}
            aria-label="Ingrandisci il testo"
          >
            <span aria-hidden>A+</span>
          </button>
        </div>

        <button
          type="button"
          className="control-button"
          onClick={() => setNotation(global.notation === 'it' ? 'int' : 'it')}
          aria-label={
            global.notation === 'it'
              ? 'Notazione italiana, passa a internazionale'
              : 'Notazione internazionale, passa a italiana'
          }
        >
          <span aria-hidden>{global.notation === 'it' ? 'Do' : 'C'}</span>
        </button>
      </div>
    </nav>
  )
}
