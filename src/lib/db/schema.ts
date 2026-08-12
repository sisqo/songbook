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
  /**
   * Where the song sits inside its canzoniere, when someone has said.
   *
   * Null means nobody has: the song then sorts by title, after the ones that were
   * placed by hand — which is what Postgres does with nulls in an ascending sort
   * anyway, so the fallback needs no code. That makes this column additive in the
   * strongest sense: every existing row is null, so the order stays alphabetical
   * until the first drag, and a song imported into an ordered canzoniere joins at
   * the end rather than jumping into the middle.
   *
   * Renumbered 1..N for the whole canzoniere on every reorder, so the values never
   * drift into gaps or ties that would leave two songs' order undefined.
   */
  position: integer('position'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * One row, stamped by the build.
 *
 * It answers "which songs are still waiting to be published": those whose
 * `updated_at` is newer than this stamp. Deriving it from what the build
 * actually saw is the only honest answer — a flag set by a publish action would
 * claim success even if the deploy failed.
 */
export const builds = pgTable('builds', {
  id: text('id').primaryKey().default('last'),
  builtAt: timestamp('built_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Everyone the owners have let in.
 *
 * The owners themselves are not here: they come from `ALLOWED_EMAILS`, which the app
 * cannot edit — see `lib/allowlist.ts` for why the list has two halves. So this table
 * being empty is the ordinary state, not a locked door, and a row removed from it
 * cannot take the last person's access away.
 *
 * The email is the key, because that is what Google hands back and therefore the only
 * thing the gate can compare. Stored already lowercased by the action that writes it,
 * so the primary key is doing real work: the same address cannot be added twice in two
 * different cases.
 */
export const members = pgTable('members', {
  email: text('email').primaryKey(),
  /** Which owner or member let them in, kept as a plain address for the same reason. */
  addedBy: text('added_by'),
  /**
   * What they may do: `admin`, `editor` or `viewer` — see `lib/roles.ts`.
   *
   * Text rather than an enum, and defaulted to the least of the three. An enum would put
   * the list in two places and make adding a fourth a migration on the type; `readRole`
   * treats anything it does not recognise as `viewer`, so a value nobody expected cannot
   * become a way in. Owners have no row here and are admin by definition, which is why
   * this column cannot demote anybody who matters.
   */
  role: text('role').notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Global preferences: one row per person. */
export const userPrefs = pgTable('user_prefs', {
  userEmail: text('user_email').primaryKey(),
  zoomStep: integer('zoom_step').notNull().default(2),
  notation: text('notation').notNull().default('it'),
  /**
   * Which instrument the chord diagrams are drawn for.
   *
   * A preference about the reader, like the notation, so it belongs here rather than
   * in local storage next to the theme: the same person picks up the same instrument
   * on the phone and on the tablet. Defaulted rather than nullable so every existing
   * row already answers the question.
   */
  instrument: text('instrument').notNull().default('chitarra'),
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
    /**
     * The fret the capo is on, 0 for none.
     *
     * Not the same thing as `semitones`, which is why it is a second column and not a
     * clever reuse of the first: transposing moves the sound, a capo moves the hand and
     * leaves the sound where it was. Defaulted rather than nullable, because every row
     * that exists already answers this — nobody had a capo on.
     */
    capo: integer('capo').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userEmail, table.songSlug] })],
)
