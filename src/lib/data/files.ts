/**
 * File-backed repository: reads `content/` straight from disk.
 *
 * This is the bootstrap source — the seed script loads the database from these
 * same files — and it also means local development works with no DATABASE_URL at
 * all. It is not a fallback for a database that failed: the choice is made once,
 * in `data/index.ts`, by whether DATABASE_URL is set.
 *
 * Canzonieri are derived here from the `{canzoniere:}` directives, so the app
 * looks the same before a database exists. Once one does, the database owns the
 * assignment and these directives are only an initial value.
 */

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { parseChordPro } from '../chordpro'
import { slugify } from '../slug'
import { type Canzoniere, type Song, type SongRepository, UNFILED } from './types'

const CONTENT_DIR = path.join(process.cwd(), 'content')

interface ParsedFile {
  song: Song
  /** Name as written in the directive, needed to build the canzoniere list. */
  canzoniereName: string
}

function toSong(slug: string, body: string): ParsedFile {
  const parsed = parseChordPro(body)
  const canzoniereName = parsed.canzoniere ?? UNFILED.name

  return {
    song: {
      slug,
      // A file with no {title} still needs a name to show in the list.
      title: parsed.title ?? slug,
      artist: parsed.artist,
      tags: parsed.tags,
      canzoniereSlug: slugify(canzoniereName) || UNFILED.slug,
      body,
      // No versions to compare without a database, and nothing to compare them
      // against: with no database there is no runtime copy of a song either.
      updatedAt: null,
    },
    canzoniereName,
  }
}

async function readFiles(): Promise<ParsedFile[]> {
  let entries: string[]
  try {
    entries = await readdir(CONTENT_DIR)
  } catch {
    return []
  }

  const parsed = await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.chopro'))
      .map(async (entry) => {
        const body = await readFile(path.join(CONTENT_DIR, entry), 'utf8')
        return toSong(entry.replace(/\.chopro$/, ''), body)
      }),
  )

  return parsed.sort((a, b) => a.song.title.localeCompare(b.song.title, 'it'))
}

export async function readSongFiles(): Promise<Song[]> {
  return (await readFiles()).map((entry) => entry.song)
}

/** The canzonieri named by the files, in alphabetical order. */
export async function readCanzoniereFiles(): Promise<Canzoniere[]> {
  const bySlug = new Map<string, Canzoniere>()

  for (const { song, canzoniereName } of await readFiles()) {
    const slug = song.canzoniereSlug ?? UNFILED.slug
    if (!bySlug.has(slug)) bySlug.set(slug, { slug, name: canzoniereName })
  }

  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'))
}

export const fileRepository: SongRepository = {
  listSongs: readSongFiles,

  async getSong(slug) {
    const songs = await readSongFiles()
    return songs.find((song) => song.slug === slug) ?? null
  },

  listCanzonieri: readCanzoniereFiles,
}
