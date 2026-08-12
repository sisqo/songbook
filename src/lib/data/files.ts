/**
 * File-backed repository: reads `content/` straight from disk.
 *
 * This is the bootstrap source — the seed script loads the database from these
 * same files — and it also means local development works with no DATABASE_URL at
 * all. It is not a fallback for a database that failed: the choice is made once,
 * in `data/index.ts`, by whether DATABASE_URL is set.
 *
 * Canzonieri and their sections are derived here from the `{canzoniere:}` and
 * `{sezione:}` directives, so the app looks the same before a database exists. Once one
 * does, the database owns both and these directives are only an initial value.
 */

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { parseChordPro } from '../chordpro'
import { slugify } from '../slug'
import {
  type Canzoniere,
  DEFAULT_SECTION,
  type Section,
  type Song,
  type SongRepository,
  UNFILED,
} from './types'

const CONTENT_DIR = path.join(process.cwd(), 'content')

interface ParsedFile {
  /** Everything but the section, which cannot be known one file at a time. */
  song: Omit<Song, 'sectionId'>
  /** Names as written in the directives, needed to build the two lists. */
  canzoniereName: string
  sezioneName: string
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
    sezioneName: parsed.sezione ?? DEFAULT_SECTION,
  }
}

async function readFiles(): Promise<ParsedFile[]> {
  let entries: string[]
  try {
    entries = await readdir(CONTENT_DIR)
  } catch {
    return []
  }

  return await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.chopro'))
      .map(async (entry) => {
        const body = await readFile(path.join(CONTENT_DIR, entry), 'utf8')
        return toSong(entry.replace(/\.chopro$/, ''), body)
      }),
  )
}

const key = (canzoniereSlug: string, name: string) => `${canzoniereSlug}\n${name}`

/**
 * The whole library as the three lists the pages ask for, built together.
 *
 * Together because they cannot be built apart: a song's section is an id, and the ids
 * only exist once every file has been read and the sections of each canzoniere are
 * known. Reading the directory three times to answer three questions was already what
 * this file did; what is new is that the answers have to agree.
 *
 * **The ids are invented here.** Without a database nothing generates them and nothing
 * writes them back, so they are positions in this list — stable for as long as the files
 * are, which is exactly as long as anything in this mode lives. They never reach a
 * database: the seed matches sections by name, not by id.
 *
 * Sections of a canzoniere come out in alphabetical order, and that is the honest
 * answer rather than a poor one: with no database there is nowhere to have written an
 * order, so there is no order to respect.
 */
async function readLibrary(): Promise<{
  songs: Song[]
  canzonieri: Canzoniere[]
  sections: Section[]
}> {
  const files = await readFiles()

  const byCanzoniere = new Map<string, Canzoniere>()
  for (const { song, canzoniereName } of files) {
    if (!byCanzoniere.has(song.canzoniereSlug)) {
      byCanzoniere.set(song.canzoniereSlug, { slug: song.canzoniereSlug, name: canzoniereName })
    }
  }
  const canzonieri = [...byCanzoniere.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'))

  const sections: Section[] = []
  const idOf = new Map<string, number>()

  for (const canzoniere of canzonieri) {
    const names = [
      ...new Set(
        files
          .filter((entry) => entry.song.canzoniereSlug === canzoniere.slug)
          .map((entry) => entry.sezioneName),
      ),
    ].sort((a, b) => a.localeCompare(b, 'it'))

    names.forEach((name, index) => {
      const id = sections.length + 1
      sections.push({ id, canzoniereSlug: canzoniere.slug, name, position: index + 1 })
      idOf.set(key(canzoniere.slug, name), id)
    })
  }

  const positionOf = new Map(sections.map((section) => [section.id, section.position]))

  /*
   * Section first, then title. The same order the database reads, for the same reason:
   * the arrows inside a song step through this list, so it has to be the order the
   * pages were generated in. Nothing on disk can say where a song sits inside its
   * section — that is `position`, which only the database has — so within a section it
   * is alphabetical.
   */
  const songs = files
    .map((entry) => ({
      ...entry.song,
      sectionId: idOf.get(key(entry.song.canzoniereSlug, entry.sezioneName)) ?? null,
    }))
    .sort((a, b) => {
      const place = (positionOf.get(a.sectionId ?? -1) ?? 0) - (positionOf.get(b.sectionId ?? -1) ?? 0)
      return place !== 0 ? place : a.title.localeCompare(b.title, 'it')
    })

  return { songs, canzonieri, sections }
}

export async function readSongFiles(): Promise<Song[]> {
  return (await readLibrary()).songs
}

/** The canzonieri named by the files, in alphabetical order. */
export async function readCanzoniereFiles(): Promise<Canzoniere[]> {
  return (await readLibrary()).canzonieri
}

/** The sections named by the files, with the ids this module invented for them. */
export async function readSectionFiles(): Promise<Section[]> {
  return (await readLibrary()).sections
}

export const fileRepository: SongRepository = {
  listSongs: readSongFiles,

  async getSong(slug) {
    const songs = await readSongFiles()
    return songs.find((song) => song.slug === slug) ?? null
  },

  listCanzonieri: readCanzoniereFiles,
  listSections: readSectionFiles,
}
