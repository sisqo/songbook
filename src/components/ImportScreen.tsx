'use client'

import { zipSync, strToU8 } from 'fflate'
import { useCallback, useEffect, useRef, useState } from 'react'

import { type FormValues, SongForm } from '@/components/SongForm'
import {
  IconCheck,
  IconDownload,
  IconInfo,
  IconOffline,
  IconPublish,
  IconRebuild,
} from '@/components/icons'
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
  const [publishing, setPublishing] = useState(false)
  const [online, setOnline] = useState(true)
  /** Set when this screen goes away, so the watch below stops with it. */
  const gone = useRef(false)

  /** Null when the list could not be read, which is not the same as an empty one. */
  const refreshPending = useCallback(async (): Promise<PendingSong[] | null> => {
    try {
      const fresh = await loadPending()
      setPending(fresh)
      return fresh
    } catch {
      // Offline or signed out: leave the list as it is.
      return null
    }
  }, [])

  useEffect(() => {
    // Set again on every run, not just once: in development the effect is mounted,
    // cleaned up and mounted again, and a flag left true would stop the watch below
    // on its first turn — leaving the button stuck on "Pubblicazione…" for good.
    gone.current = false
    void refreshPending()

    return () => {
      gone.current = true
    }
  }, [refreshPending])

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

  /** Triggers the deploy hook and reports what happened. */
  const fire = async (done: string): Promise<boolean> => {
    setBusy(true)
    setNotice(null)
    const result = await publish()
    setNotice(result.ok ? done : PUBLISH_MESSAGE[result.reason])
    setBusy(false)
    return result.ok
  }

  /**
   * Publishes, then watches the list until the rebuild has taken these songs on.
   *
   * Firing the hook changes nothing that this screen can see, which is why the
   * list used to sit there unchanged and publishing looked like it had failed. What
   * empties the list is the build itself: it stamps the database as it starts, and
   * the list is every song written after that stamp.
   *
   * So the wait is real and worth showing, and the end of it means the songs are in
   * the build that is running — not that the site is live. Reporting more than that
   * would need Vercel's API; the wording here says what is actually known.
   */
  const publishPending = async () => {
    const fired = await fire('Ricostruzione avviata.')
    if (!fired) return

    setPublishing(true)

    for (let attempt = 0; attempt < 45; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 4000))
      if (gone.current) return

      const still = await refreshPending()
      // A read that failed says nothing; only an answered, empty list does.
      if (still !== null && still.length === 0) {
        setPublishing(false)
        setNotice(
          'Fatto: i brani sono entrati nella ricostruzione. Fra un minuto sono anche nelle pagine e disponibili offline.',
        )
        return
      }
    }

    setPublishing(false)
    setNotice(
      'La ricostruzione non risulta ancora partita. Controlla il deploy su Vercel, oppure riprova.',
    )
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
        <p className="notice notice-accent mb-4">
          <IconOffline />
          Senza connessione non si può importare: salvare richiede il database e pubblicare
          richiede un deploy.
        </p>
      )}

      {notice !== null && (
        <p className="notice mb-4" role="status">
          <IconInfo />
          {notice}
        </p>
      )}

      {prepared === null ? (
        <div className="card p-4 sm:p-5">
          <label className="block">
            <span className="mb-2 block text-sm text-muted">
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
            className="btn btn-primary mt-3"
            disabled={!online || pasted.trim() === ''}
            onClick={prepare}
          >
            Analizza
          </button>
        </div>
      ) : (
        <div className="card p-4 sm:p-5">
          <p className="mb-4 text-xs text-muted">
            {FORMAT_LABEL[prepared.format] ?? prepared.format} ·{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => setPrepared(null)}>
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
                setNotice('Salvato. È già nell’elenco; pubblica per averlo anche senza connessione.')
                await refreshPending()
              }
              return result
            }}
          />
        </div>
      )}

      <section className="mt-8 border-t pt-5" style={{ borderColor: 'var(--line)' }}>
        <h2 className="text-lg font-semibold tracking-tight">In attesa di pubblicazione</h2>
        <p className="mt-1 text-sm text-muted">
          Quello che salvi si vede subito, qui e nell’elenco. La pubblicazione serve a ricostruire
          le pagine: finché non la lanci, questi brani non ci sono senza connessione. Puoi
          importarne diversi e pubblicarli in un colpo.
        </p>

        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nulla in attesa.</p>
        ) : (
          <ul className="row-list card mt-4">
            {pending.map((song) => (
              <li key={song.slug} className="row">
                <span className="count-badge" aria-hidden>
                  <IconCheck size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{song.title}</span>
                  {song.artist !== null && <span className="text-muted"> · {song.artist}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {publishing && (
          <p className="mt-3 text-sm text-muted" role="status">
            Pubblicazione in corso: aspetto che la ricostruzione prenda in carico questi brani.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!online || busy || publishing || pending.length === 0}
            onClick={() => void publishPending()}
          >
            <IconPublish size={16} />
            {publishing ? 'Pubblicazione…' : 'Pubblica'}
          </button>

          {/*
           * The same deploy hook as Pubblica, without the condition. Renaming a
           * canzoniere changes what the pages say without touching any song, so
           * nothing shows up as pending and Pubblica stays disabled — and the site
           * would keep the old name until the next unrelated publish.
           */}
          <button
            type="button"
            className="btn"
            disabled={!online || busy || publishing}
            onClick={() => void fire('Ricostruzione avviata. Fra un minuto il sito è aggiornato.')}
          >
            <IconRebuild size={16} />
            Ricostruisci ora
          </button>

          <button
            type="button"
            className="btn"
            disabled={!online || busy || publishing}
            onClick={() => void download()}
          >
            <IconDownload size={16} />
            Scarica tutto
          </button>
        </div>

        <p className="mt-3 text-xs text-faint">
          «Ricostruisci ora» rigenera il sito anche senza brani in attesa: serve dopo aver
          rinominato un canzoniere o spostato dei brani, perché quelle modifiche non compaiono
          nella lista qui sopra.
        </p>
      </section>
    </div>
  )
}
