/**
 * The booklet as a PDF, laid out the same way the reading screen is: chords
 * sitting above the exact syllable they belong to, word by word — see
 * `SongSheet`'s own comment on why that has to be word-by-word rather than
 * line-by-line to survive wrapping.
 *
 * Visual design follows a pixel-mockup handoff (cover, index, song and
 * continuation pages) rather than the app's own on-screen look — a printed
 * booklet is its own artifact with its own paper palette, not a screenshot of
 * the reader. The mockup groups runs of chord-less words into one span with
 * literal spaces; this file keeps the reading screen's own word-by-word
 * model instead (dropped whitespace, reinserted as a margin) since the two
 * produce the same visual result and rebuilding the parser around the
 * mockup's DOM shape would buy nothing — see its own README: match the
 * output, not the prototype's structure.
 *
 * Always the written key, never a reader's own transposition: a booklet is
 * printed for a room, not for the one person who happened to press the button,
 * and their capo or their `-2` has no business on somebody else's page.
 *
 * Colors are literal hex, not `var(--accent)` and friends: a PDF has no
 * stylesheet to read custom properties from, and this page's paper palette
 * (warm off-black ink, terracotta accent, a ladder of greys for rules and
 * captions) is its own, separate from the screen theme in `DESIGN.md`.
 *
 * Helvetica and Courier, not DM Sans and Geist Mono: the app's own fonts are
 * `next/font/google` files this page has no path to at the moment a booklet is
 * generated, and fetching them from a CDN on demand would make "download a
 * booklet" the one feature in the app that stops working offline — the thing
 * `PRODUCT.md` names as the one mode this app treats as real, not a fallback.
 * The two PDF-standard fonts need no embedding at all, which is what keeps a
 * booklet buildable with no connection, same as everything else already saved.
 * Standard-14 Helvetica has only normal and bold, not the mockup's medium (500)
 * — every weight below is rounded to whichever of the two reads closer.
 *
 * Cover, index, songs, in one document built in two passes. The index has to
 * print a page number next to every song, and there is no way to know those
 * before the songs themselves are laid out — a page is as long as its own
 * lyrics make it, not a fixed slot. So the first pass renders every song (and
 * the index) once each, on its own, purely to count the physical pages it
 * takes; the second pass is the real document, built with the page numbers
 * the first pass measured. `pdf-lib` reads the throwaway PDFs back only for
 * that count — see `countPages`.
 *
 * The two-column song layout is a one-shot split by line count, not a real
 * CSS-style reflow: `@react-pdf/renderer` lays out a fixed tree, it doesn't
 * balance text across columns as it overflows. A section never splits across
 * the divide (see `splitByRows`), and a stanza never splits across a column or
 * page break either (see the `stanza` style's own comment) — a song long
 * enough to overflow both columns of a page simply starts a fresh page with
 * its next stanza in the left column, leaving that page's right column short.
 * The index accepts the same trade-off for the same reason.
 */

import { Document, Font, Page, Path, StyleSheet, Svg, Text, View, pdf } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'

import type { Booklet, BookletSong } from './actions'
import { type Line, type Section, type SectionKind, chordTokens, parseChordPro } from '../chordpro'
import { type Notation, parseChord, transposeChord, formatChord } from '../music/chord'
import { estimateKey } from '../music/key'
import { C_MAJOR } from '../music/notes'

// React-pdf hyphenates long words by default (a title wrapping as "ani-mati"),
// which reads as a typo rather than typesetting. A song title or chord chart
// should wrap at word boundaries, never split one open.
Font.registerHyphenationCallback((word) => [word])

const SITE_URL = 'songbook.sisqo.dev'
const BRAND_ICON_PATH = 'M10 17.5a3 3 0 1 1-3-3c.6 0 1.15.17 1.6.47V4.8l7.4-1.8v3.1L10.9 7.6v9.9z'

const INK = '#16181d'
const MUTED = '#5c626c'
const FAINT = '#8d939c'
const FOOTER_GREY = '#a8aab0'
const STANZA_LABEL_GREY = '#b0b2b8'
const RULE = '#e6e3dc'
const COLUMN_RULE = '#efece5'
const LEADER_DOTS = '#d5d1c8'
const ACCENT = '#97490f'
const ACCENT_BG = '#faf6f1'
const BADGE_TEXT = '#fffaf4'

const SECTION_KIND_LABEL: Record<SectionKind, string> = {
  verse: 'Verse',
  chorus: 'Chorus',
  bridge: 'Bridge',
}

const styles = StyleSheet.create({
  coverPage: {
    paddingTop: 72,
    paddingHorizontal: 63,
    paddingBottom: 45,
    fontFamily: 'Helvetica',
  },
  page: {
    paddingTop: 54,
    paddingHorizontal: 63,
    paddingBottom: 56,
    fontFamily: 'Helvetica',
  },
  /*
   * Absolutely positioned, not a flow sibling of the content above it: a
   * `fixed` element that stays in flow competes with the column layout for
   * the page's height, and on a page whose content exactly fills the page
   * that starves the last line of room rather than pushing it to the next
   * page. Pinning it to the page's own edges — the page already reserves the
   * room in its `paddingBottom` — keeps it out of that fight.
   */
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 63,
    right: 63,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerBordered: {
    borderTopWidth: 0.75,
    borderTopColor: RULE,
    paddingTop: 13.5,
  },
  footerText: {
    fontSize: 8.25,
    color: FOOTER_GREY,
  },

  // Cover
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  badgeIcon: {
    width: 19.5,
    height: 19.5,
    borderRadius: 6,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 9.75,
    color: FAINT,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  coverTitle: {
    fontSize: 68,
    fontWeight: 'bold',
    lineHeight: 0.96,
    letterSpacing: -1.2,
    color: INK,
  },
  coverMeta: {
    fontSize: 14.25,
    color: MUTED,
    marginTop: 21,
  },
  coverDivider: {
    marginTop: 39,
    paddingTop: 22.5,
    borderTopWidth: 0.75,
    borderTopColor: INK,
  },
  coverHighlights: {
    fontSize: 14.25,
    lineHeight: 1.6,
    color: MUTED,
  },

  // Index
  indexHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 15,
    borderBottomWidth: 0.75,
    borderBottomColor: INK,
  },
  indexTitle: {
    fontSize: 27,
    fontWeight: 'bold',
    letterSpacing: -0.5,
    color: INK,
  },
  indexSongbookName: {
    fontSize: 10.5,
    color: FAINT,
  },
  indexColumns: {
    flexDirection: 'row',
    marginTop: 22.5,
  },
  indexColumnLeft: {
    flex: 1,
    marginRight: 26,
  },
  indexColumn: {
    flex: 1,
  },
  indexGroup: {
    marginBottom: 16.5,
  },
  indexGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 7.5,
  },
  indexGroupLabel: {
    fontSize: 8.625,
    fontWeight: 'bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: ACCENT,
  },
  indexGroupRule: {
    flex: 1,
    height: 0.75,
    backgroundColor: RULE,
  },
  indexRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 5.25,
  },
  indexRowTitle: {
    fontSize: 10.5,
    color: INK,
  },
  indexLeader: {
    flex: 1,
    marginHorizontal: 4.5,
    marginBottom: 2,
    borderBottomWidth: 0.75,
    borderBottomColor: LEADER_DOTS,
    borderBottomStyle: 'dotted',
  },
  indexPageNumber: {
    fontSize: 10.5,
    color: MUTED,
  },

  // Song pages
  songHeader: {
    paddingBottom: 13.5,
    borderBottomWidth: 0.75,
    borderBottomColor: INK,
  },
  songHeaderLabel: {
    fontSize: 8.625,
    fontWeight: 'bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: ACCENT,
    marginBottom: 7.5,
  },
  songTitle: {
    fontSize: 25.5,
    fontWeight: 'bold',
    lineHeight: 1.05,
    letterSpacing: -0.5,
    color: INK,
  },
  songArtist: {
    fontSize: 11.25,
    color: MUTED,
    marginTop: 4.5,
  },
  continuationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 10.5,
    borderBottomWidth: 0.75,
    borderBottomColor: RULE,
  },
  continuationTitle: {
    fontSize: 11.25,
    color: MUTED,
  },
  continuationSuffix: {
    color: STANZA_LABEL_GREY,
  },
  columns: {
    flexDirection: 'row',
    flex: 1,
    marginTop: 19.5,
  },
  columnLeft: {
    flex: 1,
    marginRight: 15,
  },
  column: {
    flex: 1,
    paddingLeft: 15,
    borderLeftWidth: 0.75,
    borderLeftColor: COLUMN_RULE,
  },
  stanza: {
    marginBottom: 12,
  },
  stanzaChorus: {
    paddingTop: 8.25,
    paddingHorizontal: 9,
    paddingBottom: 9,
    borderLeftWidth: 1.5,
    borderLeftColor: ACCENT,
    backgroundColor: ACCENT_BG,
  },
  stanzaLabel: {
    fontSize: 7.875,
    fontWeight: 'bold',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: STANZA_LABEL_GREY,
    marginBottom: 6,
  },
  stanzaLabelChorus: {
    color: ACCENT,
  },
  comment: {
    fontSize: 8.625,
    fontStyle: 'italic',
    color: MUTED,
    marginBottom: 4,
  },
  tabRow: {
    fontFamily: 'Courier',
    fontSize: 7.5,
    color: INK,
  },
  lineSpacing: {
    marginTop: 3.75,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  word: {
    flexDirection: 'row',
    marginRight: 3,
  },
  part: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  chord: {
    fontSize: 8.25,
    fontWeight: 'bold',
    color: ACCENT,
  },
  /** Only a real chord label needs breathing room before the next part; a blank placeholder doesn't. */
  chordGap: {
    paddingRight: 3.7,
  },
  lyric: {
    fontSize: 9.75,
    color: INK,
  },
})

/** The brand mark and "Printed with Songbook · …" line, on every page. */
function Footer({ bordered = true }: { bordered?: boolean }) {
  return (
    <View style={[styles.footer, bordered ? styles.footerBordered : undefined]} fixed>
      <Text style={styles.footerText}>Printed with Songbook · {SITE_URL}</Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber }) => (pageNumber === 1 ? '' : String(pageNumber))}
      />
    </View>
  )
}

function CoverPage({ booklet }: { booklet: Booklet }) {
  const songCount = booklet.sections.reduce((sum, section) => sum + section.songs.length, 0)
  const sectionNames = booklet.sections.map((section) => section.name)

  return (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.badgeRow}>
        <View style={styles.badgeIcon}>
          <Svg width={10.5} height={10.5} viewBox="0 0 24 24">
            <Path d={BRAND_ICON_PATH} fill={BADGE_TEXT} />
          </Svg>
        </View>
        <Text style={styles.badgeLabel}>Songbook</Text>
      </View>

      <View style={{ flex: 1 }} />

      <Text style={styles.coverTitle}>{booklet.songbookName}</Text>
      <Text style={styles.coverMeta}>
        {songCount} {songCount === 1 ? 'song' : 'songs'} · {sectionNames.length}{' '}
        {sectionNames.length === 1 ? 'section' : 'sections'}
      </Text>

      {sectionNames.length > 0 && (
        <View style={styles.coverDivider}>
          <Text style={styles.coverHighlights}>{sectionNames.join(' · ')}</Text>
        </View>
      )}

      <View style={{ flex: 1 }} />

      <Footer bordered={false} />
    </Page>
  )
}

/** One song row in the index, grouped under the songbook section it belongs to. */
interface IndexEntry {
  title: string
  /** Null only for the measuring pass, before any page number is known yet. */
  page: number | null
}

interface IndexGroup {
  sectionName: string
  entries: IndexEntry[]
}

/**
 * Splits index groups into two columns by row count (a group header plus one
 * row per song), never mid-group — the index equivalent of `splitByRows`.
 */
function splitGroupsIntoColumns(groups: IndexGroup[]): [IndexGroup[], IndexGroup[]] {
  const totalRows = groups.reduce((sum, group) => sum + 1 + group.entries.length, 0)
  const half = totalRows / 2

  const left: IndexGroup[] = []
  const right: IndexGroup[] = []
  let seen = 0

  for (const group of groups) {
    if (seen < half) {
      left.push(group)
    } else {
      right.push(group)
    }
    seen += 1 + group.entries.length
  }

  return [left, right]
}

function IndexColumn({ groups }: { groups: IndexGroup[] }) {
  return (
    <>
      {groups.map((group, groupIndex) => (
        <View key={groupIndex} style={styles.indexGroup} wrap={false}>
          <View style={styles.indexGroupHeader}>
            <Text style={styles.indexGroupLabel}>{group.sectionName}</Text>
            <View style={styles.indexGroupRule} />
          </View>
          {group.entries.map((entry, entryIndex) => (
            <View key={entryIndex} style={styles.indexRow}>
              <Text style={styles.indexRowTitle}>{entry.title}</Text>
              <View style={styles.indexLeader} />
              <Text style={styles.indexPageNumber}>{entry.page ?? ''}</Text>
            </View>
          ))}
        </View>
      ))}
    </>
  )
}

function IndexPage({ songbookName, groups }: { songbookName: string; groups: IndexGroup[] }) {
  const [left, right] = splitGroupsIntoColumns(groups)

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.indexHeader}>
        <Text style={styles.indexTitle}>Index</Text>
        <Text style={styles.indexSongbookName}>{songbookName}</Text>
      </View>

      <View style={styles.indexColumns}>
        <View style={styles.indexColumnLeft}>
          <IndexColumn groups={left} />
        </View>
        <View style={styles.indexColumn}>
          <IndexColumn groups={right} />
        </View>
      </View>

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
      <>
        {line.rows.map((row, index) => (
          <Text key={index} style={styles.tabRow}>
            {row}
          </Text>
        ))}
      </>
    )
  }

  return (
    <View style={styles.line}>
      {line.words.map((word, wordIndex) => (
        <View key={wordIndex} style={styles.word}>
          {word.parts.map((part, partIndex) => {
            const label = chordLabel(part.chord)
            return (
              <View key={partIndex} style={styles.part}>
                {roomForChords && (
                  <Text style={label === null ? styles.chord : [styles.chord, styles.chordGap]}>
                    {label ?? ' '}
                  </Text>
                )}
                <Text style={styles.lyric}>{part.text === '' ? ' ' : part.text}</Text>
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function Stanzas({
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
          style={section.kind === 'chorus' ? [styles.stanza, styles.stanzaChorus] : styles.stanza}
          /*
           * Never split, on a column or a page break alike: print convention
           * keeps a verse or chorus whole, and it also happens to be the
           * simplest way to guarantee a chord is never stranded apart from
           * its own lyric — nothing inside an unbreakable block can be torn.
           */
          wrap={false}
        >
          <Text
            style={section.kind === 'chorus' ? [styles.stanzaLabel, styles.stanzaLabelChorus] : styles.stanzaLabel}
          >
            {SECTION_KIND_LABEL[section.kind]}
          </Text>
          {section.lines.map((line, lineIndex) => (
            <View key={lineIndex} style={lineIndex > 0 ? styles.lineSpacing : undefined}>
              <BookletLine line={line} chordLabel={chordLabel} roomForChords={roomForChords} />
            </View>
          ))}
        </View>
      ))}
    </>
  )
}

/**
 * Splits a song's sections into two roughly even halves, by line count rather
 * than by section count — a song of one long verse and one short chorus would
 * split unevenly by section alone. Never mid-section: a stanza stays whole
 * (see the `stanza` style's own `wrap={false}`), but sections stay in the
 * order they were written, half in one column, the rest continuing in the
 * other.
 */
function splitByRows(sections: Section[]): [Section[], Section[]] {
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
  sectionName,
  notation,
}: {
  song: BookletSong
  /** The songbook section this song lives in — shown as a running header on every page. */
  sectionName: string
  notation: Notation
}) {
  const { parsed, chordLabel, roomForChords } = prepare(song, notation)
  const [left, right] = splitByRows(parsed.sections)

  return (
    <Page size="A4" style={styles.page} wrap>
      <View
        fixed
        render={({ subPageNumber }) =>
          subPageNumber === 1 ? (
            <View style={styles.songHeader}>
              <Text style={styles.songHeaderLabel}>{sectionName}</Text>
              <Text style={styles.songTitle}>{song.title}</Text>
              {song.artist !== null && <Text style={styles.songArtist}>{song.artist}</Text>}
            </View>
          ) : (
            <View style={styles.continuationHeader}>
              <Text style={styles.continuationTitle}>
                {song.title} <Text style={styles.continuationSuffix}>— continues</Text>
              </Text>
              <Text style={styles.songHeaderLabel}>{sectionName}</Text>
            </View>
          )
        }
      />

      <View style={styles.columns}>
        <View style={styles.columnLeft}>
          <Stanzas sections={left} chordLabel={chordLabel} roomForChords={roomForChords} />
        </View>
        <View style={styles.column}>
          <Stanzas sections={right} chordLabel={chordLabel} roomForChords={roomForChords} />
        </View>
      </View>

      <Footer />
    </Page>
  )
}

/** Every song, flattened in order, each remembering which section it belongs to. */
function flatten(booklet: Booklet): { song: BookletSong; sectionName: string }[] {
  const flat: { song: BookletSong; sectionName: string }[] = []
  for (const section of booklet.sections) {
    for (const song of section.songs) {
      flat.push({ song, sectionName: section.name })
    }
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
      countPages(<BookletSongPage song={entry.song} sectionName={entry.sectionName} notation={notation} />),
    ),
  )

  // The index's own length turns on how many songs and sections there are,
  // never on the digits printed next to them — a row is exactly as tall
  // whether it says "3" or "103" — so it can be measured with no real page
  // numbers in hand yet.
  const measureGroups: IndexGroup[] = booklet.sections.map((section) => ({
    sectionName: section.name,
    entries: section.songs.map((song) => ({ title: song.title, page: null })),
  }))
  const indexPageCount = await countPages(
    <IndexPage songbookName={booklet.songbookName} groups={measureGroups} />,
  )

  // Pass two: the real thing. Page 1 is the cover, the index follows it, and
  // every song starts right where the one before it left off.
  let page = 1 + indexPageCount + 1
  const pages: number[] = entries.map((_entry, index) => {
    const startsAt = page
    page += songPageCounts[index]
    return startsAt
  })

  let i = 0
  const indexGroups: IndexGroup[] = booklet.sections.map((section) => ({
    sectionName: section.name,
    entries: section.songs.map((song) => {
      const entry: IndexEntry = { title: song.title, page: pages[i] }
      i += 1
      return entry
    }),
  }))

  const document = (
    <Document title={booklet.songbookName}>
      <CoverPage booklet={booklet} />
      <IndexPage songbookName={booklet.songbookName} groups={indexGroups} />
      {entries.map((entry, index) => (
        <BookletSongPage key={index} song={entry.song} sectionName={entry.sectionName} notation={notation} />
      ))}
    </Document>
  )

  return pdf(document).toBlob()
}
