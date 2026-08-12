/**
 * Picks the repository once, by whether DATABASE_URL is set.
 *
 * With a database, pages are generated from it at build time. Without one, they
 * are generated straight from `content/` — which is how local development works
 * before Neon exists, and how the seed script and the pages stay in agreement
 * about what a song is.
 */

import { hasDatabase } from '../db/client'
import { dbRepository } from './db'
import { fileRepository } from './files'
import type { SongRepository } from './types'

export const repository: SongRepository = hasDatabase ? dbRepository : fileRepository

export const repositoryKind: 'database' | 'files' = hasDatabase ? 'database' : 'files'

export { DEFAULT_SECTION, UNFILED } from './types'
export type { Canzoniere, Section, Song, SongRepository } from './types'
