export interface SongInput {
  /** Present when editing an existing song, absent when importing a new one. */
  slug?: string
  title: string
  artist: string | null
  originalKey: string | null
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

export type SaveResult =
  | { ok: true; slug: string }
  /** Same title and artist already exist; the caller must decide what to do. */
  | { ok: false; reason: 'duplicate'; existing: DuplicateOf }
  | { ok: false; reason: SaveFailure }

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
