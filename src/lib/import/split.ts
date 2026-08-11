/**
 * Cuts a paste into one text per song.
 *
 * Only on marks that a human put there on purpose. The tempting heuristic —
 * "a blank line, then a line that looks like a title" — is exactly wrong for this
 * material: songs are full of blank lines between verses, and a verse's first line
 * looks like a title as often as not. Getting that wrong tears one song into five,
 * and the person pasting cannot see it happen until five wrong songs are saved.
 *
 * So the marks are explicit, and each of the three is something that already
 * appears in real sources:
 *
 * - `{new_song}`, or `{ns}` — ChordPro's own separator for a multi-song file, so
 *   an export from any tool that speaks it can be pasted whole.
 * - A rule: a line of nothing but `---`, `===`, `***` or `___`. What people type
 *   themselves when they paste two songs into one box.
 * - A second `{title:}` directive. A file cannot hold two titles for one song, so
 *   a later one is the next song starting — and unlike the rules, this mark is
 *   part of the song it opens, so it stays with it.
 *
 * A form feed counts as a rule: text extracted from a PDF songbook carries one at
 * every page break, and those pages are songs.
 *
 * Anything else is one song, which is the safe way to be wrong: the screen shows
 * what it found before saving, and one song too few is a re-paste, while one song
 * too many is a mess to clean up afterwards.
 */

/** `{ns}` or `{new_song}`, with or without an argument. */
const NEW_SONG = /^\{\s*(?:ns|new_song)\s*(?::[^}]*)?\}$/i

/** `{t: …}` or `{title: …}`, which opens the song rather than separating it. */
const TITLE = /^\{\s*(?:t|title)\s*:[^}]*\}$/i

/** Three or more of one rule character, and nothing else. */
const RULE = /^(?:-{3,}|={3,}|\*{3,}|_{3,})$/

export function splitSongs(text: string): string[] {
  // A form feed is a page break, and a page break in a songbook is a new song.
  const lines = text.replace(/\r\n?/g, '\n').replace(/\f/g, '\n---\n').split('\n')

  const songs: string[][] = []
  let current: string[] = []
  const hasContent = () => current.some((line) => line.trim() !== '')

  const cut = () => {
    if (hasContent()) songs.push(current)
    current = []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (RULE.test(trimmed) || NEW_SONG.test(trimmed)) {
      // The mark is not part of either song.
      cut()
      continue
    }

    /*
     * A title only starts a song when there is already one underway. Otherwise a
     * paste that opens with `{title:}` — every ChordPro export does — would begin
     * with an empty song before it.
     */
    if (TITLE.test(trimmed) && hasContent()) {
      cut()
    }

    current.push(line)
  }

  cut()

  // Blank lines around the cuts belong to no song.
  return songs.map((song) => song.join('\n').replace(/^(?:[ \t]*\n)+/, '').trimEnd())
}
