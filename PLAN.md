# Songbook — Piano di implementazione

> Il progetto si chiamava **songs** fino alla v2.4. Il repo, il dominio
> (`songs.sisqo.dev`) e la tabella `songs` nel database restano quello che sono — è un
> rebranding del nome mostrato, non un trasloco — quindi il resto di questo piano lo
> nomina ancora quando parla di quelle cose, di proposito.

> **Stato:** v1, **v1.1 — canzonieri**, **v1.2 — import e modifica** e **v1.3 — le
> modifiche si vedono subito** sono consegnate e in produzione su
> https://songs.sisqo.dev. La v1.2 ha cambiato chi possiede un brano: il database, non i
> file — va letta prima di toccare il seed. La v1.3 ha aggiunto lo strato che mostra la
> versione del database sopra la pagina statica: va letta prima di toccare la lettura. La
> v1.4 ha portato l'editor in una pagina sua, con la regola che nessuna modifica può
> riscrivere il file: va letta prima di toccare il modello a blocchi.

## Cosa è

Un'applicazione web privata per leggere testi e accordi del proprio repertorio, pensata
prima per tablet e telefono e poi per il computer. Il compito dell'app è una sola cosa
fatta bene: **tenere il testo leggibile e le mani libere mentre si suona**. Da qui
derivano zoom, auto-scroll, cambio di tonalità e cambio di notazione — non come
impostazioni in un menù, ma come controlli a portata di pollice.

Il materiale è organizzato in **canzonieri**: ogni brano appartiene a un canzoniere, come un
file a una cartella, e la prima schermata è l'elenco dei canzonieri.

Non è un archivio pubblico né un social di accordi: entra solo chi è in elenco — i
proprietari dall'ambiente, gli invitati da una tabella che si gestisce dall'app.

## Stato attuale

Il progetto è già in piedi e in produzione: Next.js 15.5.19 (App Router, `src/`),
TypeScript, Tailwind v3, repo `sisqo/songs`, deploy automatico su push a `main`,
dominio `songs.sisqo.dev`. Contiene una sola pagina hello world. Tutto ciò che segue si
costruisce da qui.

## Architettura

### Stack

| Livello | Scelta |
|---|---|
| Framework | Next.js 15 App Router, React 19, TypeScript |
| Stili | Tailwind v3 (v4 impossibile in locale, vedi *Vincoli d'ambiente*) |
| Database | Postgres su **Neon via Vercel Marketplace** |
| Accesso dati | **Drizzle ORM** + `postgres.js` (vedi *Scostamenti*) |
| Auth | **Auth.js v5** (`next-auth@5`), provider Google, sessioni JWT |
| PWA | **Serwist** (successore mantenuto di `next-pwa`) |
| Lingua UI | Italiano, testi in chiaro nel codice — nessun framework i18n |

### Flusso dei dati

Il punto chiave è che **il DB non sta davanti alla lettura**: la pagina si legge subito, e la
domanda al database viene dopo — se ha una risposta più recente, la si mette sopra.

```
build      Neon ──SELECT──▶ generateStaticParams ──▶ /canzoni/[slug] statiche
                        └──▶ /api index di ricerca (JSON statico)
runtime    lettura  ──▶ pagina statica (o cache del service worker)
                     └──▶ server action ──▶ Neon  (la versione corrente, dopo il paint)
           scrittura ──▶ server action ──▶ Neon   (preferenze, canzonieri, brani)
```

Le pagine dei brani sono generate al build leggendo Neon, quindi a runtime la lettura non
paga né latenza di database né cold start: quello che si legge è sullo schermo prima che
qualsiasi richiesta parta. La domanda «questa canzone è cambiata?» viene fatta dopo, e la
risposta conta solo se è più recente della pagina — vedi *Pubblicazione*.

Sono le scritture, non le letture, a pagare l'autosuspend di Neon: il primo `+1` dopo un
periodo di inattività attende il risveglio del database. La coda di scrittura rende
l'attesa invisibile sullo schermo, ma esiste.

Dopo una modifica ai contenuti serve una rivalidazione: la fa il deploy, e dalla v1.3 anche
`revalidatePath()` al salvataggio — che però non basta da solo, perché non passa davanti al
service worker.

**Conseguenza da gestire:** le pagine statiche sono identiche per tutti, quindi non possono
contenere le preferenze dell'utente. La pagina viene servita nella tonalità originale e le
preferenze si applicano lato client. Per evitare un lampo di accordi nella tonalità
sbagliata, gli accordi vivono nel markup come dati strutturati e la trasposizione si applica
in un `useLayoutEffect` prima del paint.

### Modello dati

```sql
canzonieri(slug primary key, name, created_at, updated_at)

sections(id serial primary key,                                      -- v2.3
         canzoniere_slug not null references canzonieri(slug) on delete restrict,
         name, position, created_at,
         unique (canzoniere_slug, name),   -- l'import indirizza per nome
         unique (id, canzoniere_slug))     -- solo per essere referenziata, sotto

songs(slug primary key, title, artist, body, tags[],
      canzoniere_slug not null references canzonieri(slug) on delete restrict,
      section_id,                                                    -- v2.3, nullable per un deploy
      position,                                                      -- v1.6, nullable
      created_at, updated_at,
      foreign key (section_id, canzoniere_slug)                      -- v2.3
        references sections(id, canzoniere_slug)
        on delete restrict on update cascade)
      -- original_key rimossa in v2.0: la tonalità si stima dagli accordi

members(email primary key, added_by, created_at,
        role)                                                        -- v2.1: admin|editor|viewer
      -- solo gli invitati; i proprietari restano in ALLOWED_EMAILS e sono admin per definizione

credentials(email primary key, password_hash, updated_at)            -- v2.2
      -- come si dimostra un indirizzo, non se è ammesso: tabella a parte perché
      -- un proprietario non ha riga in members e deve poter avere una password

user_prefs(user_email primary key, zoom_step, notation)              -- globali
user_song_prefs(user_email, song_slug, semitones, scroll_speed,      -- per brano
                capo,                                                -- v1.8
                updated_at, primary key (user_email, song_slug))

builds(id primary key default 'last', built_at)                      -- v1.2
```

La riga singola in `builds` viene timbrata dal build. Serve a sapere quali brani
sono ancora *in attesa di pubblicazione*: sono quelli con `updated_at` più recente
dell'ultimo build. È l'unico modo onesto di rispondere, perché riflette ciò che il
build ha effettivamente visto invece di ciò che l'app crede di aver pubblicato.

`user_email` come chiave: con sessioni JWT non serve una tabella di utenti per
l'autenticazione. `members` (v2.0) non è quella tabella — dice chi è ammesso, non chi è
autenticato, e i proprietari non ci compaiono.
Lo `slug` come chiave naturale al posto di un id surrogato: vedi *Scostamenti*.

**Lo slug di un canzoniere è immutabile.** Si genera una volta dal nome iniziale e non
cambia mai più: rinominare tocca solo `name`. È questo che rende una rinomina gratuita —
nessuna chiave esterna da aggiornare, nessuna URL che si sposta, nessuna voce di precache
da rigenerare.

L'`on delete restrict` è la regola "rifiuta se non è vuoto" scritta nel database, non solo
nella UI: nessun percorso, nemmeno un errore di programmazione, può cancellare un
canzoniere lasciando brani orfani.

**La chiave esterna composta è ciò che rende impossibile un brano in una sezione di un
altro canzoniere.** Il canzoniere di un brano è scritto due volte — sul brano e sulla sua
sezione — e invece di affidare la coerenza al codice la tiene il database. `on update
cascade` non è decorazione: è l'unica cosa che permette a una sezione di traslocare in un
altro canzoniere, misurato su uno schema di prova (senza, l'update è rifiutato in
*entrambi* gli ordini, perché il vincolo si controlla per statement e non per transazione).
`on delete` resta `restrict`: una sezione che contiene brani non si cancella.

**`songs.position` è nullable e resta null** finché qualcuno non riordina quella sezione o
non ci importa dentro. Dalla v2.3 conta **dentro una sezione**, non dentro il canzoniere. Non è un dettaglio implementativo: `null` significa «nessuno ha detto»,
e Postgres lo mette in fondo a un ordinamento crescente, quindi l'ordine alfabetico è il
comportamento di default senza una riga di codice che lo produca — verificato interrogando
Postgres, non la tabella. Un riordino, e ogni import, rinumerano l'intero canzoniere da 1 a N.

### Contenuti e seed

Sorgente di verità in v1: file nel repo, caricati da uno script.

```
content/
  certe-notti.chopro
  bocca-di-rosa.chopro
scripts/seed.ts             # npm run seed → upsert per slug
```

Lo script è idempotente (upsert per `slug`), così rilanciarlo dopo una correzione non
duplica nulla.

**Con la v1.2 questo regime cambia:** il database diventa il padrone dei brani e il seed
diventa di solo inserimento. Vedi *Import e modifica*.

**Il canzoniere è l'eccezione a questa regola, e va capita bene.** La direttiva
`{canzoniere: Repertorio}` in un `.chopro` dice dove il brano *nasce*, e il seed la applica
soltanto all'inserimento — o quando la colonna è ancora vuota, che è come i brani già
esistenti ricevono il loro canzoniere senza uno script separato. In aggiornamento la
direttiva viene **ignorata**: da quel momento comanda il database, altrimenti il primo
`npm run seed` cancellerebbe ogni rinomina e ogni spostamento fatto dall'app.

Ne segue una seconda eccezione: il seed **non fa pruning dei canzonieri**. Sono creati
dall'app, quindi esistono legittimamente righe che nessun file ha mai dichiarato. Dalla
v2.0 la regola "cancella ciò che non ha un file" non vale più per nessuno: era rimasta
solo per le scalette, e le scalette non ci sono più.

Un file senza la direttiva finisce in **Da ordinare**, un canzoniere creato al bisogno.
Serve perché ogni brano deve appartenere a uno, e il nome è deliberatamente un promemoria:
ciò che non è archiviato si vede a colpo d'occhio.

### Autenticazione

- Auth.js v5, sessioni JWT (nessun adapter, nessuna tabella di utenti per l'autenticazione).
- Due provider: **Google** e **credenziali** (email e password, v2.2). Il secondo dimostra
  *quale indirizzo* sei e non concede niente: `roleOf` decide come sempre, e non sa che la
  tabella delle password esista.
- Il callback `signIn` confronta l'email con l'unione di `ALLOWED_EMAILS` (i proprietari,
  dall'ambiente) e della tabella `members` (gli invitati, gestiti da `/utenti` — v2.0);
  qualunque altro account Google valido viene respinto con una pagina dedicata.
- **Ruoli** (v2.1): admin, editor, viewer. Una funzione sola, `roleOf`, risponde sia al
  login sia alle guardie davanti a ogni scrittura, e i proprietari sono admin per
  definizione. Il ruolo **non** entra nel token: una sessione dura novanta giorni e si
  porterebbe dietro i poteri di ieri, mentre così un cambio vale dall'azione successiva.
- `maxAge` sessione **90 giorni**: una sessione scaduta senza rete significherebbe restare
  chiusi fuori dal repertorio nel momento peggiore.
- Middleware a protezione di tutto tranne `/login`, gli asset statici e il manifest.
- **Da sapere:** con service worker cache-first, i brani già in cache restano leggibili sul
  dispositivo anche a sessione scaduta e senza rete. È il comportamento desiderato per
  l'uso dal vivo, ma va detto: la protezione è sull'accesso alla rete, non sul dispositivo.

### Offline e PWA

- Serwist con precache degli asset e delle pagine dei brani generate al build:
  installata sulla home del tablet, l'app apre istantaneamente e a rete assente.
- **Il punto più fragile di tutto il piano, da verificare prima di dichiarare l'offline
  funzionante.** Il precache del service worker fa richieste HTTP vere, che passano dal
  middleware di autenticazione: se il service worker si installa senza una sessione valida,
  quelle richieste vengono reindirizzate a `/login` e finiscono in cache **sotto gli URL dei
  brani**. Il risultato è la modalità di errore peggiore possibile, perché la cache sembra
  piena: offline ogni brano mostra una schermata di login. Va garantito che il precache parta
  solo dopo l'autenticazione, e va verificato che una pagina precachata renda offline con il
  cookie di sessione assente. Da controllare anche che venga messo in cache il payload RSC
  insieme all'HTML: con App Router è la parte che si rompe più facilmente.
- `manifest.json`, icone, `display: standalone`, tema coerente con la UI.
- Le preferenze scritte offline finiscono in una **coda in memoria** svuotata all'evento
  `online`; un indicatore discreto mostra che c'è una modifica non ancora salvata.
  Il DB resta l'unica fonte di verità: nessun mirror locale, nessuna logica di merge. Il
  limite accettato: un reload mentre si è ancora offline perde la modifica in coda.

## Formato dei contenuti

ChordPro, con accordi inline tra parentesi quadre. Direttive supportate in v1:

```
{title: Certe notti}
{artist: Ligabue}
{tags: lento, acustico}
{canzoniere: Repertorio}     ← solo il valore iniziale, vedi Contenuti e seed
{start_of_chorus} … {end_of_chorus}
{comment: assolo}

[Am]Certe [F]notti la [C]macchina sembra una [G]donna
```

Tutto il resto dello standard viene ignorato senza errori. Il parser produce un AST
(sezioni → righe → coppie accordo/testo) riusato da rendering, trasposizione e indice di
ricerca.

**Normalizzazione dei suffissi.** Il parser riduce le grafie equivalenti a una forma
canonica interna prima di qualunque altra cosa: `m` / `min` / `-` → `m`, `maj` / `ma` / `△`
→ `maj`, `dim` / `°` → `dim`, `aug` / `+` → `aug`. Entrambe le tabelle di notazione
formattano **a partire da quella forma canonica**, mai dal testo grezzo del file. Senza
questo passaggio l'affermazione "in internazionale il display coincide col sorgente" vale
solo per i file scritti in modo coerente: un `Cmin7` scritto a mano finirebbe a schermo
così com'è e non verrebbe mappato in `Do-7`.

## Motore musicale

### Trasposizione

Ogni accordo viene scomposto in `{ fondamentale, suffisso, basso }`. La fondamentale
diventa una classe di altezza 0–11, la trasposizione è `(pc + n) mod 12`, e anche il basso
degli accordi con slash viene trasposto.

Due regole distinte, non una:

1. **Senza trasposizione la grafia della sorgente si conserva.** Un `Bb` in un brano in Do
   resta `Bb`: riscriverlo `La#` perché "Do usa i diesis" sarebbe sbagliato, dato che un
   accordo prestato in bemolle si scrive sempre in bemolle. Questo caso è emerso da un test
   in implementazione, non era previsto nella prima stesura del piano.
2. **Trasponendo decide la tonalità d'arrivo**, secondo il circolo delle quinte: tonalità con
   diesis usano i diesis, con bemolli i bemolli. Alzando quel brano di dieci semitoni si
   arriva in Sib, dove si legge `Ab` e mai `Sol#`.

La tonalità d'arrivo si calcola dalla tonalità di partenza più i semitoni (e meno il
capotasto, dalla v1.8). Fino alla v2.0 la partenza era la colonna `original_key`; ora si
**stima dagli accordi del brano**, che è la stessa risposta senza il campo — vedi *v2.0*.

Il capotasto non è in v1 (vedi *Domande aperte*).

### Notazione

Il toggle IT/INT cambia **due** cose insieme: alfabeto delle note e stile delle sigle. Due
tabelle separate, ognuna coerente con le convenzioni del proprio sistema.

| Sorgente | Internazionale | Italiano |
|---|---|---|
| `C` | Do → `C` | `Do` |
| `Cm` | `Cm` | `Do-` |
| `Cm7` | `Cm7` | `Do-7` |
| `Cmaj7` | `Cmaj7` | `Do△7` |
| `Cdim` | `Cdim` | `Do°` |
| `Caug` | `Caug` | `Do+` |
| `Cm7b5` | `Cm7b5` | `Do-7b5` |
| `Csus4` | `Csus4` | `Dosus4` |
| `Bb` | `Bb` | `Sib` |
| `C/E` | `C/E` | `Do/Mi` |

Note italiane: Do, Do#, Re, Re#/Mib, Mi, Fa, Fa#, Sol, Sol#/Lab, La, La#/Sib, Si.
In internazionale il display coincide col sorgente ChordPro; in italiano no, ed è
intenzionale.

**Rischio da verificare presto:** i glifi `△` e `°` devono esistere nel font scelto e avere
una larghezza che non rompa l'allineamento sopra il testo. Se il font non li porta, si
ripiega su `maj7` e `dim` in italiano.

## Interfaccia di lettura

### Rendering accordi sopra il testo

Ogni coppia accordo/sillaba è un `inline-block` che contiene l'accordo in un blocco sopra il
testo. Le righe vanno a capo **fra** le unità e mai dentro, così l'allineamento non si perde
mai su schermo stretto — che è il punto debole classico di questo layout su telefono.

```
┌ unità ┐┌ unità ┐┌ unità ─┐
  Am        F        C
  Certe     notti la macchina
```

### Barra dei controlli

Barra inferiore fissa e compatta (~56px), sempre visibile, a portata di pollice:

```
│  Do-      Fa       Sol       │
│  Certe notti la macchina     │
├──────────────────────────────┤
│ ▶ −●●●○○+  A− A+  −1 Re +1 ⋯ │
└──────────────────────────────┘
```

Play/pause, velocità e semitoni sono raggiungibili con un tap solo: dal vivo fermare lo
scroll o alzare di un semitono non può costare la ricerca di un menù. Notazione e altre voci
stanno nel `⋯`. L'header mostra di quanti semitoni si è mossi, con un tap per tornare al
punto di partenza: il nome della tonalità è su ogni accordo dello spartito, mentre la
distanza da casa non sarebbe scritta da nessuna parte. (Nel disegno originale mostrava la
tonalità corrente accanto all'originale; dalla v2.0 nessun nome di tonalità compare
nell'interfaccia.)

### Zoom

Stepper `A− / A+` su 6 passi (≈14px → 30px) applicati con una custom property CSS sul
contenitore di lettura: accordi e testo scalano insieme e il testo **rifluisce**, senza
scroll orizzontale. Il pinch-zoom nativo del browser non viene disabilitato (nessun
`user-scalable=no`): è una via d'uscita di accessibilità che non va tolta.

### Auto-scroll

- Loop `requestAnimationFrame` con accumulo frazionario di pixel, per un movimento fluido
  invece che a scatti.
- Velocità su 8 passi discreti, regolabile mentre scorre; l'ultima usata per quel brano
  viene ricordata.
- Un gesto di scroll manuale mette in pausa (si riprende dal pulsante), così una correzione
  al volo non combatte con l'animazione.
- **Wake Lock API** (`navigator.wakeLock`) attivo durante lo scroll, rilasciato in pausa e
  al cambio di visibilità: senza questo la funzione è inutilizzabile, perché lo schermo si
  spegne a metà brano. Dove l'API non c'è, si degrada silenziosamente.
- Rispetta `prefers-reduced-motion` per ogni altra animazione dell'app, non per lo scroll
  stesso (è la funzione richiesta, non decorazione).

## Navigazione e ricerca

- **Home**: l'elenco dei canzonieri, uno per riga col numero di brani, e la ricerca sopra.
  Nessun brano finché non si cerca: la prima domanda è quale canzoniere.
- **Pagina del canzoniere** (`/canzonieri/<slug>`, v2.0): i suoi brani nell'ordine in cui si
  suonano, e da qui si riordinano.
- **Ricerca istantanea** lato client su titolo, artista, tag e testo (accordi esclusi),
  contro un indice generato al build. Nessuna chiamata di rete mentre si scrive. Vive in
  home e lavora su **tutti** i brani, perché una ricerca non appartiene a un canzoniere;
  ogni risultato dice dove abita.

## Canzonieri

Un canzoniere è una **libreria**: ogni brano appartiene a uno e uno solo, come un file in
una cartella. È un concetto diverso dai tag, che restano descrizioni libere e
sovrapponibili (`lento`, `acustico`).

Si possono **creare, rinominare, spostare brani fra l'uno e l'altro e rimuovere**, e tutto
questo dall'app, non dai file.

### Le sezioni (v2.3)

Un canzoniere è diviso in sezioni e ogni brano sta in una e una sola. Una sezione è un
**oggetto del canzoniere** — nome, ordine proprio, può restare vuota — e non un'etichetta
scritta sul brano: un'etichetta non ha ordine (e «Prima parte»/«Seconda parte» non sono in
ordine alfabetico), non può esistere prima dei brani che la riempiranno, e un refuso ne
creerebbe una gemella.

Identificata da un numero e non da uno slug, perché non ha una pagina: nessuno la indirizza
per nome, quindi rinominarla è gratis. Il nome è però unico dentro il canzoniere, ed è
quello che permette all'import di crearne una per nome senza gemelle e al seed di far
combaciare i file con il database.

Nella pagina del canzoniere partono **chiuse**, con due eccezioni che cedono a qualunque
scelta di chi legge: una sola sezione si apre da sé, e tornando da un brano si apre la sua.
La piega sta in `localStorage`, per canzoniere: è un gesto della mano, non una preferenza
da ritrovare altrove, e deve funzionare senza rete.

### Il canzoniere ha una rotta propria (v2.0)

Per due versioni non l'ha avuta, e le ragioni erano queste:

- un canzoniere **creato dall'app** non esisterebbe fra le rotte generate al build, quindi
  non sarebbe precachato e offline non esisterebbe fino al deploy successivo;
- una **rinomina** sposterebbe la rotta, se lo slug seguisse il nome — e se non lo segue, la
  URL resta legata a un nome vecchio, che è peggio.

La seconda si è rivelata **falsa nel nostro schema**: lo slug si genera una volta dal nome
iniziale e non cambia più, quindi una rinomina tocca `name` e nient'altro. La prima è vera,
ed è lo stesso patto che ogni brano importato accetta da sempre: visibile subito, offline
alla pubblicazione successiva.

Dall'altra parte della bilancia c'era il costo di non averla: aprire un canzoniere doveva
succedere **dentro la home**, come una piega, perché non c'era altro posto dove potesse
succedere. Con la rotta, la home è l'elenco dei canzonieri, `/canzonieri/<slug>` è il
canzoniere, e la pagina di un brano ha una via di ritorno che vuol dire qualcosa.

Storicamente la vista era la lista filtrata su `/?c=repertorio`, poi la card che si apriva.
Non c'è più nulla che produca quel parametro, ma `c` resta in
`ignoreURLParametersMatching` di Serwist perché un vecchio segnalibro continui a trovare la
home in cache anche offline.

Resta **`/canzonieri`** come schermata di gestione: creare, rinominare, rimuovere. Leggere e
gestire sono due gesti diversi, e solo il primo sta sulla strada di chi suona.

### Guscio statico, dato mutabile

Le pagine restano statiche e precachate. Nomi dei canzonieri e assegnazione dei brani sono
invece dati che cambiano a runtime, quindi vivono in uno strato separato che l'app legge
dopo il mount e conserva in cache locale — lo stesso meccanismo già usato per le
preferenze, non uno nuovo:

```
statico (build)   brani, titoli, testi, accordi, indice di ricerca
runtime (server)  { canzonieri: [{slug, name, count}],
                    assegnazioni: { songSlug → canzoniereSlug } }
                  ↓ cache locale
```

Una rinomina si vede subito; offline si vede l'ultimo stato conosciuto. Il payload è
minuscolo, dell'ordine di poche centinaia di byte per canzoniere.

`revalidatePath()` sarebbe la risposta standard di Next e **da sola qui non basterebbe**: il
service worker serve quelle pagine cache-first, quindi una rigenerazione lato server
resterebbe invisibile al dispositivo che ha installato l'app fino al build successivo. Viene
comunque chiamata dopo ogni scrittura, ma per l'altro tipo di visita — un browser senza
service worker — che altrimenti riceverebbe la pagina vecchia dalla cache del server.

### Gestione

`/canzonieri` elenca i canzonieri con il conteggio dei brani e permette di crearne,
rinominarne e rimuoverne. Lo spostamento di un singolo brano si fa dall'editor del brano, e
uno nuovo si crea anche in `/importa`, dove serve. **L'ordine dei brani dentro un canzoniere**
si sistema invece dove i brani si vedono: nella card aperta in home, con *Riordina* (v1.6).

La rimozione **rifiuta** un canzoniere non vuoto e propone prima dove spostare i brani:

```
[ Rimuovi "Da imparare" ]
→ contiene 2 brani
  Sposta in: [ Repertorio ▾ ]
  [ Sposta e rimuovi ]   [ Annulla ]
```

Ne segue che l'ultimo canzoniere non è rimovibile finché esistono brani, che è corretto dato
il vincolo di appartenenza. L'ordinamento è alfabetico.

Le scritture passano da server action che richiedono una sessione autorizzata, come le
preferenze. A differenza delle preferenze, però, **non c'è coda offline**: senza rete i
pulsanti di gestione si disabilitano con una spiegazione. La ragione è che i canzonieri sono
una struttura condivisa fra gli account in allowlist, dove un last-write-wins fra dispositivi
non è innocuo come su una trasposizione personale — e rinominare un canzoniere non è
qualcosa che si fa sul palco senza segnale.

### Stato iniziale

I canzonieri di partenza si ricavano dai tag già usati, che contenevano di fatto questa
categorizzazione. Le direttive vengono scritte nei quattro file, così un database ricreato da
zero riproduce lo stesso risultato senza script una tantum:

| Brano | Canzoniere | Tag residui |
|---|---|---|
| `ferma-il-tram` | Repertorio | `veloce` |
| `le-luci-di-via-ostiense` | Repertorio | `lento` |
| `novembre-in-cortile` | Da imparare | `lento` |
| `quasi-domenica` | Da imparare | — |

I tag `repertorio` e `da imparare` vengono rimossi: ora sono canzonieri, e tenerli in
entrambi i posti creerebbe due verità sulla stessa cosa. `lento` e `veloce` restano tag,
che è il loro ruolo giusto.

## Import e modifica

Una sezione per far entrare brani nuovi incollando testo, più la possibilità di correggerli
e rimuoverli. È il passo che sostituisce l'editor `/admin` immaginato per la v2, ristretto a
ciò che serve davvero.

### Cambio di regime: il database diventa il padrone

Fino alla v1.1 i file in `content/` erano la sorgente di verità dei brani e il seed li
imponeva al database. Dalla v1.2 non è più così: un brano importato nasce nel database e non
ha alcun file. Tre conseguenze, tutte obbligate:

1. **Il seed non può più fare pruning dei brani.** Cancellava le righe senza file: quelle
   sono ora esattamente i brani importati.
2. **Il seed non può più aggiornare i brani.** Sovrascriverebbe con la versione del file una
   correzione fatta dall'app.
3. **La cancellazione deve esistere nell'app.** Senza un file da eliminare, un brano
   importato per errore non avrebbe altrimenti nessun modo di andarsene.

Il seed diventa dunque di **solo inserimento** (`on conflict do nothing`): carica ciò che
manca e non tocca ciò che c'è. Perde il ruolo di padrone e ne acquista uno nuovo — è la via
di ripristino dell'export (vedi sotto).

### Cosa si incolla

Prima **dove**, poi **cosa**: il canzoniere di destinazione è il primo campo della
schermata, vale per tutto ciò che si incolla, e vince su un `{canzoniere: …}` nel testo. Poi
un solo campo di testo, e il formato viene riconosciuto:

- se il testo contiene accordi fra parentesi quadre è già ChordPro e passa così com'è;
- altrimenti si tenta la conversione da **accordi sopra il testo**, che è la forma in cui gli
  accordi si trovano quasi sempre in giro.

```
INCOLLATO                    CONVERTITO
Am        F                  [Am]Certe [F]notti la
Certe notti la               [C]macchina...
```

La conversione riconosce una riga di accordi quando **tutti** i suoi token si leggono come
accordi, riusando `parseChord` — che già rifiuta le parole normali e le annotazioni, quindi
una riga come `Ritornello` o `x2` non viene confusa. Gli accordi si abbinano poi alla riga
di testo successiva per posizione di colonna.

È un'euristica e sbaglierà su qualche sorgente. Per questo il salvataggio avviene **dopo una
preview** dello spartito reso, e il corpo ChordPro resta modificabile a mano nello stesso
form: la via d'uscita è sempre visibile.

### Più brani in una pasta

Lo stesso campo accetta **più brani**, divisi solo su segni espliciti: una riga di `---`
(o `===`, `***`, `___`), il `{ns}`/`{new_song}` di ChordPro, un secondo `{title:}`, un salto
pagina. Una riga vuota non divide niente — fra le strofe ce ne sono a decine. Senza segni è
un brano solo.

Trovati più brani, al posto del form arriva una riga per brano: titolo e artista
modificabili e formato in chiaro, il testo dentro un `details`. Si scrive solo
premendo *Importa*, in sequenza, e ogni riga dice come è finita — salvato, già in archivio,
oppure l'errore. Ripremere riprova solo ciò che manca.

```
3 brani in questo testo                      incolla altro
┌───────────────────────────────────────────────────────┐
│ ① [ Certe notti        ] [ Ligabue      ]           × │
│   accordi sopra il testo, convertiti                  │
│   ▸ Testo e accordi                                   │
├───────────────────────────────────────────────────────┤
│ ② [ Albachiara         ] [ Vasco Rossi  ]  ✓ salvato  │
└───────────────────────────────────────────────────────┘
Se un brano è già in archivio [ salta quelli già presenti ▾ ]
[ Importa 3 brani ]
```

### Il form

Per un brano solo. Titolo e artista si deducono dalle direttive se ci sono, altrimenti dalle
prime righe. La tonalità **non è fra i campi** dalla v2.0: si stima dagli accordi ogni volta
che serve, e serve solo per la grafia enarmonica. Il canzoniere non è fra i campi: l'ha già chiesto la schermata, sopra. Lo slug si genera dal titolo con
`uniqueSlug`, lo stesso già usato per i canzonieri.

```
Titolo   [ Certe notti          ]
Artista  [ Ligabue              ]
┌─ corpo ChordPro ─┬─ preview ────┐
│ [Am]Certe notti  │  Do      Fa  │
│ ...              │  Certe notti │
└──────────────────┴──────────────┘
```

### Duplicati

Se titolo e artista coincidono con un brano esistente, l'import lo dice prima di salvare e
offre tre strade: **sostituire** il corpo di quello esistente, **aggiungere comunque** come
brano separato con slug numerato, o annullare. Sostituire è spesso l'intento reale — hai
trovato una versione migliore — e conserva lo slug, quindi le preferenze salvate di quel
brano sopravvivono.

### Pubblicazione

**v1.3.** Il modello «si vede dopo il build» era sbagliato, e sbagliato in un modo che
sembrava una perdita di dati: correggevi un verso, salvavi, lo spartito non cambiava, e
riaprendo la modifica ritrovavi le parole vecchie — perché il form era riempito dalla pagina,
non dal database. La modifica era salva, ma nessuna schermata lo mostrava.

Quindi le pagine restano statiche e precachate, ma sopra ci va uno strato di runtime, lo
stesso già usato per preferenze e canzonieri:

```
statico (build)   brani, titoli, testi, accordi, indice di ricerca
runtime (server)  la canzone aperta, per intero
                  l'elenco senza i corpi
                  ↓ cache locale (solo le canzoni, non l'elenco)
```

La regola che tiene insieme il tutto è **una sola**: si confrontano le versioni,
`songs.updated_at` del database contro quello con cui la pagina è stata generata. Niente
timbri, niente orologi del browser. Il timbro in `builds` viene scritto *prima* del build,
quindi qualsiasi cosa derivata da lui è falsa per tutta la durata di un deploy; e una data
generata nel browser sarebbe una supposizione su un valore che appartiene al database — e
vincerebbe per sempre, dato che viene messa in cache. Per questo un salvataggio restituisce
la riga scritta, non l'input che gli era stato passato.

Ne segue il comportamento giusto senza casi speciali: la copia fresca resta al suo posto per
tutta la durata del build che la sta incorporando, e si fa da parte da sola quando arriva la
pagina che la contiene.

La pubblicazione resta, con un compito più stretto: **rendere le modifiche disponibili
offline**, incorporandole nelle pagine e nel precache. Un solo deploy per cinque import,
come prima.

Lo stato «in attesa» non è una colonna: è il confronto fra `songs.updated_at` e il timbro in
`builds`. Ne segue che un deploy fatto per altri motivi, per esempio un push di codice,
pubblica anche i brani in attesa. E ne segue anche cosa può dire il pulsante: dopo aver
chiamato il hook, la schermata **aspetta** che la lista si svuoti, che è il momento in cui il
build che sta girando ha timbrato il database e quindi contiene quei brani. Non dice «è
online», perché saperlo richiederebbe l'API di Vercel. Prima non aspettava affatto, e la
lista restava lì immobile: il secondo sintomo del bug.

Cosa resta fuori dallo strato, dalla v2.0: solo **le frecce** nell'header di un brano.
Portano ad altre pagine statiche, generate con la stessa lista di questa, e leggere qui
l'assegnazione viva le farebbe puntare a brani le cui pagine credono ancora di stare
altrove. Le righe della pagina di un canzoniere, invece, sono aggiornate come l'elenco in
home: sono una lista di titoli, e un titolo vecchio in una lista è esattamente il bug che
questo strato esiste per evitare.

L'elenco in home non viene messo in cache. Una riga lì è la promessa che toccandola si apre
qualcosa, e un brano importato dopo l'ultimo build non ha una pagina nel precache da aprire
(online sì: la rotta non è fra quelle generate e Next la genera su richiesta). Quando il
server non risponde, l'elenco resta quello del build, dove ogni riga porta da qualche parte.

### Export e ripristino

I file non sono più la rete di sicurezza, quindi ne serve un'altra: un pulsante **Scarica
tutto** produce un archivio dei `.chopro`, direttive `{canzoniere:}` comprese, da conservare
dove si vuole. Nessun token e nessuna infrastruttura; la copia dipende da chi se ne ricorda,
ed è un compromesso accettato consapevolmente.

Il ripristino è il seed di solo inserimento: si rimettono i file in `content/`, si lancia
`npm run seed`, e torna tutto ciò che manca senza toccare ciò che c'è.

### Ciò che può risorgere

Un effetto da conoscere, non un difetto da correggere: se cancelli un brano dall'app e il suo
file è ancora in `content/`, il prossimo `npm run seed` lo **reinserisce**. È il comportamento
giusto per un comando che significa «carica ciò che manca», ma va saputo. In pratica: quando
entrerà il repertorio vero, i quattro file segnaposto vanno rimossi dal repo, altrimenti
resteranno a risorgere a ogni ripristino.

### Accesso

Le scritture passano da server action con sessione autorizzata, come per i canzonieri. Senza
rete la sezione è disabilitata: salvare richiede il database e pubblicare richiede un deploy,
quindi non c'è nulla che possa funzionare offline e nulla da mettere in coda.

## Preferenze

| Preferenza | Granularità | Dove |
|---|---|---|
| Trasposizione (semitoni) | per brano | `user_song_prefs` |
| Velocità auto-scroll | per brano | `user_song_prefs` |
| Zoom | globale | `user_prefs` |
| Notazione IT/INT | globale | `user_prefs` |

Tutte sul DB, sincronizzate fra telefono, tablet e computer, con la coda offline descritta
sopra. Scritture debounced (2s) via server action per non generare una query a ogni tap.

## Fasi

### v1 — lettura

1. Neon + Drizzle + schema e migrazioni
2. Auth.js Google + allowlist + middleware + pagina di login
3. Parser ChordPro → AST, con test sulle grafie enarmoniche e sui suffissi
4. `scripts/seed.ts` + primi brani reali in `content/`
5. Pagine statiche: lista, brano, scaletta
6. Rendering accordi sopra il testo, con wrapping corretto
7. Barra controlli: zoom, trasposizione, notazione
8. Auto-scroll + wake lock
9. Preferenze su DB + coda offline
10. Ricerca client-side
11. PWA: manifest, icone, Serwist, precache
12. `PRODUCT.md` e `DESIGN.md` secondo la convenzione dei progetti fratelli

Consegnata e in produzione.

### v1.1 — canzonieri

Consegnata. La prima scrittura dall'app, deliberatamente su una superficie minima: nomi e
appartenenza, non i brani.

1. Migrazione: tabella `canzonieri`, colonna `songs.canzoniere_slug` con
   `on delete restrict`. La colonna nasce nullable, così il backfill è il seed stesso; una
   migrazione successiva la stringe a `not null` quando è tutto popolato
2. Direttiva `{canzoniere: …}` nel parser, con test
3. Seed: applica la direttiva su insert **o quando la colonna è vuota**, la ignora in
   aggiornamento, crea i canzonieri mancanti, **non fa pruning** dei canzonieri
4. Direttive nei quattro file esistenti e rimozione dei tag ora promossi a canzoniere
5. Strato mutabile: server action di lettura + cache locale, sul modello delle preferenze
6. Filtro a chip nella lista, con `?c=` e `c` in `ignoreURLParametersMatching`
7. `/canzonieri`: crea, rinomina, rimuovi con spostamento obbligato se non vuoto
8. Selettore di canzoniere nella testata del brano
9. Disabilitazione dei controlli di gestione quando offline

La garanzia centrale è verificata end to end e non assunta: una rinomina e uno spostamento
applicati al database sono sopravvissuti a un `npm run seed` che rileggeva file che ancora
nominavano il vecchio canzoniere.

### v1.2 — import e modifica

Consegnata. Il cambio di regime: il database diventa il padrone dei brani.

1. Tabella `builds` e timbro scritto dal build, per sapere cosa è in attesa
2. Seed a solo inserimento: nessun pruning, nessun aggiornamento dei brani
3. Convertitore «accordi sopra il testo» → ChordPro, con test sui casi che sbagliano
4. Riconoscimento del formato incollato e stima della tonalità dagli accordi
5. `/importa`: campo di testo, form dedotto, preview dello spartito, salvataggio
6. Rilevamento duplicati con sostituisci / aggiungi comunque / annulla
7. Modifica e cancellazione di un brano esistente, dallo stesso form
8. Elenco «in attesa» e azione Pubblica via deploy hook
9. Export «Scarica tutto» e ripristino documentato tramite seed
10. Rimozione dei quattro file segnaposto quando entra il repertorio vero *(in attesa
    del repertorio: i segnaposto sono ancora l'unico contenuto)*

Verificato end to end e non assunto: una correzione applicata al database e un brano
esistente solo lì sono sopravvissuti a `npm run seed`; l'elenco «in attesa» è vuoto
subito dopo un build e nomina esattamente il brano toccato dopo.

### v1.3 — le modifiche si vedono subito

Consegnata, in risposta a un bug: salvare non cambiava niente sullo schermo e riaprire la
modifica mostrava le parole vecchie, mentre il pulsante Pubblica lasciava la lista immobile.

1. `songs.updated_at` esposto nel dominio: è la versione con cui la pagina è stata generata
2. `saveSong` restituisce la riga scritta — canzoniere risolto e data del database compresi
3. Regola di sovrapposizione pura e testata: vince solo ciò che è più recente della pagina
4. Provider della canzone letta: pagina → cache locale → database, e il salvataggio applicato
   subito
5. Elenco sovrapposto a runtime: brano nuovo, brano rinominato, brano cancellato
6. `revalidatePath()` dopo ogni scrittura, per chi non ha il service worker
7. Pubblica attende che il build prenda in carico i brani, e dice solo quello che sa

Verificato su un build di produzione con il service worker installato, non in sviluppo: la
pagina in precache è ancora quella vecchia — controllato leggendo la Cache API — e sullo
schermo c'è la correzione. Poi ricarica, riapertura del form, elenco, cancellazione. La
prova che serviva era proprio questa: battere il precache, non evitarlo per caso.

### v1.4 — editor e icone

Consegnata.

L'editor esce dalla pagina del brano e diventa una pagina sua, `/canzoni/<slug>/modifica`,
con tre modalità sopra un'unica sorgente: **Grafico**, **Sorgente**, **Anteprima**.

1. Modello a blocchi, uno per riga del file, con `toSource(fromSource(x)) === x`
2. Operazioni pure e testate: testo, accordi, taglia e unisci riga, commento, sezioni
3. Grafico: le parole sono `input` veri, gli accordi appesi a una copia nascosta delle parole
4. Sorgente: il ChordPro, con gli stessi comandi
5. Anteprima: lo spartito e la barra dei controlli veri
6. Rotta dinamica, esclusa dal precache anche a runtime
7. Accordi: si mettono toccando la riga sopra la sillaba, si spostano con due frecce
8. Annulla, con la scrittura raggruppata in un passo per raffica
9. Guardia sull'uscita con modifiche non salvate, header e menù compresi
10. Set di icone generato da uno script, con favicon vero al posto di quello di Next

**La copia nascosta.** Gli accordi devono stare sopra la sillaba giusta, ma le parole sono
dentro un `input`, e dentro un input non ci sono nodi di testo su cui appendere qualcosa. La
soluzione non misura niente: sotto la riga di accordi c'è una copia invisibile delle stesse
parole, nello stesso font, e ogni accordo è appeso a un'ancora di larghezza zero fra le sue
lettere. È il browser a fare la misura, quindi non si sposta nulla quando il font finisce di
caricare o cambia il tema. Verificato con un righello indipendente — un canvas col font
dell'input — su ogni accordo: **scarto 0,0 px**.

**Il round trip è la rete di sicurezza.** Il parser del lettore butta via quello che non gli
serve: `{new_song}` — che sta in due dei tre brani veri — sparirebbe al primo salvataggio.
Quindi il modello dell'editor tiene ogni riga, comprese quelle che il lettore ignora, gli
spazi in coda (diciannove righe ne hanno) e le interruzioni di riga di Windows. Provato sui
brani veri, non su fixture inventate: identici byte per byte.

**Perché questa pagina non è statica.** Tutto il resto lo è, per sopravvivere senza rete.
Un editor precachato invece mostrerebbe le parole dell'ultimo deploy e poi non riuscirebbe a
salvare quelle nuove: peggio di una pagina che si rifiuta di aprirsi. Serve anche una regola
nel service worker, perché le regole di default se lo prendevano comunque — trovato nella
cache `others`, non immaginato.

**Dal punto alla lettera.** Mettere un accordo *posizionandolo* non richiede misure — la
copia nascosta fa tutto. La direzione opposta, da un tocco alla lettera sotto il dito, non
ha lo stesso trucco: lì si misura con un canvas impostato sul font del campo. Che sia la
stessa cosa che fa il browser è verificato, non sperato — `caretPositionFromPoint` dà la
stessa lettera dello stesso punto — e un accordo finito una lettera più in là si sposta con
le frecce accanto al nome, che tengono il campo aperto perché perdere il fuoco chiuderebbe
proprio la cosa che si sta spostando. Spostarne uno oltre un altro cambia quale dei due
viene prima, quindi l'operazione restituisce anche il nuovo indice: senza, il campo aperto
si troverebbe a modificare l'accordo sbagliato.

**Le pastiglie che sembravano etichette.** Tre segnalazioni di fila — «non posso mettere un
accordo», «non posso eliminare uno stacco», «posso spostare il brano solo dall'editor» — e
tutte e tre riguardavano cose che si potevano già fare, con un comando che non si vedeva. Il
selettore del canzoniere nella testata era un `select` nudo, testo attenuato, in mezzo a
un'altra riga di testo attenuato: leggeva come un'etichetta. È diventata una pastiglia con
l'icona e il chevron — e poi, col ridisegno, è uscita dalla testata del brano: spostare un
brano si fa dall'editor. La lezione resta, ed è quella che conta: un controllo che sta in
mezzo al testo va disegnato come un controllo, non come il testo che lo circonda.

**Le righe che non sono testo.** Stacchi, marcature e direttive si potevano già eliminare —
click sulla riga, poi *Elimina riga* — ma nessuno lo trovava, e una funzione che non si trova
è una funzione che non c'è. Ora ognuna porta il suo ×.

**La guardia sull'uscita.** `beforeunload` copre solo l'uscita dal sito. Ogni link
dell'header è una navigazione interna e non fa scattare niente: con mezzo verso scritto,
toccare il menù lo buttava via in silenzio. I click vengono quindi intercettati in fase di
cattura, prima che il router li veda, così valgono il marchio, il menù, le frecce e
qualunque cosa venga aggiunta all'header dopo.

Il prezzo, detto: la vecchia modifica in pagina si apriva anche senza rete, e questa no. Non
salvava neanche prima, ma potevi almeno guardare il form.

Resta fuori l'import: un brano nuovo si crea ancora dal form di `/importa`, e le tre modalità
valgono per i brani che esistono.

### v1.5 — l'header sempre uguale, e l'import di più brani

Consegnata.

1. Il marchio non lascia più l'header: entrando in un brano restavano solo un `‹` e un
   testo attenuato
2. `/importa` chiede **per prima cosa** in quale canzoniere, e lì se ne può creare uno
3. Un testo con più brani diventa più brani, uno per riga, controllabili prima di salvare

**Il marchio se ne andava proprio dove serve.** L'header sostituiva icona e nome con il link
di ritorno, per stare su una riga sola: sulla pagina del brano lo spazio verticale è il
prodotto. Ma quella è anche la pagina dove si sta più tempo, in standalone, senza nessuna
cornice del browser attorno: l'unica cosa che dice quale app sia questa spariva esattamente
lì. Ora il marchio c'è sempre e il link di ritorno è qualcosa che l'header *aggiunge* — e
solo quando porta altrove: per un brano letto da solo il marchio va già alla lista, quindi
un «‹ Tutte le canzoni» accanto sarebbe lo stesso posto scritto due volte.

Misurato a 320, 360 e 430 px su cinque pagine: niente straborda, e il nome resta intero.
Ma la misura ha anche mostrato il prezzo — dentro una scaletta la pastiglia veniva tagliata
a «Sabato in canti…», e quello che si perdeva era il `· 1 di 12`, cioè l'unica informazione
che serve mentre si suona. La posizione è quindi scesa sotto il titolo, dove non viene
abbreviata, e siccome lì accanto c'è già il canzoniere si dice per intero di cosa è la
posizione: «1 di 2 in Sabato in cantina».

**La destinazione prima del testo.** Il canzoniere era il quarto campo di un form che
compariva *dopo* l'analisi: un momento strano per chiedere dove stai mettendo una cosa, e
impossibile da rispondere una volta per venti brani. Ora è il primo campo, vale per tutta
la pasta, e vince su un eventuale `{canzoniere: …}` nel testo — che la riga segnala, perché
reimportare un export significa portarsi dietro la vecchia archiviazione e sovrascriverla in
silenzio sarebbe una sorpresa. Nel form del brano singolo il campo è sparito: due controlli
per una decisione, senza sapere quale vince, è il problema di prima al contrario.

L'elenco delle destinazioni arriva dal database e non dal build, per lo stesso motivo per cui
ci arrivano le parole di un brano: un canzoniere creato un minuto prima esiste, e una
schermata che non lo offre è una schermata vecchia. Crearne uno da qui lo rende subito la
destinazione — farlo qui significa volerci importare dentro.

**Dove tagliare, e dove no.** Dividere una pasta in più brani si fa solo su segni messi da
una persona: una riga di `---`, il `{ns}` di ChordPro, un secondo `{title:}`, un salto
pagina. L'euristica allettante — riga vuota e poi una riga che sembra un titolo — è
esattamente sbagliata su questo materiale: le canzoni sono piene di righe vuote fra le
strofe, e la prima riga di una strofa somiglia a un titolo quanto un titolo. Sbagliare lì
spezza un brano in cinque, e chi incolla non lo vede finché non sono salvati. Senza segni è
un brano solo: è il modo giusto di sbagliare, perché uno in meno è una ripetuta e uno in più
è da ripulire.

**La lista è il punto, non il salvataggio.** Tre guessi in fila — dove tagliare, cosa sono
accordi, quali righe sono un'intestazione — e l'unica difesa vera per un'euristica non è
avere ragione sempre, è **essere visibile quando sbaglia**. Quindi ogni brano arriva con
titolo e artista modificabili, il testo a un tocco, e niente scritto finché non lo chiedi.

**Uno alla volta, e ognuno dice come è finito.** I salvataggi sono in sequenza: lo slug si
ricava leggendo quelli già presi, e due scritture in parallelo lo leggerebbero entrambe
prima che l'altra abbia scritto, chiedendo lo stesso. In cambio ogni riga può dire cos'è
successo a sé, che è ciò che rende un fallimento parziale — quattro salvati, uno già
presente, uno rifiutato — una cosa su cui agire invece di una riga di riassunto. Ripremere
non riscrive quelli riusciti, e le righe già scritte smettono di accettare modifiche: la
canzone esiste, e da quel momento si cambia nell'editor.

Verificato contro il database, non contro l'avviso a schermo: tre brani da una pasta in un
canzoniere creato sul momento, l'artista corretto a mano che arriva nella riga giusta, e
la seconda passata che riconosce i due identici. Il terzo, di cui avevo cambiato l'artista,
viene salvato di nuovo — ed è giusto: stesso titolo con artista diverso è una cover.

### v1.6 — una via sola per il brano accanto, e l'ordine in mano

Consegnata.

1. Le due card «Precedente / Successiva» in fondo allo spartito non ci sono più: le frecce
   nell'header portano negli stessi due posti e sono sempre a portata
2. `songs.position`, nullable, e un trascinamento che la scrive
3. Riordino dal canzoniere aperto in home, col dito o con le frecce della tastiera

**Due volte la stessa strada.** In fondo al brano c'erano due card coi titoli dei vicini, e
nell'header due frecce che portano esattamente là. La copia in fondo costava anche due query
in più per pagina al build — servivano solo a leggere quei due titoli — e per raggiungerla
bisognava scorrere tutta la canzone, cioè arrivava tardi proprio quando serve: mentre suoni.
Restano le frecce, e `SetlistContext` non porta più titoli, solo slug.

**Perché `null` e non `0`.** La colonna è nullable senza default, e Postgres mette i null in
fondo a un ordinamento crescente: così la migrazione è additiva davvero — ogni riga esistente
resta null, l'ordine resta alfabetico finché nessuno tocca niente, e un brano importato in un
canzoniere già sistemato si accoda invece di comparire in testa. Un default `0` avrebbe fatto
l'opposto (il nuovo arrivato primo) e avrebbe richiesto un `position = 0 → in fondo` scritto
a mano in ogni query. Al primo trascinamento il canzoniere viene rinumerato tutto da 1 a N,
così buchi e pari merito — due brani il cui ordine reciproco non è definito — sono impossibili
per costruzione.

**Il trascinamento, con gli eventi puntatore.** L'API drag-and-drop di HTML non esiste su un
touchscreen, e il touchscreen è dove questa app si usa. Quindi `pointerdown/move/up` con
`setPointerCapture` sulla maniglia, e `touch-action: none` su di essa — senza quello il
browser si prende il gesto verticale per lo scroll e gli eventi smettono di arrivare a metà
strada.

Le bande verticali delle righe si misurano **una volta**, all'inizio del trascinamento, e non
si rimisurano mentre le righe si spostano: rimisurare sposterebbe i confini contro cui si
confronta il dito, e la lista oscillerebbe fra due ordini col dito fermo. Le righe non sono
tutte alte uguale — un brano con artista è più alto di uno senza — quindi si cammina sulle
bande invece di dividere per un'altezza.

**Anche da tastiera.** La maniglia è un `button`: a fuoco risponde a ↑ e ↓. Senza, questo
sarebbe stato l'unico comando dell'app che una tastiera non può dare. I salvataggi sono
accodati su una promessa, così cinque pressioni rapide finiscono nel database nell'ordine in
cui sono state fatte e non in quello in cui la rete risponde.

**Quello che il riordino non è.** Non è una modifica ai brani: `updated_at` non viene toccato,
quindi venti righe trascinate non finiscono nella lista «in attesa di pubblicazione», dove non
avrebbero niente da pubblicare. Le frecce dentro il brano però vengono dal build, quindi
seguono l'ordine nuovo alla ricostruzione successiva — ed è *Ricostruisci ora* che serve, la
stessa asimmetria già vera per una rinomina.

**La ricerca è tornata alfabetica di proposito.** Ordinare la lista per `(position, title)`
serve alle frecce, ma la stessa lista alimenta i risultati di ricerca: fra canzonieri diversi
le posizioni sono 1..N ciascuna, quindi i risultati sarebbero arrivati come tutti i «primi»,
poi tutti i «secondi». La ricerca ordina per titolo per conto suo.

**Il costo, detto.** Il riordino richiede la rete (il pulsante non compare offline), e con
`touch-action: none` un canzoniere più lungo dello schermo non si può scorrere mentre si
trascina: si arriva in fondo con le frecce della tastiera, oppure in due mosse. L'ordine non
entra nell'export `.chopro` — non è un fatto del brano, e inventare una direttiva non standard
renderebbe quei file meno leggibili altrove.

### v1.7 — i comandi fermi, l'ordine dell'import, l'ukulele

Consegnata.

1. I comandi dell'editor non scorrono più con la pagina
2. I brani importati restano nell'ordine in cui sono stati incollati
3. Chitarra o ukulele, dal menù: cambia la forma che il diagramma disegna

**Un blocco fermo, e corto.** I comandi dell'editor stavano in fondo a una pagina che
scorre, cioè più lontani proprio quando la canzone è lunga — il caso in cui si scorre. Ora
le due righe stanno in un unico elemento sticky: uno e non due sovrapposti, perché l'altezza
della prima cambia con la larghezza dello schermo e un secondo offset dovrebbe indovinarla.
L'offset è quello dell'header, **misurato** a 64 px, non dedotto da un commento.

Farli stare lì ha richiesto di accorciare il blocco: su un telefono da 360 px la sola riga
delle modalità ne occupava tre, 146 px di controlli prima di un comando. Quindi il link di
ritorno è il suo chevron (l'etichetta resta per chi legge con la voce), la scritta «non
salvato» è sparita perché un pulsante *Salva* attivo dice già quello, e «riga 3» è sparita
perché la riga su cui agiscono i comandi è quella col bordo accento accanto. I comandi
scorrono in orizzontale invece di andare a capo, con *Annulla* fuori dalla striscia: un
comando che si cerca dopo un errore non deve essere anche da trovare. 102 px a ogni
larghezza.

**Perché l'import numera il canzoniere.** Incollare venti brani in un ordine e ritrovarli
alfabetizzati non è quello che significa incollarli in un ordine. Ma un posto in mezzo a
brani senza posto non vuol dire niente: i null stanno in fondo, quindi un brano nuovo *con*
un numero salterebbe in testa a un canzoniere che nessuno ha ordinato. Da qui le due
strade — se il canzoniere è già 1..N i nuovi continuano da N, altrimenti viene numerato
prima, nell'ordine in cui è in quel momento. In entrambi i casi ciò che era a schermo
mantiene il suo ordine e i nuovi finiscono sotto.

Il resto sono conseguenze della stessa regola: un brano *spostato* in un altro canzoniere
resta senza numero (arriva in coda: il numero che aveva era un posto fra altri brani, e
quelli non sono questi), e sostituire il testo di un brano che sta già lì non lo muove.

**Chitarra o ukulele.** Un Do è un Do su qualsiasi strumento: cambia la *forma*, non
l'accordo, quindi sullo spartito non si muove niente e cambia solo il diagramma che si apre
toccando un accordo. Lo strumento è una preferenza globale accanto alla notazione —
sincronizzata sul database, non locale come il tema, perché è una preferenza su chi legge e
non sullo schermo che ha davanti.

La tabella dell'ukulele **non è scritta a mano**: una ricerca prova le combinazioni in una
finestra di quattro tasti e tiene solo quelle che il test già sa giudicare — nessuna nota
estranea, tutte quelle indispensabili — ordinate per corde mute, posizione, estensione e
dita. L'ordine di quei quattro criteri è tutta la differenza fra un diagramma riconoscibile e
uno no: mettendo l'estensione prima della posizione la ricerca risponde Fa con 5555, quattro
dita in fila al quinto tasto, valido e non quello che suona nessuno. Con la posizione prima,
le forme dei manuali escono da sole — Do 0003, Fa 2010, Sol 0232, La- 2000 — e sono ventuno
casi nel test, nessuno dei quali è scritto nel codice.

Su quattro corde e senza corde da smorzare una combinazione su 216 non ha voicing entro il
dodicesimo tasto (`G#m9`, che chiede quattro note distinte): lì `shapeFor` risponde null e la
finestra mostra le note, che è più utile di una forma al quattordicesimo tasto di uno
strumento che ne ha dodici. Il test quindi non pretende più «una forma per ogni famiglia» ma
verifica quanto ciascuno strumento copre.

Il diagramma è passato a essere dimensionato in **altezza**: a larghezza fissa una cassa da
quattro corde veniva stirata — stessi tasti, più distanti, il manico di uno strumento che non
esiste — mentre così ognuno resta nelle sue proporzioni e la chitarra non cambia di un pixel.

**Il costo, detto.** Una preferenza in più nell'header significa che il menù ora legge le
preferenze, quindi le tre pagine che avevano solo la barra — canzonieri, scalette, la singola
scaletta — hanno anche loro il `PrefsProvider`. Il conto è una query in più su quelle pagine.

### v1.8 — capotasto

Consegnata.

1. `user_song_prefs.capo`, e uno spartito che mostra le forme da fare invece degli
   accordi che suonano
2. Una pastiglia sotto il titolo che dichiara il capotasto e la tonalità che suona
3. Un suggerimento: quale tasto rende aperti più accordi del brano

**Due spostamenti che non sono lo stesso spostamento.** Trasporre muove il suono;
il capotasto muove la mano e lascia il suono dov'è. Insieme: `letto = scritto + semitoni
− capotasto`, `sonante = scritto + semitoni`. È una sottrazione, e per questo sta in un
modulo con i test invece che dentro un componente: sbagliata di segno resta plausibile a
schermo, e l'unico caso che la smaschera è **+2 semitoni con il capotasto al 2**, dove le
lettere devono tornare quelle scritte *e* il brano deve suonare un tono sopra. Una delle
due cose da sola non basta: con un segno invertito una delle due continua a tornare.

**Perché la pastiglia sotto il titolo.** Il pannello di lettura è chiuso quasi sempre —
è una scelta di design già dichiarata: «col pannello chiuso la barra non dice più in che
tonalità stai leggendo» — e un capotasto ricordato da ieri rinomina *ogni* accordo della
pagina. Senza una riga fissa, aprire un brano mostrerebbe Do dove c'era Re e niente
spiegherebbe perché: la sorpresa silenziosa che questa app evita altrove. La pastiglia
c'è solo col capotasto inserito, perché a zero non c'è niente da spiegare.

**Il suggerimento, e la definizione che ha dovuto cambiare.** Il criterio parte da una
domanda semplice: quali accordi sono aperti. La prima versione lo chiedeva alla tabella
delle posizioni aperte — sembrava di principio ed era sbagliata: il La aperto arriva allo
spartito attraverso una forma mobile che capita di cadere al capotasto, quindi la tabella
non ha una voce per lui e il suggerimento contava il La fra i difficili. Il test l'ha
trovato subito. La definizione buona è **almeno una corda libera, e niente oltre il terzo
tasto**: una corda libera è esattamente quello che un barré toglie, quindi dice «senza
barré» senza dover riconoscere un barré — cosa che nessuna euristica fa bene, perché tre
dita in fila al secondo tasto sono indistinguibili da un barré e sono un La aperto. E vale
identica sui due strumenti, dove prima servivano due regole diverse.

Il suggerimento **non si applica da sé** e si confronta col capotasto già messo, non con
un manico nudo: a chi ha già scelto il secondo tasto, sentirsi dire che il secondo tasto
andrebbe bene è rumore. Il test della proprietà — su cinque brani, otto tasti e due
strumenti — verifica che quando parla sia sempre un miglioramento vero.

**Il diagramma non si rinumera.** Col capotasto al 2 la forma di Do *è* la forma di Do:
il capotasto è il nuovo tasto zero. Cambia solo la barra, colorata e col numero accanto,
perché altrimenti una forma aperta e la stessa forma dietro un capotasto sarebbero lo
stesso disegno.

**Cosa ha detto il tipo.** Aggiungere `capo` a `SongPrefs` ha fatto fallire la
compilazione in tre punti: la server action, la cache locale e le fixture del test della
coda — cioè esattamente i tre posti che costruiscono le preferenze campo per campo
invece di passarle intere. È la stessa classe di bug evitata due volte in v1.7 (il
confronto di uguaglianza in `updateGlobal`, poi in `updateSong`), e stavolta l'ha trovata
il compilatore invece di me.

**Il costo, detto.** Il capotasto è una preferenza del brano, quindi lo segue anche dentro
una scaletta: se in una serata lo stesso brano va fatto in due modi diversi, questo
modello non lo permette. E non entra nell'export `.chopro`, come non ci entrano
trasposizione e ordine: quel file è il brano come è scritto, non come lo leggi.

### v1.9 — la modifica ridisegnata

Consegnata. Viene da un handoff di Claude Design: *Turno 5* del documento
`Songs Grafica`, che completa il ridisegno già fatto per lettura, elenchi e barra.

1. La testata dell'editor: il titolo del brano, *Annulla* e *Salva* su una riga
2. Le tre modalità come icone — matita, parentesi, occhio — invece di tre parole
3. I comandi come icone, con la sola *Accordo* che tiene la sua parola
4. *Dati del brano* con il suo chevron, *Elimina* come unico controllo scuro dell'app

**Cosa il mockup non poteva sapere.** È stato disegnato prima che i comandi diventassero
fissi (v1.7, la stessa giornata): lì stanno nel flusso della pagina, con la card dei dati
in mezzo fra la riga del titolo e le modalità. Fissa, quella card renderebbe il blocco
alto quattrocento pixel appena la si apre. Quindi l'ordine è quello del mockup tranne la
card, che scende sotto il blocco fisso — l'unico scostamento, e la ragione è una
richiesta esplicita dello stesso giorno.

**Le icone hanno pagato il titolo.** Tre parole per le modalità riempivano la riga da
sole; a icone (66 px l'una) ne resta abbastanza per il nome del brano in alto, che prima
non c'era da nessuna parte: l'header dice «songs», e in modalità grafica le parole sullo
schermo sono la canzone, non il suo titolo. Ogni icona conserva il nome in `title` e in
`aria-label` — la lezione delle pastiglie che sembravano etichette valeva anche al
contrario.

**Una cosa rotta trovata implementando.** La prima riga di un brano con intro —
`[re] [la] [re] [sol]` — sovrapponeva tutti gli accordi in una macchia: le sue "parole"
sono spazi singoli, quattro pixel, e un nome di accordo ne occupa venti. Il lettore non
ha il problema perché lì è l'accordo a decidere la larghezza della parola sotto; qui le
parole sono un `input` vero e la copia nascosta sopra deve corrispondergli lettera per
lettera, quindi allargarla è esattamente ciò che non si può fare. Una riga senza parole
non ha sillabe a cui appendere niente: gli accordi diventano una riga di accordi.

Resta il caso di due accordi a due lettere di distanza su una riga *con* parole, che si
sovrappongono ancora: si separano con le frecce, e risolverlo davvero richiede di
misurare. Era così anche prima.

### v2.0 — utenti, e tre cose in meno

Cinque richieste, e tre sono **rimozioni**. Vale dirlo prima di tutto il resto: la
maggior parte di questa versione è codice che non c'è più — tre rotte, due tabelle, una
colonna, una dipendenza, e le funzioni che esistevano solo per servirle.

**1. Chi può entrare, dall'app.** Nuova tabella `members` e nuova schermata `/utenti`.
L'elenco ha due metà che non sono la stessa cosa: i **proprietari** vengono da
`ALLOWED_EMAILS`, che l'app non può scrivere, e gli **invitati** dalla tabella. È la
differenza che rende impossibile chiudersi fuori — non c'è nessun gesto, in nessuna
schermata, che tolga l'accesso all'ultima persona che ce l'ha — e che tiene in piedi
l'accesso dei proprietari anche con il database irraggiungibile, dato che per loro non
c'è niente da leggere.

Le due metà si incontrano in `isAllowed(email, env, members)`, che risponde **sia** al
callback di login **sia** alla guardia davanti a ogni scrittura. Questa è la parte da non
sbagliare, ed è il primo errore che il revisore ha fermato: una guardia che avesse letto
solo la tabella avrebbe lasciato i due proprietari — le sole persone con accesso — dentro
l'app e incapaci di salvare qualunque cosa, perché non sono righe. Verificato attraverso
l'interfaccia dopo il cambio: una trasposizione salvata da un proprietario arriva al
server.

Quello che una rimozione **non** fa: chiudere una sessione già aperta. Il cookie dura
novanta giorni per una ragione (scadere senza rete chiuderebbe fuori dal repertorio in
scena) e le pagine sono già sul dispositivo di chi le ha scaricate. Smette subito ogni
scrittura, perché la guardia rilegge l'elenco a ogni azione. La schermata lo dice al
momento di rimuovere: promettere una porta che si chiude sarebbe falso.

**2. Le scalette non ci sono più.** Due rotte, due tabelle, il tipo, i due metodi del
repository, i file YAML, la voce di menù, l'icona, la dipendenza `yaml`. Non erano mai
diventate scrivibili dall'app e nel database erano due gusci vuoti — due righe in
`setlists`, **zero** in `setlist_songs` — quindi non si è persa nessuna serata. Il
`SetlistContext` di `SongReader` va con loro, e con esso l'unico caso in cui la pagina di
un brano poteva stare in due sequenze diverse.

**3. La tonalità non è più un campo.** Via la colonna `original_key`, il campo
nell'editor, le pastiglie negli elenchi, la direttiva `{key:}` e ogni readout che
nominasse una tonalità. Ma la tonalità serviva a qualcosa di preciso, e non era mostrarla:
`transposeChord` sceglie fra `Fa#` e `Solb` **dalla tonalità d'arrivo**. Toglierla senza
sostituirla avrebbe fatto ripiegare ogni brano su Do maggiore, cioè avrebbe cambiato la
grafia di brani che nessuno aveva toccato.

Quindi la tonalità si **stima dagli accordi**, con l'estimatore che l'import già usava —
spostato da `lib/import/key.ts` a `lib/music/key.ts`, perché non è più una cosa
dell'import. Interna, mai scritta, mai stampata. Misurato **prima** di far cadere la
colonna, che è l'unico momento in cui si poteva misurare: sui ventuno brani con una
tonalità salvata la stima ha indovinato **ventuno volte su ventuno**. I tre senza tonalità
salvata ci guadagnano, perché prima ripiegavano su Do.

Ne segue una potatura che vale la pena nominare: `formatKey`, `keyLabel`, `parseKey` e
`soundingKey` sono state cancellate. Non erano rotte — erano diventate senza chiamanti,
perché una tonalità non si scrive più in nessun senso della parola, né dentro né fuori. I
loro test sono stati riscritti per dire la stessa cosa attraverso ciò che resta.

**4. La home è l'elenco dei canzonieri**, e ogni canzoniere ha la sua pagina. Il perché
sta in *Il canzoniere ha una rotta propria*: delle due obiezioni storiche una era falsa
nel nostro schema. La ricerca resta in home; il riordino trasloca nella pagina del
canzoniere, che è dove ora vive l'elenco che riordina.

**5. Dal brano si torna al canzoniere**, con la pastiglia `‹ Cartoni animati` nell'header.
Qui c'era una trappola che il revisore ha visto prima di me: `seriesFor` calcolava insieme
il canzoniere e la posizione nella sequenza, e restituiva `null` per entrambi quando i
brani erano meno di due. Un canzoniere con un brano solo avrebbe quindi perso **anche** la
via del ritorno, che non ha niente a che vedere con l'avere dei vicini. Sono due funzioni
adesso, con due condizioni diverse.

**Le migrazioni sono due, e nell'ordine giusto.** `0006` crea `members` e va applicata
*prima* del push, perché il login la legge; `0007` lascia cadere la colonna e le due
tabelle e va applicata *dopo* che il deploy è pronto, perché fino a quel momento il sito
in produzione è ancora quello vecchio, che quella colonna la seleziona. Al contrario si
aprirebbe una finestra di qualche minuto in cui salvare un brano sul sito vivo fallisce.

**Cosa è stato misurato, non supposto.** Trentatré controlli attraverso l'interfaccia:
che le righe della home siano collegamenti e non pieghe, che seguire la pastiglia del
ritorno *atterri* sul canzoniere che nomina, che togliere il capotasto rimetta esattamente
gli accordi di prima, che rimuovere un invitato lo faccia sparire dall'elenco. Due
fallimenti erano miei e non dell'app: un profilo del browser riusato si portava dietro una
trasposizione in `localStorage`, e un `input` svuotato via DOM non aggiorna lo stato di
React. Il terzo era vero e istruttivo: un `type="email"` fa rifiutare l'indirizzo
malformato al browser, prima che l'azione sul server venga chiamata.

### v2.1 — ruoli

Tre ruoli, e la linea fra loro è cosa possono **cambiare**: admin tutto, editor il
repertorio, viewer niente di condiviso. Quattro decisioni tengono in piedi il resto.

**I proprietari sono admin per definizione, non per una riga.** `ALLOWED_EMAILS` non è
scrivibile dall'app, quindi chi c'è dentro non si può rimuovere — e la stessa cosa lo
rende non retrocedibile. Non esiste perciò una sequenza di gesti permessi che lasci
l'installazione senza nessuno al comando, che è la proprietà da cui dipende tutto il
resto: le altre regole possono sbagliare senza chiudere fuori nessuno.

**Le preferenze non sono modifiche.** Trasposizione, capotasto, velocità, dimensione e
notazione restano aperte a ogni ruolo, viewer compresi. Non toccano il repertorio: sono
come una persona legge sul proprio schermo, e un viewer che non potesse trasporre non
servirebbe a niente sul palco — l'unico posto dove questa app viene usata. Verificato come
tale: un viewer alza di un semitono e la riga arriva nel database.

**Il ruolo non entra nel token.** Una sessione dura novanta giorni; un ruolo scritto lì
dentro terrebbe i poteri di ieri per tre mesi. Le guardie rileggono la tabella a ogni
azione, quindi retrocedere qualcuno gli toglie i controlli **dalla sua azione successiva**
— provato spostando un editor a viewer sotto la stessa sessione e vedendo sparire
*Modifica*.

**L'interfaccia è la spiegazione, il server è la garanzia.** Le pagine sono statiche e
precachate: sono le stesse per tutti, e nessuna può sapere al render chi la guarda. Quindi
il ruolo arriva dopo il mount, come le preferenze, e i controlli compaiono solo quando la
risposta è arrivata e permette — mai il contrario, perché un pulsante che appare e sparisce
è un pulsante che qualcuno ha già premuto. Offline non arriva affatto, il che va bene:
tutto ciò che un ruolo sblocca ha comunque bisogno della rete. Il ruolo **non** è messo in
cache di proposito: un «admin» ricordato disegnerebbe pulsanti che rifiutano.

L'unica pagina che rifiuta da sé è l'editor, l'unica generata su richiesta: a un viewer non
manda nemmeno i campi.

**Cosa è stato misurato.** Ventisette controlli con tre sessioni vere — un invitato
temporaneo per ruolo, una sessione firmata per ciascuno, e l'app usata come quella persona:
i controlli assenti dove devono essere assenti, le tre schermate che spiegano invece di
offrire, un editor a cui `/utenti` non dice nemmeno chi altro esiste, e una richiesta POST
sparata diretta a un'azione di scrittura che non cambia niente — perché un pulsante
nascosto non è una serratura. Le due volte che il controllo ha segnalato un problema era
il controllo a sbagliare: leggeva `document.body`, che comincia con lo script del tema, e
cercava le parole del brano in una pagina dove Next le aveva prefetchate legittimamente
dal link di ritorno.

### v2.2 — email e password

Un secondo modo di entrare, accanto a Google. Quattro decisioni, e la prima spiega la forma
di tutte le altre.

**Una tabella a parte, `credentials`, non una colonna su `members`.** Il motivo è lo stesso
fatto che rende i proprietari impossibili da chiudere fuori: un proprietario **non ha riga**
in `members`, quindi una colonna là non potrebbe mai contenere la sua password. Separandole,
`members` risponde *se* puoi essere qui e `credentials` soltanto *come dimostri di essere
quell'indirizzo*. Una riga di password non concede niente: `roleOf` decide come prima e non
sa che questa tabella esista.

**scrypt dalla libreria standard.** L'alternativa era un bcrypt in puro JS: una dipendenza
per una funzione, in un'app che ha appena finito di cancellare una dipendenza che non usava
più. scrypt è un KDF da password nella standard library, lento e affamato di memoria di
proposito, e il suo costo è l'unico freno ai tentativi che questa app abbia — misurato:
34 ms per un hash, 30 ms per una verifica, con N=16384, r=8, p=1 e 16 MiB. La stringa
salvata porta i propri parametri (`scrypt$16384$8$1$sale$hash`), così alzarli domani non
rompe le righe scritte ieri.

**Il login non distingue mai i suoi rifiuti.** Password sbagliata, indirizzo senza password,
indirizzo fuori elenco: una frase sola. Il controllo di ammissione sta *dentro* `authorize`
oltre che in `signIn`, e non è ridondanza — è ciò che fa collassare due esiti diversi in uno
visto da fuori. Altrimenti indovinare la password di qualcuno che è stato rimosso darebbe un
errore diverso, e il modulo diventerebbe un oracolo su chi esiste. Il *tempo* di risposta
direbbe la stessa cosa, e per quello c'è la verifica contro un hash finto quando la riga non
c'è.

**La password di un proprietario non si imposta da un'altra persona.** L'identità di un
proprietario la garantisce Google; poter scrivere la sua password sarebbe la strada per
entrare come qualcuno che non si può né rimuovere né retrocedere — l'unica scalata di
privilegi che il sistema dei ruoli lasciava aperta. La propria sì, sempre, e per questo la
regola è «tranne il tuo indirizzo» e non «solo gli invitati».

E una cosa in più di quanto chiesto, da valutare: **`/password`**, dove ognuno cambia la
propria indicando quella attuale. Una password che solo un admin può cambiare è una password
che l'admin conosce; con quella schermata l'admin dà la prima e poi non serve più. Ogni ruolo
ce l'ha, viewer compreso: come entri è affare tuo, e l'unica autorizzazione è che l'indirizzo
viene dalla sessione e non da un parametro.

**Cosa è stato misurato.** Ventidue controlli, e la prima metà **senza cookie forgiati**: il
browser compila il modulo e l'app deve restituire una sessione. La password arriva nel
database solo come hash `scrypt$…`, mai in chiaro; entra con quella giusta e non con quella
sbagliata; un indirizzo che nessuno conosce ottiene la stessa frase di una password
sbagliata; l'interessato la cambia da sé e la vecchia smette di funzionare; una password
attuale sbagliata non cambia niente e lo dice; un admin invitato non si vede offrire la
password di un proprietario; rimuovere l'utente porta via anche la password, e il modulo
allora lo rifiuta come qualsiasi estraneo.

**Cosa non è stato provato end-to-end**: il giro completo di Google, perché non si può
guidare la sua schermata di consenso. Di quello resta verificato che i due provider si
costruiscono, che `/login` mostra entrambe le strade e che il middleware non è cresciuto —
`node:crypto` non è finito sull'edge.

Migrazione 0009: crea `credentials`. Solo aggiunta, quindi applicata prima del push.

### v2.3 — sezioni

Il canzoniere si divide, e ogni brano sta in una sezione sola. Cinque decisioni tengono su
il resto.

**La coerenza la garantisce il database, non il codice.** Il canzoniere di un brano resta
scritto sul brano — è la colonna su cui filtrano le pagine statiche e l'overlay — e la
sezione dice a sua volta in quale canzoniere sta. Due copie dello stesso fatto: quindi
`unique (id, canzoniere_slug)` su `sections` e una chiave esterna **composta** su `songs`,
che rende impossibile la riga sbagliata. Il `on update cascade` che la completa è stato
misurato prima di scriverlo, su uno schema di prova poi rimosso, perché senza di esso far
traslocare una sezione è rifiutato in entrambi gli ordini di update.

**Una disposizione sola, in una transazione sola.** `arrangeCanzoniere` sostituisce
`reorderCanzoniere` e scrive tutto: l'ordine delle sezioni, l'ordine dei brani dentro
ognuna, e la sezione di ogni brano. Un brano trascinato oltre un'intestazione cambia tre
cose insieme, e scriverle con due chiamate lascerebbe un momento in cui il brano non sta né
qua né là. Un controllo di obsolescenza solo, su **entrambi** gli insiemi — sezioni e brani
— perché il caso vero è qualcuno che importa o rimuove mentre le righe sono aperte.

**Le frecce non si fermano a una sezione.** Il canzoniere resta una sequenza sola, percorsa
sezione dopo sezione; l'header del brano dice la sezione e conta il canzoniere («Prima
parte · 3 di 12»), perché il numero e la freccia devono raccontare la stessa storia.

**Il ritorno da un brano porta un frammento, non un parametro.** `#brano-<slug>` è ciò che
apre la sezione giusta all'arrivo, e un frammento non arriva al service worker: una query
avrebbe fatto mancare la pagina nel precache, cioè avrebbe rotto il ritorno da un brano
proprio offline.

**La struttura non timbra `updated_at`.** Disporre non cambia nessun brano, cambia
l'insieme. La riga che il codice esistente aveva già tracciato viene tenuta: si timbra chi
**cambia canzoniere** — è su un'altra pagina, quindi va pubblicato — e non chi cambia solo
posto o sezione. Per allineare frecce e header si usa *Ricostruisci ora*.

Migrazioni 0010 (additiva: la tabella, la colonna nullable, i vincoli, `canzoniere_slug`
`not null`, e il backfill di una sezione «Brani» per canzoniere scritto a mano sotto il DDL
generato — la prima migrazione di questo repo che porta dati) e 0011 (contrattiva, dopo il
deploy: ripete il backfill per la finestra fra le due e mette `section_id` `not null`).

**Cosa è stato misurato.** Sessantasette controlli attraverso l'interfaccia, in quattro
passate.

*In lettura, sul locale (23):* la divisione di un canzoniere, un brano portato oltre
l'intestazione con la tastiera, le sezioni chiuse e le due eccezioni, la piega che resta
dopo un ricarico, l'editor e l'import che chiedono la sezione.

*Ruoli e rifiuti (16):* un nome già preso rifiutato con la sua ragione, un brano portato
oltre l'intestazione **col dito**, la rimozione di una sezione piena che chiede dove, e la
*stessa* richiesta di scrittura di un editor ripetuta da un viewer — con l'identificatore
vero dell'azione, registrato da una chiamata legittima, e la conferma che arriva davvero
all'azione (200, non un 404 di rotta) — che non cambia niente.

*In produzione (14):* le stesse cose sul dominio vero, più le due che solo lì si vedono —
l'header del brano che resta fermo al build mentre le schede sotto sono già cambiate, e
tutto il giro **offline**: il canzoniere che si apre dal precache con le sue sezioni, una
sezione che si apre comunque perché la piega è locale, e il ritorno da un brano che trova la
pagina in cache proprio grazie al frammento.

*Il trasloco delle sezioni (14):* l'SQL più intricato della versione e la sola strada che
potrebbe perdere un brano, quindi provato su canzonieri creati per l'occasione: «Messa»
diventa una sezione di chi accoglie i brani, la «Brani» omonima non arriva come gemella,
il brano portato cambia canzoniere **per cascata** senza essere riscritto, chi era già là
non si muove, i due arrivati risultano da pubblicare e lui no. Nella stessa passata il caso
che sbaglierebbe in silenzio: nell'editor il menu delle sezioni segue il canzoniere scelto,
e salvando il brano finisce davvero là.

Un difetto vero trovato dai controlli: un nome duplicato arrivava a schermo come
«salvataggio non riuscito», perché drizzle incapsula l'errore del driver e il codice `23505`
sta su `cause`. Tre volte era invece il controllo a sbagliare — misurava le coordinate del
trascinamento prima di scorrere la pagina, apriva la sessione del viewer nella stessa
finestra dell'editor portandogli via il cookie, e guardava il database prima che la
scrittura fosse arrivata (in sviluppo la prima chiamata a un'azione va compilata). Da qui
le attese sullo *stato* invece che sul tempo.

Due cose sono state corrette rileggendo invece che provando: la sezione da aprire al
ritorno va **ricavata** dal brano e non fissata quando si legge il frammento, perché gli
effetti di layout girano prima nei figli che nei genitori e in quell'istante le assegnazioni
sono ancora quelle del build; e i conteggi appartengono alla lista viva, non
all'intestazione generata al build, o le due metà dello stesso schermo direbbero due cose
diverse.

### v2.4 — Songbook

Un nome e un payoff, non una funzione: **songs** diventa **Songbook**, con «Where every
fire needs a melody» accanto al titolo. Deliberatamente non tradotto — un payoff si
ascolta, non si legge per il significato — su una app che per il resto parla italiano.

Una sola fonte, `lib/brand.ts`, con `APP_NAME` e `APP_PAYOFF`: il nome compariva già in
quattro posti che non si vedono l'un l'altro — il titolo della pagina, il manifest della
PWA, il marchio nell'header, e ora la pagina pubblica — e un nome scritto a mano in
quattro punti è un nome che la prossima modifica dimentica in uno dei quattro.

**`/login` diventa anche la pagina pubblica del progetto**, perché lo era già per
costruzione: `middleware.ts` manda lì chiunque non ha una sessione, prima di questa
versione e dopo, quindi non c'è una seconda rotta da inventare. Sotto il nome e il payoff
resta esattamente il modulo di accesso di prima — Google, poi email e password, entrambi i
rifiuti in una frase sola — perché chi entra ogni giorno non è un visitatore e non deve
scorrere una vetrina per arrivarci. Sotto il modulo, una vetrina di sei caratteristiche,
in una frase ciascuna: canzonieri e sezioni, tonalità e capotasto, la forma di ogni
accordo, zoom e scorrimento, l'uso offline, i ruoli. Sei fatti verificabili nel codice, non
un elenco copiato dal README.

Un'icona nuova, `IconOnStage`, per l'unica caratteristica per cui nessuna icona esistente
andava bene: `IconOffline` esiste già, ma è disegnata come un avviso — un segnale
attraversato da una riga — e ogni sua chiamata nell'app è dentro un banner che dice che
qualcosa è disabilitato. Usarla per una caratteristica positiva avrebbe detto il contrario
di quel che c'entrava.

### v2 — il resto

Restava: scalette modificabili dall'app, allowlist su tabella, ordinamento manuale dei
canzonieri. La v2.0 ha chiuso le prime due in due modi opposti — l'allowlist è diventata una
tabella con la sua schermata, le scalette sono state **rimosse** invece di essere finite,
perché non servivano. Resta l'ordinamento dei canzonieri (vedi *Domande aperte*).

Nota la progressione deliberata: la v1.1 ha aperto il percorso di scrittura su una superficie
minima — nomi e appartenenza — e la v1.2 lo estende al contenuto. Ogni passo ha portato una
regola nuova su chi possiede cosa, ed è la parte da rileggere prima di toccare il seed.

### v3.0 — account (pianificata, non ancora costruita)

Finora un solo repertorio condiviso: canzonieri, sezioni e brani sono tabelle globali, e
`members`/`ALLOWED_EMAILS` decidono soltanto chi, fra un insieme fisso di persone, può
vederlo o modificarlo. Questa versione rompe quel presupposto — **ogni persona ammessa
nell'app ha un proprio spazio**, con i propri canzonieri, e può essere invitata, in più,
come collaboratrice nello spazio di qualcun altro.

Il cancello d'ingresso **non cambia**: resta chiuso a chi non è né un proprietario
(`ALLOWED_EMAILS`) né già invitato da qualcuno che c'è. Cambia solo cosa trova, chi entra:
non più l'unico repertorio dell'installazione, ma il proprio.

Passi, nell'ordine in cui una migrazione reale li richiede:

1. **Nuova tabella `accounts`** — `ownerEmail` (chiave primaria), `createdAt`. Un account è
   sempre di una persona sola e non si rinomina: è identificato dal proprietario, non da un
   nome scelto. Serve come tabella a sé — non basta dedurre "gli account esistenti"
   dall'elenco dei canzonieri — perché un account deve poter esistere anche un istante
   prima che la clonazione del canzoniere Example gli scriva dentro qualcosa, e perché dà
   un bersaglio pulito alle chiavi esterne che seguono.
2. **`songbooks` guadagna `accountOwnerEmail`**, come colonna semplice — non come parte
   della chiave primaria. L'idea originale era una chiave composta `(accountOwnerEmail,
   slug)`, per permettere a due account di clonare lo stesso Example senza scontrarsi sullo
   slug; si è rivelata incompatibile con `generateStaticParams`, che genera le pagine di
   `/songs/[slug]` e `/songbooks/[slug]` **a build time**, senza alcun account di richiesta
   con cui comporre la chiave. Lo slug resta quindi **globale** come oggi — `songbooks.slug`
   e `songs.slug` restano chiavi primarie semplici, `sections` e `songs` non guadagnano
   alcuna colonna — e la clonazione dell'Example evita le collisioni riusando `uniqueSlug()`
   (già esistente) al momento della provisione, mintando uno slug nuovo per il canzoniere
   clonato e per ciascun brano che contiene. La conseguenza più grande è altrove: uno slug
   globale raggiungibile da chiunque sia autenticato è un confine di privacy che non regge
   più da solo, il che è il motivo dei punti 12–14 più sotto.
3. **`songbooks` guadagna `isExampleTemplate`** (booleano, default `false`), con un indice
   unico parziale (`UNIQUE (isExampleTemplate) WHERE isExampleTemplate`) che garantisce che
   al più un canzoniere in tutta l'installazione porti il flag. È quello che la
   provisione clona per ogni nuovo account; spostarlo su un altro canzoniere in futuro è un
   `UPDATE`, non un deploy.
4. **`members` diventa per-account.** Chiave primaria `(accountOwnerEmail, memberEmail)`
   invece di `email` da sola: la stessa persona può comparire più volte, una riga per ogni
   account di cui è collaboratrice, con un ruolo — editor o viewer — indipendente in
   ciascuno. `addedBy`, `role`, `createdAt` restano come sono oggi, solo scope diverso.
5. **`userSongPrefs` non cambia**, di conseguenza al punto 2: restando `songs.slug` una
   chiave globale, la chiave esterna verso `songs` e la chiave primaria
   `(userEmail, songSlug)` restano quelle di oggi, senza bisogno di una colonna
   `accountOwnerEmail` in più. `userPrefs` (zoom, notazione, strumento) resta comunque
   **della persona**, non del repertorio che sta leggendo — quello non era mai stato in
   discussione.
6. **`singAlongSessions` guadagna `broadcastAccountEmail`.** `ownerEmail` continua a dire
   *chi* sta trasmettendo (una trasmissione attiva a testa, come oggi); la nuova colonna
   dice *il repertorio di quale account* sta mostrando — quasi sempre il proprio, ma non
   necessariamente, se chi trasmette è anche collaboratore altrove (vedi punto 11).
7. **`roleOf` accetta l'account bersaglio.** Restano tre ruoli — admin, editor, viewer — ma
   editor/viewer smettono di essere un fatto globale sulla persona e diventano relativi
   a un account: `roleOf(email, ALLOWED_EMAILS, accountOwnerEmail, members)` risponde
   `admin` in due casi — l'email è un proprietario globale (ovunque, come oggi: il bypass
   non cambia), **oppure** l'email è la proprietaria *di quello specifico account*. Il
   secondo caso non è il primo travestito: un proprietario d'account ha pieno controllo
   solo lì, non su nessun altro account — vedere ed entrare in *tutti* gli account resta
   un potere del solo bypass globale, controllato a parte da chi mostra l'elenco (punto
   10), non da `roleOf`. Solo se nessuno dei due si applica si cerca la riga
   `(accountOwnerEmail, email)` in `members`, che non contiene mai `admin`: è un grado che
   nessun account può concedere a un collaboratore, per costruzione — vedi *Account
   (v3.0)* nella tabella delle Decisioni. `admitted()`, la guardia del login, resta invece
   un controllo **senza** account di destinazione: esiste se l'email è proprietaria
   globale **o compare in `members` per almeno un account qualsiasi** — è così che il
   cancello resta chiuso a chi nessuno ha mai invitato da nessuna parte, senza dover già
   sapere quale sarà il primo account che vedrà.
8. **Provisione automatica alla prima sign-in riuscita**, dentro `signIn` in `auth.ts`,
   accanto a `recordSignIn`: se l'email non ha ancora una riga in `accounts`, se ne crea
   una e si clona il canzoniere con `isExampleTemplate`, con le sue sezioni e i suoi brani,
   dentro il nuovo account. Idempotente per costruzione — controlla l'esistenza, non
   l'occasione — quindi può girare a ogni login senza bisogno di distinguere "il primo".
   Questo vale per **chiunque** superi `admitted()`, non solo per chi entra come
   proprietario: un invitato come semplice collaboratore in un account altrui riceve
   comunque il proprio, come richiesto.
9. **Account corrente: un cookie, non il token di sessione.** A differenza del ruolo — che
   resta fuori dal JWT per motivi di sicurezza (v2.1) — quale account si sta guardando è
   solo una preferenza di navigazione, e può vivere in un cookie semplice, riletto e
   **sempre riverificato** a ogni richiesta lato server: mai fidarsi del suo contenuto senza
   ricontrollare che l'email in sessione abbia davvero accesso (admin, proprietà, o riga in
   `members`) all'account che dice. Un cookie assente, invalido o che punta a un account non
   più accessibile ricade sempre sul proprio account — che è anche, così, il comportamento
   di default dopo il login, senza bisogno di un'azione dedicata a "apri il tuo account".
   Cambiare account è una server action che valida l'accesso e riscrive solo il cookie.
10. **`/utenti` diventa la gestione collaboratori dell'account corrente**; una nuova
    schermata (solo per chi ha ruolo admin) elenca tutti gli account dell'installazione,
    con un'azione "entra" per ciascuno che equivale a cambiare account. Nel menù, chi ha
    accesso a un solo account (il proprio, il caso comune) non vede alcun selettore — chi
    ne ha più di uno, perché è collaboratore altrove o perché è admin, sì.
11. **Sing Together trasmette l'account corrente**, non "il" repertorio: chi avvia una
    trasmissione deve avere editor o admin sull'account che ha aperto in quel momento — un
    viewer può seguire un canzoniere, non esporlo pubblicamente con un link. Le letture
    lato ospite (`guestReads.ts`) si filtrano per `broadcastAccountEmail` invece di leggere
    tutte le tabelle senza condizione.
12. **Slug globale + pagine statiche = una fuga di privacy**, scoperta durante
    l'implementazione e non prevista dall'interview: con lo slug tornato globale (punto 2),
    `/songs/[slug]` e `/songbooks/[slug]` restano generate a build time da
    `generateStaticParams`, il che le rende raggiungibili da **chiunque sia autenticato**,
    non solo da chi ha accesso all'account proprietario — indovinare uno slug altrui bastava.
    Il precache d'installazione (`scripts/precache-routes.ts`) aggravava la cosa scaricando
    ogni canzoniere di ogni account su ogni dispositivo, a prescindere da chi lo usa. Due
    strade erano possibili — accettare la fuga com'è (nessun altro account esiste ancora),
    o ricostruire il confine di privacy per davvero; la seconda è quella scelta, tutta in
    un'unica consegna piuttosto che in due tempi.
13. **Le pagine diventano dinamiche, il confine di privacy si sposta nel controllo
    d'accesso.** `generateStaticParams` viene rimosso da `/songs/[slug]` e
    `/songbooks/[slug]` (`export const dynamic = 'force-dynamic'` al suo posto); ogni
    caricamento risolve l'account proprietario della risorsa (`songAccountOf`/
    `songbookAccountOf`) e verifica `accessTo(accountOwnerEmail)` **prima** di leggere o
    restituire qualunque dato, con `notFound()` sia per "non esiste" sia per "esiste ma non
    è tuo" — indistinguibili di proposito, per non confermare a un estraneo che uno slug
    indovinato esiste davvero. La stessa distinzione vale ovunque una risorsa si raggiunga
    per slug/token invece che navigando l'account corrente: pagina di modifica, azioni di
    salvataggio/spostamento/cancellazione, letture lato ospite di Sing Together. Da qui
    anche la fine della tabella `builds` e del pannello "in attesa di pubblicazione": con
    ogni pagina dinamica, un salvataggio è live all'istante, non c'è più una build da
    aspettare.
14. **L'offline si ricostruisce senza un precache unico.** Il precache d'installazione si
    riduce a quattro rotte generiche (`/`, `/utenti`, `/password`, il manifest); la copertura
    offline per lettore arriva invece da due meccanismi nuovi — il service worker applica lo
    stesso controllo di sessione già usato per il precache anche alla cache di runtime delle
    pagine (`authenticatedPageCaching` in `sw.ts`, prima limitato all'installazione), e un
    warm-up in background (`OfflineSync`) che, una volta online, richiede da sé le pagine dei
    soli account a cui chi legge ha accesso — mai quelle di un account altrui.

**Migrazione dei dati esistenti, in ordine.** Il repertorio unico di oggi e i suoi
`members` diventano l'account di **f.limberti@gmail.com** — scelto perché l'altro indirizzo
di `ALLOWED_EMAILS`, f.limberti@3nd.it, riceve il proprio account personale vuoto al
prossimo login, come chiunque altro (punto 8), pur restando proprietario globale nel
frattempo. Concretamente: si crea la sua riga in `accounts`; si scrive `accountOwnerEmail`
su ogni riga esistente di `songbooks` con quel valore (`sections` e `songs` non hanno
bisogno di nulla, seguono `songbookSlug`); ogni riga attuale di `members` diventa una riga
`(accountOwnerEmail: f.limberti@gmail.com, email, role, addedBy, createdAt)` invariata nel
resto, cosa che preserva l'accesso di chi è già invitato senza bisogno di re-invitarlo;
`userSongPrefs` non richiede backfill (punto 5). Le eventuali trasmissioni Sing Together
già aperte al momento della migrazione, se presenti, si scartano piuttosto che collegarle a
un account: sono trasmissioni interrotte, non repertorio.

Il canzoniere Example esiste già (creato durante l'implementazione: un canzoniere dedicato,
non uno dei segnaposto di `content/`, che restano il repertorio "vero" del primo account);
resta da decidere se dargli un contenuto reale prima di flaggarlo `isExampleTemplate`, o
lasciarlo come punto di partenza vuoto — vedi la domanda aperta corrispondente.

## Vincoli d'ambiente

- **Node 18.20.8 in locale** (snap, nessun nvm), Node 24 su Vercel. Tailwind è fissato alla
  v3 perché il binding nativo `@tailwindcss/oxide` della v4 richiede Node ≥ 20. Ogni nuova
  dipendenza va verificata su Node 18 prima di entrare: **Serwist e drizzle-kit sono i due
  candidati a rompersi**, da provare per primi.
- Il build interroga Neon: se il database non è raggiungibile **il deploy fallisce**. È un
  compromesso accettato in cambio di pagine statiche, ma va saputo.
- **L'ordine di attivazione del database non è indifferente.** Il build genera le pagine dai
  dati che trova: se `DATABASE_URL` arriva su Vercel prima del seed, il build legge una
  tabella vuota e pubblica zero canzoni con una lista di precache vuota — un'app che sembra
  funzionante e non ha contenuti. La sequenza corretta è in `README.md`: crea Neon, `env
  pull`, migrate, seed, e **solo dopo** aggiungi la variabile in produzione.

## Scostamenti dal piano, emersi in implementazione

Ognuno è una scelta consapevole con un costo dichiarato, non una scorciatoia.

1. **Chiave naturale `slug` invece di un id surrogato.** Un file su disco ha uno slug e
   nient'altro: è questo che rende le due implementazioni del repository interscambiabili e
   permette di indicizzare le preferenze allo stesso modo in entrambe. Costo: rinominare uno
   slug orfana la trasposizione salvata di quel brano.
2. **`postgres.js` invece di `@neondatabase/serverless`.** Nulla tocca il database dall'edge:
   le sessioni sono JWT e il middleware non legge l'elenco degli ammessi — lo legge il
   callback di login, che gira in Node (v2.0). Quindi il driver HTTP non porta vantaggi, e la sua versione 1 richiede Node ≥ 19 mentre qui c'è 18.
3. **Cache di lettura locale per le preferenze.** Il piano diceva "solo DB". Ma una lettura di
   rete non può concludersi prima del primo paint, e offline non c'è alcun database da
   leggere: ogni brano si aprirebbe in tonalità originale senza memoria. Il DB resta l'unica
   fonte di verità e vince sempre in caso di conflitto; questa è una cache, e la coda di
   scrittura in memoria resta come deciso.
4. **Leggere dentro una scaletta è una rotta a sé** (`/scalette/[scaletta]/[brano]`) invece di
   un query param. Costo: una pagina statica per coppia. Vantaggi: precedente e successiva
   note al build, e URL di precache identiche a quelle richieste — un query param non farebbe
   parte della voce precachata. *(Rimossa in v2.0 insieme alle scalette. Lo stesso
   ragionamento vale ora per `/canzonieri/[slug]`.)*
5. **Toggle notazione inline nella barra** invece che dietro il menù `⋯`: un tap invece di
   due, e nessun popover da gestire.
6. **L'indice di ricerca viaggia nel payload della pagina** invece di essere un JSON separato:
   nessuna chiamata di rete e funziona offline per costruzione.
7. **Tema chiaro e scuro implementati subito**, chiudendo una domanda aperta: per un tablet
   letto in penombra non era rinviabile.
8. **Il precache deve includere a mano la scansione di `public/`**: `@serwist/next` la esegue
   solo se `additionalPrecacheEntries` è assente, e un array vuoto basta a saltarla. Passare
   le rotte delle pagine avrebbe silenziosamente smesso di precachare le icone.
9. **Gli script usano un `main()`**: `tsx` qui compila in CJS, dove il top-level await è un
   errore di build.

## Decisioni

| Decisione | Scelta | Perché |
|---|---|---|
| Sorgente dati | Postgres su Neon, seed da file | Fondazione per l'editor v2 senza rifare la UI |
| Sezioni (v2.3) | Tabella `sections` per canzoniere, id seriale | Ordine proprio, sezioni vuote possibili, rinomina gratis |
| Coerenza sezione/canzoniere | Chiave esterna composta, `on update cascade` | Il database rende impossibile la riga sbagliata; misurato, non dedotto |
| Disposizione | Un'azione sola per tutto il canzoniere | Trascinare oltre un'intestazione cambia tre cose insieme |
| Piega delle sezioni | `localStorage`, chiuse per default | È un gesto della mano, e deve funzionare offline |
| Scope v1 | Sola lettura, editor in v2 | Le funzioni di valore sono tutte sul lato lettura |
| Formato | ChordPro, accordi sopra il testo | Standard di fatto; rende trasposizione e notazione banali |
| Sigle italiane | Stile jazz: `Do-`, `Do△7` | Scelta esplicita dell'utente |
| Sigle internazionali | Standard: `Cm`, `Cmaj7` | Ogni sistema con la propria convenzione; in INT il display coincide col sorgente |
| Trasposizione | Stepper a semitoni, con la distanza da casa | Il gesto più rapido dal vivo: si alza finché la voce sta comoda. Il nome della tonalità è già su ogni accordo (v2.0) |
| Enarmonia | Segue la tonalità d'arrivo | `Sib` e non `La#`: è come si legge uno spartito |
| Auto-scroll | Velocità costante su 8 passi, salvata per brano | Correggibile al volo se si va fuori sincrono |
| Wake lock | Sempre attivo durante lo scroll | Senza, la funzione non serve a nulla |
| Controlli | Barra inferiore fissa | Un tap per fermare o trasporre, mai un menù da cercare |
| Zoom | Stepper globale a 6 passi, testo che rifluisce | Dipende dagli occhi e dal dispositivo, non dal brano |
| Preferenze per brano | Solo trasposizione e velocità | La tonalità comoda dipende dal brano; zoom e notazione sono abitudini stabili |
| Persistenza | Solo DB, sincronizzato | Con un'identità, preferenze che divergono fra dispositivi sarebbero una stranezza |
| Scrittura offline | Applicata subito, coda in memoria | Dal vivo funziona e nulla si perde in silenzio, senza logica di merge |
| Navigazione | Elenco dei canzonieri + ricerca su tutto | La prima domanda è quale canzoniere; la ricerca non appartiene a nessuno (v2.0) |
| Offline | PWA con pagine statiche precache | Sala prove e palco spesso non hanno rete |
| Accesso | Google OAuth + elenco in due metà | Chiude la questione copyright e dà l'identità per la sincronizzazione. Proprietari nell'ambiente, invitati in tabella (v2.0) |
| Ruoli | admin, editor, viewer; i proprietari sono admin (v2.1) | Chi entra e cosa può fare sono due domande, e la seconda non deve poter chiudere fuori nessuno dalla prima |
| Modi di entrare | Google + email e password (v2.2) | Due prove dello stesso indirizzo, non due account; scrypt dalla libreria standard, nessuna dipendenza nuova |
| Preferenze e ruoli | Aperte a tutti, viewer compresi | Trasporre non è modificare: è come una persona legge sul proprio schermo |
| Sessione | 90 giorni | Un token scaduto senza rete chiuderebbe fuori dal repertorio |
| Database | Neon via Vercel Marketplace | Variabili iniettate, zero configurazione manuale |
| Lingua UI | Solo italiano | Un utente, nessun bisogno di i18n |

### Canzonieri (v1.1)

| Decisione | Scelta | Perché |
|---|---|---|
| Cardinalità | Contenitore: un brano, un canzoniere | Lettura letterale del requisito; appartenenza sempre certa e rimozione con un significato ovvio |
| Proprietà | Il file dà il valore iniziale, poi comanda il DB | Senza questa regola il primo seed cancellerebbe ogni rinomina fatta dall'app |
| Slug del canzoniere | Immutabile, generato una volta | Rinominare non tocca chiavi esterne, URL né voci di precache |
| Rimozione | Rifiutata se non vuoto, con spostamento obbligato | Nessuna perdita possibile; `on delete restrict` la impone nel database |
| Cascata | Esclusa | Si annullerebbe da sola: i file esistono ancora e il primo seed farebbe risorgere i brani |
| URL dei brani | Invariata, il canzoniere non ne fa parte | Rinomine e spostamenti non rompono segnalibri, precache né preferenze |
| Rotta per canzoniere | `/canzonieri/[slug]`, dalla v2.0 | La rinomina non sposta niente (lo slug è immutabile), e aspettare la ricostruzione è il patto di ogni brano importato |
| Freschezza | Guscio statico + strato mutabile a runtime | Con precache cache-first un `revalidatePath` non arriverebbe mai al dispositivo |
| Home | Elenco dei canzonieri, uno per riga | Un tocco, una destinazione: la piega che si apriva lasciava i brani dentro la schermata sbagliata (v2.0) |
| Gestione offline | Disabilitata | Struttura condivisa fra account: un last-write-wins non è innocuo come su una trasposizione personale |
| Stato iniziale | Ricavato dai tag esistenti | I tag contenevano già questa categorizzazione |
| Pruning dei canzonieri | Escluso dal seed | Esistono legittimamente canzonieri che nessun file ha mai dichiarato |

### Import e modifica (v1.2)

| Decisione | Scelta | Perché |
|---|---|---|
| Proprietà dei brani | Il database, non i file | Scelta esplicita dell'utente; l'import scrive una riga e non committa nulla |
| Seed | Solo inserimento | Non può più aggiornare senza sovrascrivere le correzioni, né fare pruning senza cancellare gli import |
| Ingresso | Solo testo incollato | È come si trovano gli accordi; upload e URL scartati come poco usati o fragili |
| Formato | Riconosciuto da sé | ChordPro passa, il resto si converte: nessun formato da conoscere |
| Conversione | Euristica con preview obbligatoria | Sbaglierà su qualche sorgente, e la preview più il corpo modificabile sono la via d'uscita |
| Metadati | Dedotti e correggibili | Nel caso comune non si tocca nulla. La tonalità non è più fra loro (v2.0): la sanno gli accordi |
| Scope | Import, modifica e cancellazione | La cancellazione è obbligata: senza file da eliminare un errore sarebbe permanente |
| Duplicati | Avviso con sostituisci / aggiungi / annulla | Sostituire conserva lo slug, quindi le preferenze del brano sopravvivono |
| Pubblicazione | Esplicita, un build per gruppo | Lista, ricerca e precache si generano al build: un solo modello, e cinque brani costano un deploy |
| Stato «in attesa» | Confronto con il timbro del build | Riflette ciò che il build ha visto, non ciò che l'app crede di aver pubblicato |
| Backup | Export manuale scaricabile | Scelta esplicita dell'utente, senza token; il rischio di dimenticarlo è accettato |
| Ripristino | Il seed di solo inserimento | Dà all'export una via di rientro senza toccare ciò che esiste |

### Account (v3.0, pianificata)

| Decisione | Scelta | Perché |
|---|---|---|
| Account corrente | Cookie separato dal token di sessione, sempre riverificato lato server | Non è un fatto di sicurezza come il ruolo, ma una preferenza di navigazione; deve comunque non fidarsi di sé stesso |
| URL | Invariati, l'account non compare nella rotta | Coerente con l'architettura sottile attuale; il costo è che un link copiato dipende da quale account ha attivo chi lo apre — accettato, Sing Together resta a parte con i suoi token |
| Unicità di slug e brani | Globale, come prima della v3.0 — `accountOwnerEmail` resta una colonna su `songbooks`, non parte della chiave | Deciso in interview come chiave composta per account, poi rovesciato: `generateStaticParams` genera a build time, senza un account di richiesta con cui comporla. `uniqueSlug()` evita le collisioni alla clonazione dell'Example |
| Confine di privacy per slug globali | Pagine dinamiche (`force-dynamic`) con controllo d'accesso per-richiesta, non più la generazione statica | Uno slug globale raggiungibile da chiunque sia autenticato è una fuga; il controllo deve stare nel caricamento, non nel fatto che la pagina esista già pre-generata |
| Precache offline | Rimosso il precache d'installazione di tutti i brani; sostituito da caching di runtime autenticato (`sw.ts`) + warm-up per-lettore (`OfflineSync`) | Un unico precache per l'intera installazione scaricava ogni account su ogni dispositivo; con più account non c'è più un "tutti i brani" innocuo da precachizzare |
| Pannello "in attesa di pubblicazione" | Rimosso, con la tabella `builds` | Aveva senso quando un salvataggio aspettava una build; con le pagine dinamiche un salvataggio è live subito |
| Tabella `accounts` | Esplicita, non dedotta dai canzonieri | Un account deve poter esistere un istante prima che la clonazione gli scriva dentro qualcosa, e dà un bersaglio pulito alle chiavi esterne |
| Canzoniere Example | Nuovo, dedicato, distinto dai canzonieri segnaposto in `content/` | Il repertorio "vero" del primo account non deve fare anche da template per tutti gli altri |
| Come si segna l'Example | Flag booleano su `songbooks`, indice unico parziale | Spostarlo in futuro è un `UPDATE`, non un deploy |
| Cancello d'ingresso | Invariato: proprietario o già presente in `members` per qualunque account | Aprire l'accesso a chiunque non è stato chiesto; solo il repertorio si moltiplica, non chi può entrare |
| Creazione dell'account | Automatica al primo login riuscito, per chiunque superi il cancello | "Ogni utente ha il proprio account" è letto alla lettera, non solo per i proprietari |
| Ruolo nel proprio account | Sempre admin *di quell'account*, non rimovibile, ma senza il potere di vedere gli altri account | Un editor non gestisce la lista delle persone (regola già esistente, v2.1); chi possiede un account deve poterne gestire i collaboratori. Distinto dal bypass globale, altrimenti "admin" smetterebbe di voler dire "vede tutto" |
| `members.role` concedibile | Solo editor o viewer, mai admin | L'admin di un account non è un grado che si invita: o sei il proprietario, o sei un proprietario globale |
| Chi può trasmettere (Sing Together) | Editor o admin sull'account aperto in quel momento | Un viewer può seguire un canzoniere, non esporlo pubblicamente con un link |
| Preferenze globali (`userPrefs`) | Restano della persona, non dell'account | Zoom, notazione e strumento sono un'abitudine di lettura, non del repertorio guardato |
| Migrazione dei membri esistenti | Convertiti as-is sull'account del proprietario scelto | Nessuno deve essere re-invitato per non perdere l'accesso che ha già oggi |
| Account personale di chi c'era già | Creato al login successivo, stesso meccanismo dei nuovi utenti | Nessuna logica speciale in più solo per la migrazione |

## Domande aperte

1. **Capotasto** — escluso dalla v1 (lo stepper a semitoni copre il bisogno principale).
   Da riprendere se suonando emerge la necessità delle forme aperte.
2. **Diagrammi degli accordi** — fatti: ogni accordo sullo spartito è un bottone che apre la
   forma per chitarra in accordatura standard. Le diteggiature stanno in
   `src/lib/music/shapes.ts` e non vengono da `@tombatossals/chords-db`: sono una tabella
   corta di forme in posizione aperta più due forme mobili con la fondamentale sulla sesta o
   sulla quinta corda, così le dodici tonalità sono coperte senza portarsi dietro un
   database. Ogni voce è verificata dai test contro le note dell'accordo che dichiara di
   essere — nessuna nota estranea, e presenti quelle che fanno l'accordo. Restano fuori: una
   sola forma per accordo (nessuna alternativa), nessun capotasto, e le alterazioni della
   quinta (`7b5`, `7#5`) che non si possono semplificare senza suonare una nota sbagliata,
   per cui il popup mostra solo i nomi delle note.
3. **Quanti brani** — il piano regge fino a qualche centinaio: oltre, l'indice di ricerca
   client-side e la generazione statica completa vanno riconsiderati (ricerca full-text su
   Postgres, paginazione).
4. **Protezione Vercel** — con Google OAuth applicativo la Deployment Protection non serve;
   resta da decidere se tenere comunque `noindex` come cintura di sicurezza.
5. **Font di lettura** — non ancora scelto, e la scelta interagisce con due cose: la
   disponibilità dei glifi `△` e `°` e la leggibilità a distanza di leggìo. Da definire in
   `DESIGN.md`.
6. **Verifiche che richiedono un dispositivo reale** — in questo ambiente non c'è browser,
   quindi tre cose restano confermate solo per ispezione e non per uso: il comportamento
   offline effettivo dopo l'installazione della PWA, il round trip OAuth con Google, e la resa
   visiva dei glifi `△` e `°` nel font scelto. Sono le prime cose da provare su tablet.
7. **Toggle manuale del tema** — chiaro e scuro seguono `prefers-color-scheme`; resta da
   decidere se serve anche un interruttore in-app, utile se la penombra non coincide con
   l'orario di sistema.
8. **Direttive ChordPro estese** (`{capo}`, tablature, ritornelli ripetuti per riferimento)
   — ignorate in v1, da valutare quando emergono su brani reali.
9. **Ordinamento dei canzonieri** — alfabetico. Se in pratica serve un ordine tuo (il
   repertorio attivo per primo, l'archivio in fondo) va aggiunta una colonna `position` e un
   riordino a trascinamento, come già hanno i brani dentro un canzoniere. Ora che la home è
   l'elenco dei canzonieri, la domanda pesa più di prima.
10. ~~**Canzonieri condivisi o per utente**~~ — risolta dalla v3.0 (*Account*): ogni account
    ha i propri canzonieri, non più struttura condivisa fra tutti gli ammessi.
11. **Rinominare uno slug di brano** — non previsto nemmeno dall'import: lo slug si genera
    dal titolo alla creazione e poi resta. Cambiarlo orfanerebbe le preferenze salvate di
    quel brano, quindi servirebbe una tabella di alias.
12. **Come si produce l'archivio dell'export** — un `.chopro` per brano dentro uno zip
    richiede una libreria (`fflate` è piccola e senza dipendenze, da verificare su Node 18).
    L'alternativa senza dipendenze è un unico file JSON, che però il seed dovrebbe imparare a
    leggere e che non è più un archivio di `.chopro`. Da decidere in implementazione.
13. **Qualità della conversione** — l'euristica «accordi sopra il testo» fallirà su sorgenti
    con tabulazioni, etichette di sezione in mezzo, o accordi e testo sulla stessa riga. La
    preview e il corpo modificabile sono la mitigazione; se in pratica sbaglia troppo spesso
    su un sito che usi davvero, conviene aggiungere casi di test presi da lì.
14. **Brani in attesa non leggibili** — prima della pubblicazione un brano si vede solo nella
    preview dell'import. Se capiterà di volerlo provare a suonare subito, l'alternativa è una
    pagina di lettura dinamica per i soli brani in attesa, fuori dal precache.
15. ~~**Chi prende in carico il repertorio esistente (v3.0)**~~ — risolta: **f.limberti@gmail.com**.
    L'altro proprietario globale, f.limberti@3nd.it, riceve il proprio account personale
    (vuoto, con il solo Example) al prossimo login, come chiunque altro.
16. ~~**Contenuto del canzoniere Example (v3.0)**~~ — risolta per ora con un unico brano
    segnaposto ("Example Song"), aggiunto proprio per verificare la clonazione end-to-end
    (confermata contro il database reale: un secondo account provisionato ha ricevuto
    `example-2` con la sua sezione e il suo brano, slug tutti nuovi). Resta un contenuto
    editoriale vero e proprio da scrivere quando qualcuno vorrà curarlo, non un blocco
    tecnico.
17. ~~**Precache offline per account multipli (v3.0)**~~ — risolta: nessun precache
    d'installazione per i brani. Un salvataggio è live subito (pagine dinamiche), e la
    copertura offline arriva da un warm-up per-lettore che copre solo gli account a cui chi
    legge ha accesso — mai "tutti" indiscriminatamente.
18. **Cosa succede a un account se il suo proprietario esce da `ALLOWED_EMAILS` (v3.0)** —
    oggi non esiste alcun flusso di rimozione per un proprietario (è impossibile per
    costruzione, v2.0/v2.1). Se in futuro ne comparisse uno, resterebbe da decidere se il suo
    account e i suoi canzonieri restano raggiungibili da chi vi era stato invitato come
    collaboratore, o se anche quell'accesso decade con lui.
19. **Snapshot di `drizzle-kit` non aggiornato (v3.0)** — le due migrazioni di questa
    versione (0015/0016) sono scritte a mano, non generate: `drizzle-kit generate` chiede
    prompt interattivi (disambiguazione rinomina) che questo ambiente non può rispondere. Gli
    snapshot in `drizzle/meta/0015_snapshot.json` e `0016_snapshot.json` sono quindi copie
    invariate di quello precedente (v2.4), non una vera rappresentazione dello schema
    risultante. Il database reale è corretto — le migrazioni sono state verificate riga per
    riga contro di esso — ma il **prossimo** `npm run db:generate`, in un terminale vero,
    proporrà di ricreare da capo `accounts`, le colonne di `songbooks`, la chiave di
    `members` eccetera: da scartare, rigenerando invece lo snapshot a mano o rispondendo ai
    prompt per farlo combaciare con la realtà, prima di fidarsi del diff che propone.
