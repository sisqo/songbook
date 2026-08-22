# `/accounts`: da elenco statico a ricerca paginata + pagina di dettaglio

Documento a parte da `PLAN-attivazione.md` e `PLAN-pagamenti.md`, stesso motivo di sempre: quei
due descrivono lavoro già spedito (il gate di attivazione, upgrade/downgrade/disdetta) — questa
è una fase nuova sulla superficie admin, non un'appendice a un documento "cosa esiste già".

## Cosa cambia, in tre punti

1. **La sezione "Create" sparisce del tutto** dalla pagina — nessuna scorciatoia per dare a un
   indirizzo un account prima che si sia mai registrato da solo.
2. **"Every account" diventa una ricerca**: paginata, con un campo di ricerca per email, un
   filtro per piano e un ordinamento a scelta.
3. **La riga della lista si riduce a quattro fatti e un solo pulsante**: email, badge del piano,
   stato dell'abbonamento (quando finisce, in cosa diventerà), il numero di sign-in come cifra —
   e un pulsante che apre la pagina di dettaglio di quell'account. Ogni altra operatività (Enter,
   dare/togliere un regalo, password, cancellazione) si sposta lì.

## Perché "Create" può sparire senza lasciare un buco

`CreateAccountForm`/`createAccount` esistevano per "dare un'account a un indirizzo prima del suo
primo accesso" (v3.1, *Niente più ospiti*) — l'unico canale di ammissione di allora. Da v3.2
esiste la registrazione self-service (`/register`, email+password con verifica), e ogni account
nasce comunque al primo accesso riuscito qualunque sia la via (Google **o** password —
`provisionAccount` gira nello stesso `signIn` callback per entrambi i provider, non solo per
Google). Chi deve dare un accesso a qualcuno oggi lo manda a registrarsi; non c'è più un caso
reale per crearglielo a mano. Confermato: `AccountPasswordButton`/`setPasswordFor` non hanno mai
avuto bisogno che l'account esistesse già a livello di schema (`credentials` non ha una FK verso
`accounts`), ma nella UI di oggi il pulsante compare comunque solo su una riga di un account già
esistente — quindi la capacità "dai una password a un indirizzo che non esiste ancora" non
esiste già oggi nella pratica, e non è una perdita di questo cambiamento.

**Codice morto da rimuovere, non solo nascosto** (verificato con grep prima di scrivere questo
elenco, non per supposizione):
- `src/components/CreateAccountForm.tsx` — nessun altro import.
- `createAccount` (`lib/accounts/actions.ts`) — nessun altro chiamante.
- `AccountFailure`/`ACCOUNT_MESSAGE` (`lib/accounts/types.ts`) perdono `'invalid-email'` e
  `'already-exists'` — il commento di quel file stesso già li documenta come esclusivi della
  creazione (`/** Creating: ... */`), e `deleteAccount` (l'unico altro chiamante di
  `AccountResult`) non li usa e non li ha mai usati. Stessa disciplina che il file applica già a
  `SelfDeleteFailure` accanto: "this project does not model states a function cannot reach".

## La lista: perché filtro/ordinamento/paginazione vivono in memoria, non in SQL

Il filtro per piano e la spunta "Not activated" (deciso sotto) operano sul piano **risolto**
(`effectivePlan`, da `planStateFor`/`resolveSubscription`), non sulla colonna grezza `plan` — lo
stesso valore che il badge mostra oggi. `resolveSubscription` è una funzione pura in TypeScript,
non un'espressione SQL: duplicarne la logica in un `WHERE` sarebbe una seconda copia della
regola di generosità che il resto di questo feature ha sempre evitato con cura (vedi
`PLAN-attivazione.md` e i commenti di `entitlements.ts` stesso). La scelta è quindi: **leggere
tutti gli account** (`listAllAccounts` + `listAccountPlans`, gli stessi due read di oggi, mai
allargati in uno solo per la stessa ragione già documentata lì — un `listAccountPlans` fallito
non deve costare la lista intera), **risolvere ogni riga una volta**, e poi filtrare/ordinare/
paginare l'array risultante in JavaScript, dentro `AccountsPage`. Corretto e semplice alla scala
attuale (poche decine di account, installazione privata su invito); se un giorno crescesse a
migliaia, questo è il punto da rivedere — non prima.

**Degradazione quando `listAccountPlans()` torna `null`** (migrazione non ancora applicata, lo
stesso scenario che il codice di oggi già assorbe): il menu piano e la spunta "Not activated"
restano visibili nella UI, ma qualunque valore scelto viene **ignorato silenziosamente** — ogni
account passa il filtro, esattamente come se nessun filtro di piano fosse impostato. Le righe
mostrano solo email + cifra sign-in, senza badge né stato abbonamento, come già fanno oggi. Non
un errore, non uno stato "impossibile filtrare": la stessa direzione fail-open di ogni altra
funzione in questa parte del codice.

### Parametri di ricerca, nell'URL

Stato interamente nell'URL (`?q=&plan=&unactivated=&sort=&dir=&page=`), non in stato client —
condivisibile, torna indietro col pulsante Back, coerente con `force-dynamic` che questa pagina
già usa. Nessuno stato perso in un refresh.

- `q`: sottostringa sull'email, case-insensitive.
- `plan`: `free|standard|plus|premium|lifetime`, assente/`all` = nessun filtro. Confrontato contro
  `effectivePlan`, non contro `plan` grezzo.
- `unactivated`: `1` = solo righe con `planChosen === false`; si combina in AND con `plan`, non
  in alternativa — un account può avere un regalo Premium e non aver mai completato il gate di
  attivazione insieme (`setGrant` non tocca mai `planChosenAt`), le due condizioni sono
  indipendenti.
- `sort`: `email` (default) `| createdAt | lastSignInAt` — le tre colonne che `AccountSummary`
  espone già oggi, nessuna nuova query per ottenerle.
- `dir`: `asc` (default per `email`) `| desc`.
- `page`: intero 1-based, page size fissa a **25**.

## La riga della lista

```
mario@esempio.it                                    3
Premium · until 2027-06-12                    [View]
```

- Email, troncata come oggi.
- Badge piano (`PLAN_BADGE_CLASS`) + `planDetail()` — riusati identici da oggi, solo spostati (
  vedi sotto).
- Il conteggio sign-in come **cifra nuda**, non più la frase "3 sign-ins"/"Never signed in" —
  deciso esplicitamente, in contrasto con la versione di oggi. Porta comunque
  `aria-label`/`title` con la frase intera (es. `aria-label="3 sign-ins"`, `aria-label="Never
  signed in"` per lo zero), l'unica conseguenza di accessibilità di questa scelta.
- Un solo pulsante, **View** (non "Enter" — quello è un'azione diversa, ora sulla pagina di
  dettaglio) → `/accounts/[email]`.

## Le funzioni di formattazione condivise, non più duplicate

`PLAN_BADGE_CLASS` e `planDetail()` vivono oggi in `app/accounts/page.tsx`; `subscriptionLine`,
`giftLine`, `auditLine`, `inForceLine` vivono dentro `AccountPlanButton.tsx`, un componente
client. La nuova pagina di dettaglio (server component) deve poter chiamare tutt'e sei le
funzioni per renderle come testo direttamente, non dietro un pannello — quindi tutt'e sei si
spostano in un modulo condiviso nuovo, **`src/lib/accounts/planText.ts`**: nessuna direttiva
(`'use server'`/`'use client'`), funzioni pure su `AccountPlanLine`/`Plan`, importabile sia dal
server (la pagina di dettaglio, la lista) sia da un client component se mai servisse. Questo è
l'unico modo per non finire con due copie della stessa frase che possono divergere — esattamente
il rischio che il commento di `AccountPlanButton.tsx` su `subscriptionLine` mette già in guardia.
`app/accounts/page.tsx` e la nuova pagina di dettaglio importano da lì, nessuna delle due tiene
una copia propria.

## La rotta di dettaglio: `/accounts/[email]`

- Il segmento è l'email stessa, con `encodeURIComponent(ownerEmail)` nel link dalla lista, e
  **un `decodeURIComponent` esplicito nella pagina** (`readEmailParam`).

  Correzione rispetto alla prima stesura di questo documento, che affermava l'opposto: qui era
  scritto che `params` arriva già decodificato, "verificato leggendo il codice sorgente di
  Next.js (`route-matcher.js`, `getRouteMatcher`/`decode`)". Sbagliato — quello è il matcher del
  **Pages** Router, non il percorso che i `params` di un server component dell'App Router
  seguono. Verificato empiricamente (una rotta sonda temporanea sotto un prefisso pubblico al
  middleware, interrogata con `curl`): `/accounts/a%40b.com` arriva alla pagina come la stringa
  letterale `a%40b.com`, `%` compreso. Senza il decode, `getAccountDetail` cercava una riga il
  cui `owner_email` contenesse `%40`, non la trovava mai, e la pagina rispondeva `notFound()` su
  **ogni** account — il bug come si è manifestato in produzione.

  Un solo decode, inverso dell'unico `encodeURIComponent` del link: è anche ciò che preserva un
  indirizzo con un `%` letterale (legale nella parte locale di un'email, se rarissimo), perché
  il link lo scrive `%25` e la pagina lo rilegge `%`. Un secondo decode corromperebbe proprio
  quell'indirizzo. Su una sequenza malformata (`%zz`) `decodeURIComponent` lancia: `notFound()`,
  come per un indirizzo senza account.

  Lezione da tenere: leggere il sorgente di una libreria non è una verifica se non si è
  controllato di stare leggendo il percorso di codice davvero in uso. Una richiesta reale lo
  è.
- Stessa guardia della lista in testa alla pagina: `isOwner(session?.user?.email, ALLOWED_EMAILS)`
  altrimenti `notFound()` — "non esiste" e "non è tuo" restano indistinguibili dall'esterno,
  come ovunque in questo repo.
- Un'email che non corrisponde a nessuna riga in `accounts` è anch'essa `notFound()` — stessa
  regola, un indirizzo mai registrato e un indirizzo che un owner non dovrebbe vedere sono lo
  stesso "non c'è niente qui" per chi guarda da fuori.
- Nuova funzione, `getAccountDetail(ownerEmail)` in `lib/accounts/read.ts`: **un'unica riga**,
  non l'intera lista filtrata a un elemento — stesso spirito di "non pagare per l'installazione
  intera per una domanda su un account solo" che già motiva la separazione fra
  `listAllAccounts`/`listAccountPlans`. Restituisce `AccountSummary` + `AccountPlanLine`
  (risolti con la stessa logica, non una terza copia) per quel solo indirizzo, o `null`.

## Il layout della pagina di dettaglio

Tutto visibile subito all'apertura — non più un pulsante per pannello: la pagina intera è già il
"dettaglio", aprire un altro livello sotto sarebbe un click in più senza motivo.

```
mario@esempio.it
──────────────────────────────────────────
[Enter as this account]  (o "current", se è l'account su cui l'owner è già switchato)

Subscription
  Premium · from the gift.                  ← inForceLine
  Subscription — standard, until 2027-06-12 ← subscriptionLine
  Gift — premium until 2026-12-31           ← giftLine
  Given by owner@... on 2026-08-10.         ← auditLine, se presente
  [piano ▾] [fino al…] [perché…] [Give] [Remove gift]   ← form di scrittura, invariato

Payment history
  (tabella PaymentHistoryTable, caricata subito lato server — non più dietro un click)

Password
  [nuova password…] [Set] [Remove]           ← form sempre visibile, non più dietro un trigger

Danger zone
  [Delete account]                           ← invariato: click rivela ancora il campo di
                                                riconferma "ritaglia" l'indirizzo — l'unica
                                                azione che tiene la propria disclosure, perché
                                                è una rete di sicurezza deliberata, non un
                                                "clicca per vedere cos'è" come le altre
```

- **Enter**: stesso `switchAccount` di oggi (`EnterButton`), spostato qui, comportamento
  identico — un `form action` server-side che scrive il cookie e fa `redirect('/')`.
- **Subscription**: le quattro frasi renderizzate come testo semplice dal server, il form
  di dare/togliere un regalo diventa un client component più piccolo (`GiftForm.tsx`, quel che
  resta di `AccountPlanButton.tsx` una volta tolti i quattro line-builder e il trigger
  apri/chiudi) — stessa `setGrant`, stesso `router.refresh()` al successo.
- **Payment history**: `loadAccountHistory(ownerEmail)` chiamato **direttamente dal server
  component** della pagina di dettaglio, non più da un client wrapper che lo richiama al primo
  click. `AccountHistoryButton.tsx` sparisce — la ragione per cui esisteva ("la maggior parte
  delle righe non si apre mai, pagare la query per tutte sarebbe uno spreco") non vale più
  quando l'intera pagina è già la scelta esplicita di guardare quell'account.
- **Password**: `AccountPasswordButton.tsx` perde il trigger apri/chiudi, resta il form con Set
  e Remove sempre visibile — stesse due `setPasswordFor`/`removePasswordFor`.
- **Danger zone / Delete**: `DeleteAccountButton.tsx` resta quasi identico — **tiene** il proprio
  click-per-rivelare, perché è l'unico caso in cui nascondere qualcosa dietro un click è una
  rete di sicurezza voluta (retype-per-confermare), non un pannello-per-risparmiare-spazio come
  gli altri tre che qui si aprono. **Cambia una riga**: oggi chiama `router.refresh()` al
  successo, il che su questa pagina ricaricherebbe il dettaglio di un account appena cancellato
  — una pagina senza più la sua riga. Diventa `redirect('/accounts')`.

## Decisions

- **"Create" rimosso del tutto, codice morto compreso** — `/register` più il provisioning
  automatico a ogni primo accesso (Google o password) coprono già ogni caso reale; verificato
  con grep che `createAccount` non ha altri chiamanti prima di deciderlo, non per supposizione.
- **Filtro/ordinamento/paginazione in memoria, non in SQL** — il filtro opera sul piano
  *risolto*, che è una funzione pura TypeScript e non un'espressione SQL; duplicarla in un
  `WHERE` sarebbe una seconda copia della stessa regola di generosità. Corretto alla scala
  attuale (poche decine di account); da rivedere solo se l'installazione crescesse di ordini di
  grandezza.
- **`listAccountPlans() === null` disabilita silenziosamente il filtro di piano**, non lo
  segnala come errore — stessa direzione fail-open di ogni altro punto di questa parte del
  codice; le righe restano comunque leggibili (email + sign-in) come già oggi.
- **Filtro piano e spunta "Not activated" indipendenti, in AND** — un regalo non tocca mai
  `planChosenAt` (`setGrant`), quindi un account può essere "Premium" e "Not activated" insieme;
  un solo controllo che scegliesse fra i due non potrebbe esprimere quella riga.
- **Cifra nuda per i sign-in nella lista**, non più la frase — deciso esplicitamente
  dall'utente; `aria-label` porta la frase intera per chi usa uno screen reader.
- **Le sei funzioni di formattazione del piano vivono in `lib/accounts/planText.ts`**, condivise
  fra lista e dettaglio — l'alternativa (due copie) è esattamente il rischio che il commento di
  `AccountPlanButton.tsx` su `subscriptionLine` avverte di evitare.
- **`/accounts/[email]`, con `encodeURIComponent` sul link e `decodeURIComponent` nella pagina**
  — l'App Router consegna il segmento ancora percent-encoded (verificato con una richiesta
  reale, non leggendo il sorgente della libreria: vedi sopra per il perché quella prima
  "verifica" era invalida e per il 404 in produzione che ne è seguito).
- **Pagina di dettaglio: tutto visibile, azioni raggruppate nella propria sezione** — l'unica
  eccezione è `DeleteAccountButton`, che tiene il proprio click-per-rivelare come rete di
  sicurezza deliberata, non come risparmio di spazio.
- **`DeleteAccountButton` reindirizza a `/accounts` invece di `router.refresh()`** sulla pagina
  di dettaglio — altrimenti ricaricherebbe il dettaglio di un account che non esiste più.
- **`AccountHistoryButton.tsx` rimosso**: la sua ragion d'essere (non pagare la query per righe
  mai aperte) non si applica più su una pagina che è già, per costruzione, la scelta di guardare
  quell'account.

## Domande aperte

Nessuna: ogni scelta materiale per l'implementazione è decisa sopra.
