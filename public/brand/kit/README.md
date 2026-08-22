# Strumfolio — asset di brand

Rigenerato dai lockup aggiornati: **orizzontale** (2446×425) e **verticale** (1823×898).
Il logo è **vettorializzato** (`svg/`) e
**tutti i PNG sono renderizzati dal vettore**, quindi nitidi a qualsiasi dimensione.
Fedeltà del vettore rispetto al raster: diff media 1/255, solo antialiasing dei bordi
(`preview/svg-diff.png`).

Il tile ora è più arrotondato: raggio 138 px su 499 di lato, **27,7%**, riportato
uguale sulle icone quadrate.

## Palette

| Colore | HEX | Uso |
|---|---|---|
| Brown | `#97490F` | tile icona, theme-color, accento primario |
| Orange | `#F1B369` | tile della variante chiara |
| Ink | `#231F20` | glifo sul tile arancione |
| Black | `#000000` | lettering su fondo chiaro |
| White | `#FFFFFF` | glifo sul tile brown, lettering su fondo scuro |

## Struttura

```
svg/              → sorgenti vettoriali (usa questi da qui in avanti)
web/              → pronto da caricare nella root del sito
icons/            → icone quadrate generiche
ios/              → AppIcon.appiconset da trascinare in Xcode
logo/             → lockup, mark e wordmark in PNG
preview/          → contact sheet e diff di verifica
build-assets.py   → rigenera tutto da due PNG di partenza
```

### svg/

Ogni lockup esiste in due orientamenti — `lockup-horizontal-*` e `lockup-vertical-*` —
con le stesse quattro varianti:

| File | Uso | Peso |
|---|---|---|
| `lockup-{orient}-black.svg` | su fondi chiari | 7,3 / 7,6 KB |
| `lockup-{orient}-white.svg` | su fondi scuri | 7,3 / 7,6 KB |
| `lockup-{orient}-adaptive.svg` | lettering che segue `prefers-color-scheme` | 7,3 / 7,7 KB |
| `lockup-{orient}-mono.svg` | tutto in `currentColor`, glifo in negativo (`fill-rule="evenodd"`) | 7,3 / 7,6 KB |
| `mark.svg` / `mark-light.svg` / `mark-mono.svg` | solo il badge | 3,0 KB |
| `glyph.svg` / `note.svg` | nota+libro / solo nota, `currentColor`, fondo trasparente | 2,6 / 0,6 KB |
| `wordmark.svg` | solo lettering, `currentColor` | 4,2 KB |
| `icon-square.svg` / `icon-rounded.svg` / `icon-light.svg` / `icon-maskable.svg` | icone 512 | 2,7 KB |
| `favicon.svg` | solo nota su tile arrotondato | 0,7 KB |

`viewBox` stretto al contenuto (nessun padding): dimensiona con CSS e aggiungi lo spazio
di rispetto tu. I file con `currentColor` ereditano il colore del testo del contenitore.

### web/

| File | Uso |
|---|---|
| `favicon.svg` | preferito dai browser moderni, primo nello snippet |
| `favicon.ico` | 16+32+48 multi-size, fallback |
| `favicon-16x16.png`, `favicon-32x32.png` | solo **nota** (il libro sparisce sotto i 48 px) |
| `favicon-48x48.png`, `favicon-96x96.png` | mark completo |
| `apple-touch-icon.png` | 180×180, full-bleed RGB (iOS arrotonda da sé) |
| `icon-192.png`, `icon-512.png` | PWA, purpose `any` |
| `maskable-icon-512.png` | PWA `maskable`, glifo dentro la safe zone del 60% |
| `og-image-light/dark/brand.png` | 1200×630 per OpenGraph / Twitter card (lockup orizzontale) |
| `social-square-light/dark.png` | 1200×1200 per Instagram, WhatsApp, avatar (lockup verticale) |
| `site.webmanifest`, `head-snippet.html` | da servire / incollare così come sono |

### icons/

- `icon-square-*` → full-bleed, per contenitori che arrotondano loro (iOS, Android, macOS)
- `icon-rounded-*` → angoli arrotondati al 27,7%, corner trasparenti, per uso in-app/web
- `icon-light-*` → tile arancione + glifo scuro, per UI dark
- `icon-note-*` → solo nota, versione semplificata per dimensioni piccole
- Taglie: 16, 32, 48, 64, 96, 128, 144, 152, 180, 192, 256, 512, 1024

### ios/AppIcon.appiconset

Set completo 20/29/40/60/76/83,5 pt @1x–@3x + 1024 marketing, con `Contents.json` già
scritto. Trascina la cartella in `Assets.xcassets`. Immagini RGB senza alpha, come
richiede App Store Connect.

### logo/

- `lockup-{horizontal,vertical}-black-*` → lettering nero + tile brown → **fondi chiari**
- `lockup-{horizontal,vertical}-white-*` → lettering bianco + tile arancione → **fondi scuri**
- larghezze orizzontale: 150 / 300 / 600 / 1200 / 2446 / 3000 px
- larghezze verticale: 200 / 400 / 600 / 800 / 1200 / 1823 px
- `mark-white|black|brown-1024.png` → solo nota+libro, sfondo trasparente
- `wordmark-black|white-1600.png` → solo lettering

## Rigenerare dopo un aggiornamento del logo

```bash
pip install pillow numpy scipy potracer cairosvg
python3 build-assets.py \
  --h lockup-h-black.png lockup-h-white.png \
  --v lockup-v-black.png lockup-v-white.png \
  --out .
```

Entrambe le coppie sono opzionali (`--h` e/o `--v`, sempre nell'ordine
fondo-chiaro / fondo-scuro). Lo script rileva da solo orientamento, colori, bbox del
tile, raggio degli angoli, glifo e nota: non c'è nulla di hard-coded, quindi funziona
anche se il logo cambia proporzioni. Mark, icone e favicon vengono dal lockup
orizzontale se presente, altrimenti dal verticale.

Verifica automatica a fine run: rende ogni SVG e lo confronta col PNG di partenza,
stampando lo scarto e salvando `preview/svg-diff-{orient}.png`.

## Nota tecnica

Il vettoriale è ottenuto per tracciatura (potrace) dei PNG, non dal file
originale del designer: le curve sono fedeli entro il pixel ma non identiche al sorgente,
e il lettering è convertito in path (nessun font richiesto, ma nemmeno modificabile come
testo). Se recuperi l'AI/SVG originale, rigenero tutto da quello.

Ignora `web/_ico48.png`: residuo di una versione precedente, puoi cancellarlo.
