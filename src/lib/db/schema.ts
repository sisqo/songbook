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

import { sql } from 'drizzle-orm'
import {
  boolean,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

/**
 * One person's space: their own songbooks, and — through `members` — whoever they have
 * let read or edit them.
 *
 * Keyed by its owner's email rather than a surrogate id, like every other person-scoped
 * table in this schema (`sign_ins`, `user_prefs`). An account is never renamed and never
 * changes hands: it is identified by who it belongs to, not by a name someone picked.
 *
 * A row here can exist before it owns anything — the moment a new email is admitted, this
 * is written first, so the Example songbook has somewhere to be cloned into. Deriving "the
 * set of accounts" from `songbooks` instead would leave that instant with no account at
 * all, and would give the admin's "every account" screen nothing to list a person under
 * until their first songbook exists.
 */
export const accounts = pgTable('accounts', {
  ownerEmail: text('owner_email').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * A songbook is a container: every song belongs to exactly one.
 *
 * The slug is generated once from the initial name and never changes — renaming
 * touches `name` only. That is what makes a rename free: no foreign key to
 * update, no URL that moves, no precache entry to regenerate.
 *
 * `accountOwnerEmail` says which account this songbook belongs to (v3.0), but the slug
 * stays the primary key, globally unique across every account rather than merely within
 * one — see this file's own top comment on why a song's slug is also its identity, which
 * did not stop being true when songs became per-account. `/songs/[slug]` and
 * `/songbooks/[slug]` are generated **statically at build time**: `generateStaticParams`
 * enumerates every slug once, with no request and no signed-in reader to resolve "which
 * account" for. Two accounts minting a same-named clone of the Example songbook do not
 * get to share a slug; `uniqueSlug` gives the clone a fresh one, the same tool
 * `createSongbook` already uses for a name that collides with an existing songbook.
 * Cross-account privacy is a permission check at read time, layered on top of a route
 * that already resolves to exactly one songbook — not a second identity for the same one.
 */
export const songbooks = pgTable(
  'songbooks',
  {
    slug: text('slug').primaryKey(),
    accountOwnerEmail: text('account_owner_email')
      .notNull()
      .references(() => accounts.ownerEmail),
    name: text('name').notNull(),
    /**
     * The one songbook, anywhere in the installation, that a new account's is cloned
     * from. A partial unique index rather than application code is what keeps a second
     * flagged row from ever existing: moving the flag to another songbook is a plain
     * `UPDATE` on both rows, not a deploy, and the database itself refuses to leave two
     * set at once even if that update is ever done out of order.
     */
    isExampleTemplate: boolean('is_example_template').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('songbooks_one_example_template')
      .on(table.isExampleTemplate)
      .where(sql`${table.isExampleTemplate}`),
  ],
)

/**
 * A songbook is divided into sections, and every song is in exactly one of them.
 *
 * A serial id, not a slug: a section has no route of its own, so it needs no readable
 * key — and an id that does not derive from the name is what keeps renaming free
 * without having to freeze anything.
 *
 * Two unique constraints, each doing a different job. `(songbook_slug, name)` says
 * two sections of the same songbook cannot share a name: that is not two things, it
 * is a typo or a double tap — and it lets the import address a section *by name*
 * without ever creating a twin. `(id, songbook_slug)` exists only to be referenced:
 * see the composite key on `songs`.
 *
 * No `accountOwnerEmail` of its own (v3.0): `songbookSlug` is still globally unique (see
 * `songbooks`' own comment), so which account a section belongs to is always one join
 * away and never needs to be written here to agree with anything.
 */
export const sections = pgTable(
  'sections',
  {
    id: serial('id').primaryKey(),
    songbookSlug: text('songbook_slug')
      .notNull()
      .references(() => songbooks.slug, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /** Renumbered 1..N across the songbook on every arrangement, like the songs. */
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('sections_songbook_name').on(table.songbookSlug, table.name),
    unique('sections_id_songbook').on(table.id, table.songbookSlug),
  ],
)

/**
 * No `accountOwnerEmail` of its own either, for the same reason as `sections`: a song's
 * `songbookSlug` is globally unique and always resolves to one songbook, which is always
 * one account's. A query scoped to "the current account's songs" joins to `songbooks`
 * for it; that join was already free to add next to the one this table's own reads
 * already do against `sections`.
 */
export const songs = pgTable(
  'songs',
  {
    slug: text('slug').primaryKey(),
    title: text('title').notNull(),
    artist: text('artist'),
    tags: text('tags').array().notNull().default([]),
    body: text('body').notNull(),
    /**
     * `restrict` puts the "refuse to delete a non-empty songbook" rule in the
     * database rather than only in the UI, so no code path can orphan a song.
     *
     * Not null since v2.3: it was nullable so the column could be added to a
     * populated table, and in the whole life of the table it never held a null —
     * every way a song can arrive gives it a songbook. With the section
     * mandatory it is also derivable from `section_id`, so a null would be a state
     * that no longer means anything.
     */
    songbookSlug: text('songbook_slug')
      .notNull()
      .references(() => songbooks.slug, { onDelete: 'restrict' }),
    /**
     * Which section of that songbook holds the song. Every song has one.
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
     * The songbook of a song is written twice — here, and on its section — and this
     * is what makes the two copies impossible to disagree: a song cannot point at a
     * section of another songbook. The alternative was trusting the code, and the
     * code is where mistakes live.
     *
     * `on update cascade` is not decoration: it is the only thing that lets a section
     * move to another songbook. Measured on a scratch schema — with `no action` the
     * update is refused whichever row goes first, because the constraint is checked
     * per statement, not per transaction. With the cascade, `sections.songbook_slug`
     * is updated and the songs follow. `on delete` stays `restrict`: a section holding
     * songs may not be deleted.
     *
     * While `section_id` is null the pair is not checked at all (Postgres `MATCH
     * SIMPLE`), which is exactly what the additive phase of the migration needs.
     */
    foreignKey({
      columns: [table.sectionId, table.songbookSlug],
      foreignColumns: [sections.id, sections.songbookSlug],
      name: 'songs_section_songbook_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)

/**
 * Everyone let into some account other than their own.
 *
 * The owners of an account are not here, and there are two kinds of them. A *global*
 * owner comes from `ALLOWED_EMAILS`, which the app cannot edit — see `lib/allowlist.ts`
 * for why the list has two halves — and is admin on every account, this one included. The
 * account's *own* owner is not there either, and is admin on this one account for the
 * same structural reason: `roleOf` recognises both without a row to read, so an account
 * with no row here at all is the ordinary state, not a locked door, and a row removed
 * from it can never take away access that never lived in this table to begin with.
 *
 * Scoped to an account (v3.0): the primary key is `(account_owner_email, email)`, not
 * the email alone, because the same person can be a collaborator on more than one
 * account — a viewer on one, an editor on another — and each membership is independent.
 * Before v3.0 there was exactly one account in the whole installation, so a bare email
 * was already, coincidentally, scoped to "the" account; that coincidence is what this
 * migration undoes.
 *
 * The email is stored already lowercased by the action that writes it, same as before,
 * so the primary key still does real work within one account: the same address cannot
 * be added twice in two different cases.
 */
export const members = pgTable(
  'members',
  {
    accountOwnerEmail: text('account_owner_email')
      .notNull()
      .references(() => accounts.ownerEmail, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    /** Which owner or member let them in, kept as a plain address for the same reason. */
    addedBy: text('added_by'),
    /**
     * What they may do on *this* account: `editor` or `viewer` — see `lib/roles.ts`.
     * `admin` never appears here: it is not a grant this or any account can hand out to a
     * collaborator, only what an owner already is — globally from `ALLOWED_EMAILS`, or
     * structurally for this one account by being the email this row's own key names.
     *
     * Text rather than an enum, and defaulted to the least of the two. An enum would put
     * the list in two places and make adding a third a migration on the type; `readRole`
     * treats anything it does not recognise as `viewer`, so a value nobody expected cannot
     * become a way in.
     */
    role: text('role').notNull().default('viewer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountOwnerEmail, table.email] })],
)

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
  notation: text('notation').notNull().default('int'),
  /**
   * Which instrument the chord diagrams are drawn for.
   *
   * A preference about the reader, like the notation, so it belongs here rather than
   * in local storage next to the theme: the same person picks up the same instrument
   * on the phone and on the tablet. Defaulted rather than nullable so every existing
   * row already answers the question.
   */
  instrument: text('instrument').notNull().default('guitar'),
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

/**
 * A "Sing Together" broadcast: a token a guest can use to read the whole repertoire
 * with no account, and the one song — and its key — its owner is currently showing
 * everyone who followed that link.
 *
 * Keyed by the owner, not by the token: one active broadcast per person, not one row
 * per link ever created. Starting a new one overwrites this row, so an old, forgotten
 * link simply stops resolving to anything current instead of piling up rows nobody is
 * watching. The token still needs its own uniqueness — two people's links must never
 * collide — hence the separate constraint rather than making it the key.
 *
 * `lastActiveAt` moves only when the owner does something — starting the broadcast, or
 * playing a song — never when a guest merely reads this row. A guest left polling
 * cannot keep a session alive on their own: once its owner has stopped, it expires on
 * schedule regardless of who is still watching.
 *
 * `broadcastAccountEmail` says *whose account's* repertoire is on show (v3.0) — almost
 * always the same as `ownerEmail`, but not necessarily: someone editing on an account
 * they collaborate on may broadcast that repertoire instead of their own. Kept apart from
 * `ownerEmail` because the two answer different questions — who is in control of this
 * broadcast, and which shelf of songs it is reading from — and the guest-facing reads
 * (`guestReads.ts`) only ever need the second one.
 */
/**
 * How often, and when last, each address has actually gotten in — through Google or a
 * password makes no difference; both reach the same `signIn` callback in `auth.ts`, and
 * this is written from there, once admission is already decided. Never itself a gate:
 * a row here grants nothing, and a missing row simply means "not yet", not "not allowed".
 *
 * Keyed by email like everything else about a person, but never joined to `members`: an
 * owner signs in too, and an owner has no row there — see that table's own comment for
 * why. A row here is as true of an owner as of an invited member, which is exactly why it
 * cannot live on either.
 */
export const signIns = pgTable('sign_ins', {
  email: text('email').primaryKey(),
  signInCount: integer('sign_in_count').notNull().default(0),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }).notNull().defaultNow(),
})

export const singAlongSessions = pgTable(
  'sing_along_sessions',
  {
    ownerEmail: text('owner_email').primaryKey(),
    token: text('token').notNull(),
    broadcastAccountEmail: text('broadcast_account_email')
      .notNull()
      .references(() => accounts.ownerEmail),
    /** Cleared, not left dangling, if the song itself is ever deleted mid-broadcast. */
    currentSongSlug: text('current_song_slug').references(() => songs.slug, {
      onDelete: 'set null',
    }),
    currentSemitones: integer('current_semitones').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('sing_along_sessions_token').on(table.token)],
)
