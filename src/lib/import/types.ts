import type { Song } from '@/lib/data/types'

export interface SongInput {
  /** Present when editing an existing song, absent when importing a new one. */
  slug?: string
  title: string
  artist: string | null
  tags: string[]
  canzoniereSlug: string
  body: string
}

export interface DuplicateOf {
  slug: string
  title: string
  artist: string | null
}

export type SaveFailure =
  | 'no-session'
  | 'no-database'
  | 'invalid-title'
  | 'empty-body'
  | 'not-found'
  | 'failed'

/**
 * A save carries back the row it wrote, not just its slug.
 *
 * The screen shows that row immediately, so it has to be the row the database
 * holds rather than the values that were sent: `canzoniereSlug` can come back
 * different when the one asked for does not exist, and `updatedAt` is the
 * database's own clock — the value every later comparison is made against. Echoing
 * the input with a timestamp from the browser would risk a guess that outranks the
 * truth and then wins forever, since it gets cached.
 */
export type SaveResult =
  | { ok: true; song: Song }
  /** Same title and artist already exist; the caller must decide what to do. */
  | { ok: false; reason: 'duplicate'; existing: DuplicateOf }
  | { ok: false; reason: SaveFailure }

export type DeleteResult = { ok: true; slug: string } | { ok: false; reason: SaveFailure }

/** What to do when a save hits a song with the same title and artist. */
export type Decision = 'replace' | 'add'

export type PublishFailure = 'no-session' | 'no-hook' | 'failed'
export type PublishResult = { ok: true } | { ok: false; reason: PublishFailure }

export interface PendingSong {
  slug: string
  title: string
  artist: string | null
  updatedAt: string
}

export const SAVE_MESSAGE: Record<SaveFailure | 'duplicate', string> = {
  'no-session': 'Sessione scaduta. Ricarica la pagina ed entra di nuovo.',
  'no-database': 'Nessun database configurato: non si può salvare.',
  'invalid-title': 'Serve un titolo.',
  'empty-body': 'Il testo è vuoto.',
  'not-found': 'Questo brano non esiste più.',
  duplicate: 'Esiste già un brano con questo titolo e artista.',
  failed: 'Salvataggio non riuscito. Riprova.',
}

export const PUBLISH_MESSAGE: Record<PublishFailure, string> = {
  'no-session': 'Sessione scaduta. Ricarica la pagina ed entra di nuovo.',
  'no-hook':
    'Deploy hook non configurato. Crealo su Vercel in Settings → Git → Deploy Hooks e mettilo in DEPLOY_HOOK_URL.',
  failed: 'Pubblicazione non riuscita. Riprova.',
}
