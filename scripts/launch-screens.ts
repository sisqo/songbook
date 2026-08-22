/**
 * Draws the iOS launch screens into `public/brand/launch/`. Run with
 * `npx tsx scripts/launch-screens.ts` after changing `LAUNCH_SCREENS` or the lockup.
 *
 * Deliberately **not** wired into `npm run build`. The output is committed, like the PWA icons
 * beside it, and for the same reason: these change when the brand or the device list changes,
 * which is a decision somebody makes, not something that should quietly differ between two
 * builds of the same commit.
 *
 * The list of screens is not here — see `src/lib/launchScreens.ts` for why one list has to serve
 * both this and the `<link>` tags in `app/layout.tsx`.
 *
 * **Rendered by Chromium, not by `sharp`**, and that is forced rather than chosen: `sharp` is in
 * `node_modules` but cannot load here at all — this machine's Node is a Snap, which does not
 * support native modules (`CLAUDE.md`, environment notes). Chromium's own `--screenshot` mode
 * needs no CDP client and so no new dependency, which on Node 18 is a cost of its own. The one
 * care it takes: the Chromium here is a Snap too and cannot write into `/tmp/claude-*`, so every
 * path handed to it stays under the repository, which is under `$HOME`.
 *
 * A `main()` rather than top-level await, the same shape every other script in this folder takes:
 * `tsx` compiles to CJS here, where a top-level await is a build error.
 */

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { LAUNCH_BACKGROUND, LAUNCH_SCREENS, launchFileName, launchPixels } from '../src/lib/launchScreens'

/**
 * How wide the mark sits, in CSS pixels: a little over half the screen, but never past 260,
 * which is what stops it from becoming a banner across an iPad. Expressed in CSS pixels rather
 * than device ones precisely so that a phone at ratio 3 and a tablet at ratio 2 end up with a
 * mark the same physical size, instead of one twice the other.
 */
function markCssWidth(screenCssWidth: number): number {
  return Math.min(Math.round(screenCssWidth * 0.52), 260)
}

/** The whole launch screen as one document: a flat ground, the lockup centred on it, nothing else. */
function documentFor(widthPx: number, heightPx: number, markPx: number, lockup: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${widthPx}px; height: ${heightPx}px;
    background: ${LAUNCH_BACKGROUND};
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .mark { width: ${markPx}px; }
  .mark svg { display: block; width: 100%; height: auto; }
</style></head>
<body><div class="mark">${lockup}</div></body></html>`
}

async function main() {
  const outDir = path.join(process.cwd(), 'public', 'brand', 'launch')
  await mkdir(outDir, { recursive: true })

  const lockup = await readFile(path.join(process.cwd(), 'public', 'brand', 'lockup-vertical-white.svg'), 'utf8')

  /* Written beside the output rather than in a system temp dir: see this file's header on why no
     path handed to Chromium may leave `$HOME`. Removed at the end, whatever happens. */
  const scratch = path.join(outDir, '.render.html')

  try {
    for (const screen of LAUNCH_SCREENS) {
      const { width, height } = launchPixels(screen)
      const markPx = markCssWidth(screen.width) * screen.ratio
      const out = path.join(outDir, launchFileName(screen))

      await writeFile(scratch, documentFor(width, height, markPx, lockup), 'utf8')

      /* `--window-size` in CSS pixels with no device scale factor, so the capture comes out at
         exactly the device-pixel size the filename claims. */
      execFileSync(
        'chromium',
        [
          '--headless=new',
          '--disable-gpu',
          '--no-sandbox',
          '--hide-scrollbars',
          `--window-size=${width},${height}`,
          `--screenshot=${out}`,
          `file://${scratch}`,
        ],
        { stdio: 'pipe' },
      )

      const { size } = await import('node:fs').then((fs) => fs.promises.stat(out))
      console.log(
        `${launchFileName(screen).padEnd(28)} ${String(width).padStart(4)}x${height}  ${(size / 1024).toFixed(1)} kB  ${screen.devices}`,
      )
    }
  } finally {
    await rm(scratch, { force: true })
  }

  console.log(`\n${LAUNCH_SCREENS.length} launch screens in public/brand/launch/`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
