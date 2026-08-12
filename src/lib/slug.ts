/**
 * Slug generation for songbook names.
 *
 * A songbook's slug is generated once and then frozen, so this only ever runs
 * at creation. Renaming deliberately does not touch it.
 */

/** Combining diacritical marks, as escapes so the source stays legible. */
const DIACRITICS = /[\u0300-\u036f]/g

/** `Da imparare` becomes `da-imparare`; accents are folded, not dropped. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * A slug that is not already taken. Two songbooks may legitimately be named
 * the same way — a numeric suffix keeps the key unique without refusing the
 * name the reader asked for.
 */
export function uniqueSlug(value: string, taken: Iterable<string>): string {
  const base = slugify(value) || 'songbook'
  const used = new Set(taken)

  if (!used.has(base)) return base

  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`
    if (!used.has(candidate)) return candidate
  }
}
