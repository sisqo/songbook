/**
 * Loads `content/` into Postgres. Run with `npm run seed`.
 *
 * **Insert-only.** The database owns songs now: they can be imported, edited and
 * deleted in the app, so this script may not update them (it would overwrite a
 * correction with the file's version) and may not prune them (rows without a file are
 * exactly the imported ones).
 *
 * What it is for instead: the initial bootstrap, and restoring the manual export. Put
 * the downloaded `.chopro` files in `content/`, run this, and what is missing comes
 * back without touching what is there.
 *
 * The consequence to know: deleting a song in the app while its file still sits in
 * `content/` means this script reinserts it. That is correct for a command meaning
 * "load what is missing", but it is why the placeholder fixtures should leave the repo
 * once real repertoire arrives.
 */

import { loadEnv } from './load-env'

async function main() {
  loadEnv()

  const { readCanzoniereFiles, readSongFiles } = await import('../src/lib/data/files')
  const { UNFILED } = await import('../src/lib/data/types')
  const { closeDatabase, db, hasDatabase } = await import('../src/lib/db/client')
  const { canzonieri, songs } = await import('../src/lib/db/schema')

  if (!hasDatabase) {
    console.error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.')
    process.exit(1)
  }

  const [songFiles, canzoniereFiles] = await Promise.all([readSongFiles(), readCanzoniereFiles()])

  /**
   * An empty `content/` is legitimate now: once the repertoire is imported and
   * the placeholder fixtures are removed, there is nothing left to bootstrap
   * from. Songs are no longer pruned, so there is nothing to guard against
   * either — only something worth saying out loud.
   */
  if (songFiles.length === 0) {
    console.log('No .chopro files in content/ — nothing to bootstrap.')
  }

  const database = db()

  /**
   * Canzonieri named by the files, plus the unfiled one, created if missing.
   *
   * `doNothing` on conflict, not an update: a canzoniere renamed in the app must
   * keep its new name. The directive only ever decides where a song is born.
   * And unlike songs, canzonieri are never pruned — they can be created in the
   * app, so rows legitimately exist that no file ever declared.
   */
  const declared = [...canzoniereFiles, UNFILED]
  for (const canzoniere of declared) {
    await database
      .insert(canzonieri)
      .values({ slug: canzoniere.slug, name: canzoniere.name })
      .onConflictDoNothing({ target: canzonieri.slug })
  }
  console.log(`Canzonieri present (created if missing): ${declared.length}`)

  /**
   * Insert-only. `doNothing` rather than `doUpdate`, because an existing row may
   * carry an edit made in the app, and the file's version is not more correct —
   * it is only older.
   *
   * Songs are deliberately not pruned either. Rows without a file are the imported
   * ones, and removing them here would delete exactly the material the app was given
   * the power to create.
   */
  let inserted = 0
  for (const song of songFiles) {
    const rows = await database
      .insert(songs)
      .values({
        slug: song.slug,
        title: song.title,
        artist: song.artist,
        tags: song.tags,
        canzoniereSlug: song.canzoniereSlug,
        body: song.body,
      })
      .onConflictDoNothing({ target: songs.slug })
      .returning({ slug: songs.slug })

    inserted += rows.length
  }
  console.log(`Songs inserted: ${inserted} (${songFiles.length - inserted} already present)`)

  await closeDatabase()
  console.log('\nSeed complete.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
