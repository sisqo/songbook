/**
 * Writes the list of page URLs the service worker must precache.
 *
 * Serwist's own manifest covers build assets, not rendered pages, so without
 * this the app would have its JavaScript offline and none of its songs. The list
 * is generated before `next build` and read synchronously by next.config.ts,
 * which keeps the config file free of database access.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { loadEnv } from './load-env'

async function main() {
  // Before importing anything that reads DATABASE_URL at module scope.
  loadEnv()

  const { repository, repositoryKind } = await import('../src/lib/data')
  const { closeDatabase, db, hasDatabase } = await import('../src/lib/db/client')
  const { builds } = await import('../src/lib/db/schema')

  const [songs, setlists] = await Promise.all([
    repository.listSongs(),
    repository.listSetlists(),
  ])

  const routes = [
    '/',
    '/scalette',
    '/canzonieri',
    '/importa',
    // A metadata route, not a file in public/, so it has to be listed here.
    '/manifest.webmanifest',
    ...songs.map((song) => `/canzoni/${song.slug}`),
    ...setlists.map((setlist) => `/scalette/${setlist.slug}`),
    ...setlists.flatMap((setlist) =>
      setlist.songs.map((song) => `/scalette/${setlist.slug}/${song}`),
    ),
  ]

  const output = path.join(process.cwd(), 'generated', 'precache-routes.json')
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(routes, null, 2)}\n`, 'utf8')

  console.log(`Precache routes (${repositoryKind}): ${routes.length}`)

  /**
   * Stamp the build.
   *
   * Done here rather than after `next build` because this script runs before the
   * pages are generated and therefore knows exactly which songs they will
   * contain: anything written to the database after this moment is genuinely not
   * in the build, and the import screen should keep listing it as pending.
   */
  if (hasDatabase) {
    const builtAt = new Date()
    await db()
      .insert(builds)
      .values({ id: 'last', builtAt })
      .onConflictDoUpdate({ target: builds.id, set: { builtAt } })
    console.log(`Build stamped at ${builtAt.toISOString()}`)
  }

  await closeDatabase()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
