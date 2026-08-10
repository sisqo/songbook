/**
 * Loads `content/` into Postgres. Run with `npm run seed`.
 *
 * **Insert-only for songs.** The database owns songs now: they can be imported,
 * edited and deleted in the app, so this script may not update them (it would
 * overwrite a correction with the file's version) and may not prune them (rows
 * without a file are exactly the imported ones).
 *
 * What it is for instead: the initial bootstrap, and restoring the manual
 * export. Put the downloaded `.chopro` files in `content/`, run this, and what
 * is missing comes back without touching what is there.
 *
 * The consequence to know: deleting a song in the app while its file still sits
 * in `content/` means this script reinserts it. That is correct for a command
 * meaning "load what is missing", but it is why the placeholder fixtures should
 * leave the repo once real repertoire arrives.
 *
 * Setlists are still file-owned and still pruned — nothing creates them in the
 * app yet.
 */

import { inArray, notInArray } from 'drizzle-orm'

import { loadEnv } from './load-env'

async function main() {
  loadEnv()

  const { readCanzoniereFiles, readSetlistFiles, readSongFiles } = await import(
    '../src/lib/data/files'
  )
  const { UNFILED } = await import('../src/lib/data/types')
  const { closeDatabase, db, hasDatabase } = await import('../src/lib/db/client')
  const { canzonieri, setlistSongs, setlists, songs } = await import('../src/lib/db/schema')

  if (!hasDatabase) {
    console.error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.')
    process.exit(1)
  }

  const [songFiles, setlistFiles, canzoniereFiles] = await Promise.all([
    readSongFiles(),
    readSetlistFiles(),
    readCanzoniereFiles(),
  ])

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
   * And unlike songs and setlists, canzonieri are never pruned — they can be
   * created in the app, so rows legitimately exist that no file ever declared.
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
   */
  let inserted = 0
  for (const song of songFiles) {
    const rows = await database
      .insert(songs)
      .values({
        slug: song.slug,
        title: song.title,
        artist: song.artist,
        originalKey: song.originalKey,
        tags: song.tags,
        canzoniereSlug: song.canzoniereSlug,
        body: song.body,
      })
      .onConflictDoNothing({ target: songs.slug })
      .returning({ slug: songs.slug })

    inserted += rows.length
  }
  console.log(`Songs inserted: ${inserted} (${songFiles.length - inserted} already present)`)

  /**
   * Checked against the database rather than the files: a setlist may
   * legitimately reference a song that was imported in the app and has no file.
   */
  const knownSlugs = new Set(
    (await database.select({ slug: songs.slug }).from(songs)).map((row) => row.slug),
  )

  /** Songs a setlist references but which do not exist at all. */
  const missing: string[] = []

  for (const setlist of setlistFiles) {
    await database
      .insert(setlists)
      .values({ slug: setlist.slug, name: setlist.name, position: setlist.position })
      .onConflictDoUpdate({
        target: setlists.slug,
        set: { name: setlist.name, position: setlist.position },
      })

    // Rewritten wholesale: order is the point of a setlist, and diffing
    // positions would be more code than replacing them.
    await database.delete(setlistSongs).where(inArray(setlistSongs.setlistSlug, [setlist.slug]))

    const present = setlist.songs.filter((slug) => {
      if (knownSlugs.has(slug)) return true
      missing.push(`${setlist.slug} → ${slug}`)
      return false
    })

    if (present.length > 0) {
      await database.insert(setlistSongs).values(
        present.map((slug, index) => ({
          setlistSlug: setlist.slug,
          songSlug: slug,
          position: index,
        })),
      )
    }
  }
  console.log(`Setlists upserted: ${setlistFiles.length}`)

  /**
   * Songs are deliberately not pruned. Rows without a file are the imported
   * ones, and removing them here would delete exactly the material the app was
   * given the power to create.
   */
  /**
   * Setlists are still file-owned, so they are still pruned — but only when
   * there is at least one file to compare against. With an empty directory the
   * old code deleted every setlist, which was safe while a missing file always
   * meant a deleted setlist and is not safe now that `content/` may simply have
   * been emptied.
   */
  const setlistSlugs = setlistFiles.map((setlist) => setlist.slug)
  if (setlistSlugs.length === 0) {
    console.log('No setlist files — leaving existing setlists alone.')
  } else {
    const pruned = await database
      .delete(setlists)
      .where(notInArray(setlists.slug, setlistSlugs))
      .returning({ slug: setlists.slug })

    for (const row of pruned) console.log(`Pruned setlist: ${row.slug}`)
  }

  if (missing.length > 0) {
    console.warn(`\nSetlist entries skipped — no such song:\n  ${missing.join('\n  ')}`)
  }

  await closeDatabase()
  console.log('\nSeed complete.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
