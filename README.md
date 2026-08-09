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
{tags: lento, repertorio}

[Bb]Prima [Eb]riga del [F]testo

{start_of_chorus}
[Gm7]Ritornello
{end_of_chorus}
```

Le scalette sono file YAML in `content/setlists/` con un nome e l'elenco ordinato
degli slug. In v1 sono in sola lettura: cambiarle richiede un commit.

I brani in `content/` sono testi segnaposto originali, non repertorio reale.

## Attivare il database

L'ordine conta. Il build genera le pagine dei brani leggendo il database quando
`DATABASE_URL` esiste: **se la variabile arriva su Vercel prima del seed, il build
trova la tabella vuota e pubblica zero canzoni**, con una lista di precache vuota.

1. Crea il database Neon dalla dashboard Vercel del progetto (Storage → Neon)
2. `vercel env pull .env.local` — porta `DATABASE_URL` in locale
3. `npm run db:migrate` — applica le migrazioni
4. `npm run seed` — carica `content/` nel database
5. **Solo adesso** aggiungi `DATABASE_URL` all'ambiente Production su Vercel
6. Redeploy

Il seed è idempotente (upsert per slug) e rimuove le righe il cui file non esiste
più, perché in v1 la sorgente di verità sono i file.

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
