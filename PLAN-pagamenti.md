# Piani, pagamenti e disdette — area utente e area admin

Continua il lavoro dei piani a pagamento e del checkout finto (non documentato in `PLAN.md`,
che si ferma alla v3.3 e non menziona piani/Paddle in nessuna sezione — questo file vive a
parte apposta, invece di essere infilato come una v3.4 che dipenderebbe da una funzionalità
che `PLAN.md` non introduce mai). Punto di partenza: **zero utenti a pagamento reali**, il
checkout è un mock aperto a chiunque (`SONGBOOK_MOCK_CHECKOUT`), e l'integrazione Paddle vera
resta esplicitamente futura — questo file non la costruisce, prepara solo il terreno perché
sostituirla un giorno sia uno swap e non una riscrittura.

## Cosa esiste già

- **Schema** (`db/schema.ts`, `accounts`): `plan`/`planStatus`/`planExpiresAt` (colonne che
  scriverà il futuro webhook Paddle, oggi scritte dal mock), `grantedPlan`/`grantedUntil`/
  `grantedBy`/`grantedAt`/`grantedNote` (regalo manuale, binario separato e già ben
  documentato in `accounts/actions.ts`), `paddleCustomerId`/`paddleSubscriptionId`
  (riservate al webhook vero, mai scritte dal mock), `paddle_events` (il ledger append-only
  pensato per gli eventi Paddle — **esiste ma nessuno scrive lì oggi**).
- **Mock checkout** (`lib/plans/checkout.ts`, `/checkout/[plan]`): `mockPurchase`/
  `mockCancel`, aperti a chiunque sia autenticato, scrivono solo le tre colonne di
  abbonamento, effetto sempre immediato, nessuna riga di storico.
- **Admin** (`app/accounts/page.tsx`, `AccountPlanButton.tsx`): elenco account con la riga di
  piano (`planClause`), pannello per dare/togliere un regalo (`setGrant`). Nessuna vista sui
  pagamenti.
- **Menu utente** (`UserMenu.tsx`): badge col nome del piano (statico, nessun link), schermata
  Settings con Instrument/Theme/Notation/Delete account — nessun punto d'ingresso verso
  fatturazione o storico.

## Cosa manca (obiettivo di questa fase)

1. Storico dei pagamenti, sia per l'utente che per l'admin.
2. Un posto dove l'utente cambia piano da solo — upgrade, downgrade, disdetta.
3. Una semantica per upgrade/downgrade/disdetta che non sia "tutto istantaneo" come oggi.
4. Visibilità admin sullo storico (senza nuove leve di scrittura — vedi Decisioni).

## Piano in sospeso — perché serve uno schema nuovo

`liveSubscription` (`entitlements.ts`) già oggi lascia decadere da sola una sottoscrizione la
cui data è passata, **senza bisogno di nessuna scrittura**: è pura, non tocca il database, e
la fa decadere solo confrontando `now` con `expiresAt`. Questo basta perfettamente per una
**disdetta**: non tocchiamo `plan`/`planStatus`/`planExpiresAt` al momento della disdetta,
lasciamo che la data già scritta scada da sola, e il piano torna a `free` automaticamente il
giorno dopo — zero cron, zero scrittura al momento della scadenza. (Verificato: non c'è alcuna
infrastruttura cron/job in questo progetto — `vercel.json` non ne dichiara e `src/app/api`
contiene solo la rotta NextAuth. Non ce ne serve una: la soluzione è nella purezza della
funzione, non in un lavoro pianificato.)

Un **downgrade** verso un altro piano pagante (non verso `free`) è diverso: alla scadenza il
piano non deve semplicemente decadere, deve *diventare un altro piano pagante*. Questo la
funzione pura di oggi non lo sa fare, e serve un posto dove scrivere "cosa diventerà, e da
quando lo sappiamo già" — due colonne nuove, non un flag booleano: serve sapere *quale* piano,
non solo *che* cambierà.

### Schema (migrazione 0026)

```
accounts.pending_plan   text, nullable   -- il piano (Plan) che sarà in vigore da planExpiresAt in poi
accounts.pending_cycle  text, nullable   -- il ciclo (BillingPeriod) di quel piano; null se pending_plan = 'free'
```

Nessun default, nessuna riga esistente tocca queste colonne: "niente in sospeso" è
esattamente lo stato di una colonna mai scritta, lo stesso idioma già usato per `granted*`.

**`pending_plan` non va letto con `readPlan`.** `readPlan` degrada qualunque valore non
riconosciuto a `'free'` — e nel modello di questo file `'free'` in `pending_plan` significa
"disdici a fine periodo". Un valore corrotto o scritto da un deploy più nuovo che questa
versione non riconosce diventerebbe così una disdetta silenziosa, il rovescio esatto
dell'asimmetria che `types.ts` già dichiara in questi termini: *"un piano illeggibile non deve
mai concedere, uno stato illeggibile non deve mai revocare"* — lo stesso motivo per cui
`validateGrant` confronta con `PLAN_VALUES.includes` e non chiama mai `readPlan`. Regola:
`pending_plan` si legge con lo stesso confronto diretto contro `PLAN_VALUES`, e un valore non
riconosciuto si legge come **nessun pending** (la direzione generosa), non come `'free'`.

`pending_plan = 'free'` è **la disdetta**, modellata come "downgrade verso free" invece che
come un caso a parte — un solo meccanismo per entrambe, non due. Questo evita anche un
booleano `cancelAtPeriodEnd` che affiancherebbe `pending_plan` senza aggiungere informazione:
un piano pendente pagante *e* una disdetta pendente sono la stessa colonna, letta due modi.

### La funzione pura che risolve il pending — `resolveSubscription`

`pendingPlan: Plan | null` e `pendingCycle: BillingPeriod | null` diventano due campi
**obbligatori su `StoredPlan` stesso** (`entitlements.ts`), non un'intersezione sul solo
parametro di una funzione. È la parte che rende la correttezza verificabile dal compilatore
invece che a occhio: con i due campi obbligatori, ogni punto che costruisce uno `StoredPlan`
smette di compilare finché non li popola — un sito dimenticato diventa un errore di build,
non una divergenza scoperta a runtime. Il punto che conta è `storedPlanOf` in `resolve.ts`: è
l'**unico** costruttore di `StoredPlan` dietro `entitlementsOf`, `deviceCapOf` **e**
`effectivePlanOf` (quest'ultima è la funzione dietro il badge del piano in `UserMenu` — se non
selezionasse le due colonne nuove, il badge direbbe "Premium" mentre i gate impongono già
Standard). Aggiornare la sua `SELECT` e i suoi due rami "forced plan" letterali una volta
sistema tutte e tre le chiamanti in un colpo. `listAccountPlans` (`accounts/read.ts`) e
`rawSubscriptionOf` (`checkout.ts`) fanno ciascuna una propria query separata e vanno
aggiornate a parte, non passano da `storedPlanOf`.

Nuova funzione pura, accanto a `liveSubscription`, con la stessa disciplina (pura, `now` come
parametro, nessun accesso al database):

```
resolveSubscription(stored: StoredPlan, now: Date):
  { plan: Plan; status: PlanStatus; expiresAt: Date | null; pendingPlan: Plan | null; pendingCycle: BillingPeriod | null }
```

Regole:
- Se `status` è `'expired'` o `'grace'`, o `expiresAt` è `null` (free, lifetime): nessuna
  risoluzione, si ritorna lo stato grezzo tale e quale. **`grace` ignora le date per lo stesso
  motivo per cui `liveSubscription` già lo fa** — un pending non scatta mai durante un
  tentativo di rinnovo in corso, deliberatamente, non per un ordine di `if` casuale.
- Se `now < expiresAt`: nessun cambio ancora — si ritorna lo stato grezzo, **con**
  `pendingPlan`/`pendingCycle` esposti tali e quali, perché è quello che fa vedere all'utente
  e all'admin "premium fino al 12/6/2027, poi standard" *prima* che scatti.
- Se `now >= expiresAt` e `pendingPlan !== null`: il cambio è scattato. Si ritorna
  `{ plan: pendingPlan, status: 'active', expiresAt: null, pendingPlan: null, pendingCycle: null }`
  — un solo passo, mai una ricorsione: se `pendingPlan` fosse ancora scritto dopo questa
  chiamata (perché nessuno ha ancora eseguito la scrittura pigra, sotto) una ricorsione
  vedrebbe lo stesso pending e non finirebbe mai. `expiresAt: null` è deliberato e non un
  buco: non stiamo simulando un nuovo ciclo di rinnovo con una nuova scadenza, il mock non
  modella rinnovi ricorrenti per nessun piano già oggi — il piano "nuovo" resta in vigore
  finché qualcosa non lo cambia di nuovo, esattamente come ogni riga scritta da `mockPurchase`
  oggi non si rinnova mai da sola.

`liveSubscription(stored, now)` diventa semplicemente: applica la sua logica di oggi al
risultato di `resolveSubscription(stored, now)` invece che a `stored` direttamente. Il resto
della funzione non cambia una riga.

### I tre punti che devono leggere attraverso `resolveSubscription`, non le colonne grezze

Oggi due percorsi leggono `plan`/`planStatus`/`planExpiresAt` **grezzi**, non attraverso
`liveSubscription`/`planStateFor`:

- `rawSubscriptionOf` (`checkout.ts`) — la riga "This account right now" del checkout/billing.
- `AccountPlanLine`/`AccountPlanButton.subscriptionLine` (`accounts/read.ts`,
  `AccountPlanButton.tsx`) — la riga admin, quella con il commento «lo schermo il cui intero
  scopo è essere creduto».

Con un downgrade in sospeso che scatta, questi due continuerebbero a stampare "Premium, until
12/6/2027" (una data passata, status ancora `active`) mentre gli entitlement dicono già
Standard — la stessa divergenza che il resto del codice ha sempre evitato con cura. Entrambi
vanno riscritti per costruire il loro oggetto a partire da `resolveSubscription(raw, now)`, non
dalle colonne. `AccountPlanLine` guadagna un campo `pendingPlan: Plan | null` (non serve una
nuova data: la data è già `planExpiresOn`, quella esistente). `MockSubscriptionState`
(`checkout.ts`) guadagna lo stesso campo.

## Casi limite (decisi qui, non lasciati all'implementazione)

- **`lifetime` non si disdice e non si declassa nel mock.** `expiresAt` è `null` per
  definizione — un pending non avrebbe mai una data su cui scattare. Un cliente lifetime che
  volesse un piano diverso è un caso di supporto, non un flusso self-service; `mockCancel` e
  `mockPurchase` verso qualsiasi piano restituiscono `not-applicable` quando il piano in
  vigore sul lato abbonamento è già `lifetime`, e la schermata Billing non mostra i controlli
  di cambio piano in quel caso — mostra solo "Lifetime — nulla da rinnovare o disdire."
- **Il confronto di rango è contro il piano *abbonamento* dal vivo, mai contro il piano
  effettivo.** `mockPurchase` decide se è un upgrade o un downgrade confrontando il piano
  scelto con `liveSubscription(stored, now)` (già pending-aware), **non** con
  `planStateFor(...).effectivePlan`. Un account con un regalo `lifetime` e un abbonamento
  `standard` che compra `plus` deve leggersi come un upgrade dell'abbonamento (standard →
  plus), non come un downgrade rispetto al regalo che vince oggi — sono due assi separati per
  lo stesso motivo per cui `grantedPlan`/`plan` sono due colonne separate.
- **Rango pari (stesso piano, es. solo cambio di ciclo annuale/mensile) è immediato**, come un
  piccolo upgrade: rinnova subito con le nuove date e **cancella un downgrade/disdetta in
  sospeso**, se ce n'era uno — un ripensamento ("in realtà voglio restare qui") si esprime
  comprando di nuovo il piano attuale, non con un pulsante a parte.
- **Un upgrade sempre immediato**, anche con un downgrade già in sospeso: comprare un piano più
  alto sovrascrive `plan`/`planStatus`/`planExpiresAt` e azzera `pendingPlan`/`pendingCycle` —
  chi paga di più non aspetta un rinnovo per vederne il beneficio, né aspetta che scada prima
  un downgrade che ha appena cambiato idea su.

## Le funzioni di scrittura (`lib/plans/checkout.ts`)

- **`mockPurchase(plan, cycle)`** — invariato nella firma. Nuova diramazione interna: calcola
  `currentLive = liveSubscription(stored, now)`; se `plan === 'lifetime'`, o `currentLive`
  è `null`, o supera `currentLive` in `PLAN_RANK`, o è alla pari → applica subito (comportamento
  di oggi, più: azzera `pendingPlan`/`pendingCycle`). Se `currentLive` è `'lifetime'` → rifiuta
  (`not-applicable`). Altrimenti (rango inferiore, vero downgrade) → non tocca
  `plan`/`planStatus`/`planExpiresAt`, scrive solo `pendingPlan = plan, pendingCycle = cycle`.
  In entrambi i rami di successo, scrive una riga in `paddle_events` (sotto).
- **`mockCancel()`** — non scrive più `planStatus: 'expired'` subito. Calcola
  `currentLive = liveSubscription(stored, now)`; se è `null` o `'lifetime'` → `not-applicable`;
  altrimenti scrive `pendingPlan = 'free', pendingCycle = null` (una disdetta è un downgrade
  verso free, vedi sopra) e logga l'evento.
- **`clearPendingChange()`** (nuova) — "resta dove sono": azzera `pendingPlan`/`pendingCycle`
  senza toccare altro. Rifiuta se non c'era nulla in sospeso.
- **`forceExpireNow()`** (nuova, esplicitamente di test) — il comportamento che `mockCancel`
  aveva prima di questo cambiamento: scrive `planStatus: 'expired'` **subito**, azzera anche
  ogni pending (non c'è più nulla su cui farlo scattare). È l'unico modo rimasto per esercitare
  il percorso di blocco/freeze sulle colonne di abbonamento senza aspettare una data vera — vive
  nel checkout stesso, aperto a chiunque come il resto del mock, etichettato chiaramente come
  scorciatoia di test (stesso spirito del commento su `FAKE_CARD`) così che la frase resti
  onesta anche letta dopo che l'integrazione vera avrà sostituito questo file.
- `MockCheckoutFailure` guadagna `'not-applicable'`, con un messaggio proprio.

## Storico pagamenti → `paddle_events`, non una tabella nuova

Ogni scrittura di successo sopra logga anche una riga in `paddle_events`:

- `eventId`: un id generato lì (es. `mock_${randomUUID()}` o simile) — la tabella lo richiede
  come chiave primaria, e un evento mock non arriva già con un id come farebbe un webhook.
- `eventType`: prefisso `mock.` per restare visivamente e query-abilmente distinto dai nomi
  puntati che Paddle userà davvero (`subscription.created`, ...) — `mock.purchase`,
  `mock.scheduled_change`, `mock.force_expired`. Un solo `mock.scheduled_change` per downgrade
  *e* disdetta (il payload porta `targetPlan`; se è `'free'` la riga si legge come disdetta).
- `occurredAt`: `now` dell'azione (per un evento vero sarebbe la data di Paddle; qui non c'è
  differenza da marcare, quindi le due coincidono).
- `accountOwnerEmail`: l'account.
- `paddleSubscriptionId`: sempre `null` — non è mai stata scritta da niente qui, resta riservata
  al webhook vero, stesso patto già in vigore per `paddleCustomerId`/`paddleSubscriptionId` sulle
  colonne di `accounts`.
- `payload`: JSON con almeno `{ mock: true, action, plan, cycle, amount }` — `amount` letto da
  `PRICES` al momento dell'azione (una cifra finta ma coerente con quella già mostrata prima di
  comprare), per far leggere lo storico come una lista di ricevute vere e non come un log
  tecnico.

Nuova lettura condivisa, `paymentHistoryFor(accountOwnerEmail)`, usata da entrambi i punti
sotto — non due funzioni che interrogano la stessa tabella in due modi.

## Superficie utente — `/billing`

Nuova rotta, stessa impalcatura di `/checkout/[plan]` (`PrefsProvider` + `TopBar` + `main`),
nuovo componente client `BillingScreen`:

- Riga di stato, in una frase, dalla tripla risolta: *"Premium, si rinnova da solo."* /
  *"Premium fino al 12 giugno 2027, poi passa a Standard."* / *"Premium fino al 12 giugno
  2027, poi Free — disdetto."* / *"Lifetime — comprato una volta, nulla da rinnovare."* /
  *"Free — nulla ancora comprato."*
- Se c'è un pending: un pulsante **"Resta su {piano attuale}"** → `clearPendingChange()`.
- Link **"Cambia piano"** → `/pricing` — niente seconda copia della tabella di confronto già
  lì, con i suoi prezzi e pulsanti "Choose".
- Pulsante **"Disdici"** (nascosto su free/lifetime/pending-già-disdetta) → `mockCancel()`, con
  una riga di copy che dice esplicitamente che vale da fine periodo, non subito.
- Sezione di test, visivamente separata: **"Forza la scadenza adesso (solo per prova)"** →
  `forceExpireNow()`.
- Tabella storico pagamenti: Data · Evento · Importo, più recenti in cima, da
  `paymentHistoryFor`.
- Punto d'ingresso: nuovo `<Link href="/billing">` nella schermata **Settings** di
  `UserMenu.tsx`, sopra "Delete account" — stesso trattamento di "conseguenza sull'account",
  non di preferenza di lettura, coerente con l'aver già spostato lì "Delete account" per lo
  stesso motivo. Il badge del piano vicino all'email resta com'è (un'occhiata, non un link).

## Superficie admin — `/accounts`

- Nuovo pulsante **"History"** per riga, accanto a "Plan" — stesso trigger/pannello di
  `AccountPlanButton` ma **senza form**: solo la lista che produce `paymentHistoryFor`, letta
  con lo stesso componente di presentazione condiviso con `BillingScreen` (una lista, passata
  già caricata — niente doppia query, ognuno dei due punti la carica con la propria azione e le
  proprie regole d'accesso).
- `planClause`/`subscriptionLine` guadagnano la clausola *", poi {piano} il {data}"* quando
  `AccountPlanLine.pendingPlan` non è `null`.
- Nessun nuovo potere di scrittura sull'abbonamento — vedi Decisioni.

## Fuori scope, esplicitamente

- Nessuna leva admin diretta su piano/scadenza di un account (letto sotto, in Decisioni):
  chi deve provare il blocco lo fa passando dall'account stesso (Switch, già esistente) e usando
  `forceExpireNow` nel checkout — non da una seconda pagina.
- Nessuna simulazione di pagamento fallito/`grace` in questa fase — nessuna schermata lato
  lettore mostra oggi quello stato nemmeno per un account vero, solo la riga admin lo fa;
  costruire una vera esperienza di `grace` è UI nuova, non solo il cablaggio già richiesto qui.
  Resta in Domande aperte.
- Nessuna integrazione Paddle reale, nessun webhook: tutto qui è pensato per essere sostituito
  di netto, non estenso, il giorno in cui arriva — stesso patto già scritto in `checkout.ts`.
- Nessuna fattura/PDF scaricabile: lo storico è una tabella nella pagina.
- Nessun cambiamento a `setGrant`/`AccountPlanButton`: il regalo resta un binario separato,
  come oggi, per lo stesso motivo per cui lo è già.

## Migrazione

Nuova migrazione `0026`: `accounts.pending_plan text`, `accounts.pending_cycle text`, entrambe
nullable, nessun default, nessun backfill (ogni riga esistente non ha nulla in sospeso).

Da tenere a mente scrivendola (`PLAN.md`, Domande aperte #19): ogni snapshot `drizzle-kit` da
0015 in poi è una copia byte-per-byte di quello della v2.4, quindi il prossimo
`db:generate` proporrà di ricreare `accounts` da zero, le colonne di `songbooks`, e persino la
tabella `members` già droppata — va scartato quel diff e scritto l'SQL a mano, come già fatto
per 0024 e 0025.

## Decisioni

- **Storico in `paddle_events`, non una tabella nuova.** Stessa forma che scriverà un giorno
  il webhook vero; storico utente e admin leggono da un'unica fonte, e passare al Paddle vero
  non richiede un nuovo percorso di lettura.
- **Upgrade sempre immediato; downgrade e disdetta a fine periodo pagato.** Chi paga di più
  vede il beneficio subito (come Paddle, Stripe e chiunque altro); chi scende di piano o
  disdice mantiene ciò che ha già pagato fino alla scadenza — deciso esplicitamente dopo un
  primo giro di domande che li raggruppava insieme.
- **Admin: solo lettura sullo storico, nessuna leva diretta.** L'admin può già agire "come"
  qualsiasi account passando da Switch (già esistente) e usando il checkout lì — una seconda
  leva diretta duplicherebbe quel percorso. La leva di test per il blocco (`forceExpireNow`)
  resta nel checkout stesso, non nella pagina Accounts.
- **La disdetta è modellata come "downgrade verso `free`"**, una sola colonna
  (`pending_plan`) invece di un piano pendente più un booleano separato — meno stato, stesso
  significato.
- **Confronto di rango contro l'abbonamento dal vivo, mai contro il piano effettivo** (che
  può includere un regalo) — altrimenti un regalo più alto farebbe leggere come downgrade un
  upgrade reale dell'abbonamento sottostante.
- **`lifetime` non si disdice né si declassa nel mock** — non ha una scadenza su cui far
  scattare nulla; un cambiamento per un cliente lifetime resta un caso di supporto.
- **Documento a parte, non una v3.4 in `PLAN.md`** — `PLAN.md` non menziona piani/pagamenti in
  nessuna sezione; un'appendice lì dipenderebbe da un contesto che il documento non introduce
  mai.

## Domande aperte

1. **Simulare un pagamento fallito (`grace`) end-to-end** — rimandato: serve anche una UI
   lato lettore che oggi non esiste per nessun account, reale o finto (solo la riga admin
   nomina `grace`). Da riprendere se emerge il bisogno di provare anche quel percorso.
2. **Le colonne grezze restano "superate ma corrette solo attraverso `resolveSubscription`"
   indefinitamente** — non serve per la correttezza (ogni lettura passa dalla funzione pura),
   ma è un'igiene rimasta aperta: una scrittura pigra al prossimo tocco dell'account
   (`mockPurchase`, un futuro webhook) potrebbe riallineare `plan`/`planExpiresAt` col
   risultato risolto invece di lasciarli indietro a tempo indefinito.
3. **Nome esatto delle nuove funzioni server** (`clearPendingChange`, `forceExpireNow`,
   `paymentHistoryFor`, ...) — proposti qui come vocabolario di lavoro, da confermare in
   revisione quando si scrive il codice.
