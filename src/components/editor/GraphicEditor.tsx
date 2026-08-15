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
import {
  addChord,
  chordIndexAt,
  insertLineAfter,
  joinLines,
  moveChord,
  removeLine,
  setChord,
  setLineText,
  setTabRows,
  splitLine,
} from '@/lib/editor/edits'

/**
 * Which letter of a line a click landed on.
 *
 * The chords are *positioned* by the browser, using a hidden copy of the words, and
 * that needs no measuring. Going the other way — from a point back to a letter —
 * has no such trick, so this measures with a canvas set to the input's own font. The
 * same measurement, in a test, agrees with the browser's layout to a tenth of a
 * pixel; and a chord landing a letter off can be nudged with the arrows next to it.
 */
function letterAt(row: HTMLElement, clientX: number): number | null {
  const input = row.parentElement?.querySelector<HTMLInputElement>('.line-input')
  if (input == null) return null

  const context = document.createElement('canvas').getContext('2d')
  if (context === null) return null

  const style = window.getComputedStyle(input)
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

  const x = clientX - input.getBoundingClientRect().left
  const text = input.value

  let best = 0
  let smallest = Infinity
  for (let at = 0; at <= text.length; at += 1) {
    const gap = Math.abs(context.measureText(text.slice(0, at)).width - x)
    if (gap < smallest) {
      smallest = gap
      best = at
    }
  }

  return best
}

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
            onAddChord={(at) => {
              const block = doc.blocks[index]
              if (block.kind !== 'lyrics') return

              // Opened for typing straight away: an empty chord is a chord you are
              // in the middle of naming, and leaving it empty takes it back off.
              onEditing({ line: index, chord: chordIndexAt(block.chords, at) })
              apply(addChord(doc, index, at))
            }}
            onMoveChord={(chord, delta) => {
              const moved = moveChord(doc, index, chord, delta)
              // Passing another chord changes which one this index means.
              onEditing({ line: index, chord: moved.chord })
              apply(moved.document)
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
            onRemove={() => apply(removeLine(doc, index))}
            onTabText={(text) => apply(setTabRows(doc, index, text.split('\n')), `tab:${index}`)}
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
        + line
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
  onAddChord,
  onMoveChord,
  onText,
  onCaret,
  onSplit,
  onJoin,
  onRemove,
  onTabText,
}: {
  block: Block
  index: number
  section: SectionKind
  focused: boolean
  editing: number | null
  onEditChord: (chord: number | null) => void
  onChordName: (chord: number, name: string) => void
  onAddChord: (at: number) => void
  onMoveChord: (chord: number, delta: number) => void
  onText: (text: string, at: number) => void
  onCaret: (at: number) => void
  onSplit: (at: number) => void
  onJoin: () => void
  onRemove: () => void
  onTabText: (text: string) => void
}) {
  const classes = `editor-line is-${section}${focused ? ' is-focused' : ''}`

  /**
   * The lines that are not words: a blank, a chorus marker, a directive.
   *
   * Each carries its own × . The toolbar can delete the line the cursor is on and
   * always could, but nobody found it there — a row you can see is a row you can
   * remove. Backspace (or Delete) does the same once the row is focused — reached by
   * clicking it, same as any button — for a "— break —" in particular: a lyrics line
   * becomes exactly this the moment its last word is backspaced away (see
   * `readLyricLine`/`fromSource`), so finishing that same gesture with one more
   * Backspace, rather than reaching for the mouse, is what completes it.
   */
  if (block.kind === 'blank' || block.kind === 'boundary' || block.kind === 'directive') {
    const section = block.kind === 'boundary' && block.section === 'chorus' ? 'chorus' : 'bridge'

    return (
      <div className={classes} data-line={index}>
        <button
          type="button"
          className="editor-aside flex-1 text-start"
          onClick={() => onCaret(0)}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' || event.key === 'Delete') {
              event.preventDefault()
              onRemove()
            }
          }}
        >
          {block.kind === 'blank' && <span className="editor-hint">— break —</span>}

          {block.kind === 'boundary' && (
            <span className="badge">
              {block.edge === 'start' ? `${section} start` : `${section} end`}
            </span>
          )}

          {/* Shown rather than hidden: it is in the file, so it is on the screen.
              Its text is edited in Source, where a directive is just a line. */}
          {block.kind === 'directive' && <code className="editor-hint">{block.raw.trim()}</code>}
        </button>

        <button
          type="button"
          className="line-remove"
          onClick={onRemove}
          aria-label={
            block.kind === 'blank'
              ? 'Delete this break'
              : block.kind === 'boundary'
                ? 'Delete this marker'
                : 'Delete this directive'
          }
        >
          ×
        </button>
      </div>
    )
  }

  /**
   * A tab, edited as one block of raw monospace text rather than the per-letter
   * chord-and-word model every `lyrics` line uses — alignment is the entire point
   * of a tab, and nothing here should ever read a dash as a syllable to wrap. Enter
   * inside it is a plain newline, a new row of the same tab, not a split into two
   * blocks: unlike a verse, a tab is not a run of independent lines that happen to
   * sit next to each other.
   */
  if (block.kind === 'tab') {
    return (
      <div className={classes} data-line={index}>
        <div className="line-scroll">
          <div className="line-inner">
            <textarea
              className="tab-input"
              value={block.rows.join('\n')}
              wrap="off"
              spellCheck={false}
              rows={Math.max(block.rows.length, 2)}
              onChange={(event) => onTabText(event.target.value)}
              onFocus={() => onCaret(0)}
              onClick={() => onCaret(0)}
              aria-label={`Tab, line ${index + 1}`}
            />
          </div>
        </div>

        <button type="button" className="line-remove" onClick={onRemove} aria-label="Delete this tab">
          ×
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
              placeholder="comment"
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
              aria-label={`Comment on line ${index + 1}`}
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
            onAddAt={onAddChord}
            onMove={onMoveChord}
          />

          <input
            className="line-input"
            value={block.text}
            placeholder={index === 0 ? 'Write the lyrics…' : undefined}
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
            aria-label={`Text of line ${index + 1}`}
          />
        </div>
      </div>

      {/*
        * The two arrows, kept out of `.line-scroll` entirely rather than floating over
        * the chord being renamed: that box scrolls a long line sideways as one piece
        * with `overflow-y: hidden` (see its own comment), and a popover tall enough for
        * a real touch target rendered inside it simply got sheared off at the top —
        * which is what "the tool doesn't fit above the row" turned out to mean. A
        * sibling of the scrolling box, in the row's own layout, has no such ceiling and
        * never scrolls out of view with a long line either.
        */}
      {editing !== null && (
        <div className="chord-move-controls">
          <button
            type="button"
            className="chord-nudge"
            onMouseDown={(event) => {
              // Before focus moves, so the name field being edited survives the press.
              event.preventDefault()
              onMoveChord(editing, -1)
            }}
            aria-label="Move the chord one letter left"
          >
            ‹
          </button>
          <button
            type="button"
            className="chord-nudge"
            onMouseDown={(event) => {
              event.preventDefault()
              onMoveChord(editing, 1)
            }}
            aria-label="Move the chord one letter right"
          >
            ›
          </button>
        </div>
      )}
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
  onAddAt,
  onMove,
}: {
  text: string
  chords: { at: number; name: string }[]
  editing: number | null
  onEdit: (chord: number | null) => void
  onName: (chord: number, name: string) => void
  onAddAt: (at: number) => void
  onMove: (chord: number, delta: number) => void
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
          <ChordField
            name={chord.name}
            onDone={(name) => onName(chord.index, name)}
            onMove={(delta) => onMove(chord.index, delta)}
          />
        ) : (
          <button
            type="button"
            className="chord-chip"
            /* The row below adds a chord; a chip opens the one already there. */
            onClick={(event) => {
              event.stopPropagation()
              onEdit(chord.index)
            }}
            aria-label={`Chord ${chord.name || 'empty'}, edit`}
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

  /*
   * A line with no words: an intro, a solo, a turnaround.
   *
   * Written `[re] [la] [re] [sol]`, so its "words" are single spaces — and a space is
   * four pixels wide while a chord name is twenty, which piled the whole intro into one
   * illegible smudge at the top of the song. There are no syllables here to align to, so
   * the chords are simply a row of chords, spaced like the words they stand in for.
   *
   * The reader has no such trouble: there each chord sets the width of the word beneath
   * it. Here the words are a real input and the ghost above has to match it letter for
   * letter, so widening the ghost is exactly what must not happen. (Two chords on one
   * syllable of a line that *does* have words still overlap; the arrows separate them,
   * and fixing that properly means measuring.)
   */
  if (text.trim() === '') {
    return (
      <div
        className="chord-row"
        onClick={() => onAddAt(text.length)}
        role="presentation"
      >
        <span className="chord-loose">
          {ordered.map((chord) =>
            editing === chord.index ? (
              <ChordField
                key={chord.index}
                name={chord.name}
                onDone={(name) => onName(chord.index, name)}
                onMove={(delta) => onMove(chord.index, delta)}
              />
            ) : (
              <button
                key={chord.index}
                type="button"
                className="chord-chip is-loose"
                onClick={(event) => {
                  event.stopPropagation()
                  onEdit(chord.index)
                }}
                aria-label={`Chord ${chord.name || 'empty'}, edit`}
              >
                {chord.name || '—'}
              </button>
            ),
          )}
        </span>
      </div>
    )
  }

  return (
    /*
     * Tapping the row puts a chord on the syllable under the finger. It is the
     * gesture the row is asking for, and the toolbar button is the same thing for
     * whoever is on a keyboard.
     */
    <div
      className="chord-row"
      onClick={(event) => {
        const at = letterAt(event.currentTarget, event.clientX)
        if (at !== null) onAddAt(at)
      }}
      role="presentation"
    >
      <span className="chord-ghost">{pieces}</span>
    </div>
  )
}

/**
 * Typing a chord, and moving it.
 *
 * Empty and confirmed means the chord goes away — that is how one comes off a
 * syllable. The two arrows that nudge it a letter at a time are not here any more —
 * see `BlockRow`'s own comment — but Alt+Arrow still moves it without leaving the
 * field, for whoever is on a keyboard.
 */
function ChordField({
  name,
  onDone,
  onMove,
}: {
  name: string
  onDone: (name: string) => void
  onMove: (delta: number) => void
}) {
  const [value, setValue] = useState(name)

  return (
    <span className="chord-editing" onClick={(event) => event.stopPropagation()}>
      <input
        className="chord-field"
        value={value}
        autoFocus
        spellCheck={false}
        autoCapitalize="off"
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onDone(value)}
        onKeyDown={(event) => {
          // Alt with an arrow moves the chord; the arrows alone move the cursor
          // inside the name, which is what they are for while typing.
          if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault()
            onMove(event.key === 'ArrowLeft' ? -1 : 1)
            return
          }

          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            onDone(value)
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onDone(name)
          }
        }}
        aria-label="Chord name"
      />
    </span>
  )
}

