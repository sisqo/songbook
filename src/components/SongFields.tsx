'use client'

import type { Canzoniere } from '@/lib/data/types'

export interface SongFieldValues {
  title: string
  artist: string
  tags: string
  canzoniereSlug: string
}

/**
 * Everything about a song except its words.
 *
 * Shared by the import screen and the editor so the two cannot drift into asking
 * for the same things in different ways.
 *
 * There is no key here any more. It was the one field nobody could answer better than
 * the song itself: the chords say what key they are in, and the only thing the app did
 * with the answer was choose between sharps and flats — which it now works out when it
 * needs to, from the chords.
 */
export function SongFields({
  values,
  canzonieri,
  showCanzoniere = true,
  onChange,
}: {
  values: SongFieldValues
  canzonieri: Canzoniere[]
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
        * The tags take the whole width only when there is a whole width to take: with
        * the canzoniere the fields are four and fill two rows exactly, and stretching
        * this one would leave a hole beside the canzoniere rather than a form.
        */}
      <label className={`block ${showCanzoniere ? '' : 'sm:col-span-2'}`}>
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
