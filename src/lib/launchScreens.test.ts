import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

import { LAUNCH_SCREENS, launchFileName, launchMedia, launchPixels, launchUrl } from './launchScreens'

const DIR = path.join(process.cwd(), 'public', 'brand', 'launch')

/*
 * These read the filesystem, unlike every other test in this repo, and that is the point rather
 * than an exception being taken: the failure this guards against is a `<link>` in `layout.tsx`
 * pointing at a PNG that was never generated. iOS answers a startup image it cannot fetch by
 * showing the blank screen these exist to remove — so it looks exactly like having done none of
 * this, with nothing in any log to say so. A missing file has to fail here, where somebody sees
 * it, and not on a phone.
 */
describe('the iOS launch screens', () => {
  it('has a generated file for every declared screen', () => {
    for (const screen of LAUNCH_SCREENS) {
      const file = path.join(DIR, launchFileName(screen))
      assert.ok(existsSync(file), `missing ${launchFileName(screen)} — run: npx tsx scripts/launch-screens.ts`)
    }
  })

  it('leaves no orphan file that no screen names', () => {
    const declared = new Set(LAUNCH_SCREENS.map(launchFileName))
    const onDisk = readdirSync(DIR).filter((name) => name.endsWith('.png'))
    for (const name of onDisk) {
      assert.ok(declared.has(name), `${name} is on disk but no entry names it — stale after an edit?`)
    }
  })

  /* Two devices can share a CSS size and differ only in ratio (iPhone XR and XS Max are both
     414x896), which is why the filename is built from device pixels. If that ever regressed, one
     image would overwrite the other and one of the two phones would go back to the blank. */
  it('names every file exactly once', () => {
    const names = LAUNCH_SCREENS.map(launchFileName)
    assert.equal(new Set(names).size, names.length)
  })

  it('gives every screen its own media query', () => {
    const queries = LAUNCH_SCREENS.map(launchMedia)
    assert.equal(new Set(queries).size, queries.length)
  })

  it('builds the media query with all four clauses iOS needs to match', () => {
    for (const screen of LAUNCH_SCREENS) {
      const media = launchMedia(screen)
      assert.match(media, new RegExp(`\\(device-width: ${screen.width}px\\)`))
      assert.match(media, new RegExp(`\\(device-height: ${screen.height}px\\)`))
      assert.match(media, new RegExp(`\\(-webkit-device-pixel-ratio: ${screen.ratio}\\)`))
      assert.match(media, /\(orientation: portrait\)/)
    }
  })

  it('sizes the file in device pixels and serves it from /brand/launch/', () => {
    const screen = { width: 393, height: 852, ratio: 3, devices: 'sample' }
    assert.deepEqual(launchPixels(screen), { width: 1179, height: 2556 })
    assert.equal(launchFileName(screen), 'apple-launch-1179x2556.png')
    assert.equal(launchUrl(screen), '/brand/launch/apple-launch-1179x2556.png')
  })
})
