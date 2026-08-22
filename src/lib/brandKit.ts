import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { SITE_URL } from '@/lib/brand'

/**
 * The hosted brand kit, read off disk.
 *
 * `/brand` prints an exhaustive list of what is in `public/brand/kit/`, and this is
 * where that list comes from — the directory itself, not a hand-written array. The
 * kit is 140 files across six folders and arrives replaced wholesale every time the
 * logo is redrawn; a list typed by hand is a list that is wrong by one file the first
 * time nobody notices.
 *
 * Reading the filesystem here is as static-safe as reading `process.env`, and for the
 * same reason `app/pricing/page.tsx` spells out at length: it is not a dynamic API, so
 * it does not opt the page out of prerendering. What it does is resolve at *build*
 * time, against the `public/` folder in the build's own checkout — which is exactly
 * what is wanted, since the files it describes are shipped by that same build. Nothing
 * here runs per request, and there is no `export const dynamic` on the page for the
 * same reason there is none on `/pricing`.
 */

/** Where the kit sits, relative to the project root and to the site's own root. */
const KIT_DIR = path.join('public', 'brand', 'kit')
const KIT_PREFIX = '/brand/kit'

export interface KitFile {
  /** File name alone, e.g. `mark.svg`. */
  name: string
  /** Path within the kit, e.g. `svg/mark.svg` — the folder list's own key. */
  relative: string
  /** What this site serves it at, e.g. `/brand/kit/svg/mark.svg`. */
  href: string
  /** What to paste somewhere else: the same file, absolute. */
  url: string
  bytes: number
}

export interface KitFolder {
  /** Folder within the kit, e.g. `svg` or `ios/AppIcon.appiconset`; `''` for the root. */
  name: string
  files: KitFile[]
}

/**
 * The order the folders are shown in: sources first, then the things made from them,
 * then the verification renders nobody needs but which are part of the drop. Anything
 * a later drop adds that is not named here sorts to the end alphabetically rather than
 * disappearing — a folder missing from the page would be the one failure this list
 * could quietly cause.
 */
const FOLDER_ORDER = ['', 'svg', 'logo', 'icons', 'web', 'ios/AppIcon.appiconset', 'preview']

export function kitUrl(relative: string): string {
  return `https://${SITE_URL}${KIT_PREFIX}/${relative}`
}

export function kitHref(relative: string): string {
  return `${KIT_PREFIX}/${relative}`
}

/**
 * Every file in the kit, grouped by the folder it sits in.
 *
 * Empty when the folder is not there at all, which is what the page's own empty state
 * is written against: a checkout that never received the drop should say so, not throw
 * a build.
 */
export function kitFolders(): KitFolder[] {
  let entries: string[]

  try {
    entries = readdirSync(path.join(process.cwd(), KIT_DIR), {
      recursive: true,
      encoding: 'utf8',
    })
  } catch {
    return []
  }

  const byFolder = new Map<string, KitFile[]>()

  for (const entry of entries) {
    const relative = entry.split(path.sep).join('/')
    const absolute = path.join(process.cwd(), KIT_DIR, entry)

    // `recursive` returns the directories too, and a `.DS_Store` can ride along in a
    // working tree even though one has never been committed.
    if (!statSync(absolute).isFile()) continue
    if (relative.split('/').some((segment) => segment.startsWith('.'))) continue

    const folder = path.posix.dirname(relative)
    const name = path.posix.basename(relative)
    const key = folder === '.' ? '' : folder

    const file: KitFile = {
      name,
      relative,
      href: kitHref(relative),
      url: kitUrl(relative),
      bytes: statSync(absolute).size,
    }

    byFolder.set(key, [...(byFolder.get(key) ?? []), file])
  }

  return [...byFolder.entries()]
    .map(([name, files]) => ({
      name,
      files: files.sort((a, b) => a.name.localeCompare(b.name, 'en')),
    }))
    .sort((a, b) => {
      const ai = FOLDER_ORDER.indexOf(a.name)
      const bi = FOLDER_ORDER.indexOf(b.name)
      if (ai === -1 && bi === -1) return a.name.localeCompare(b.name, 'en')
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
}

/**
 * A file size a person can read at a glance. One decimal from a kilobyte up, none
 * below it: "612 B" is exact and "0.6 KB" is exact and useless.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${round(bytes / 1024)} KB`
  return `${round(bytes / (1024 * 1024))} MB`
}

function round(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1)
}
