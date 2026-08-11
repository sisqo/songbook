'use client'

import { useMemo, useState } from 'react'

import { SongFields, type SongFieldValues } from '@/components/SongFields'
import { SongSheet } from '@/components/SongSheet'
import { IconTrash } from '@/components/icons'
import { parseChordPro } from '@/lib/chordpro'
import type { Canzoniere } from '@/lib/data/types'
import { SAVE_MESSAGE, type Decision, type DuplicateOf, type SaveResult, type SongInput } from '@/lib/import/types'

export interface FormValues extends SongFieldValues {
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
  showCanzoniere = true,
  slug,
  onSave,
  onDelete,
}: {
  initial: FormValues
  canzonieri: Canzoniere[]
  /** Shows the key as an estimate, since a wrong key changes the transposed spelling. */
  keyIsGuess?: boolean
  /** False when the screen around this form already asked which canzoniere. */
  showCanzoniere?: boolean
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
        <p className="notice notice-error mb-4" role="alert">
          {error}
        </p>
      )}

      <SongFields
        values={values}
        canzonieri={canzonieri}
        keyIsGuess={keyIsGuess && values.originalKey === initial.originalKey}
        showCanzoniere={showCanzoniere}
        onChange={set}
      />

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="field-label">Corpo ChordPro</span>
          <textarea
            value={values.body}
            onChange={(event) => set('body', event.target.value)}
            rows={16}
            spellCheck={false}
            className="form-field font-mono text-sm"
          />
        </label>

        <div>
          <span className="field-label">Come apparirà</span>
          <div className="card max-h-[26rem] overflow-auto p-3">
            <SongSheet song={parsed} originalKey={values.originalKey || null} />
          </div>
        </div>
      </div>

      {duplicate !== null && (
        <div className="notice-accent mt-4 rounded-[var(--r-lg)] p-4 text-sm" role="alert">
          <p>
            Esiste già «{duplicate.title}»
            {duplicate.artist !== null && ` di ${duplicate.artist}`}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void save('replace')}
            >
              Sostituisci
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => void save('add')}
            >
              Aggiungi comunque
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDuplicate(null)}>
              Annulla
            </button>
          </div>
          <p className="mt-3 text-xs">
            Sostituire conserva lo slug, quindi la trasposizione e la velocità che avevi salvato
            per quel brano restano.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--surface-2)' }}>
        <button
          type="button"
          className="btn btn-primary"
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
                <span className="text-sm text-muted">Eliminare questo brano?</span>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    await onDelete()
                    setBusy(false)
                  }}
                >
                  Elimina
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>
                  Annulla
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(true)}>
                <IconTrash size={16} />
                Elimina
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
