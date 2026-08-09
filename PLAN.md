# songs — Piano di implementazione

## Cosa è

Un'applicazione web privata per leggere testi e accordi del proprio repertorio, pensata
prima per tablet e telefono e poi per il computer. Il compito dell'app è una sola cosa
fatta bene: **tenere il testo leggibile e le mani libere mentre si suona**. Da qui
derivano zoom, auto-scroll, cambio di tonalità e cambio di notazione — non come
impostazioni in un menù, ma come controlli a portata di pollice.

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

Il punto chiave è che **il DB non sta sul percorso di lettura**:

```
build      Neon ──SELECT──▶ generateStaticParams ──▶ /canzoni/[slug] statiche
                        └──▶ /api index di ricerca (JSON statico)
runtime    lettura  ──▶ pagina statica (o cache del service worker)
           scrittura ──▶ server action ──▶ Neon   (solo preferenze)
```

Le pagine dei brani sono generate al build leggendo Neon, quindi a runtime la lettura non
paga né latenza di database né cold start. Il DB viene scritto solo per le preferenze — e
sono quelle scritture, non le letture, a pagare l'autosuspend di Neon: il primo `+1` dopo un
periodo di inattività attende il risveglio del database. La coda di scrittura rende
l'attesa invisibile sullo schermo, ma esiste.
Dopo una modifica ai contenuti serve una rivalidazione: in v1 la fa il deploy che segue il
seed, in v2 la farà `revalidatePath()` al salvataggio dall'editor.

**Conseguenza da gestire:** le pagine statiche sono identiche per tutti, quindi non possono
contenere le preferenze dell'utente. La pagina viene servita nella tonalità originale e le
preferenze si applicano lato client. Per evitare un lampo di accordi nella tonalità
sbagliata, gli accordi vivono nel markup come dati strutturati e la trasposizione si applica
in un `useLayoutEffect` prima del paint.

### Modello dati

```sql
songs(id, slug unique, title, artist, original_key, body, tags[], created_at, updated_at)
setlists(id, slug unique, name, position, created_at)
setlist_songs(setlist_id, song_id, position, primary key (setlist_id, position))

user_prefs(user_email primary key, zoom_step, notation)              -- globali
user_song_prefs(user_email, song_id, semitones, scroll_speed,        -- per brano
                updated_at, primary key (user_email, song_id))
```

`user_email` come chiave: con sessioni JWT e allowlist non serve una tabella utenti.

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
duplica nulla. In v2 il DB diventa la fonte di verità e i file restano solo bootstrap.

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

- **Lista brani**: titolo, artista e tonalità, ordinabile per titolo o artista.
- **Ricerca istantanea** lato client su titolo, artista, tag e testo (accordi esclusi),
  contro un indice JSON generato al build. Nessuna chiamata di rete mentre si scrive.
- **Scalette**: definite nei file di seed e in sola lettura in v1. Una scaletta apre in
  sequenza con `‹ prec` / `succ ›` in fondo al brano, così durante la serata non si torna
  mai alla lista. Cambiarne una richiede commit e deploy: sono repertori curati, non liste
  improvvisate.

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

### v2 — scrittura

`/admin` con CRUD brani e scalette, preview live, `revalidatePath()` al salvataggio,
allowlist spostata su tabella, import da file. Il layer di accesso dati della v1 va scritto
già pensando a questo, così l'editor non obbliga a toccare la UI di lettura.

## Vincoli d'ambiente

- **Node 18.20.8 in locale** (snap, nessun nvm), Node 24 su Vercel. Tailwind è fissato alla
  v3 perché il binding nativo `@tailwindcss/oxide` della v4 richiede Node ≥ 20. Ogni nuova
  dipendenza va verificata su Node 18 prima di entrare: **Serwist e drizzle-kit sono i due
  candidati a rompersi**, da provare per primi.
- Il build interroga Neon: se il database non è raggiungibile **il deploy fallisce**. È un
  compromesso accettato in cambio di pagine statiche, ma va saputo.

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

## Domande aperte

1. **Capotasto** — escluso dalla v1 (lo stepper a semitoni copre il bisogno principale).
   Da riprendere se suonando emerge la necessità delle forme aperte.
2. **Diagrammi degli accordi** — non richiesti, ma `@tombatossals/chords-db` è già usato in
   `easy-guitar-tuner` e sarebbe riusabile a costo basso. Da valutare in v2.
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
