# Attivazione obbligatoria del piano — registrazione, scelta, gate d'accesso

Documento a parte da `PLAN-pagamenti.md`, non una sua appendice, per lo stesso motivo per cui
quel file è a parte da `PLAN.md`: `PLAN-pagamenti.md` descrive lavoro già spedito (storico
pagamenti, upgrade/downgrade/disdetta, `/billing`) — una fase nuova dentro un documento "cosa
esiste" confonderebbe "già fatto" con "da fare". Punto di partenza: upgrade, downgrade e
disdetta **esistono già e restano fuori scope qui** — verificato leggendo `checkout.ts`,
`entitlements.ts`, `/billing` e `PLAN-pagamenti.md` stesso, tutti coerenti con quel documento.
Il buco reale è un altro: **nessun account ha mai scelto esplicitamente un piano**, nemmeno
Free.

## Il buco

`accounts.plan` ha `default('free')` a livello di colonna (`schema.ts`). `provisionAccount`
inserisce la riga con `{ ownerEmail }` e nient'altro — il piano nasce già "free" senza che
nessuno lo scelga, lo veda o lo confermi. `middleware.ts` blocca solo chi non ha una sessione
affatto (`!request.auth`); non ha mai controllato, e oggi non ha alcun modo economico di
controllare, se un piano è stato scelto. Il risultato: un account appena nato è già pienamente
operativo su Free implicito, e le uniche due superfici di scelta piano che esistono
(`/pricing`, `/checkout/[plan]`) sono entrambe facoltative — nulla obbliga a passarci.

`/checkout/[plan]` in più non vende nemmeno Free: `CHECKOUT_PLANS` è `PAID_PLANS + lifetime`
(`prices.ts`), quindi "scegliere Free" oggi non è un'azione che esiste da nessuna parte — è
semplicemente il non fare nulla.

## Perché non nel middleware

`middleware.ts` gira sull'edge runtime per scelta esplicita — `auth.config.ts` lo dice nel
proprio commento («must stay free of anything Node-only»). Aggiungere una query al database lì
andrebbe contro quel vincolo architetturale deliberato, e pagherebbe una query su *ogni*
richiesta che passa dal matcher, non solo sulla prima dopo il login. Il gate non vive lì.

## Perché non un redirect generico in `RoleProvider`

Prima ipotesi scartata (grazie a una revisione dell'architettura prima di scrivere questo
documento): agganciare il redirect a `RoleProvider`, che già fa il fetch di identità via
`loadIdentity()` una volta per sessione di tab. Due problemi, entrambi reali:

1. `RoleProvider` sta nel **root layout**: un redirect lì scatterebbe su ogni pagina, incluso
   `/checkout/[plan]` stesso — un utente in attesa che tocca "Choose Standard" verrebbe
   rimbalzato subito indietro su `/pricing` prima che `CheckoutScreen` possa girare.
   Servirebbe una allowlist di rotte dove il gate non deve scattare, duplicando la lista già in
   `middleware.ts` per un secondo scopo.
2. Dopo l'azione che completa la scelta, il contesto di `RoleProvider` resterebbe stantio (si
   aggiorna solo al mount e sull'evento `online`, mai su una scrittura appena fatta) — la
   navigazione successiva verso `/` rilancerebbe il gate e rimbalzerebbe l'utente di nuovo.

## La scelta: `(home)/page.tsx`, non una rotta nuova

`(home)/page.tsx` è già `export const dynamic = 'force-dynamic'`, gira per-richiesta, chiama
già `currentUser()` (un vero accesso al database) e **già fa esattamente questo genere di
redirect**: `if (hasDatabase && user === null) redirect('/login')`, con la stessa identica
logica ("la sessione è valida ma non è più ammessa da nessuna parte, quindi torna a farsi
riconoscere"). Aggiungere un secondo controllo, subito dopo, con la stessa forma:

```
if (hasDatabase && user !== null && !isOwner(user.email, process.env.ALLOWED_EMAILS)) {
  if (!(await hasChosenPlan(user.accountOwnerEmail))) redirect('/pricing')
}
```

risolve entrambi i problemi del `RoleProvider`: nessuna allowlist serve, perché nessun'altra
rotta (`/checkout/[plan]`, `/login`, `/register`, `/verify`, le pagine legali) passa da questo
file; e nessuno stato stantio, perché ogni navigazione verso `/` — inclusa quella lanciata
dall'azione che completa la scelta — rilancia il render dinamico da zero e rilegge il database.
Tutti e tre i punti d'ingresso dell'app (Google OAuth da `/login` e `/register`, e
`verifyEmail` dopo la verifica email) reindirizzano già a `/` oggi, quindi un solo punto di
controllo copre ogni caso senza toccare nessuno dei tre.

**Correzione rispetto alla prima stesura di questo documento**: qui era scritto
`user.role !== 'admin'` come modo economico di escludere il global owner. Falso: `roleOf`
ritorna `'admin'` anche quando `normalizeEmail(email) === normalizeEmail(accountOwnerEmail)`,
cioè **ogni proprietario è admin sul proprio account** — non esistono più ruoli minori da
"Niente più ospiti" in poi. `user.role` non distingue affatto il global owner da un cliente
qualunque. Il controllo corretto, verificato leggendo `roles.ts`/`allowlist.ts` prima di
scrivere il codice, è `isOwner(user.email, process.env.ALLOWED_EMAILS)` diretto — la stessa
identica chiamata già usata in `auth/actions.ts` (`setPasswordFor`). Controllato su `user.email`
(la persona davvero collegata), non su `accountOwnerEmail`: così un global owner passato "come"
un cliente tramite Switch non viene mai rimbalzato dall'onboarding incompleto di quel cliente.

## Schema — migrazione `0027`

```sql
ALTER TABLE accounts ADD COLUMN plan_chosen_at timestamp with time zone;

-- Backfill una tantum: ogni account che esiste già oggi conta come "già attivato" fin dalla
-- sua creazione — non deve interrompere nessuno che sta già usando l'app. Non `now()`, cosa
-- che marcherebbe ogni account vecchio come attivato "oggi": `created_at` è la data onesta.
UPDATE accounts SET plan_chosen_at = created_at WHERE plan_chosen_at IS NULL;
```

Nullable, nessun default: "nessuna scelta ancora" è esattamente lo stato di una colonna mai
scritta, lo stesso idioma già usato per `granted*` e per `pending_plan`/`pending_cycle`.

Da tenere a mente scrivendola (stessa nota già in `PLAN-pagamenti.md`): ogni snapshot
`drizzle-kit` da 0015 in poi propone di ricreare tabelle intere da zero — va scartato quel
diff e scritto l'SQL a mano, come già fatto per `0024`\-`0026`.

## Le regole del gate

- **Scatta solo se `plansEnforced()`** (`SONGBOOK_PLANS=on`). Se i piani non sono enforced,
  obbligare a sceglierne uno non avrebbe senso — coerente con l'intera famiglia di funzioni in
  `resolve.ts`, che fallisce tutta verso "nessun enforcement" quando questo flag è spento. In
  locale, dove `SONGBOOK_PLANS` non è mai settato, il gate resta spento di default, com'è oggi
  per il resto dei piani.
- **Non dipende da `mockCheckoutEnabled()`.** Questo è un flag diverso (`SONGBOOK_MOCK_CHECKOUT`),
  che governa solo i pulsanti "Choose" verso il checkout a pagamento. L'uscita gratuita
  (`activatePlanChoice`, sotto) deve funzionare anche con il checkout spento — altrimenti, con
  `SONGBOOK_PLANS=on` e `SONGBOOK_MOCK_CHECKOUT=off`, un account nuovo resterebbe bloccato senza
  alcuna via d'uscita.
- **`SONGBOOK_FORCE_PLAN` scavalca il gate.** Il suo contratto è "questo account è esattamente e
  solo questo piano" (`resolve.ts`) — un override che finisce comunque contro il muro
  dell'attivazione sarebbe l'unico caso locale in cui la scorciatoia non scorcia. Quando
  `forcedPlanNotice()` non è `null`, il controllo in `(home)/page.tsx` si salta del tutto.
- **Il global owner è esente**, backfillato come tutti gli account esistenti e mai più toccato
  dal controllo, a prescindere da quando è stato creato il suo account.

## Le due uscite dal gate

- **Free** — nuova azione server, `activatePlanChoice()` (`lib/plans/checkout.ts`): scrive
  *solo* `plan_chosen_at = now()`, senza toccare `plan`/`planStatus`/`planExpiresAt` (che
  restano sul default `free` già scritto) e senza loggare nulla in `paddle_events` — scegliere
  Free non è un acquisto, e mescolarlo nello storico pagamenti renderebbe quella tabella una
  lista di "ricevute" che include righe da zero euro non richieste da nessuno. Finisce con
  `redirect('/')`, lo stesso idioma già usato da `verifyEmail`.
- **A pagamento o Lifetime** — il `mockPurchase` già esistente, esteso di una riga: se
  `plan_chosen_at` è `null`, lo scrive insieme al resto della transazione. Così la primissima
  scelta, anche se è direttamente un piano a pagamento (nessun passaggio da Free prima),
  soddisfa il gate da sola. Nessun cambiamento alla logica di upgrade/downgrade esistente.

## `/pricing` — un solo pulsante diventa consapevole di chi guarda

La pagina resta esattamente com'è: statica, server-side, leggibile sia da uno sconosciuto sia
da chi è loggato da mesi (il suo stesso commento lo dichiara già). Cambia solo il pulsante
"Start free" dentro `PricingPlans` (già `'use client'`): oggi è un `<Link href="/register">`
fisso, per chiunque lo guardi.

`PricingPlans` guadagna la stessa lettura di identità che `RoleProvider` già fa (stesso
`loadIdentity()`, stessa idea di "known" prima di offrire qualunque cosa), estesa con un
`planChosen: boolean`. Tre stati per quel solo pulsante:

- **Sconosciuto o sloggato** → comportamento di oggi, invariato: link a `/register`.
- **Loggato e già attivato** → il pulsante resta un link, ma innocuo: ri-cliccarlo chiamerebbe
  comunque solo un ri-timbro idempotente, non un caso da gestire a parte.
- **Loggato e in attesa (il caso nuovo)** → il pulsante diventa un bottone che invoca
  `activatePlanChoice()` e segue il suo `redirect('/')`.

Questo non è un secondo punto di enforcement — è pura cosmetica, la stessa filosofia che
`RoleProvider` dichiara già di sé stesso ("gates what the screens offer, never what the server
allows"). Il vero cancello resta unicamente quello in `(home)/page.tsx`.

## Superficie admin — `/accounts`, il nome del piano guadagna evidenza

Oggi il piano è testo minuto in coda alla riga, stesso colore di tutto il resto:
`3 sign-ins · free`, `1 sign-in · standard · subscription until 12 giu 2027`. Il nuovo lavoro:

- Il nome del piano diventa un **badge pieno, prominente**, spostato fuori dalla riga di testo
  minuto — non più annegato dopo il conteggio dei sign-in.
- **Un colore diverso per ognuno dei cinque piani**, più un sesto per lo stato "non ancora
  attivato". Questo è formalmente un'eccezione alla *Chord-First Rule* di `DESIGN.md` ("un solo
  colore d'accento in tutta l'app, riservato per primo agli accordi; ogni altro uso deve restare
  più silenzioso"): qui invece sono richiesti colori pieni e distinti. L'eccezione è scoped
  **solo a questa schermata admin**, che non ha uno spartito né accordi con cui competere — la
  sostanza della regola (non distrarre dall'accordo sul foglio) resta intatta, solo la sua
  lettera più larga no. `DESIGN.md` va aggiornato per dichiarare esplicitamente questa singola
  eccezione e il motivo, così un lettore futuro non la scambi per una deriva. La palette esatta
  (famiglia di colore per piano) si rifinisce contro i token già in `DESIGN.md` in fase di
  implementazione — non blocca questo documento.
- **"Not activated"** (in inglese, come ogni stringa che l'app mostra — vedi la nota di
  `CLAUDE.md` sul perché) appare solo quando `planChosen === false` su una riga che
  `listAccountPlans` è effettivamente riuscita a leggere. Punto di attenzione esplicito: la
  mappa già distingue una riga *letta con successo* da una riga per cui la lettura è fallita
  (`listAccountPlans` può tornare `null` del tutto, e il componente già assorbe quel caso
  nascondendo piano e pulsante). Le due `null` non si scambiano di significato: "non sono
  riuscito a leggere" non deve mai apparire come "non attivato" sulla schermata il cui intero
  scopo è essere creduta — sarebbe un'affermazione falsa, non un'informazione mancante.

`AccountPlanLine` (`accounts/read.ts`) guadagna un campo `planChosen: boolean`, letto insieme al
resto della riga nella stessa query che già legge `pendingPlan`/`grantedPlan` — nessuna query
in più.

## Cosa resta fuori scope, esplicitamente

- **Upgrade, downgrade, disdetta**: invariati. `/billing`, `mockPurchase`, `mockCancel`,
  `clearPendingChange`, lo storico in `paddle_events` — tutto resta come descritto in
  `PLAN-pagamenti.md`. L'unico tocco a `checkout.ts` è la riga che stampa `plan_chosen_at` in
  `mockPurchase`, sopra.
- **Non è una security boundary.** L'utente ha chiesto che l'accesso all'app richieda "per
  forza" un piano; questo gate lo ottiene lato UX (un redirect server-side sulla rotta
  d'ingresso), non lato permessi. Chi aggirasse il redirect a mano continuerebbe a usare l'app
  sul Free implicito già di oggi — nessun danno nuovo, nessun accesso che non avesse già. È
  coerente con la filosofia già scritta nel codice (`RoleProvider`: «this is not the
  permission... every action re-reads the table on the server»): ogni scrittura reale resta
  comunque protetta dalle proprie regole indipendentemente da questo gate.
- **Deep link diretti** a `/songs/[slug]` o `/songbooks/[slug]` prima di aver mai visitato `/`
  almeno una volta: nessuna delle due rotte richiama oggi `currentUser()` per conto proprio, e
  un account appena nato non ha comunque nulla da linkare finché non ha visto la home almeno
  una volta — quindi il caso non si presenta nel percorso reale di un nuovo iscritto.

## Migrazione

Nuova migrazione `0027`: `accounts.plan_chosen_at timestamp with time zone`, nullable, nessun
default, con il backfill one-time descritto sopra. Stesso avvertimento sul diff di
`drizzle-kit` già scritto in `PLAN-pagamenti.md`.

## Decisions

- **Solo il gate di attivazione, non upgrade/downgrade/disdetta** — già completi e già
  documentati, verificato leggendo il codice prima di aprire questo lavoro; una fase nuova
  dentro `PLAN-pagamenti.md` avrebbe confuso "fatto" con "da fare".
- **Retroattività: no.** Solo gli account creati da ora in poi vedono il gate. Ogni account
  esistente viene backfillato come "già attivato" (`plan_chosen_at = created_at`) nella stessa
  migrazione — zero interruzione per chi sta già usando l'app, zero sorpresa di supporto.
- **Global owner esente** — non è un cliente, e può già agire "come" qualsiasi account tramite
  Switch; obbligarlo a scegliere un piano per il proprio account personale non aggiungerebbe
  nulla.
- **Il gate vive in `(home)/page.tsx`, non nel middleware né in `RoleProvider`** — l'unico posto
  che già fa una verifica server-side, dinamica, per-richiesta dell'account, con la stessa forma
  del redirect verso `/login` già presente lì. Evita sia il vincolo edge-runtime del middleware
  sia il doppio problema (allowlist di rotte + stato stantio dopo l'azione) di un redirect
  generico in `RoleProvider`.
- **Riuso di `/pricing`, nessuna schermata di onboarding dedicata** — un solo posto dove
  confrontare i piani, sia per chi deve ancora registrarsi sia per chi deve completare la
  propria attivazione. Cambia un solo pulsante ("Start free"), non l'impalcatura della pagina.
- **"Scegliere Free" non è un acquisto** — `activatePlanChoice()` timbra solo `plan_chosen_at`,
  non tocca `plan`/`planStatus` (già corretti dal default) e non scrive in `paddle_events`: lo
  storico pagamenti resta una lista di transazioni vere, non include righe da zero euro.
- **Il gate dipende da `SONGBOOK_PLANS`, non da `SONGBOOK_MOCK_CHECKOUT`** — spegnere
  l'enforcement dei piani spegne anche l'obbligo di sceglierne uno; l'uscita gratuita deve
  restare percorribile anche a checkout spento, per non lasciare un account nuovo bloccato senza
  via d'uscita.
- **`SONGBOOK_FORCE_PLAN` scavalca il gate** — il suo contratto ("questo account è esattamente
  questo piano") sarebbe altrimenti contraddetto dal proprio stesso muro d'attivazione.
- **Colori pieni e distinti per i badge di piano, ma solo in `/accounts`** — eccezione dichiarata
  ed esplicita alla Chord-First Rule di `DESIGN.md` (una schermata operatore senza spartito non
  compete con un accordo), non una deriva silenziosa; `DESIGN.md` va aggiornato per dirlo.
- **Le due `null` di `listAccountPlans` restano separate** — "non sono riuscito a leggere questa
  riga" (comportamento di oggi, invariato) non deve mai leggersi come "non attivato" (il nuovo
  stato, che esiste solo su righe lette con successo).

## Domande aperte

1. **Palette esatta dei sei colori** (cinque piani + "Not activated") — proposta concettuale
   qui (una famiglia di colore distinta per piano, un tono di richiamo/attenzione per "non
   attivato"), da rifinire contro i token reali di `DESIGN.md` quando si scrive il CSS.
2. **Copy esatta della schermata di attesa** — se aggiungere una frase su `/pricing` che spieghi
   perché quella pagina è comparsa subito dopo la registrazione ("Scegli un piano per
   continuare" o simile), o lasciare che il contesto (arrivo diretto dopo il login, nessun'altra
   rotta raggiungibile) parli da solo. Decisione di copy, non di architettura — rimandata alla
   scrittura effettiva dello schermo.
