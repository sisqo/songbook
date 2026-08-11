'use client'

import { Fragment, useEffect, useRef, useState } from 'react'

import {
  type Block,
  type SectionKind,
  type SongDocument,
  fromSource,
  sectionsOf,
  toSource,
} from '@/lib/editor/document'
import { insertLineAfter, joinLines, setChord, setLineText, splitLine } from '@/lib/editor/edits'

export interface Caret {
  /** Index of the block the cursor is in. */
  line: number
  /** Index into that line's text. */
  at: number
}

/**
 * The song as it will read, with the words editable in place.
 *
 * The words of each line are a real `<input>`: the caret, the selection and the
 * phone keyboard all behave as they should, which no hand-written text surface
 * manages. The chords live in a row above, each pinned to the letter it belongs to
 * by an invisible copy of the same words in the same font — the browser does the
 * measuring, so nothing drifts when the font loads or the theme changes.
 *
 * The source string stays the only state. Every keystroke is source → document →
 * change → source, which is what keeps this mode and the raw mode telling the same
 * story.
 */
export function GraphicEditor({
  source,
  caret,
  editing,
  onChange,
  onCaret,
  onEditing,
}: {
  source: string
  caret: Caret
  /** The chord open for typing, owned above because the toolbar opens one too. */
  editing: { line: number; chord: number } | null
  onChange: (source: string, kind: string | null) => void
  onCaret: (caret: Caret) => void
  onEditing: (editing: { line: number; chord: number } | null) => void
}) {
  const doc = fromSource(source)
  const sections = sectionsOf(doc.blocks)
  const wanted = useRef<{ line: number; at: number } | null>(null)

  const apply = (next: SongDocument, kind: string | null = null) => onChange(toSource(next), kind)

  /**
   * Focus follows the structure the edit produced, not the element that was there
   * before it: splitting a line means the caret belongs at the start of the new one.
   */
  useEffect(() => {
    const target = wanted.current
    if (target === null) return
    wanted.current = null

    const input = document.querySelector<HTMLInputElement>(
      `[data-line="${target.line}"] .line-input`,
    )
    if (input === null) return

    input.focus()
    input.setSelectionRange(target.at, target.at)
  }, [source])

  return (
    <div>
      {doc.blocks.map((block, index) => (
        <Fragment key={index}>
          <BlockRow
            block={block}
            index={index}
            section={sections[index]}
            focused={caret.line === index}
            editing={editing !== null && editing.line === index ? editing.chord : null}
            onEditChord={(chord) => onEditing(chord === null ? null : { line: index, chord })}
            onChordName={(chord, name) => {
              apply(setChord(doc, index, chord, name))
              onEditing(null)
            }}
            onText={(text, at) => {
              onCaret({ line: index, at })
              apply(setLineText(doc, index, text), `typing:${index}`)
            }}
            onCaret={(at) => onCaret({ line: index, at })}
            onSplit={(at) => {
              wanted.current = { line: index + 1, at: 0 }
              apply(splitLine(doc, index, at))
            }}
            onJoin={() => {
              const previous = doc.blocks[index - 1]
              if (previous === undefined || previous.kind !== 'lyrics') return

              wanted.current = { line: index - 1, at: previous.text.length }
              apply(joinLines(doc, index))
            }}
          />
        </Fragment>
      ))}

      {/*
        * A song always offers one more line at the end, so adding a verse never
        * needs a button: press Enter on the last line, or click here.
        */}
      <button
        type="button"
        className="editor-hint mt-3 block w-full text-start"
        onClick={() => {
          wanted.current = { line: doc.blocks.length, at: 0 }
          apply(insertLineAfter(doc, doc.blocks.length - 1))
        }}
      >
        + riga
      </button>
    </div>
  )
}

function BlockRow({
  block,
  index,
  section,
  focused,
  editing,
  onEditChord,
  onChordName,
  onText,
  onCaret,
  onSplit,
  onJoin,
}: {
  block: Block
  index: number
  section: SectionKind
  focused: boolean
  editing: number | null
  onEditChord: (chord: number | null) => void
  onChordName: (chord: number, name: string) => void
  onText: (text: string, at: number) => void
  onCaret: (at: number) => void
  onSplit: (at: number) => void
  onJoin: () => void
}) {
  const classes = `editor-line is-${section}${focused ? ' is-focused' : ''}`

  if (block.kind === 'blank') {
    return (
      <div className={classes} data-line={index}>
        <button
          type="button"
          className="editor-aside w-full text-start"
          onClick={() => onCaret(0)}
          aria-label="Riga vuota: separa due strofe"
        >
          <span className="editor-hint">— stacco —</span>
        </button>
      </div>
    )
  }

  if (block.kind === 'boundary') {
    const label = block.section === 'chorus' ? 'ritornello' : 'ponte'
    return (
      <div className={classes} data-line={index}>
        <button type="button" className="editor-aside w-full text-start" onClick={() => onCaret(0)}>
          <span className="badge">
            {block.edge === 'start' ? `inizio ${label}` : `fine ${label}`}
          </span>
        </button>
      </div>
    )
  }

  if (block.kind === 'directive') {
    return (
      <div className={classes} data-line={index}>
        <button type="button" className="editor-aside w-full text-start" onClick={() => onCaret(0)}>
          {/* Shown rather than hidden: it is in the file, so it is on the screen.
              Its text is edited in Sorgente, where a directive is just a line. */}
          <code className="editor-hint">{block.raw.trim()}</code>
        </button>
      </div>
    )
  }

  if (block.kind === 'comment') {
    return (
      <div className={classes} data-line={index}>
        <div className="line-scroll">
          <div className="line-inner">
            <input
              className="line-input italic"
              style={{ color: 'var(--muted)' }}
              value={block.text}
              placeholder="commento"
              onChange={(event) => onText(event.target.value, event.target.selectionStart ?? 0)}
              onFocus={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onClick={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyUp={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onSelect={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onSplit(event.currentTarget.selectionStart ?? block.text.length)
                }
              }}
              aria-label={`Commento alla riga ${index + 1}`}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={classes} data-line={index}>
      <div className="line-scroll">
        <div className="line-inner">
          <ChordRow
            text={block.text}
            chords={block.chords}
            editing={editing}
            onEdit={onEditChord}
            onName={onChordName}
          />

          <input
            className="line-input"
            value={block.text}
            placeholder={index === 0 ? 'Scrivi il testo…' : undefined}
            onChange={(event) => onText(event.target.value, event.target.selectionStart ?? 0)}
            /*
             * Four ways the caret moves, all reported: taking focus, a click that
             * only moves it, the arrow keys, and a selection. The commands act on
             * the line the caret is in, so missing one of these would point them at
             * the wrong line.
             */
            onFocus={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
            onClick={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
            onKeyUp={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
            onSelect={(event) => onCaret(event.currentTarget.selectionStart ?? 0)}
            onKeyDown={(event) => {
              const input = event.currentTarget
              const at = input.selectionStart ?? 0

              if (event.key === 'Enter') {
                event.preventDefault()
                onSplit(at)
                return
              }

              // At the very start, backspace joins this line to the one above,
              // which is what it does in every editor and what nothing else here
              // would do.
              if (event.key === 'Backspace' && at === 0 && input.selectionEnd === 0) {
                event.preventDefault()
                onJoin()
              }
            }}
            aria-label={`Testo della riga ${index + 1}`}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * The chords of one line.
 *
 * The trick is the hidden copy of the words: the chords are pinned to zero-width
 * anchors sitting between the letters of that copy, so their position comes from
 * the same layout that positions the letters in the input below.
 */
function ChordRow({
  text,
  chords,
  editing,
  onEdit,
  onName,
}: {
  text: string
  chords: { at: number; name: string }[]
  editing: number | null
  onEdit: (chord: number | null) => void
  onName: (chord: number, name: string) => void
}) {
  const ordered = chords
    .map((chord, index) => ({ ...chord, index }))
    .sort((a, b) => a.at - b.at)

  let cursor = 0
  const pieces: React.ReactNode[] = []

  ordered.forEach((chord, position) => {
    const at = Math.max(0, Math.min(text.length, chord.at))
    pieces.push(
      <span aria-hidden key={`t${position}`}>
        {text.slice(cursor, at)}
      </span>,
    )
    cursor = at

    pieces.push(
      <span className="chord-anchor" key={`c${chord.index}`}>
        {editing === chord.index ? (
          <ChordField name={chord.name} onDone={(name) => onName(chord.index, name)} />
        ) : (
          <button
            type="button"
            className="chord-chip"
            onClick={() => onEdit(chord.index)}
            aria-label={`Accordo ${chord.name || 'vuoto'}, modifica`}
          >
            {chord.name || '—'}
          </button>
        )}
      </span>,
    )
  })

  pieces.push(
    <span aria-hidden key="tail">
      {text.slice(cursor)}
    </span>,
  )

  return (
    <div className="chord-row">
      <span className="chord-ghost">{pieces}</span>
    </div>
  )
}

/** Typing a chord. Empty and confirmed means the chord goes away. */
function ChordField({ name, onDone }: { name: string; onDone: (name: string) => void }) {
  const [value, setValue] = useState(name)

  return (
    <input
      className="chord-field"
      value={value}
      autoFocus
      spellCheck={false}
      autoCapitalize="off"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault()
          onDone(value)
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          onDone(name)
        }
      }}
      aria-label="Nome dell'accordo"
    />
  )
}

