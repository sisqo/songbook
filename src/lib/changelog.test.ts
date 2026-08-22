import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { RELEASES, releaseMonth } from './changelog'

describe('releaseMonth', () => {
  it('renders a month and a year', () => {
    assert.equal(releaseMonth('2026-08-22'), 'August 2026')
    assert.equal(releaseMonth('2026-01-05'), 'January 2026')
    assert.equal(releaseMonth('2025-12-31'), 'December 2025')
  })

  /*
   * The reason this function exists instead of a `toLocaleDateString` call. A bare date is
   * parsed as UTC midnight, so `new Date('2026-08-01').toLocaleDateString(...)` renders July
   * anywhere behind Greenwich. Nothing about this implementation can do that, and this case is
   * here so nobody "simplifies" it back into one that can.
   */
  it('does not shift the month on the first of a month', () => {
    assert.equal(releaseMonth('2026-08-01'), 'August 2026')
    assert.equal(releaseMonth('2026-01-01'), 'January 2026')
  })

  it('hands back anything it cannot read, rather than throwing', () => {
    for (const raw of ['', 'soon', '2026-08', '2026-13-01', '26-08-22']) {
      assert.equal(releaseMonth(raw), raw)
    }
  })
})

describe('RELEASES', () => {
  it('has at least one release, with every field filled in', () => {
    assert.ok(RELEASES.length >= 1)
    for (const release of RELEASES) {
      assert.match(release.version, /^\d+\.\d+$/, `version ${release.version}`)
      assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/, `date of ${release.version}`)
      assert.ok(release.title.length > 0, `title of ${release.version}`)
      assert.ok(release.highlights.length > 0, `highlights of ${release.version}`)
      for (const line of release.highlights) assert.ok(line.trim().length > 0, `blank highlight in ${release.version}`)
    }
  })

  it('names every version exactly once', () => {
    const versions = RELEASES.map((release) => release.version)
    assert.equal(new Set(versions).size, versions.length)
  })

  /* The page renders the array as it stands, so the order in the file *is* the order on screen. */
  it('is newest first, by date', () => {
    const dates = RELEASES.map((release) => release.date)
    assert.deepEqual(dates, [...dates].sort().reverse())
  })
})
