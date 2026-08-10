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
la rotta. La vista di un canzoniere è la lista filtrata su `/?c=slug`, il che
richiede `c` in `ignoreURLParametersMatching` di Serwist perché un link filtrato
trovi la home in cache anche offline.

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

## Note

Tailwind è fissato alla v3: il binding nativo `@tailwindcss/oxide` della v4
richiede Node ≥ 20 e lo sviluppo locale gira su Node 18. Vercel builda su Node 24.

I push su `main` fanno auto-deploy in produzione.
