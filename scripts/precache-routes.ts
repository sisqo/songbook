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

import { sql } from 'drizzle-orm'

import { loadEnv } from './load-env'

async function main() {
  // Before importing anything that reads DATABASE_URL at module scope.
  loadEnv()

  const { repository, repositoryKind } = await import('../src/lib/data')
  const { closeDatabase, db, hasDatabase } = await import('../src/lib/db/client')
  const { builds } = await import('../src/lib/db/schema')

  const [songs, canzonieri] = await Promise.all([
    repository.listSongs(),
    repository.listCanzonieri(),
  ])

  const routes = [
    '/',
    '/canzonieri',
    '/importa',
    '/utenti',
    '/password',
    // A metadata route, not a file in public/, so it has to be listed here.
    '/manifest.webmanifest',
    ...songs.map((song) => `/canzoni/${song.slug}`),
    /*
     * One page per canzoniere, and they matter offline as much as the songs do:
     * the home page is now a list of these, so without them every row on the
     * first screen would lead nowhere with no network.
     */
    ...canzonieri.map((canzoniere) => `/canzonieri/${canzoniere.slug}`),
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
   *
   * The instant comes from the database, like `songs.updated_at`, because the
   * pending list compares the two. A build machine whose clock ran a second ahead
   * would otherwise stamp the future and quietly call a song published that it had
   * not read.
   */
  if (hasDatabase) {
    try {
      const [stamped] = await db()
        .insert(builds)
        .values({ id: 'last', builtAt: sql`now()` })
        .onConflictDoUpdate({ target: builds.id, set: { builtAt: sql`now()` } })
        .returning({ builtAt: builds.builtAt })

      console.log(`Build stamped at ${stamped.builtAt.toISOString()}`)
    } catch (error) {
      /**
       * The stamp is not load-bearing for generating pages: without it the import
       * screen shows a stale pending list, which is a nuisance. Letting it fail
       * the build would take the whole site down instead.
       */
      console.warn(`Could not stamp the build; the pending list will be stale: ${error}`)
    }
  }

  await closeDatabase()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
