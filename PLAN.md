# songs — Piano di implementazione

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
file a una cartella. Le **scalette** sono un'altra cosa e restano trasversali — il programma
di una serata, che può pescare da canzonieri diversi.

Non è un archivio pubblico né un social di accordi: l'accesso è riservato a una lista di
email autorizzate.

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

songs(slug primary key, title, artist, original_key, body, tags[],
      canzoniere_slug references canzonieri(slug) on delete restrict,
      position,                                                      -- v1.6, nullable
      created_at, updated_at)

setlists(slug primary key, name, position, created_at)
setlist_songs(setlist_slug, song_slug, position,
              primary key (setlist_slug, position))

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

`user_email` come chiave: con sessioni JWT e allowlist non serve una tabella utenti.
Lo `slug` come chiave naturale al posto di un id surrogato: vedi *Scostamenti*.

**Lo slug di un canzoniere è immutabile.** Si genera una volta dal nome iniziale e non
cambia mai più: rinominare tocca solo `name`. È questo che rende una rinomina gratuita —
nessuna chiave esterna da aggiornare, nessuna URL che si sposta, nessuna voce di precache
da rigenerare.

L'`on delete restrict` è la regola "rifiuta se non è vuoto" scritta nel database, non solo
nella UI: nessun percorso, nemmeno un errore di programmazione, può cancellare un
canzoniere lasciando brani orfani.

**`songs.position` è nullable e resta null** finché qualcuno non riordina quel canzoniere o
non ci importa dentro. Non è un dettaglio implementativo: `null` significa «nessuno ha detto»,
e Postgres lo mette in fondo a un ordinamento crescente, quindi l'ordine alfabetico è il
comportamento di default senza una riga di codice che lo produca — verificato interrogando
Postgres, non la tabella. Un riordino, e ogni import, rinumerano l'intero canzoniere da 1 a N.

### Contenuti e seed

Sorgente di verità in v1: file nel repo, caricati da uno script.

```
content/
  certe-notti.chopro
  bocca-di-rosa.chopro
  setlists/
    sabato-blu.yml          # nome + elenco ordinato di slug
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
dall'app, quindi esistono legittimamente righe che nessun file ha mai dichiarato — la
regola "cancella ciò che non ha un file" vale per brani e scalette, non per loro.

Un file senza la direttiva finisce in **Da ordinare**, un canzoniere creato al bisogno.
Serve perché ogni brano deve appartenere a uno, e il nome è deliberatamente un promemoria:
ciò che non è archiviato si vede a colpo d'occhio.

### Autenticazione

- Auth.js v5, unico provider Google, sessioni JWT (nessun adapter, nessuna tabella auth).
- Il callback `signIn` confronta l'email con `ALLOWED_EMAILS` (lista separata da virgole);
  qualunque altro account Google valido viene respinto con una pagina dedicata.
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
{key: C}
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

La tonalità d'arrivo si calcola dalla `original_key` del brano più i semitoni.

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
stanno nel `⋯`. L'header mostra la tonalità corrente accanto all'originale, con un tap per
tornare all'originale.

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

## Navigazione, ricerca, scalette

- **Lista brani**: titolo, artista, canzoniere e tonalità, ordinabile per titolo o artista.
- **Ricerca istantanea** lato client su titolo, artista, tag e testo (accordi esclusi),
  contro un indice JSON generato al build. Nessuna chiamata di rete mentre si scrive. La
  ricerca lavora sempre su **tutti** i brani, anche con un filtro canzoniere attivo: il
  filtro restringe la lista, non il campo d'azione della ricerca.
- **Filtro canzoniere**: una riga di chip sotto la ricerca (`tutti`, poi un chip per
  canzoniere). Così la strada più breve per arrivare a un brano non si allunga di un tap,
  che è il punto dell'app.
- **Scalette**: definite nei file di seed e in sola lettura in v1. Restano **trasversali** —
  una serata può mescolare brani di canzonieri diversi, ed è l'unica forma che funziona per
  quello che una scaletta è: un ordine di esecuzione, non una libreria. Una scaletta apre in
  sequenza con le frecce nell'header, così durante la serata non si torna mai alla lista.
  Cambiarne una richiede commit e deploy.

## Canzonieri

Un canzoniere è una **libreria**: ogni brano appartiene a uno e uno solo, come un file in
una cartella. È un concetto diverso dalla scaletta, che è un programma, e diverso dai tag,
che restano descrizioni libere e sovrapponibili (`lento`, `acustico`).

Si possono **creare, rinominare, spostare brani fra l'uno e l'altro e rimuovere**, e tutto
questo dall'app, non dai file.

### Perché il canzoniere non ha una rotta propria

Sembrerebbe naturale dare a ogni canzoniere una pagina come `/canzonieri/repertorio`. Non lo
facciamo, e la ragione è che due delle funzioni richieste la renderebbero fragile:

- un canzoniere **creato dall'app** non esisterebbe fra le rotte generate al build, quindi
  non sarebbe precachato e offline non esisterebbe fino al deploy successivo;
- una **rinomina** sposterebbe la rotta, se lo slug seguisse il nome — e se non lo segue, la
  URL resta legata a un nome vecchio, che è peggio.

Il canzoniere non ha quindi una vista propria: **aprirlo vuol dire aprire la sua prima
canzone**, e da lì le frecce nell'header scorrono le altre. La home offre i canzonieri in
riga sotto la ricerca e non elenca brani; i brani compaiono solo come risultati di ricerca.
L'ordine su cui scorrono le frecce è quello del build, come tutto il resto della pagina: se
un brano cambia canzoniere nel database, i vicini restano quelli vecchi fino alla
pubblicazione successiva.

Storicamente la vista era la lista filtrata su `/?c=repertorio`. Non c'è più nulla che
produca quel parametro, ma `c` resta in `ignoreURLParametersMatching` di Serwist perché un
vecchio segnalibro continui a trovare la home in cache anche offline.

Una sola rotta nuova, statica e precachata: **`/canzonieri`**, la schermata di gestione.

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
modificabili, formato e tonalità in chiaro, il testo dentro un `details`. Si scrive solo
premendo *Importa*, in sequenza, e ogni riga dice come è finita — salvato, già in archivio,
oppure l'errore. Ripremere riprova solo ciò che manca.

```
3 brani in questo testo                      incolla altro
┌───────────────────────────────────────────────────────┐
│ ① [ Certe notti        ] [ Ligabue      ]           × │
│   accordi sopra il testo, convertiti   Fa (stimata)   │
│   ▸ Testo e accordi                                   │
├───────────────────────────────────────────────────────┤
│ ② [ Albachiara         ] [ Vasco Rossi  ]  ✓ salvato  │
└───────────────────────────────────────────────────────┘
Se un brano è già in archivio [ salta quelli già presenti ▾ ]
[ Importa 3 brani ]
```

### Il form

Per un brano solo. Titolo e artista si deducono dalle direttive se ci sono, altrimenti dalle
prime righe. La tonalità si stima dagli accordi ed è **mostrata come stima**, perché da essa
dipendono l'etichetta «originale» e la grafia enarmonica quando trasponi. Il canzoniere non
è fra i campi: l'ha già chiesto la schermata, sopra. Lo slug si genera dal titolo con
`uniqueSlug`, lo stesso già usato per i canzonieri.

```
Titolo   [ Certe notti          ]
Artista  [ Ligabue              ]
Tonalità [ Do ▾ ] stimata
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

Resta fuori l'elenco **dentro una scaletta**: i titoli lì vengono dal build, quindi un brano
rinominato compare col nome vecchio finché non si pubblica. Aprirlo dà la versione giusta —
la pagina del brano ha il suo strato — ed è per questo che la riga può aspettare: raggiungere
quelle pagine dalla scrittura vorrebbe dire cercare in quali scalette sta il brano.

L'elenco in home, invece, non viene messo in cache. Una riga lì è la promessa che toccandola si apre
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

### v2 — il resto

Scalette modificabili dall'app, allowlist su tabella, ordinamento manuale dei canzonieri.
Dopo la v1.2 restano queste, non l'editor: quello sarà già fatto.

Nota la progressione deliberata: la v1.1 ha aperto il percorso di scrittura su una superficie
minima — nomi e appartenenza — e la v1.2 lo estende al contenuto. Ogni passo ha portato una
regola nuova su chi possiede cosa, ed è la parte da rileggere prima di toccare il seed.

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
2. **`postgres.js` invece di `@neondatabase/serverless`.** Nulla tocca il database dall'edge —
   le sessioni sono JWT e l'allowlist è una variabile d'ambiente — quindi il driver HTTP non
   porta vantaggi, e la sua versione 1 richiede Node ≥ 19 mentre qui c'è 18.
3. **Cache di lettura locale per le preferenze.** Il piano diceva "solo DB". Ma una lettura di
   rete non può concludersi prima del primo paint, e offline non c'è alcun database da
   leggere: ogni brano si aprirebbe in tonalità originale senza memoria. Il DB resta l'unica
   fonte di verità e vince sempre in caso di conflitto; questa è una cache, e la coda di
   scrittura in memoria resta come deciso.
4. **Leggere dentro una scaletta è una rotta a sé** (`/scalette/[scaletta]/[brano]`) invece di
   un query param. Costo: una pagina statica per coppia. Vantaggi: precedente e successiva
   note al build, e URL di precache identiche a quelle richieste — un query param non farebbe
   parte della voce precachata.
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
| Scope v1 | Sola lettura, editor in v2 | Le funzioni di valore sono tutte sul lato lettura |
| Formato | ChordPro, accordi sopra il testo | Standard di fatto; rende trasposizione e notazione banali |
| Sigle italiane | Stile jazz: `Do-`, `Do△7` | Scelta esplicita dell'utente |
| Sigle internazionali | Standard: `Cm`, `Cmaj7` | Ogni sistema con la propria convenzione; in INT il display coincide col sorgente |
| Trasposizione | Stepper a semitoni con tonalità risultante | Il gesto più rapido dal vivo: si alza finché la voce sta comoda |
| Enarmonia | Segue la tonalità d'arrivo | `Sib` e non `La#`: è come si legge uno spartito |
| Auto-scroll | Velocità costante su 8 passi, salvata per brano | Correggibile al volo se si va fuori sincrono |
| Wake lock | Sempre attivo durante lo scroll | Senza, la funzione non serve a nulla |
| Controlli | Barra inferiore fissa | Un tap per fermare o trasporre, mai un menù da cercare |
| Zoom | Stepper globale a 6 passi, testo che rifluisce | Dipende dagli occhi e dal dispositivo, non dal brano |
| Preferenze per brano | Solo trasposizione e velocità | La tonalità comoda dipende dal brano; zoom e notazione sono abitudini stabili |
| Persistenza | Solo DB, sincronizzato | Con un'identità, preferenze che divergono fra dispositivi sarebbero una stranezza |
| Scrittura offline | Applicata subito, coda in memoria | Dal vivo funziona e nulla si perde in silenzio, senza logica di merge |
| Navigazione | Lista con ricerca + scalette | Le scalette rendono l'app uno strumento da palco |
| Scalette v1 | Nei file di seed, sola lettura | Repertori curati, non liste improvvisate |
| Offline | PWA con pagine statiche precache | Sala prove e palco spesso non hanno rete |
| Accesso | Google OAuth + allowlist email | Chiude la questione copyright e dà l'identità per la sincronizzazione |
| Sessione | 90 giorni | Un token scaduto senza rete chiuderebbe fuori dal repertorio |
| Database | Neon via Vercel Marketplace | Variabili iniettate, zero configurazione manuale |
| Lingua UI | Solo italiano | Un utente, nessun bisogno di i18n |

### Canzonieri (v1.1)

| Decisione | Scelta | Perché |
|---|---|---|
| Cardinalità | Contenitore: un brano, un canzoniere | Lettura letterale del requisito; appartenenza sempre certa e rimozione con un significato ovvio |
| Rapporto con le scalette | Scalette trasversali | Una serata può mescolare repertori; la scaletta è un ordine, non una libreria |
| Proprietà | Il file dà il valore iniziale, poi comanda il DB | Senza questa regola il primo seed cancellerebbe ogni rinomina fatta dall'app |
| Slug del canzoniere | Immutabile, generato una volta | Rinominare non tocca chiavi esterne, URL né voci di precache |
| Rimozione | Rifiutata se non vuoto, con spostamento obbligato | Nessuna perdita possibile; `on delete restrict` la impone nel database |
| Cascata | Esclusa | Si annullerebbe da sola: i file esistono ancora e il primo seed farebbe risorgere i brani |
| URL dei brani | Invariata, canzoniere come filtro `?c=` | Rinomine e spostamenti non rompono segnalibri, precache né preferenze |
| Rotta per canzoniere | Nessuna | Un canzoniere creato dall'app non sarebbe precachato, e una rinomina sposterebbe la rotta |
| Freschezza | Guscio statico + strato mutabile a runtime | Con precache cache-first un `revalidatePath` non arriverebbe mai al dispositivo |
| Home | Elenco piatto con chip di filtro | La strada più breve verso un brano non si allunga di un tap |
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
| Metadati | Dedotti e correggibili | Nel caso comune non si tocca nulla; la tonalità è marcata come stima perché ne dipende l'enarmonia |
| Scope | Import, modifica e cancellazione | La cancellazione è obbligata: senza file da eliminare un errore sarebbe permanente |
| Duplicati | Avviso con sostituisci / aggiungi / annulla | Sostituire conserva lo slug, quindi le preferenze del brano sopravvivono |
| Pubblicazione | Esplicita, un build per gruppo | Lista, ricerca e precache si generano al build: un solo modello, e cinque brani costano un deploy |
| Stato «in attesa» | Confronto con il timbro del build | Riflette ciò che il build ha visto, non ciò che l'app crede di aver pubblicato |
| Backup | Export manuale scaricabile | Scelta esplicita dell'utente, senza token; il rischio di dimenticarlo è accettato |
| Ripristino | Il seed di solo inserimento | Dà all'export una via di rientro senza toccare ciò che esiste |

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
   repertorio attivo per primo, l'archivio in fondo) va aggiunta una colonna `position` e
   un riordino a trascinamento, come già hanno le scalette.
10. **Canzonieri condivisi o per utente** — sono struttura della libreria, quindi condivisi
    fra gli account in allowlist, come i brani. Va riconsiderato solo se entrasse qualcuno
    che vuole un proprio ordinamento del materiale comune.
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
