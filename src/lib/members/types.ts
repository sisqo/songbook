/**
 * Who may enter, as the screen that manages it sees the question.
 *
 * The two halves travel together and stay distinguishable, because the difference is
 * the whole point: an owner cannot be removed here, a member can. A payload of plain
 * addresses would make them look like one list with an arbitrary rule attached.
 */

import type { MemberRow } from './read'

export type { MemberRow }

export interface MemberList {
  /** From `ALLOWED_EMAILS`, which only the server can read. Not removable from here. */
  owners: string[]
  members: MemberRow[]
  /** The address asking, so the screen can mark it and refuse to remove it. */
  you: string
}

export type MemberFailure =
  | 'no-session'
  | 'no-database'
  | 'invalid-email'
  /** Already a member: adding again would do nothing. */
  | 'already-allowed'
  /** An owner: allowed by the environment, and not ours to add or remove. */
  | 'is-owner'
  /** Removing the address you are signed in as. */
  | 'yourself'
  | 'not-found'
  | 'failed'

export type MemberResult = { ok: true } | { ok: false; reason: MemberFailure }

export const MEMBER_MESSAGE: Record<MemberFailure, string> = {
  'no-session': 'Sessione scaduta. Ricarica la pagina ed entra di nuovo.',
  'no-database': 'Nessun database configurato: gli accessi non possono essere modificati.',
  'invalid-email': 'Serve un indirizzo email.',
  'already-allowed': 'Questo indirizzo può già entrare.',
  'is-owner': 'Questo indirizzo è un proprietario: si cambia nella configurazione del server.',
  yourself: 'Non puoi rimuovere te stesso.',
  'not-found': 'Questo indirizzo non è nell’elenco.',
  failed: 'Salvataggio non riuscito. Riprova.',
}
