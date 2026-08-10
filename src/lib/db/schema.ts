/**
 * Database schema.
 *
 * Songs are keyed by their slug rather than a surrogate id. That keeps the two
 * repository implementations interchangeable — a file on disk has a slug and
 * nothing else — and it lets preferences be keyed the same way in both. The
 * trade-off is deliberate: renaming a slug orphans that song's saved
 * transposition, which for filenames that rarely change is a fair price for
 * having one key everywhere.
 */

import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * A canzoniere is a container: every song belongs to exactly one.
 *
 * The slug is generated once from the initial name and never changes — renaming
 * touches `name` only. That is what makes a rename free: no foreign key to
 * update, no URL that moves, no precache entry to regenerate.
 */
export const canzonieri = pgTable('canzonieri', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const songs = pgTable('songs', {
  slug: text('slug').primaryKey(),
  title: text('title').notNull(),
  artist: text('artist'),
  originalKey: text('original_key'),
  tags: text('tags').array().notNull().default([]),
  body: text('body').notNull(),
  /**
   * Nullable only so the column can be added to a populated table: the seed
   * fills it on insert *or when it is still empty*, which is how existing rows
   * get their canzoniere without a one-off backfill script. `restrict` puts the
   * "refuse to delete a non-empty canzoniere" rule in the database rather than
   * only in the UI, so no code path can orphan a song.
   */
  canzoniereSlug: text('canzoniere_slug').references(() => canzonieri.slug, {
    onDelete: 'restrict',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const setlists = pgTable('setlists', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const setlistSongs = pgTable(
  'setlist_songs',
  {
    setlistSlug: text('setlist_slug')
      .notNull()
      .references(() => setlists.slug, { onDelete: 'cascade' }),
    songSlug: text('song_slug')
      .notNull()
      .references(() => songs.slug, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.setlistSlug, table.position] })],
)

/** Global preferences: one row per person. */
export const userPrefs = pgTable('user_prefs', {
  userEmail: text('user_email').primaryKey(),
  zoomStep: integer('zoom_step').notNull().default(2),
  notation: text('notation').notNull().default('it'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Per-song preferences: the key you sing it in, and the speed you read it at. */
export const userSongPrefs = pgTable(
  'user_song_prefs',
  {
    userEmail: text('user_email').notNull(),
    songSlug: text('song_slug')
      .notNull()
      .references(() => songs.slug, { onDelete: 'cascade' }),
    semitones: integer('semitones').notNull().default(0),
    scrollSpeed: integer('scroll_speed').notNull().default(3),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userEmail, table.songSlug] })],
)
