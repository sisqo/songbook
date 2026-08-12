/**
 * What a password action can answer, and what a password has to be.
 *
 * Separate from `password.ts` because that module imports `node:crypto`: the rules a form
 * needs to state — how long a password must be — have to be readable from the browser, and
 * the machine that hashes it must not be.
 */

export const MIN_PASSWORD = 10
export const MAX_PASSWORD = 200

export type PasswordFailure =
  | 'no-session'
  | 'no-database'
  /** Signed in, but not an admin: somebody else's password is not theirs to set. */
  | 'not-allowed'
  /** An owner other than yourself: their identity is Google's to vouch for, not ours. */
  | 'is-owner'
  | 'weak-password'
  /** Changing your own, and the current one given does not match. */
  | 'wrong-password'
  /** Asked to remove a password that was not there. */
  | 'no-password'
  | 'failed'

export type PasswordResult = { ok: true } | { ok: false; reason: PasswordFailure }

export const PASSWORD_MESSAGE: Record<PasswordFailure, string> = {
  'no-session': 'Sessione scaduta. Ricarica la pagina ed entra di nuovo.',
  'no-database': 'Nessun database configurato: le password non possono essere salvate.',
  'not-allowed': 'Serve il ruolo Admin per impostare la password di qualcun altro.',
  'is-owner':
    'La password di un altro proprietario non si imposta da qui: il suo accesso risponde alla configurazione del server.',
  'weak-password': `La password deve avere almeno ${MIN_PASSWORD} caratteri.`,
  'wrong-password': 'La password attuale non è corretta.',
  'no-password': 'Questo indirizzo non ha una password.',
  failed: 'Salvataggio non riuscito. Riprova.',
}
