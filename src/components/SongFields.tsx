'use client'

import type { Canzoniere, Section } from '@/lib/data/types'

export interface SongFieldValues {
  title: string
  artist: string
  tags: string
  canzoniereSlug: string
  /** The section's id as the select holds it: a string, empty when none is offered. */
  sectionId: string
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
  sections,
  showCanzoniere = true,
  onChange,
}: {
  values: SongFieldValues
  canzonieri: Canzoniere[]
  /** Every section of every canzoniere; the one on offer depends on the choice above. */
  sections: Section[]
  /**
   * False where the screen already asked. On import the destination is the first
   * thing chosen, for every song in the paste at once, and repeating it here would
   * be a second control for one decision — with no way to tell which one won.
   */
  showCanzoniere?: boolean
  onChange: <K extends keyof SongFieldValues>(field: K, value: SongFieldValues[K]) => void
}) {
  const divisions = sections
    .filter((section) => section.canzoniereSlug === values.canzoniereSlug)
    .sort((one, other) => one.position - other.position)

  /**
   * Changing the canzoniere changes the sections on offer, so the section moves with it —
   * to the first of the new one. Leaving the old id in place would send the song to a
   * section of a canzoniere it is no longer in, which the database refuses outright, and
   * the person would be told "could not save" about a menu they never touched.
   */
  const chooseCanzoniere = (slug: string) => {
    onChange('canzoniereSlug', slug)

    const first = sections
      .filter((section) => section.canzoniereSlug === slug)
      .sort((one, other) => one.position - other.position)[0]

    onChange('sectionId', first === undefined ? '' : String(first.id))
  }

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
        <>
          <label className="block">
            <span className="field-label">Canzoniere</span>
            <select
              value={values.canzoniereSlug}
              onChange={(event) => chooseCanzoniere(event.target.value)}
              className="form-field"
            >
              {canzonieri.map((canzoniere) => (
                <option key={canzoniere.slug} value={canzoniere.slug}>
                  {canzoniere.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="field-label">Sezione</span>
            <select
              value={values.sectionId}
              onChange={(event) => onChange('sectionId', event.target.value)}
              className="form-field"
              disabled={divisions.length === 0}
            >
              {divisions.map((section) => (
                <option key={section.id} value={String(section.id)}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {/*
        * The tags take the whole width only when there is a whole width to take: with
        * the canzoniere and its section the fields are five, so this one closes the
        * third row, and without them it is alone on the second.
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
