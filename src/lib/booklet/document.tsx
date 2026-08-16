/**
 * The booklet as a PDF, laid out the same way the reading screen is: chords
 * sitting above the exact syllable they belong to, word by word — see
 * `SongSheet`'s own comment on why that has to be word-by-word rather than
 * line-by-line to survive wrapping.
 *
 * Always the written key, never a reader's own transposition: a booklet is
 * printed for a room, not for the one person who happened to press the button,
 * and their capo or their `-2` has no business on somebody else's page.
 *
 * Colors are literal hex, not `var(--accent)` and friends: a PDF has no
 * stylesheet to read custom properties from, so the light theme's own values
 * (`DESIGN.md`) are copied in once, here, rather than reached for from CSS.
 *
 * Helvetica and Courier, not DM Sans and Geist Mono: the app's own fonts are
 * `next/font/google` files this page has no path to at the moment a booklet is
 * generated, and fetching them from a CDN on demand would make "download a
 * booklet" the one feature in the app that stops working offline — the thing
 * `PRODUCT.md` names as the one mode this app treats as real, not a fallback.
 * The two PDF-standard fonts need no embedding at all, which is what keeps a
 * booklet buildable with no connection, same as everything else already saved.
 *
 * Cover, index, songs, in one document built in two passes. The index has to
 * print a page number next to every song, and there is no way to know those
 * before the songs themselves are laid out — a page is as long as its own
 * lyrics make it, not a fixed slot. So the first pass renders every song (and
 * the index) once each, on its own, purely to count the physical pages it
 * takes; the second pass is the real document, built with the page numbers
 * the first pass measured. `pdf-lib` reads the throwaway PDFs back only for
 * that count — see `countPages`.
 */

import { Fragment } from 'react'

import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'

import type { Booklet, BookletSong } from './actions'
import { type Line, type Section, chordTokens, parseChordPro } from '../chordpro'
import { type Notation, parseChord, transposeChord, formatChord } from '../music/chord'
import { estimateKey } from '../music/key'
import { C_MAJOR } from '../music/notes'

const SITE_URL = 'https://songbook.sisqo.dev'

const INK = '#16181d'
const MUTED = '#5c626c'
const LINE = '#dcdad4'
const ACCENT = '#97490f'
/** A rough 35% mix of `ACCENT` over white — PDF borders take a solid color, not an alpha. */
const ACCENT_DILUTE = '#dcb79b'

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 72,
    paddingHorizontal: 44,
    fontFamily: 'Helvetica',
    fontSize: 11,
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.75,
    borderTopColor: LINE,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 8,
    color: MUTED,
  },
  coverBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: 700,
    color: INK,
    textAlign: 'center',
  },
  coverMeta: {
    fontSize: 12,
    color: MUTED,
    marginTop: 10,
  },
  indexTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: INK,
    marginBottom: 18,
  },
  indexSection: {
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: MUTED,
    marginTop: 14,
    marginBottom: 6,
  },
  indexRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
  },
  indexSongTitle: {
    fontSize: 11,
    color: INK,
    flex: 1,
    marginRight: 8,
  },
  indexPageNumber: {
    fontSize: 11,
    color: MUTED,
  },
  sectionLabel: {
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: MUTED,
    marginBottom: 14,
  },
  columns: {
    flexDirection: 'row',
  },
  column: {
    flex: 1,
  },
  columnLeft: {
    marginRight: 22,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: INK,
  },
  artist: {
    fontSize: 12,
    color: MUTED,
    marginTop: 3,
    marginBottom: 20,
  },
  section: {
    marginBottom: 14,
  },
  sectionIndented: {
    borderLeftWidth: 2,
    borderLeftColor: ACCENT_DILUTE,
    paddingLeft: 12,
    marginLeft: 2,
  },
  comment: {
    fontSize: 10,
    fontStyle: 'italic',
    color: MUTED,
    marginBottom: 4,
  },
  tabRow: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: INK,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  word: {
    flexDirection: 'row',
    marginRight: 4,
    marginBottom: 2,
  },
  part: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  chord: {
    fontSize: 9,
    fontWeight: 700,
    color: ACCENT,
  },
  lyric: {
    fontSize: 11,
    color: INK,
  },
})

/** On every page: what this PDF is, and where in it a reader currently is. */
function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        Printed with Songbook {SITE_URL}
      </Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  )
}

function CoverPage({ booklet }: { booklet: Booklet }) {
  const songCount = booklet.sections.reduce((sum, section) => sum + section.songs.length, 0)

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.coverBody}>
        <Text style={styles.coverTitle}>{booklet.songbookName}</Text>
        <Text style={styles.coverMeta}>
          {songCount} {songCount === 1 ? 'song' : 'songs'}
        </Text>
      </View>
      <Footer />
    </Page>
  )
}

/** One line of the index: a song, which section it opens (if any), and the page it starts on. */
interface IndexEntry {
  title: string
  artist: string | null
  sectionLabel: string | null
  /** Null only for the measuring pass, before any page number is known yet. */
  page: number | null
}

/**
 * `wrap`, same as a song: an index long enough to need a second page is
 * exactly as legitimate as a song long enough to need one, and both are
 * measured and printed the same way.
 */
function IndexPage({ entries }: { entries: IndexEntry[] }) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.indexTitle}>Index</Text>
      {entries.map((entry, index) => (
        <Fragment key={index}>
          {entry.sectionLabel !== null && (
            <Text style={styles.indexSection}>{entry.sectionLabel}</Text>
          )}
          <View style={styles.indexRow} wrap={false}>
            <Text style={styles.indexSongTitle}>
              {entry.title}
              {entry.artist !== null && ` — ${entry.artist}`}
            </Text>
            <Text style={styles.indexPageNumber}>{entry.page ?? ''}</Text>
          </View>
        </Fragment>
      ))}
      <Footer />
    </Page>
  )
}

/** One song's parsed body, ready to lay out — computed once and reused for every line. */
function prepare(song: BookletSong, notation: Notation) {
  const parsed = parseChordPro(song.body)
  const written = estimateKey(chordTokens(parsed)) ?? C_MAJOR

  const chordLabel = (raw: string | null): string | null => {
    if (raw === null) return null
    const chord = parseChord(raw)
    if (chord === null) return raw
    return formatChord(transposeChord(chord, 0, written), notation)
  }

  const roomForChords = parsed.sections.some((section) =>
    section.lines.some((line) => line.kind === 'lyrics' && line.hasChords),
  )

  return { parsed, chordLabel, roomForChords }
}

function BookletLine({
  line,
  chordLabel,
  roomForChords,
}: {
  line: Line
  chordLabel: (raw: string | null) => string | null
  roomForChords: boolean
}) {
  if (line.kind === 'comment') {
    return <Text style={styles.comment}>{line.text}</Text>
  }

  if (line.kind === 'tab') {
    return (
      <View wrap={false}>
        {line.rows.map((row, index) => (
          <Text key={index} style={styles.tabRow}>
            {row}
          </Text>
        ))}
      </View>
    )
  }

  /*
   * `wrap={false}` at every level a chord and its own syllable share: a page
   * break is free to fall between one line and the next, never inside one —
   * a chord stranded at the bottom of a column with its lyric starting the
   * next is exactly the split a reader can't use.
   */
  return (
    <View style={styles.line} wrap={false}>
      {line.words.map((word, wordIndex) => (
        <View key={wordIndex} style={styles.word} wrap={false}>
          {word.parts.map((part, partIndex) => (
            <View key={partIndex} style={styles.part} wrap={false}>
              {roomForChords && <Text style={styles.chord}>{chordLabel(part.chord) ?? ' '}</Text>}
              <Text style={styles.lyric}>{part.text === '' ? ' ' : part.text}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function SongSections({
  sections,
  chordLabel,
  roomForChords,
}: {
  sections: Section[]
  chordLabel: (raw: string | null) => string | null
  roomForChords: boolean
}) {
  return (
    <>
      {sections.map((section, sectionIndex) => (
        <View
          key={sectionIndex}
          style={
            section.kind === 'verse'
              ? styles.section
              : [styles.section, styles.sectionIndented]
          }
        >
          {section.lines.map((line, lineIndex) => (
            <BookletLine
              key={lineIndex}
              line={line}
              chordLabel={chordLabel}
              roomForChords={roomForChords}
            />
          ))}
        </View>
      ))}
    </>
  )
}

/**
 * Splits a song's sections into two roughly even halves, by line count rather
 * than by section count — a song of one long verse and one short chorus would
 * split unevenly by section alone. Never mid-section: a section can span the
 * column break (ordinary print behaviour — see `BookletLine`'s own comment
 * for the one break this file does refuse), but its lines stay in the order
 * they were written, half in one column, the rest continuing in the other.
 */
function splitIntoColumns(sections: Section[]): [Section[], Section[]] {
  const totalLines = sections.reduce((sum, section) => sum + section.lines.length, 0)
  const half = totalLines / 2

  const left: Section[] = []
  const right: Section[] = []
  let seen = 0

  for (const section of sections) {
    if (seen < half) {
      left.push(section)
    } else {
      right.push(section)
    }
    seen += section.lines.length
  }

  return [left, right]
}

function BookletSongPage({
  song,
  sectionLabel,
  notation,
}: {
  song: BookletSong
  /** Shown only for the first song of each section — a set break, not a repeat. */
  sectionLabel: string | null
  notation: Notation
}) {
  const { parsed, chordLabel, roomForChords } = prepare(song, notation)
  const [left, right] = splitIntoColumns(parsed.sections)

  return (
    <Page size="A4" style={styles.page} wrap>
      {sectionLabel !== null && <Text style={styles.sectionLabel}>{sectionLabel}</Text>}
      <Text style={styles.title}>{song.title}</Text>
      {song.artist !== null && <Text style={styles.artist}>{song.artist}</Text>}

      <View style={styles.columns}>
        <View style={[styles.column, styles.columnLeft]}>
          <SongSections sections={left} chordLabel={chordLabel} roomForChords={roomForChords} />
        </View>
        <View style={styles.column}>
          <SongSections sections={right} chordLabel={chordLabel} roomForChords={roomForChords} />
        </View>
      </View>

      <Footer />
    </Page>
  )
}

/** Every song, flattened in order, each remembering which section it opened. */
function flatten(booklet: Booklet): { song: BookletSong; sectionLabel: string | null }[] {
  const flat: { song: BookletSong; sectionLabel: string | null }[] = []
  for (const section of booklet.sections) {
    section.songs.forEach((song, index) => {
      flat.push({ song, sectionLabel: index === 0 ? section.name : null })
    })
  }
  return flat
}

/**
 * How many physical pages one `<Page>` element takes, by rendering it alone and
 * reading the result back with `pdf-lib` — the only reliable way to ask
 * `@react-pdf/renderer` "how long is this", since it lays a page out as long as
 * its own content makes it, not to a fixed slot this function could compute by
 * itself.
 */
async function countPages(page: React.ReactElement): Promise<number> {
  const blob = await pdf(<Document>{page}</Document>).toBlob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const rendered = await PDFDocument.load(bytes)
  return rendered.getPageCount()
}

/** Renders the booklet to a downloadable blob — the one thing the export panel needs. */
export async function bookletToBlob(booklet: Booklet, notation: Notation): Promise<Blob> {
  const entries = flatten(booklet)

  // Pass one: measure. Every song starts a fresh page and shares no flow with
  // its neighbours, so how long it runs depends only on its own words — safe
  // to measure in isolation, in parallel, before any page number exists.
  const songPageCounts = await Promise.all(
    entries.map((entry) =>
      countPages(
        <BookletSongPage song={entry.song} sectionLabel={entry.sectionLabel} notation={notation} />,
      ),
    ),
  )

  // The index's own length turns on how many songs and sections there are,
  // never on the digits printed next to them — a row is exactly as tall
  // whether it says "3" or "103" — so it can be measured with no real page
  // numbers in hand yet.
  const indexPageCount = await countPages(
    <IndexPage
      entries={entries.map((entry) => ({
        title: entry.song.title,
        artist: entry.song.artist,
        sectionLabel: entry.sectionLabel,
        page: null,
      }))}
    />,
  )

  // Pass two: the real thing. Page 1 is the cover, the index follows it, and
  // every song starts right where the one before it left off.
  let page = 1 + indexPageCount + 1
  const indexEntries: IndexEntry[] = entries.map((entry, index) => {
    const withPage: IndexEntry = {
      title: entry.song.title,
      artist: entry.song.artist,
      sectionLabel: entry.sectionLabel,
      page,
    }
    page += songPageCounts[index]
    return withPage
  })

  const document = (
    <Document title={booklet.songbookName}>
      <CoverPage booklet={booklet} />
      <IndexPage entries={indexEntries} />
      {entries.map((entry, index) => (
        <BookletSongPage
          key={index}
          song={entry.song}
          sectionLabel={entry.sectionLabel}
          notation={notation}
        />
      ))}
    </Document>
  )

  return pdf(document).toBlob()
}
