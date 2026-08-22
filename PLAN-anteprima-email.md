# `/emails`: anteprima e invio di test dei modelli email

Documento a parte da `PLAN.md`, `PLAN-pagamenti.md`, `PLAN-attivazione.md` e
`PLAN-accounts-admin.md`, stesso motivo di sempre: quelli descrivono lavoro già spedito, questa
è una superficie nuova — uno strumento per il global owner, non un'appendice a un account
specifico.

## Cosa cambia, in quattro punti

1. Nuova pagina `/emails`, visibile solo al global owner (stesso gate `isOwner` di `/accounts`),
   con un tab per ciascuno dei tre modelli già in `lib/email/templates.ts`: verifica
   registrazione, benvenuto, reset password.
2. Ogni tab mostra oggetto, corpo HTML (renderizzato isolato, non iniettato nel DOM della
   pagina) e testo semplice, con un interruttore HTML/testo.
3. Un bottone "Invia copia di test" per modello, che manda la vera email — stesso `sendEmail`
   della produzione, non una simulazione — all'indirizzo di chi ha effettivamente fatto login.
4. Nuova voce nel menù (`NavMenu.tsx`), accanto ad "Accounts", visibile solo se `isGlobalOwner`.

## Perché una pagina a sé, non una sezione dentro `/accounts`

`/accounts` è uno strumento di ricerca/gestione per singolo account (piano, cronologia,
password, cancellazione). I tre modelli email non si personalizzano su dati di un account —
`welcomeEmail()` non prende nemmeno un parametro — quindi questa pagina non ha un account da
mostrare: è una verifica del "prodotto email" nel suo complesso, e vive per conto suo, con la
propria voce di menù invece di essere sepolta in fondo a una pagina che parla di tutt'altro.

## I tre modelli e i dati fittizi

- `verificationEmail(url)` — `url` fittizio costruito come farebbe `register()`
  (`lib/register/actions.ts`): punta a `/verify` con `email`/`token` di comodo, non un token
  reale.
- `passwordResetEmail(url)` — stesso schema, punta a `/reset-password`.
- `welcomeEmail()` — nessun parametro, nulla da fabbricare.

Il link fittizio non porta a nulla di funzionante se cliccato dall'inbox di test: apre `/verify`
o `/reset-password` con un token inesistente, e la pagina risponde come farebbe con un link
scaduto — comportamento atteso, non un bug, stesso spirito del checkout mock (`checkout.ts`).

## Invio di test: cosa, e a chi

- Nuova server action — es. `sendTestEmail(template: 'verification' | 'welcome' |
  'password-reset')`, vicino a `templates.ts` in `lib/email/` — che verifica `isOwner` da sé,
  senza fidarsi del gate della pagina: stessa disciplina di ogni scrittura in `checkout.ts`, che
  non si fida mai di `mockCheckoutEnabled()` controllato altrove.
- Destinatario: sempre `session.user.email`, l'identità di chi ha fatto login — mai l'account
  eventualmente selezionato dal cambio-account (`RoleProvider`/account switcher). Nessuno dei
  tre modelli appartiene a un account, quindi il selettore non ha voce in capitolo qui.
- Oggetto della copia di test prefissato con `[Anteprima] `, per non confondersi con un'email
  reale identica che arrivasse nella stessa inbox.
- Nessun campo destinatario libero: l'unico invio possibile è verso se stessi. Azzera il rischio
  che questa pagina diventi un modo per spedire email a indirizzi arbitrari.

## Layout

- Rotta: `/emails`, non annidata sotto `/accounts` — stessa scelta "piatta" di ogni altra rotta
  di quest'app (`/billing`, `/pricing`, `/accounts` stessa: nessun prefisso "admin" condiviso).
- Un server component pre-calcola i tre `{subject, html, text}` chiamando le funzioni pure di
  `templates.ts` (nessuna rete coinvolta: sono sincrone) e li passa a un client component
  (`EmailPreview.tsx`) che gestisce tab attivo, interruttore HTML/testo e stato del bottone di
  invio (disabilitato mentre invia, messaggio di esito — stesso schema di `GiftForm`/
  `DeleteAccountButton`).
- Il corpo HTML va in un `<iframe srcDoc={html}>`, non iniettato diretto nella pagina: quell'
  HTML ha stili inline pensati per un client di posta, non per convivere con Tailwind e i reset
  della pagina che lo ospita.
- Icona di menù: `IconEye`, già definita in `icons.tsx` e non usata altrove — nessuna nuova
  icona da disegnare.

## Decisions

- **Bottone "invia copia di test" incluso**, non solo anteprima statica — deciso dall'utente: il
  rendering nel browser non riproduce le stranezze dei client email reali (Gmail in primis).
- **Oggetto + HTML + testo semplice con toggle**, non solo HTML — deciso dall'utente: il testo
  semplice è quello che arriva a chi ha immagini/HTML disattivati, e merita di essere
  controllato senza dover leggere il codice.
- **Voce di menù propria**, non una sezione in fondo a `/accounts` — deciso dall'utente.
- **Una pagina con tab tra i tre modelli**, non tre sotto-rotte — deciso dall'utente: meno
  navigazione, tutto a un clic.
- **Destinatario del test è sempre l'identità di login** (`session.user.email`), mai l'account
  selezionato dal cambio-account — i tre modelli non appartengono a un account specifico, quindi
  quel selettore non si applica qui.
- **Oggetto della copia di test prefissato `[Anteprima]`** — evita confusione con un'email reale
  identica nella stessa inbox.
- **Rotta piatta `/emails`**, non `/accounts/emails` — coerente con come ogni altra rotta
  dell'app è organizzata, nessun prefisso "admin" condiviso da inventare apposta.
- **Rendering HTML in iframe isolato** — gli stili inline dell'email non devono convivere con
  quelli dell'app che li ospita.
- **`IconEye` riusata per la voce di menù** — esiste già, non è usata altrove, nessuna nuova
  icona da creare.

## Domande aperte

Nessuna: ogni scelta materiale per l'implementazione è decisa sopra.
