# songs

Testi e accordi del proprio repertorio, da leggere su tablet e telefono: zoom,
scorrimento automatico, cambio di tonalità, capotasto e notazione italiana o
internazionale. Accesso riservato a una lista di indirizzi.

- Produzione: https://songs.sisqo.dev
- Repo: https://github.com/sisqo/songs
- Progetto e decisioni: [PLAN.md](PLAN.md)

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # parser, motore musicale, allowlist, fixture
npm run build    # genera le rotte da precachare, poi builda
```

Senza `DATABASE_URL` l'app legge le canzoni direttamente da `content/`. È il modo
normale di lavorare in locale: non serve un database per vedere l'app funzionare.

## Aggiungere una canzone

Dall'app, in `/importa`, in due passi: **prima scegli il canzoniere** dove finiranno
i brani — è il primo campo della schermata, e da lì si può anche crearne uno nuovo —
poi incolli il testo. L'app riconosce se è già ChordPro o se sono accordi sopra il
testo e converte, deduce titolo, artista e tonalità, e mostra il risultato prima di
salvare.

Il canzoniere scelto **vince** su quello che dice il testo: se un brano porta un
`{canzoniere: …}` — succede reimportando un export — la riga lo segnala e lo ignora.

### Più brani in un colpo

Se nel testo incollato ci sono più brani, l'app li divide e ne mostra uno per riga,
con titolo e artista modificabili e il testo a un tocco di distanza. Nulla viene
scritto finché non premi *Importa*; poi ogni riga dice cos'è successo a sé, e i brani
si salvano uno alla volta, in ordine.

I brani vanno separati da uno di questi segni, e solo da questi:

| Segno | Da dove arriva |
|---|---|
| Una riga di `---` (o `===`, `***`, `___`) | quello che si scrive a mano incollando due brani |
| `{ns}` o `{new_song}` | il separatore di ChordPro per i file multi-brano |
| Un secondo `{title: …}` | un export: la riga del titolo resta al brano che apre |
| Un salto pagina (`\f`) | testo estratto da un PDF |

Una riga vuota **non** separa: le canzoni sono piene di righe vuote fra le strofe, e
indovinare lì significa spezzare un brano in cinque. Senza segni è un brano solo —
che è il modo giusto di sbagliare, perché si vede prima di salvare.

Se due brani hanno lo stesso titolo *e* artista di uno già in archivio, decidi una
volta per tutto il gruppo: saltarli, sostituirli o aggiungerli comunque. Stesso
titolo con artista diverso è una cover, quindi passa.

Correggere e cancellare si fanno **nell'editor**, `/canzoni/<slug>/modifica`, che si
apre dal pulsante *Modifica* sotto lo spartito.

Quello che salvi **si vede subito**: la pagina del brano e l'elenco chiedono al
database la versione corrente e la mettono sopra quella generata al build, quindi una
correzione appare senza aspettare nulla. Il confronto è per versione — `updated_at`
del database contro quello con cui la pagina è stata generata — perciò la copia
fresca resta al suo posto per tutta la durata del deploy che la sta incorporando, e
si fa da parte appena arriva la pagina nuova.

La **pubblicazione** serve ancora, ma per una cosa sola: incorporare le modifiche
nelle pagine statiche e nel precache, cioè renderle disponibili **senza
connessione**. La schermata elenca i brani non ancora nel sito, e `Pubblica` lancia
la ricostruzione per tutto il gruppo, poi resta in attesa finché il build non li
prende in carico — quello che la lista può dire con certezza, dato che il build
timbra il database quando parte. Serve `DEPLOY_HOOK_URL`, un deploy hook creato su
Vercel in Settings → Git → Deploy Hooks.

Un brano importato adesso è cliccabile dall'elenco anche prima della pubblicazione:
la sua rotta non esiste fra quelle generate, e Next la genera su richiesta. Offline
no, per lo stesso motivo — non è nel precache — ed è per questo che l'elenco, quando
il server non risponde, resta quello del build, dove ogni riga porta da qualche
parte.

Il database è la sorgente di verità dei brani, quindi **non c'è cronologia git**: il
pulsante *Scarica tutto* produce un archivio dei `.chopro` da conservare. Per
ripristinarlo, rimetti i file in `content/` e lancia `npm run seed`, che inserisce
solo ciò che manca.

Cosa l'archivio **non** porta con sé: l'ordine dei brani dentro il canzoniere. Un
file `.chopro` sa a quale canzoniere appartiene — c'è una direttiva per quello — ma il
suo posto nella fila non è un fatto del brano, e inventare una direttiva non standard
per scriverlo dentro renderebbe quei file meno leggibili da qualsiasi altro programma.
Dopo un ripristino i canzonieri tornano in ordine alfabetico.

### Via file, come bootstrap

Un file `content/<slug>.chopro`, dove lo slug diventa l'URL:

```
{title: Titolo}
{artist: Autore}
{key: Bb}
{tags: lento}
{canzoniere: Repertorio}

[Bb]Prima [Eb]riga del [F]testo

{start_of_chorus}
[Gm7]Ritornello
{end_of_chorus}
```

Gli accordi si possono scrivere in **entrambe le notazioni**: `[Bb]` e `[sib]`, `[D]`
e `[re]`, `[Em7]` e `[mi-7]`. Vengono letti allo stesso modo e mostrati nella
notazione scelta da chi legge, quindi un brano preso da una fonte italiana si
traspone e mostra i diagrammi come uno scritto in internazionale.

Due dettagli di questa lettura, entrambi coperti dai test:

- `Do` è **C**, non un Re diminuito scritto con l'alias `o`. Chi intende il
  diminuito scrive `sol°` o `soldim`.
- Le parole italiane che finiscono in `o` e iniziano con un nome di nota —
  `[solo]`, `[mio]` — **non** sono accordi: resterebbero fuori dal testo. Vale
  anche nell'import, dove una riga come `la la la la` è testo cantato e non una
  riga di accordi: a distinguerla è la spaziatura, perché una riga di accordi è
  allineata sulle sillabe e ha spazi larghi.

`{canzoniere}` dice **soltanto dove il brano nasce**: il seed lo applica
all'inserimento, o quando la colonna è ancora vuota, e da lì in poi comanda il
database. Un file senza la direttiva finisce in "Da ordinare". Rinominare o
spostare si fa dall'app, e un `npm run seed` successivo non lo disfa.

Il seed è di **solo inserimento**: carica ciò che manca e non aggiorna né cancella
mai un brano, perché una riga esistente può portare una correzione fatta dall'app.
Effetto da conoscere: se cancelli un brano dall'app e il suo file è ancora in
`content/`, il prossimo seed lo **reinserisce**. Quando entrerà il repertorio vero,
i quattro segnaposto vanno rimossi dal repo.

Le scalette sono file YAML in `content/setlists/` con un nome e l'elenco ordinato
degli slug, e restano **trasversali**: possono mescolare brani di canzonieri
diversi. In v1 sono in sola lettura: cambiarle richiede un commit.

Una cosa che resta ferma al build: **l'elenco dentro una scaletta** mostra i titoli
come erano all'ultima pubblicazione, quindi un brano rinominato compare lì col nome
vecchio finché non pubblichi. Aprendolo, il brano è quello giusto e aggiornato — è
solo la riga dell'elenco a restare indietro.

## Editor

Tre modi di guardare lo stesso brano, con una sola sorgente sotto: quello che cambi
in uno c'è già nell'altro.

- **Grafico** — lo spartito modificabile. Le parole sono campi di testo veri, quindi
  cursore, selezione e tastiera del telefono funzionano come dovrebbero; gli accordi
  stanno nella riga sopra, ognuno appeso alla lettera cui appartiene.
  - **Tocca la riga degli accordi** sopra una sillaba per metterne uno lì.
  - Tocca un accordo per cambiarlo; **‹ ›** lo spostano di una lettera (o Alt con le
    frecce), e svuotarlo lo toglie.
  - Ogni riga che non è testo — stacco, inizio e fine di ritornello, direttive —
    ha il suo **×**.
  - Invio divide la riga, Backspace a inizio riga la unisce a quella sopra.
- **Sorgente** — il ChordPro come sta nel file, senza aiuti.
- **Anteprima** — il brano come si legge, con la barra dei controlli vera. Trasporre
  qui trasporta davvero: è la stessa preferenza che ti ritrovi sul palco.

I comandi agiscono sulla riga dove sta il cursore, in entrambe le modalità di
modifica: **Accordo** (dove sei, l'equivalente da tastiera del tocco sulla riga),
**Ritornello** e **Ponte** (marcano il blocco di righe fra due stacchi, e premuti di
nuovo lo smarcano), **Commento**, **Elimina riga**. C'è **Annulla**: un passo per comando, e uno per ogni raffica di scrittura
invece di uno per lettera.

Uscire con modifiche non salvate chiede conferma — anche dall'header e dal menù, che
sono navigazioni interne e non farebbero scattare nessun avviso del browser.

Gli accordi restano attaccati alle sillabe anche mentre riscrivi le parole, e una
direttiva che il lettore ignora — `{new_song}`, o qualsiasi altra — non viene buttata
via: aprire un brano nell'editor e salvarlo senza toccare nulla restituisce lo stesso
file, byte per byte. È la proprietà su cui poggia tutto il resto, e ha i suoi test.

L'editor è l'unica pagina **non** statica e non precachata: deve mostrare la versione
che il database ha adesso, e senza rete non potrebbe comunque salvare. Quindi offline
non si apre — mentre i brani si leggono. Se la rete cade mentre stai scrivendo, il
salvataggio lo dice e il testo resta sullo schermo.

## Icone

`npm run icons` rigenera favicon, icone PWA e icona iOS da `scripts/icons.ts`; gli
output sono committati, quindi il build normale non le tocca. Il disegno è due accordi
sopra le righe di un testo, nei colori del tema scuro — e alle misure piccole diventa
una composizione più semplice invece di rimpicciolirsi in una macchia.

## Canzonieri

Ogni brano appartiene a un canzoniere. Si creano, rinominano e rimuovono da
`/canzonieri`, e se ne crea uno anche in `/importa`, dove serve — appena creato è già
la destinazione dell'import. **Spostare un brano** si fa dal campo *Canzoniere*
nell'editor, `/canzoni/<slug>/modifica`. La rimozione di un canzoniere non vuoto chiede
prima dove spostare i brani — e il vincolo `on delete restrict` la impedisce comunque a
livello di database.

L'elenco dei canzonieri che `/importa` offre è quello del database, non quello del
build: uno creato un minuto prima da `/canzonieri` non ha una pagina da aspettare, e
una destinazione mancante all'appello sarebbe la stessa cosa di un brano vecchio.

Non esiste una rotta `/canzonieri/[slug]`: uno creato dall'app non sarebbe fra le
rotte generate al build, quindi non sarebbe precachato, e una rinomina sposterebbe
la rotta. In home ogni canzoniere è una **card che si apre** sui suoi brani, e resta
tutto su quella pagina — che è l'unico modo perché funzioni anche senza connessione.
Dalla pagina del brano le frecce nell'header scorrono le altre del canzoniere. Un
brano senza canzoniere finisce sotto una voce «Senza canzoniere», e un database senza
canzonieri fa ricomparire la lista completa: in nessun caso un brano resta
irraggiungibile.

### L'ordine dei brani

Dentro un canzoniere aperto, in home, il pulsante **Riordina** mette una maniglia su
ogni riga: si trascina col dito o col mouse, e la riga sotto il dito si sposta appena
lo supera. Con la maniglia a fuoco funzionano anche ↑ e ↓, così l'ordine si può
sistemare anche da tastiera. Ogni spostamento è salvato appena la riga si posa, e
*Fatto* rimette i collegamenti al loro posto.

Finché nessuno lo tocca l'ordine è alfabetico: la colonna `position` è `null`, e
Postgres mette i null in fondo a un ordinamento crescente, quindi un canzoniere mai
sistemato è in ordine di titolo. Al primo trascinamento — o al primo import — il
canzoniere viene rinumerato tutto, da 1 a N, nell'ordine in cui era in quel momento.
Da lì in poi l'ordine è esplicito: rinominare un brano non lo fa più risalire, e ogni
brano nuovo si accoda alla fine.

**I brani importati restano nell'ordine in cui li hai incollati**, ed è per questo che
un import numera il canzoniere: se i nuovi arrivassero con un numero e i vecchi
restassero `null`, i nuovi finirebbero *primi*, perché i null stanno in fondo.
Spostare un brano in un altro canzoniere lo lascia invece senza numero, quindi arriva
in coda — dove un brano che nessuno ha ancora ordinato appartiene.

La ricerca resta **alfabetica**: dentro un canzoniere l'ordine è quello che hai
scelto, ma fra canzonieri diversi non è un ordine — i risultati arriverebbero come il
primo brano di ognuno, poi i secondi, e in una lista di risultati serve l'ordine che
si può prevedere.

L'ordine su cui scorrono **le frecce** è quello del build, come i vicini di un brano
appena spostato di canzoniere: restano quelli vecchi fino alla ricostruzione
successiva. È l'unica parte della pagina che resta ferma al build, e volutamente: le
frecce portano ad altre pagine statiche, generate con la stessa lista di questa,
mentre le parole che stai leggendo arrivano dal database. Riordinare non mette i brani
«in attesa di pubblicazione» — nessun testo è cambiato — quindi per allineare le
frecce si usa *Ricostruisci ora*.

Il filtro `/?c=slug` non è più generato da nessun elemento dell'interfaccia; la
regola `c` in `ignoreURLParametersMatching` di Serwist resta al suo posto perché un
vecchio segnalibro continui a trovare la home in cache.

## Tonalità e capotasto

Due controlli nel pannello di lettura, e rispondono a due domande diverse:

| | Cambia il suono | Cambia le forme |
|---|---|---|
| **Tonalità** (−1 / +1) | **sì** | sì |
| **Capotasto** (0–7) | no | **sì** |

Il capotasto fa quello che fa sulla chitarra: dici a quale tasto lo metti e lo spartito
mostra **le forme da fare**, non gli accordi che suonano. Un brano in Re col capotasto
al 2 si legge in Do e continua a suonare in Re. Una formula sola:

```
accordo letto   = accordo scritto + semitoni − capotasto
accordo sonante = accordo scritto + semitoni
```

Gli accordi letti si scrivono con le alterazioni della tonalità **letta**, perché quelle
sono le lettere che hai davanti; la tonalità che suona la dichiara una pastiglia sotto
il titolo — «capotasto 2° tasto · suona in Re» — che compare solo col capotasto
inserito. Serve lì e non solo nel pannello: il pannello è chiuso quasi sempre, e un
capotasto ricordato da ieri rinomina ogni accordo della pagina senza spiegare perché.

Il **suggerimento** sotto il controllo prova i tasti da 0 a 7 e dice quale rende aperti
più accordi del brano — «col 3° tasto tutti gli accordi sono aperti» — con un pulsante
per metterlo. Non si applica da sé: il capotasto lo mette chi suona. Un accordo conta
come aperto quando la sua forma lascia **almeno una corda libera** e non passa il terzo
tasto: una corda libera è esattamente ciò che un barré toglie, e la regola vale identica
su chitarra e ukulele. Mette insieme Do, La, Sol, Mi, Re, La-, Mi- e le loro settime, e
lascia fuori Fa, Si-, Sib, Fa#- — cioè i quattro accordi per cui il capotasto si mette.

Il capotasto è **per brano**, accanto alla trasposizione: «questo lo faccio col
capotasto al 2» lo ritrovi la volta dopo, e nessun brano che non hai toccato cambia da
solo. Nel diagramma la forma non si rinumera — col capotasto al 2 la forma di Do *è* la
forma di Do — e il capotasto si vede come una barra colorata col numero accanto.

## Forme degli accordi

Ogni accordo sullo spartito è un bottone: aprirlo mostra la forma per lo strumento
che hai scelto nel menù — **chitarra** o **ukulele** — trasposta e nella notazione che
stai leggendo. Un Do resta un Do: cambia la diteggiatura, non l'accordo, quindi sullo
spartito non si muove nulla.

Le diteggiature sono in `src/lib/music/shapes.ts`, e i due strumenti le trovano in
modi diversi, di proposito:

- **Chitarra**, sei corde: una tabella corta di forme in posizione aperta, più due
  forme mobili con la fondamentale sulla sesta o sulla quinta corda che coprono le
  dodici tonalità. Scritta a mano perché quello che si suona è un barré o x32010, e
  nessun punteggio automatico inventerebbe un barré.
- **Ukulele**, quattro: una ricerca. Con quattro corde e una mano che copre quattro
  tasti le posizioni valide sono poche e non c'è spazio per smorzare, quindi la più
  compatta *è* quella che si usa — e infatti dalla ricerca escono da sole le forme dei
  manuali (Do 0003, Fa 2010, Sol 0232, La- 2000, Si7 2322), che è la prova che il
  criterio ha capito il problema. Su 216 combinazioni una sola non ha forma entro il
  dodicesimo tasto: lì il popup mostra le note, che è la risposta onesta.

Ogni forma, in entrambi i casi, è verificata dai test contro le note dell'accordo —
nessuna nota estranea, e presenti quelle che fanno l'accordo.

La scelta dello strumento sta nel menù insieme al tema, ma a differenza del tema **è
sincronizzata**: è una preferenza su chi legge, come la notazione, e la stessa persona
prende lo stesso strumento sul telefono e sul tablet.

Quando il cifrato chiede qualcosa che la tabella non ha, la forma mostrata può
**omettere** una nota ma non contraddirla: un accordo di tredicesima si disegna come
la settima che ci sta sotto, e il popup lo dichiara. Le alterazioni della quinta
(`7b5`, `7#5`) non si possono semplificare così, quindi lì non c'è forma e restano i
nomi delle note.

Lo slug di un canzoniere è immutabile: rinominare cambia solo il nome, così nessuna
chiave esterna, URL o voce di precache si muove. Senza rete la gestione è
disabilitata — è struttura condivisa fra account — mentre la lettura non cambia.

I brani in `content/` sono testi segnaposto originali, non repertorio reale.

## Il database

Postgres su Neon, provisionato via marketplace Vercel (progetto `songs-db`), già
migrato e popolato. Il build legge da lì; senza `DATABASE_URL` legge da `content/`.

Dopo una modifica ai contenuti: `npm run seed` e poi un deploy. Il seed è
idempotente (upsert per slug) e rimuove le righe il cui file non esiste più, perché
in v1 la sorgente di verità sono i file.

### Se va rifatto da zero

**L'ordine conta.** Il build genera le pagine dei brani dai dati che trova: se
`DATABASE_URL` arriva su Vercel prima del seed, il build legge una tabella vuota e
pubblica **zero canzoni**, con una lista di precache vuota — un'app che sembra sana
e non ha contenuti.

1. Crea il database, collegandolo **solo a development** per non anticipare la
   variabile in produzione:
   `vercel integration add neon -e development --name songs-db --scope sisqoz`
   (la prima volta va accettati i termini marketplace nel browser)
2. `npm run db:migrate` — applica le migrazioni
3. `npm run seed` — carica `content/` nel database
4. Verifica che il build dica `Precache routes (database)` e non `(files)`
5. **Solo adesso** aggiungi `DATABASE_URL` a Production e fai un redeploy

Due dettagli che costano tempo se non si sanno:

- `vercel env pull` **sovrascrive** `.env.local`, e scarica un solo ambiente. Le
  variabili di auth sono anche in `development` proprio per sopravvivere al pull.
- Le migrazioni girano sulla connessione **diretta** (`DATABASE_URL_UNPOOLED`), non
  su quella con PgBouncer: `scripts/migrate.ts` la preferisce da sé quando esiste.
  Il runtime invece usa l'endpoint pooled, con `prepare: false` nel client.

## Variabili d'ambiente

| Variabile | A cosa serve |
|---|---|
| `AUTH_SECRET` | Firma delle sessioni |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Client OAuth Google |
| `ALLOWED_EMAILS` | Indirizzi ammessi, separati da virgola. Vuota nega tutti |
| `AUTH_URL` | Su Vercel: `https://songs.sisqo.dev`, così il callback OAuth combacia |
| `DATABASE_URL` | Postgres. Assente: si legge da `content/` |
| `DEPLOY_HOOK_URL` | Deploy hook Vercel, usato dal pulsante Pubblica |

## Note

Tailwind è fissato alla v3: il binding nativo `@tailwindcss/oxide` della v4
richiede Node ≥ 20 e lo sviluppo locale gira su Node 18. Vercel builda su Node 24.

I push su `main` fanno auto-deploy in produzione.
