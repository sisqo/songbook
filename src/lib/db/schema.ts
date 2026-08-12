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

import {
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

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

/**
 * A canzoniere is divided into sections, and every song is in exactly one of them.
 *
 * A serial id, not a slug: a section has no route of its own, so it needs no readable
 * key — and an id that does not derive from the name is what keeps renaming free
 * without having to freeze anything.
 *
 * Two unique constraints, each doing a different job. `(canzoniere_slug, name)` says
 * two sections of the same canzoniere cannot share a name: that is not two things, it
 * is a typo or a double tap — and it lets the import address a section *by name*
 * without ever creating a twin. `(id, canzoniere_slug)` exists only to be referenced:
 * see the composite key on `songs`.
 */
export const sections = pgTable(
  'sections',
  {
    id: serial('id').primaryKey(),
    canzoniereSlug: text('canzoniere_slug')
      .notNull()
      .references(() => canzonieri.slug, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /** Renumbered 1..N across the canzoniere on every arrangement, like the songs. */
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('sections_canzoniere_name').on(table.canzoniereSlug, table.name),
    unique('sections_id_canzoniere').on(table.id, table.canzoniereSlug),
  ],
)

export const songs = pgTable(
  'songs',
  {
    slug: text('slug').primaryKey(),
    title: text('title').notNull(),
    artist: text('artist'),
    tags: text('tags').array().notNull().default([]),
    body: text('body').notNull(),
    /**
     * `restrict` puts the "refuse to delete a non-empty canzoniere" rule in the
     * database rather than only in the UI, so no code path can orphan a song.
     *
     * Not null since v2.3: it was nullable so the column could be added to a
     * populated table, and in the whole life of the table it never held a null —
     * every way a song can arrive gives it a canzoniere. With the section
     * mandatory it is also derivable from `section_id`, so a null would be a state
     * that no longer means anything.
     */
    canzoniereSlug: text('canzoniere_slug')
      .notNull()
      .references(() => canzonieri.slug, { onDelete: 'restrict' }),
    /**
     * Which section of that canzoniere holds the song. Every song has one.
     *
     * It was nullable for exactly one deploy, which is what made the migration
     * additive: the code then in production knew nothing about this column, so it
     * could not fill it, and a song imported between the migration and the deploy
     * would have failed its insert. The contracting migration repeated the backfill —
     * for anything imported in that window — and made it `not null`, which is where
     * «one and only one section» stops being a rule in the code and becomes a fact
     * about the table.
     */
    sectionId: integer('section_id').notNull(),
    /**
     * Where the song sits inside its **section**, when someone has said.
     *
     * Null means nobody has: the song then sorts by title, after the ones that were
     * placed by hand — which is what Postgres does with nulls in an ascending sort
     * anyway, so the fallback needs no code. That makes this column additive in the
     * strongest sense: every existing row is null, so the order stays alphabetical
     * until the first drag, and a song imported into an ordered section joins at
     * the end rather than jumping into the middle.
     *
     * Renumbered 1..N within each section on every arrangement, so the values never
     * drift into gaps or ties that would leave two songs' order undefined.
     */
    position: integer('position'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * The canzoniere of a song is written twice — here, and on its section — and this
     * is what makes the two copies impossible to disagree: a song cannot point at a
     * section of another canzoniere. The alternative was trusting the code, and the
     * code is where mistakes live.
     *
     * `on update cascade` is not decoration: it is the only thing that lets a section
     * move to another canzoniere. Measured on a scratch schema — with `no action` the
     * update is refused whichever row goes first, because the constraint is checked
     * per statement, not per transaction. With the cascade, `sections.canzoniere_slug`
     * is updated and the songs follow. `on delete` stays `restrict`: a section holding
     * songs may not be deleted.
     *
     * While `section_id` is null the pair is not checked at all (Postgres `MATCH
     * SIMPLE`), which is exactly what the additive phase of the migration needs.
     */
    foreignKey({
      columns: [table.sectionId, table.canzoniereSlug],
      foreignColumns: [sections.id, sections.canzoniereSlug],
      name: 'songs_section_canzoniere_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)

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

/**
 * How somebody proves they are the address they claim, when it is not Google saying so.
 *
 * A table of its own rather than a column on `members`, and the reason is the same fact
 * that makes the owners un-lockoutable: an owner has no row in `members`, so a column
 * there could never hold their password. Membership answers *whether* you may be here;
 * this answers only *how you prove you are that address*. A row here grants nothing —
 * `roleOf` still decides, and it does not consult this table.
 *
 * The hash carries its own parameters (see `lib/auth/password.ts`), so this column is
 * opaque text on purpose: nothing but that module should read its shape.
 */
export const credentials = pgTable('credentials', {
  email: text('email').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
