/**
 * Rebuilds a `.chopro` file from a stored song.
 *
 * The metadata directives are written fresh from the columns rather than trusted
 * from the body: an imported song's body may never have had them, and one that
 * came from a file may have been edited since. Writing them from the row is what
 * makes a restore reproduce the row.
 */

import type { Song } from '../data/types'

/** Directives this rebuilds, and therefore has to strip first to avoid doubles. */
const METADATA = /^\s*\{\s*(?:title|t|artist|st|subtitle|key|tags?|canzoniere|songbook)\s*:[^}]*\}\s*$/i

export function toChoproFile(song: Song, canzoniereName: string | null): string {
  const head: string[] = [`{title: ${song.title}}`]

  if (song.artist !== null && song.artist !== '') head.push(`{artist: ${song.artist}}`)
  if (song.originalKey !== null && song.originalKey !== '') head.push(`{key: ${song.originalKey}}`)
  if (song.tags.length > 0) head.push(`{tags: ${song.tags.join(', ')}}`)
  if (canzoniereName !== null) head.push(`{canzoniere: ${canzoniereName}}`)

  const body = song.body
    .split(/\r?\n/)
    .filter((line) => !METADATA.test(line))
    .join('\n')
    .replace(/^\n+/, '')
    .trimEnd()

  return `${head.join('\n')}\n\n${body}\n`
}

/** `Certe notti` becomes `certe-notti.chopro`, matching how the seed reads slugs. */
export function choproFilename(slug: string): string {
  return `${slug}.chopro`
}
