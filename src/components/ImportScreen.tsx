'use client'

import { zipSync, strToU8 } from 'fflate'
import { useEffect, useState } from 'react'

import { type FormValues, SongForm } from '@/components/SongForm'
import type { Canzoniere } from '@/lib/data/types'
import { exportAll, loadPending, publish, saveSong } from '@/lib/import/actions'
import { convert } from '@/lib/import/convert'
import { deduce } from '@/lib/import/deduce'
import { PUBLISH_MESSAGE, type PendingSong } from '@/lib/import/types'

const FORMAT_LABEL: Record<string, string> = {
  chordpro: 'riconosciuto come ChordPro, passato così com’è',
  'chords-above': 'accordi sopra il testo, convertiti',
  'lyrics-only': 'nessun accordo trovato: solo testo',
}

/**
 * Paste, check, save. Plus the list of songs waiting to be published, the
 * publish action, and the export.
 *
 * Two steps rather than one live-converting field: the conversion is a guess, so
 * it happens once on demand and then the result is yours to correct.
 */
export function ImportScreen({
  canzonieri,
  defaultCanzoniere,
}: {
  canzonieri: Canzoniere[]
  defaultCanzoniere: string
}) {
  const [pasted, setPasted] = useState('')
  const [prepared, setPrepared] = useState<{
    values: FormValues
    keyIsGuess: boolean
    format: string
  } | null>(null)

  const [pending, setPending] = useState<PendingSong[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [online, setOnline] = useState(true)

  const refreshPending = async () => {
    try {
      setPending(await loadPending())
    } catch {
      // Offline or signed out: leave the list as it is.
    }
  }

  useEffect(() => {
    void refreshPending()
  }, [])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const prepare = () => {
    const converted = convert(pasted)
    const found = deduce(converted.body)

    setPrepared({
      format: converted.format,
      keyIsGuess: found.keyIsGuess,
      values: {
        title: found.title,
        artist: found.artist ?? '',
        originalKey: found.key ?? '',
        tags: found.tags.join(', '),
        canzoniereSlug:
          canzonieri.find((entry) => entry.name === found.canzoniere)?.slug ?? defaultCanzoniere,
        body: found.body,
      },
    })
  }

  const download = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const files = await exportAll()
      if (files.length === 0) {
        setNotice('Niente da esportare.')
        return
      }

      const zipped = zipSync(
        Object.fromEntries(files.map((file) => [file.name, strToU8(file.content)])),
      )
      const url = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'songs-chopro.zip'
      link.click()
      URL.revokeObjectURL(url)

      setNotice(`Scaricati ${files.length} brani. Per ripristinarli: rimettili in content/ e lancia npm run seed.`)
    } catch {
      setNotice('Export non riuscito.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {!online && (
        <p
          className="mb-4 rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          role="status"
        >
          Senza connessione non si può importare: salvare richiede il database e pubblicare
          richiede un deploy.
        </p>
      )}

      {notice !== null && (
        <p className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)' }} role="status">
          {notice}
        </p>
      )}

      {prepared === null ? (
        <div>
          <label className="block">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              Incolla il brano. Se ha gli accordi fra parentesi quadre è già ChordPro; altrimenti
              si tenta la conversione da accordi sopra il testo.
            </span>
            <textarea
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={14}
              spellCheck={false}
              placeholder={'Certe notti\nLigabue\n\nAm        F\nCerte notti la macchina'}
              className="form-field font-mono text-sm"
            />
          </label>

          <button
            type="button"
            className="control-button mt-3"
            disabled={!online || pasted.trim() === ''}
            onClick={prepare}
          >
            Analizza
          </button>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
            {FORMAT_LABEL[prepared.format] ?? prepared.format} ·{' '}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => setPrepared(null)}
            >
              incolla un altro brano
            </button>
          </p>

          <SongForm
            initial={prepared.values}
            canzonieri={canzonieri}
            keyIsGuess={prepared.keyIsGuess}
            onSave={async (input, decision) => {
              const result = await saveSong(input, decision)
              if (result.ok) {
                setPrepared(null)
                setPasted('')
                setNotice('Salvato. Comparirà sul sito dopo la pubblicazione.')
                await refreshPending()
              }
              return result
            }}
          />
        </div>
      )}

      <section className="mt-8 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        <h2 className="text-lg font-semibold tracking-tight">In attesa di pubblicazione</h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          Lista, ricerca e pagine si generano al build, quindi un brano è visibile solo dopo una
          ricostruzione. Puoi importarne diversi e pubblicarli in un colpo.
        </p>

        {pending.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
            Nulla in attesa.
          </p>
        ) : (
          <ul className="mt-3">
            {pending.map((song) => (
              <li
                key={song.slug}
                className="border-t py-2 text-sm"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="font-medium">{song.title}</span>
                {song.artist !== null && (
                  <span style={{ color: 'var(--muted)' }}> · {song.artist}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="control-button"
            disabled={!online || busy || pending.length === 0}
            onClick={async () => {
              setBusy(true)
              setNotice(null)
              const result = await publish()
              setNotice(
                result.ok
                  ? 'Ricostruzione avviata. Fra un minuto i brani sono sul sito.'
                  : PUBLISH_MESSAGE[result.reason],
              )
              setBusy(false)
            }}
          >
            Pubblica
          </button>

          <button
            type="button"
            className="control-button"
            disabled={!online || busy}
            onClick={() => void download()}
          >
            Scarica tutto
          </button>
        </div>
      </section>
    </div>
  )
}
