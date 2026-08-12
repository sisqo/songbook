'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ControlBar } from '@/components/ControlBar'
import { SongFields, type SongFieldValues } from '@/components/SongFields'
import { SongSheet } from '@/components/SongSheet'
import { useCanzonieri } from '@/components/CanzoniereProvider'
import { type Caret, GraphicEditor } from '@/components/editor/GraphicEditor'
import { UnsavedGuard } from '@/components/editor/UnsavedGuard'
import {
  IconBridge,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconChorus,
  IconCode,
  IconComment,
  IconEye,
  IconInfo,
  IconPencil,
  IconPlus,
  IconRemoveLine,
  IconTrash,
  IconUndo,
} from '@/components/icons'
import { chordTokens, parseChordPro } from '@/lib/chordpro'
import type { Song } from '@/lib/data/types'
import { type SongDocument, fromSource, readLyricLine, toSource } from '@/lib/editor/document'
import { addChord, removeLine, toggleComment, toggleSection } from '@/lib/editor/edits'
import { deleteSong, saveSong } from '@/lib/import/actions'
import { SAVE_MESSAGE } from '@/lib/import/types'
import { dropEdit, writeEdit } from '@/lib/library/store'

type Mode = 'graphic' | 'source' | 'preview'

const MODES: { mode: Mode; label: string; icon: typeof IconPencil }[] = [
  { mode: 'graphic', label: 'Grafico', icon: IconPencil },
  { mode: 'source', label: 'Sorgente', icon: IconCode },
  { mode: 'preview', label: 'Anteprima', icon: IconEye },
]

/**
 * The commands that act on the line the cursor is in, in the order they are used:
 * mark a chorus, mark a bridge, turn the line into a comment, take the line out.
 *
 * A table rather than five buttons written out, because they now differ only in an
 * icon, a name and one call — and five copies of the same markup is where a label and
 * an action drift apart.
 */
const COMMANDS: {
  label: string
  icon: typeof IconPencil
  act: (line: number) => (document: SongDocument) => SongDocument
}[] = [
  {
    label: 'Ritornello',
    icon: IconChorus,
    act: (line) => (document) => toggleSection(document, line, 'chorus'),
  },
  {
    label: 'Ponte',
    icon: IconBridge,
    act: (line) => (document) => toggleSection(document, line, 'bridge'),
  },
  { label: 'Commento', icon: IconComment, act: (line) => (document) => toggleComment(document, line) },
  {
    label: 'Elimina riga',
    icon: IconRemoveLine,
    act: (line) => (document) => removeLine(document, line),
  },
]

/** Where a raw offset in the source falls, in line-and-letter terms. */
function caretFromRaw(source: string, rawAt: number): Caret {
  const before = source.slice(0, rawAt)
  const lineStart = before.lastIndexOf('\n') + 1

  return {
    line: before.split('\n').length - 1,
    // The chords written before the cursor are not letters of the line.
    at: readLyricLine(before.slice(lineStart)).text.length,
  }
}

/**
 * The editor, on its own page.
 *
 * One song, three ways of looking at it, and a single source string underneath —
 * so switching modes can never lose an edit or show two different songs. The
 * commands act on the line the cursor is in, whichever mode is open, because they
 * are the same operations on the same document.
 *
 * Saving writes the row into the local overlay before leaving, which is what makes
 * the reading page show the new words the moment it opens rather than after its own
 * round trip.
 */
export function EditorScreen({ song }: { song: Song }) {
  const router = useRouter()
  const { canzonieri, refresh: refreshCanzonieri } = useCanzonieri()

  const [mode, setMode] = useState<Mode>('graphic')
  const [source, setSource] = useState(song.body)
  const [fields, setFields] = useState<SongFieldValues>({
    title: song.title,
    artist: song.artist ?? '',
    tags: song.tags.join(', '),
    canzoniereSlug: song.canzoniereSlug ?? canzonieri[0]?.slug ?? '',
  })

  const [caret, setCaret] = useState<Caret>({ line: 0, at: 0 })
  const [editing, setEditing] = useState<{ line: number; chord: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const [history, setHistory] = useState<string[]>([])
  const raw = useRef<HTMLTextAreaElement | null>(null)
  /** Where the caret goes after a command rewrote the source. */
  const rawCaret = useRef<number | null>(null)
  /** What produced the last change, so a burst of typing is one step and not thirty. */
  const lastKind = useRef<string | null>(null)

  const saved = useRef({ source: song.body, fields })
  const dirty =
    source !== saved.current.source ||
    JSON.stringify(fields) !== JSON.stringify(saved.current.fields)

  const parsed = useMemo(() => parseChordPro(source), [source])

  useEffect(() => {
    const at = rawCaret.current
    if (at === null || raw.current === null) return

    rawCaret.current = null
    raw.current.focus()
    raw.current.setSelectionRange(at, at)
  }, [source])

  /**
   * Every change to the source goes through here, so a step back is always possible.
   *
   * Typing on one line is one step, however many letters it took: the kind stays the
   * same and nothing new is pushed, so the entry already on the stack is the state
   * from before the burst began. A command is always its own step — those are the
   * changes worth undoing, and two of them throw something away.
   */
  const change = (next: string, kind: string | null) => {
    if (kind === null || kind !== lastKind.current) {
      setHistory((entries) => [...entries, source].slice(-40))
    }

    lastKind.current = kind
    setSource(next)
  }

  const undo = () => {
    const previous = history[history.length - 1]
    if (previous === undefined) return

    setHistory((entries) => entries.slice(0, -1))
    lastKind.current = null
    setSource(previous)
    setNotice(null)
  }

  const command = (edit: (document: SongDocument) => SongDocument) => {
    change(toSource(edit(fromSource(source))), null)
    setNotice(null)
  }

  /**
   * A chord where the cursor is.
   *
   * In the graphic mode it is added to the document and opened for typing; in the
   * source mode the brackets are typed into the text, which is what someone reading
   * ChordPro expects to see happen.
   */
  const insertChord = () => {
    if (mode === 'source' && raw.current !== null) {
      const at = raw.current.selectionStart
      change(`${source.slice(0, at)}[]${source.slice(at)}`, null)
      rawCaret.current = at + 1
      return
    }

    const document = fromSource(source)
    const block = document.blocks[caret.line]
    if (block === undefined || block.kind !== 'lyrics') return

    // Where the new chord lands once the chords are back in order.
    const chord = block.chords.filter((entry) => entry.at <= caret.at).length
    change(toSource(addChord(document, caret.line, caret.at)), null)
    setEditing({ line: caret.line, chord })
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      const result = await saveSong({
        slug: song.slug,
        title: fields.title,
        artist: fields.artist,
        tags: fields.tags.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''),
        canzoniereSlug: fields.canzoniereSlug,
        body: source,
      })

      if (!result.ok) {
        setError(SAVE_MESSAGE[result.reason])
        return
      }

      // The reading page reads this before it asks the server anything.
      writeEdit(result.song)
      saved.current = { source, fields }
      setNotice('Salvato. Si vede subito nel brano; pubblica per averlo anche offline.')
      await refreshCanzonieri()
    } catch {
      setError(SAVE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    const result = await deleteSong(song.slug)
    setBusy(false)

    if (!result.ok) {
      setError(SAVE_MESSAGE[result.reason])
      return
    }

    dropEdit(song.slug)
    router.push('/')
  }

  return (
    <div>
      {/* Covers the header's links too, which no unload event would catch. */}
      <UnsavedGuard when={dirty} />

      <div className="editor-head">
        {/*
          * Where you are, and the two things you do to what you changed.
          *
          * The title is here because the header above says "songs" and nothing else
          * on this screen says which song is open — in the graphic mode the words are
          * the song, and its name is not among them.
          */}
        <div className="editor-bar">
          <Link
            href={`/canzoni/${song.slug}`}
            className="icon-button"
            title="Torna al brano"
            aria-label="Torna al brano"
          >
            <IconChevronLeft size={20} />
          </Link>

          <span className="editor-title">{fields.title.trim() === '' ? 'senza titolo' : fields.title}</span>

          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={history.length === 0}
            onClick={undo}
            title="Annulla l'ultima modifica"
            aria-label="Annulla l'ultima modifica"
          >
            <IconUndo size={15} />
            Annulla
          </button>

          {/* Enabled means there is something unsaved: no second label for it. */}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !dirty || fields.title.trim() === ''}
            onClick={() => void save()}
          >
            <IconCheck size={14} />
            Salva
          </button>
        </div>

        {/*
          * Three ways of looking at the same song, as icons.
          *
          * Words here cost the row: "Grafico · Sorgente · Anteprima" filled it on its
          * own, which is what pushed the title and the commands onto lines of their
          * own and made the whole block too tall to keep in place. Each still carries
          * its name for a pointer and for a screen reader.
          */}
        <div className="editor-modes" role="tablist" aria-label="Modalità di modifica">
          <div className="segment">
            {MODES.map((entry) => (
              <button
                key={entry.mode}
                type="button"
                role="tab"
                aria-selected={mode === entry.mode}
                title={entry.label}
                aria-label={entry.label}
                className={`segment-button segment-wide ${mode === entry.mode ? 'is-on' : ''}`}
                onClick={() => setMode(entry.mode)}
              >
                <entry.icon size={17} />
              </button>
            ))}
          </div>
        </div>

        {mode !== 'preview' && (
          <div className="editor-tools">
            <div className="editor-tools-scroll">
              {/*
                * Only this one keeps its word. It is the command reached for most, it
                * is the one whose icon — a plus — says least on its own, and one label
                * in the row is what tells you the rest are commands too.
                */}
              <button type="button" className="btn btn-inset btn-sm" onClick={insertChord}>
                <IconPlus size={15} />
                Accordo
              </button>

              {COMMANDS.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  className="btn btn-inset btn-sm btn-square"
                  title={entry.label}
                  aria-label={entry.label}
                  onClick={() => command(entry.act(caret.line))}
                >
                  <entry.icon size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error !== null && (
        <p className="notice notice-error mt-4" role="alert">
          {error}
        </p>
      )}

      {notice !== null && (
        <p className="notice mt-4" role="status">
          <IconInfo />
          {notice}
        </p>
      )}

      {/*
        * The chevron replaces the triangle the browser draws, which was the one thing
        * on this screen not in the app's own hand. It turns when the card opens.
        */}
      <details className="card editor-data mt-4 p-4">
        <summary>
          <IconChevronRight size={14} className="editor-data-arrow" />
          <span className="text-sm font-medium">
            Dati del brano
            <span className="text-muted">
              {' — '}
              {fields.title || 'senza titolo'}
              {fields.artist !== '' && ` · ${fields.artist}`}
            </span>
          </span>
        </summary>

        <div className="mt-4">
          <SongFields
            values={fields}
            canzonieri={canzonieri}
            onChange={(field, value) => setFields((current) => ({ ...current, [field]: value }))}
          />
        </div>
      </details>

      {mode === 'graphic' && (
        <GraphicEditor
          source={source}
          caret={caret}
          editing={editing}
          onChange={change}
          onCaret={setCaret}
          onEditing={setEditing}
        />
      )}

      {mode === 'source' && (
        <textarea
          ref={raw}
          className="editor-raw"
          value={source}
          spellCheck={false}
          onChange={(event) => {
            change(event.target.value, 'raw')
            setCaret(caretFromRaw(event.target.value, event.target.selectionStart))
          }}
          onSelect={(event) =>
            setCaret(caretFromRaw(source, event.currentTarget.selectionStart))
          }
          aria-label="Sorgente ChordPro"
        />
      )}

      {mode === 'preview' && (
        <>
          <SongSheet song={parsed} />
          {/*
            * The reader's own bar, not a copy of it: the point of this mode is to
            * see the song the way it will be read, transposition included.
            */}
          <div className="bar-spacer" />
          <ControlBar chords={chordTokens(parsed)} />
        </>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--surface-2)' }}>
        {confirming ? (
          <>
            <span className="text-sm text-muted">Eliminare questo brano?</span>
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void remove()}>
              Elimina
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirming(false)}>
              Annulla
            </button>
          </>
        ) : (
          /*
           * Ink rather than quiet. It deletes the song, and the design says so by
           * making it the one solid dark thing on the screen — with the confirmation
           * still between it and the deletion.
           */
          <button type="button" className="btn btn-ink btn-sm" onClick={() => setConfirming(true)}>
            <IconTrash size={16} />
            Elimina
          </button>
        )}
      </div>
    </div>
  )
}
