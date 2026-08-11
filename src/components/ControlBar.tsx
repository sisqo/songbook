'use client'

import { useEffect, useMemo, useState } from 'react'

import { usePrefs } from '@/components/PrefsProvider'
import {
  IconHare,
  IconPause,
  IconPlay,
  IconSliders,
  IconTurtle,
  IconUndo,
} from '@/components/icons'
import { type CapoOption, MAX_CAPO, readKey, suggestCapo } from '@/lib/music/capo'
import { formatKey } from '@/lib/music/chord'
import { C_MAJOR, parseKey } from '@/lib/music/notes'
import { SCROLL_SPEEDS, ZOOM_STEPS } from '@/lib/prefs/types'
import { useAutoScroll } from '@/lib/useAutoScroll'

/**
 * The reading controls, floating over the bottom of the song.
 *
 * One row, and only two things on it: play, and how fast the page moves. Those are
 * the ones a hand reaches for with a guitar in the other, and the eight controls
 * that used to sit here wrapped onto a second line on every phone.
 *
 * Everything else — the key, the notation, the size of the text — is set once
 * before the song starts and lives in a panel behind the last button. The cost is
 * named and accepted: with the panel closed, the bar no longer says which key you
 * are reading in. The sheet does, in the chords themselves.
 */
export function ControlBar({
  originalKey,
  chords = [],
}: {
  originalKey: string | null
  /**
   * Every chord token of the song, for the capo suggestion. Empty is a fine answer —
   * the suggestion then has nothing to say and says nothing.
   */
  chords?: string[]
}) {
  const {
    global,
    song,
    pending,
    setZoomStep,
    setNotation,
    setSemitones,
    setScrollSpeed,
    setCapo,
  } = usePrefs()
  const { running, toggle } = useAutoScroll(song.scrollSpeed)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  /*
   * The key the song was written in, named in the notation being read. Only the
   * original: what it has been moved to is on every chord of the sheet, and the
   * panel says the distance rather than repeating the destination.
   */
  const home = useMemo(
    () => formatKey(parseKey(originalKey) ?? C_MAJOR, global.notation),
    [originalKey, global.notation],
  )

  /*
   * What the shapes on the page are, once the capo has moved them. Named only when a
   * capo is on: without one it is the key every chord of the sheet already spells out.
   */
  const reading = useMemo(
    () =>
      formatKey(
        readKey(parseKey(originalKey) ?? C_MAJOR, song.semitones, song.capo),
        global.notation,
      ),
    [originalKey, song.semitones, song.capo, global.notation],
  )

  /*
   * Only while the panel is open, because that is the only place it is shown — and
   * because on a ukulele the answer is searched rather than looked up: about thirteen
   * thousand fingerings per chord, cached after the first time, but the first time is
   * 56 ms of one thread. Paying that when a panel is opened is fine; paying it on every
   * reading page, for something nobody is looking at, is not.
   */
  const suggestion = useMemo(
    () => (open ? suggestCapo(chords, song.semitones, song.capo, global.instrument) : null),
    [open, chords, song.semitones, song.capo, global.instrument],
  )

  const lastSpeed = SCROLL_SPEEDS.length - 1

  return (
    <nav className="control-bar" aria-label="Controlli di lettura">
      {/* Catches the tap that means "never mind". Inside the bar, so it does not
          count as the manual gesture that pauses the scroll. */}
      {open && <div className="menu-overlay" onClick={() => setOpen(false)} aria-hidden />}

      <div className="control-dock">
        {open && (
          <ReadingPanel
            home={home}
            reading={reading}
            semitones={song.semitones}
            capo={song.capo}
            suggestion={suggestion}
            notation={global.notation}
            zoomStep={global.zoomStep}
            setSemitones={setSemitones}
            setCapo={setCapo}
            setNotation={setNotation}
            setZoomStep={setZoomStep}
          />
        )}

        <button
          type="button"
          className="control-button control-play"
          onClick={toggle}
          aria-pressed={running}
          aria-label={running ? 'Ferma lo scorrimento' : 'Avvia lo scorrimento'}
        >
          {running ? <IconPause size={16} /> : <IconPlay size={16} />}
        </button>

        <div className="speed">
          <IconTurtle size={24} />
          <input
            type="range"
            className="speed-range"
            min={0}
            max={lastSpeed}
            step={1}
            value={song.scrollSpeed}
            onChange={(event) => setScrollSpeed(Number(event.target.value))}
            /*
             * The filled part of the track. Chrome will not paint it from the
             * value, and Firefox uses ::-moz-range-progress instead, so the number
             * is handed to CSS and each engine takes the half it understands.
             */
            style={{ '--fill': `${(song.scrollSpeed / lastSpeed) * 100}%` } as React.CSSProperties}
            aria-label="Velocità di scorrimento"
            aria-valuetext={`${song.scrollSpeed + 1} di ${SCROLL_SPEEDS.length}`}
          />
          <IconHare size={24} />
        </div>

        <button
          type="button"
          className="control-button control-open"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          /*
           * The unsaved change is named here rather than on the dot. A live region
           * nested inside a button is not something a reader reaching this control
           * would be told about — the button's own name is — so the dot is left as
           * the visual half and the words join the label.
           */
          aria-label={
            (open ? 'Chiudi accordi e testo' : 'Accordi e testo') +
            (pending > 0 ? ', modifica non ancora salvata' : '')
          }
        >
          <IconSliders size={20} />

          {/* A queued change is visible, so nothing is ever lost in silence. */}
          {pending > 0 && <span className="pending-dot" title="Non salvato" aria-hidden />}
        </button>
      </div>
    </nav>
  )
}

/**
 * How far the song has been moved from the key it was written in.
 *
 * Steps rather than the name of the key: the name is on every chord of the sheet
 * already, and what this row cannot show is how far from home you have gone.
 * The sign is the typographic minus, so it lines up with the buttons beside it.
 */
function formatSemitones(semitones: number): string {
  if (semitones === 0) return '0 semitoni'
  const sign = semitones > 0 ? '+' : '−'
  const size = Math.abs(semitones)
  return `${sign}${size} ${size === 1 ? 'semitono' : 'semitoni'}`
}

/**
 * What the song is read in, rather than how it is read: the key, the notation the
 * chords are named in, and how big the words are.
 *
 * Grouped by what they act on — the chords, then the text — because "notazione"
 * and "dimensione" are both settings of the same sheet and nothing else on the
 * screen says which part of it each one changes.
 */
function ReadingPanel({
  home,
  reading,
  semitones,
  capo,
  suggestion,
  notation,
  zoomStep,
  setSemitones,
  setCapo,
  setNotation,
  setZoomStep,
}: {
  /** The key the song was written in, for the label on the way back to it. */
  home: string
  /** The key the shapes on the page are in, which the capo moves and nothing else does. */
  reading: string
  semitones: number
  capo: number
  suggestion: CapoOption | null
  notation: 'it' | 'int'
  zoomStep: number
  setSemitones: (value: number) => void
  setCapo: (value: number) => void
  setNotation: (value: 'it' | 'int') => void
  setZoomStep: (value: number) => void
}) {
  return (
    <div className="control-panel">
      <span className="group-label">Accordi</span>

      <div className="control-row">
        <span className="control-name">
          <span className="control-name-label">Tonalità</span>
          <span className={semitones === 0 ? 'control-name-value' : 'control-name-value is-changed'}>
            {formatSemitones(semitones)}
          </span>
        </span>

        <span className="segment">
          <button
            type="button"
            className="segment-button"
            onClick={() => setSemitones(semitones - 1)}
            aria-label="Abbassa di un semitono"
          >
            <span aria-hidden>−1</span>
          </button>

          {/* The way back, as a symbol: inert while there is nothing to undo. */}
          <button
            type="button"
            className="segment-button"
            onClick={() => setSemitones(0)}
            disabled={semitones === 0}
            aria-label={`Torna alla tonalità originale, ${home}`}
            title={semitones === 0 ? undefined : `Torna a ${home}`}
          >
            <IconUndo size={15} />
          </button>

          <button
            type="button"
            className="segment-button"
            onClick={() => setSemitones(semitones + 1)}
            aria-label="Alza di un semitono"
          >
            <span aria-hidden>+1</span>
          </button>
        </span>
      </div>

      <div className="control-row">
        <span className="control-name">
          <span className="control-name-label">Capotasto</span>
          <span className={capo === 0 ? 'control-name-value' : 'control-name-value is-changed'}>
            {capo === 0 ? 'nessuno' : `${capo}° tasto · leggi in ${reading}`}
          </span>
        </span>

        <span className="segment">
          <button
            type="button"
            className="segment-button"
            onClick={() => setCapo(capo - 1)}
            disabled={capo === 0}
            aria-label="Abbassa il capotasto di un tasto"
          >
            <span aria-hidden>−</span>
          </button>

          <button
            type="button"
            className="segment-button"
            onClick={() => setCapo(0)}
            disabled={capo === 0}
            aria-label="Togli il capotasto"
            title={capo === 0 ? undefined : 'Togli il capotasto'}
          >
            <IconUndo size={15} />
          </button>

          <button
            type="button"
            className="segment-button"
            onClick={() => setCapo(capo + 1)}
            disabled={capo === MAX_CAPO}
            aria-label="Alza il capotasto di un tasto"
          >
            <span aria-hidden>+</span>
          </button>
        </span>
      </div>

      {/*
        * What a capo would do for the hands, when it would do something.
        *
        * A sentence and a button rather than an automatic move: the capo is the one
        * thing here that changes what the hands do, and the reader is the one holding
        * them. It disappears as soon as it has nothing left to offer.
        */}
      {suggestion !== null && (
        <div className="control-hint">
          <span>
            {suggestion.easy === suggestion.total
              ? `Col ${suggestion.fret}° tasto tutti gli accordi sono aperti.`
              : `Col ${suggestion.fret}° tasto ${suggestion.easy} accordi su ${suggestion.total} sono aperti.`}
          </span>
          <button type="button" className="btn btn-sm" onClick={() => setCapo(suggestion.fret)}>
            Metti
          </button>
        </div>
      )}

      <div className="control-row">
        <span className="control-name">
          <span className="control-name-label">Notazione</span>
        </span>

        <span className="segment" role="group" aria-label="Notazione degli accordi">
          <button
            type="button"
            className={notation === 'it' ? 'segment-button is-on' : 'segment-button'}
            onClick={() => setNotation('it')}
            aria-pressed={notation === 'it'}
          >
            Do
          </button>
          <button
            type="button"
            className={notation === 'int' ? 'segment-button is-on' : 'segment-button'}
            onClick={() => setNotation('int')}
            aria-pressed={notation === 'int'}
          >
            C
          </button>
        </span>
      </div>

      <div className="control-divider" />

      <span className="group-label">Testo</span>

      <div className="control-row">
        <span className="control-name">
          <span className="control-name-label">Dimensione</span>
          <span className="control-name-value">{ZOOM_STEPS[zoomStep]} px</span>
        </span>

        <span className="segment">
          <button
            type="button"
            className="segment-button"
            onClick={() => setZoomStep(zoomStep - 1)}
            disabled={zoomStep === 0}
            aria-label="Riduci il testo"
          >
            <span aria-hidden>A−</span>
          </button>
          <button
            type="button"
            className="segment-button"
            onClick={() => setZoomStep(zoomStep + 1)}
            disabled={zoomStep === ZOOM_STEPS.length - 1}
            aria-label="Ingrandisci il testo"
          >
            <span aria-hidden>A+</span>
          </button>
        </span>
      </div>
    </div>
  )
}
