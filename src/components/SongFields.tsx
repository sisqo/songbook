'use client'

import type { Canzoniere } from '@/lib/data/types'

export interface SongFieldValues {
  title: string
  artist: string
  originalKey: string
  tags: string
  canzoniereSlug: string
}

/**
 * Everything about a song except its words.
 *
 * Shared by the import screen and the editor so the two cannot drift into asking
 * for the same things in different ways — and so the note about a guessed key lives
 * in one place.
 */
export function SongFields({
  values,
  canzonieri,
  keyIsGuess = false,
  showCanzoniere = true,
  onChange,
}: {
  values: SongFieldValues
  canzonieri: Canzoniere[]
  /** Marks the key as an estimate, since a wrong key changes the transposed spelling. */
  keyIsGuess?: boolean
  /**
   * False where the screen already asked. On import the destination is the first
   * thing chosen, for every song in the paste at once, and repeating it here would
   * be a second control for one decision — with no way to tell which one won.
   */
  showCanzoniere?: boolean
  onChange: <K extends keyof SongFieldValues>(field: K, value: SongFieldValues[K]) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="field-label">Titolo</span>
        <input
          value={values.title}
          onChange={(event) => onChange('title', event.target.value)}
          className="form-field"
        />
      </label>

      <label className="block">
        <span className="field-label">Artista</span>
        <input
          value={values.artist}
          onChange={(event) => onChange('artist', event.target.value)}
          className="form-field"
        />
      </label>

      <label className="block">
        <span className="field-label">
          Tonalità {keyIsGuess && <em className="not-italic text-accent">stimata</em>}
        </span>
        <input
          value={values.originalKey}
          onChange={(event) => onChange('originalKey', event.target.value)}
          placeholder="es. Bb o F#m"
          className="form-field"
        />
      </label>

      {showCanzoniere && (
        <label className="block">
          <span className="field-label">Canzoniere</span>
          <select
            value={values.canzoniereSlug}
            onChange={(event) => onChange('canzoniereSlug', event.target.value)}
            className="form-field"
          >
            {canzonieri.map((canzoniere) => (
              <option key={canzoniere.slug} value={canzoniere.slug}>
                {canzoniere.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/*
        * The tags take the whole width only when there is a whole width to take:
        * without the canzoniere the fields are three, and a row of two would leave
        * a hole next to the key rather than a form.
        */}
      <label className={`block ${showCanzoniere ? 'sm:col-span-2' : ''}`}>
        <span className="field-label">Tag, separati da virgola</span>
        <input
          value={values.tags}
          onChange={(event) => onChange('tags', event.target.value)}
          className="form-field"
        />
      </label>
    </div>
  )
}
