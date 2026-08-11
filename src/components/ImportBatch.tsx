'use client'

import { useState } from 'react'

import { IconCheck, IconClose, IconInfo, IconPlus } from '@/components/icons'
import { saveSong } from '@/lib/import/actions'
import type { PreparedSong } from '@/lib/import/prepare'
import { SAVE_MESSAGE, type Decision } from '@/lib/import/types'

const FORMAT_LABEL: Record<string, string> = {
  chordpro: 'già ChordPro',
  'chords-above': 'accordi sopra il testo, convertiti',
  'lyrics-only': 'nessun accordo trovato',
}

/** What to do about a song that is already in the repertoire. */
type Policy = 'skip' | 'replace' | 'add'

const POLICY_LABEL: Record<Policy, string> = {
  skip: 'salta quelli già presenti',
  replace: 'sostituisci quelli già presenti',
  add: 'aggiungili comunque, come doppioni',
}

type Outcome =
  | { state: 'waiting' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'skipped'; existing: string }
  | { state: 'failed'; message: string }

interface Row extends PreparedSong {
  include: boolean
  outcome: Outcome
}

/**
 * Already in the database, one way or another.
 *
 * A run that half worked has to be repeatable — that is the point of saying which
 * row failed — and repeating it must not write the ones that succeeded a second
 * time. Rows past this line also stop taking edits: the song exists now, and the
 * editor is where it changes.
 */
const settled = (row: Row) => row.outcome.state === 'saved' || row.outcome.state === 'skipped'

/**
 * Several songs from one paste, shown before any of them is saved.
 *
 * The list is the point: the cut into songs and the reading of each heading are
 * guesses, and a paste of twenty songs is where a guess going wrong is most
 * expensive to undo. So every song arrives with its title and artist editable and
 * its words one tap away, and nothing is written until the button is pressed.
 *
 * Saved one at a time, in order, on purpose. Two saves at once would each read the
 * list of taken slugs before the other had written, and two songs would end up
 * asking for the same one. It also means each row can say what happened to it,
 * which is what makes a partial failure — three saved, one already there, one
 * refused — something you can act on rather than one summary line.
 */
export function ImportBatch({
  songs,
  canzoniereSlug,
  canzoniereName,
  online,
  onDone,
  onReset,
}: {
  songs: PreparedSong[]
  /** Where all of them go: chosen once, at the top of the screen. */
  canzoniereSlug: string
  canzoniereName: string
  online: boolean
  /** Called once the run is over, so the screen can refresh what it shows. */
  onDone: () => Promise<void>
  onReset: () => void
}) {
  const [rows, setRows] = useState<Row[]>(
    songs.map((song) => ({ ...song, include: true, outcome: { state: 'waiting' } })),
  )
  const [policy, setPolicy] = useState<Policy>('skip')
  const [busy, setBusy] = useState(false)
  const [ran, setRan] = useState(false)

  const attempts = rows.filter((row) => row.include && !settled(row))
  const untitled = attempts.filter((row) => row.title.trim() === '').length
  const done = ran && !busy && attempts.length === 0

  const patch = (id: number, change: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)))
  }

  const run = async () => {
    setBusy(true)
    setRan(true)

    for (const row of rows) {
      if (!row.include || settled(row)) continue

      patch(row.id, { outcome: { state: 'saving' } })

      // `undefined` is what asks the server to stop at a twin instead of writing.
      const decision: Decision | undefined = policy === 'skip' ? undefined : policy

      try {
        const result = await saveSong(
          {
            title: row.title,
            artist: row.artist,
            originalKey: row.originalKey,
            tags: row.tags.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''),
            canzoniereSlug,
            body: row.body,
          },
          decision,
        )

        if (result.ok) {
          patch(row.id, { outcome: { state: 'saved' } })
        } else if (result.reason === 'duplicate') {
          patch(row.id, {
            outcome: { state: 'skipped', existing: result.existing.title },
          })
        } else {
          patch(row.id, { outcome: { state: 'failed', message: SAVE_MESSAGE[result.reason] } })
        }
      } catch {
        patch(row.id, { outcome: { state: 'failed', message: SAVE_MESSAGE.failed } })
      }
    }

    setBusy(false)
    await onDone()
  }

  const counted = (state: Outcome['state']) =>
    rows.filter((row) => row.outcome.state === state).length

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          {songs.length} brani in questo testo
        </h2>
        <button type="button" className="text-sm underline underline-offset-2" onClick={onReset}>
          incolla altro
        </button>
      </div>

      <p className="mt-1 text-sm text-muted">
        Controlla titolo e artista di ognuno: sono ricavati dalle prime righe, e su qualche
        brano saranno sbagliati. Vanno tutti in <strong className="font-medium">{canzoniereName}</strong>.
      </p>

      <ol className="mt-4 grid gap-3">
        {rows.map((row, index) => (
          <BatchRow
            key={row.id}
            row={row}
            index={index}
            canzoniereName={canzoniereName}
            busy={busy}
            onPatch={patch}
          />
        ))}
      </ol>

      <label className="mt-4 block">
        <span className="field-label">Se un brano è già in archivio</span>
        <select
          value={policy}
          onChange={(event) => setPolicy(event.target.value as Policy)}
          disabled={busy}
          className="form-field"
        >
          {(Object.keys(POLICY_LABEL) as Policy[]).map((entry) => (
            <option key={entry} value={entry}>
              {POLICY_LABEL[entry]}
            </option>
          ))}
        </select>
      </label>

      {untitled > 0 && (
        <p className="notice notice-accent mt-4" role="status">
          <IconInfo />
          {untitled === 1
            ? 'Un brano non ha titolo: dagliene uno, oppure escludilo.'
            : `${untitled} brani non hanno titolo: dagliene uno, oppure escludili.`}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* Once everything chosen is written, the only thing left to do is paste more. */}
        {done ? (
          <button type="button" className="btn btn-primary" onClick={onReset}>
            Incolla altri brani
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!online || busy || attempts.length === 0 || untitled > 0}
            onClick={() => void run()}
          >
            {busy
              ? 'Importazione…'
              : attempts.length === 1
                ? `${ran ? 'Riprova con' : 'Importa'} 1 brano`
                : `${ran ? 'Riprova con' : 'Importa'} ${attempts.length} brani`}
          </button>
        )}

        {ran && !busy && (
          <span className="text-sm text-muted" role="status">
            {counted('saved')} salvati
            {counted('skipped') > 0 && `, ${counted('skipped')} già presenti`}
            {counted('failed') > 0 && `, ${counted('failed')} non riusciti`}.
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * One song of the paste: what was read out of it, and what became of it.
 *
 * The title carries the weight and the artist sits under it in small type, which is
 * how a song is written everywhere else in the app — with two bare boxes of the same
 * size, the second one reads as a second title.
 */
function BatchRow({
  row,
  index,
  canzoniereName,
  busy,
  onPatch,
}: {
  row: Row
  index: number
  canzoniereName: string
  busy: boolean
  onPatch: (id: number, change: Partial<Row>) => void
}) {
  const locked = busy || settled(row)
  const number = index + 1

  return (
    <li className={`card p-3 ${row.include ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <span className="count-badge mt-1.5" aria-hidden>
          {number}
        </span>

        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="sr-only">Titolo del brano {number}</span>
            <input
              value={row.title}
              onChange={(event) => onPatch(row.id, { title: event.target.value })}
              placeholder="Titolo"
              disabled={locked}
              className="form-field font-medium"
            />
          </label>
          <label className="block">
            <span className="sr-only">Artista del brano {number}</span>
            <input
              value={row.artist}
              onChange={(event) => onPatch(row.id, { artist: event.target.value })}
              placeholder="Artista"
              disabled={locked}
              className="form-field text-sm"
            />
          </label>
        </div>

        {!settled(row) && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => onPatch(row.id, { include: !row.include })}
            aria-label={row.include ? `Non importare il brano ${number}` : `Importa il brano ${number}`}
          >
            {row.include ? <IconClose size={15} /> : <IconPlus size={15} />}
          </button>
        )}
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
        <span>{FORMAT_LABEL[row.format] ?? row.format}</span>
        {row.originalKey !== '' && (
          <span>
            {row.originalKey}
            {row.keyIsGuess && ' (stimata)'}
          </span>
        )}
        {/* Said, not obeyed: the destination above is the answer. */}
        {row.declares !== null && row.declares !== canzoniereName && (
          <span>il testo dice «{row.declares}»</span>
        )}
        <Status outcome={row.outcome} include={row.include} />
      </p>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted">Testo e accordi</summary>
        <textarea
          value={row.body}
          onChange={(event) => onPatch(row.id, { body: event.target.value })}
          rows={8}
          spellCheck={false}
          disabled={locked}
          aria-label={`Corpo ChordPro del brano ${number}`}
          className="form-field mt-2 font-mono text-xs"
        />
      </details>
    </li>
  )
}

/** What became of one song, in the row's own line of small print. */
function Status({ outcome, include }: { outcome: Outcome; include: boolean }) {
  if (!include) return <span>escluso</span>

  switch (outcome.state) {
    case 'waiting':
      return null
    case 'saving':
      return <span>salvataggio…</span>
    case 'saved':
      return (
        <span className="inline-flex items-center gap-1 text-accent">
          <IconCheck size={12} />
          salvato
        </span>
      )
    case 'skipped':
      return <span>già in archivio come «{outcome.existing}»</span>
    case 'failed':
      return <span className="text-danger">{outcome.message}</span>
  }
}
