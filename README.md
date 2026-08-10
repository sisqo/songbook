# songs

Testi e accordi del proprio repertorio, da leggere su tablet e telefono: zoom,
scorrimento automatico, cambio di tonalità e notazione italiana o internazionale.
Accesso riservato a una lista di indirizzi.

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

Dall'app, in `/importa`: incolli il brano, l'app riconosce se è già ChordPro o se
sono accordi sopra il testo e converte, deduce titolo, artista e tonalità, e mostra
una preview prima di salvare. Correggere e cancellare si fanno dalla pagina del
brano, sotto lo spartito.

Un brano salvato **non è ancora visibile**: lista, ricerca, pagine e precache si
generano al build. La schermata elenca i brani in attesa e il pulsante **Pubblica**
lancia una ricostruzione per tutto il gruppo. Serve `DEPLOY_HOOK_URL`, un deploy
hook creato su Vercel in Settings → Git → Deploy Hooks.

Il database è la sorgente di verità dei brani, quindi **non c'è cronologia git**: il
pulsante *Scarica tutto* produce un archivio dei `.chopro` da conservare. Per
ripristinarlo, rimetti i file in `content/` e lancia `npm run seed`, che inserisce
solo ciò che manca.

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

## Canzonieri

Ogni brano appartiene a un canzoniere. Si creano, rinominano e rimuovono da
`/canzonieri`; lo spostamento di un singolo brano si fa dal selettore nella testata
del brano. La rimozione di un canzoniere non vuoto chiede prima dove spostare i
brani — e il vincolo `on delete restrict` la impedisce comunque a livello di
database.

Non esiste una rotta `/canzonieri/[slug]`: uno creato dall'app non sarebbe fra le
rotte generate al build, quindi non sarebbe precachato, e una rinomina sposterebbe
la rotta. In home, sotto la ricerca, ogni canzoniere è invece un **collegamento
alla sua prima canzone**, e dalla pagina del brano le frecce nell'header scorrono
le altre del canzoniere. Un canzoniere vuoto è mostrato ma spento.

La home non elenca brani: i brani compaiono solo cercando. Due casi potrebbero
altrimenti rendere un brano irraggiungibile, e sono coperti: un brano senza
canzoniere finisce sotto una voce «Senza canzoniere», e un database senza
canzonieri fa ricomparire la lista completa.

L'ordine su cui scorrono le frecce è quello del build. Se sposti un brano di
canzoniere, i suoi vicini restano quelli vecchi fino alla pubblicazione successiva
— la stessa staleness del resto del sito.

Il filtro `/?c=slug` non è più generato da nessun elemento dell'interfaccia; la
regola `c` in `ignoreURLParametersMatching` di Serwist resta al suo posto perché un
vecchio segnalibro continui a trovare la home in cache.

## Forme degli accordi

Ogni accordo sullo spartito è un bottone: aprirlo mostra la forma per chitarra in
accordatura standard, trasposta e nella notazione che stai leggendo. Le diteggiature
sono in `src/lib/music/shapes.ts`: una tabella corta di forme in posizione aperta,
più due forme mobili con la fondamentale sulla sesta o sulla quinta corda che
coprono le dodici tonalità. Ogni forma è verificata dai test contro le note
dell'accordo — nessuna nota estranea, e presenti quelle che fanno l'accordo.

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
