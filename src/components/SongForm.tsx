'use client'

import { useMemo, useState } from 'react'

import { SongSheet } from '@/components/SongSheet'
import { parseChordPro } from '@/lib/chordpro'
import type { Canzoniere } from '@/lib/data/types'
import { SAVE_MESSAGE, type Decision, type DuplicateOf, type SaveResult, type SongInput } from '@/lib/import/types'

export interface FormValues {
  title: string
  artist: string
  originalKey: string
  tags: string
  canzoniereSlug: string
  body: string
}

/**
 * The fields and the preview, shared by import and editing.
 *
 * The body stays editable next to a live preview because the conversion from
 * chords-above-lyrics is a heuristic: when it gets a line wrong, the way out has
 * to be visible rather than requiring a re-paste.
 */
export function SongForm({
  initial,
  canzonieri,
  keyIsGuess = false,
  slug,
  onSave,
  onDelete,
}: {
  initial: FormValues
  canzonieri: Canzoniere[]
  /** Shows the key as an estimate, since a wrong key changes the transposed spelling. */
  keyIsGuess?: boolean
  /** Set when editing an existing song. */
  slug?: string
  onSave: (input: SongInput, decision?: Decision) => Promise<SaveResult>
  onDelete?: () => Promise<void>
}) {
  const [values, setValues] = useState<FormValues>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<DuplicateOf | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const parsed = useMemo(() => parseChordPro(values.body), [values.body])

  const set = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setDuplicate(null)
  }

  const input = (): SongInput => ({
    slug,
    title: values.title,
    artist: values.artist,
    originalKey: values.originalKey,
    tags: values.tags.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''),
    canzoniereSlug: values.canzoniereSlug,
    body: values.body,
  })

  const save = async (decision?: Decision) => {
    setBusy(true)
    setError(null)
    try {
      const result = await onSave(input(), decision)
      if (result.ok) {
        setDuplicate(null)
        return
      }
      if (result.reason === 'duplicate') {
        setDuplicate(result.existing)
        return
      }
      setError(SAVE_MESSAGE[result.reason])
    } catch {
      setError(SAVE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {error !== null && (
        <p
          className="mb-4 rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Titolo
          </span>
          <input
            value={values.title}
            onChange={(event) => set('title', event.target.value)}
            className="form-field"
          />
        </label>

        <label className="block">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Artista
          </span>
          <input
            value={values.artist}
            onChange={(event) => set('artist', event.target.value)}
            className="form-field"
          />
        </label>

        <label className="block">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Tonalità{' '}
            {keyIsGuess && values.originalKey === initial.originalKey && (
              <em style={{ color: 'var(--accent)' }}>stimata</em>
            )}
          </span>
          <input
            value={values.originalKey}
            onChange={(event) => set('originalKey', event.target.value)}
            placeholder="es. Bb o F#m"
            className="form-field"
          />
        </label>

        <label className="block">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Canzoniere
          </span>
          <select
            value={values.canzoniereSlug}
            onChange={(event) => set('canzoniereSlug', event.target.value)}
            className="form-field"
          >
            {canzonieri.map((canzoniere) => (
              <option key={canzoniere.slug} value={canzoniere.slug}>
                {canzoniere.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Tag, separati da virgola
          </span>
          <input
            value={values.tags}
            onChange={(event) => set('tags', event.target.value)}
            className="form-field"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Corpo ChordPro
          </span>
          <textarea
            value={values.body}
            onChange={(event) => set('body', event.target.value)}
            rows={16}
            spellCheck={false}
            className="form-field font-mono text-sm"
          />
        </label>

        <div>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Come apparirà
          </span>
          <div
            className="mt-1 max-h-[26rem] overflow-auto rounded-lg border p-3"
            style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}
          >
            <SongSheet song={parsed} originalKey={values.originalKey || null} />
          </div>
        </div>
      </div>

      {duplicate !== null && (
        <div
          className="mt-4 rounded-lg p-3 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          role="alert"
        >
          <p>
            Esiste già «{duplicate.title}»
            {duplicate.artist !== null && ` di ${duplicate.artist}`}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="control-button"
              disabled={busy}
              onClick={() => void save('replace')}
            >
              Sostituisci
            </button>
            <button
              type="button"
              className="control-button"
              disabled={busy}
              onClick={() => void save('add')}
            >
              Aggiungi comunque
            </button>
            <button type="button" className="control-button" onClick={() => setDuplicate(null)}>
              Annulla
            </button>
          </div>
          <p className="mt-2 text-xs">
            Sostituire conserva lo slug, quindi la trasposizione e la velocità che avevi salvato
            per quel brano restano.
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        <button
          type="button"
          className="control-button"
          disabled={busy || values.title.trim() === '' || values.body.trim() === ''}
          onClick={() => void save()}
        >
          {slug === undefined ? 'Salva il brano' : 'Salva le modifiche'}
        </button>

        {onDelete !== undefined && (
          <>
            <span className="flex-1" />
            {confirmDelete ? (
              <>
                <span className="text-sm" style={{ color: 'var(--muted)' }}>
                  Eliminare questo brano?
                </span>
                <button
                  type="button"
                  className="control-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    await onDelete()
                    setBusy(false)
                  }}
                >
                  Elimina
                </button>
                <button
                  type="button"
                  className="control-button"
                  onClick={() => setConfirmDelete(false)}
                >
                  Annulla
                </button>
              </>
            ) : (
              <button
                type="button"
                className="control-button"
                onClick={() => setConfirmDelete(true)}
              >
                Elimina
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
