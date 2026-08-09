/**
 * Loads `content/` into Postgres. Run with `npm run seed`.
 *
 * Idempotent: songs and setlists are upserted by slug, so re-running after a
 * correction updates rather than duplicates. It also prunes rows whose file no
 * longer exists, because in v1 the files are the source of truth and a deleted
 * file should mean a song that is gone, not one that lingers on the site.
 *
 * That pruning has to change in v2, when the editor makes the database
 * authoritative and rows will exist that never had a file.
 */

import { inArray, notInArray } from 'drizzle-orm'

import { loadEnv } from './load-env'

async function main() {
  loadEnv()

  const { readSetlistFiles, readSongFiles } = await import('../src/lib/data/files')
  const { closeDatabase, db, hasDatabase } = await import('../src/lib/db/client')
  const { setlistSongs, setlists, songs } = await import('../src/lib/db/schema')

  if (!hasDatabase) {
    console.error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.')
    process.exit(1)
  }

  const [songFiles, setlistFiles] = await Promise.all([readSongFiles(), readSetlistFiles()])

  if (songFiles.length === 0) {
    console.error('No .chopro files found in content/ — refusing to prune the whole table.')
    process.exit(1)
  }

  const songSlugs = new Set(songFiles.map((song) => song.slug))
  const database = db()

  for (const song of songFiles) {
    await database
      .insert(songs)
      .values({
        slug: song.slug,
        title: song.title,
        artist: song.artist,
        originalKey: song.originalKey,
        tags: song.tags,
        body: song.body,
      })
      .onConflictDoUpdate({
        target: songs.slug,
        set: {
          title: song.title,
          artist: song.artist,
          originalKey: song.originalKey,
          tags: song.tags,
          body: song.body,
          updatedAt: new Date(),
        },
      })
  }
  console.log(`Songs upserted: ${songFiles.length}`)

  /** Songs a setlist references but which have no file of their own. */
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
      if (songSlugs.has(slug)) return true
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

  const prunedSongs = await database
    .delete(songs)
    .where(notInArray(songs.slug, [...songSlugs]))
    .returning({ slug: songs.slug })

  const setlistSlugs = setlistFiles.map((setlist) => setlist.slug)
  const prunedSetlists =
    setlistSlugs.length > 0
      ? await database
          .delete(setlists)
          .where(notInArray(setlists.slug, setlistSlugs))
          .returning({ slug: setlists.slug })
      : await database.delete(setlists).returning({ slug: setlists.slug })

  for (const row of prunedSongs) console.log(`Pruned song: ${row.slug}`)
  for (const row of prunedSetlists) console.log(`Pruned setlist: ${row.slug}`)

  if (missing.length > 0) {
    console.warn(`\nSetlist entries skipped — no such song file:\n  ${missing.join('\n  ')}`)
  }

  await closeDatabase()
  console.log('\nSeed complete.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
