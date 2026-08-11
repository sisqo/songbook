/**
 * Generates the icon set: favicon, PWA icons, Apple touch icon.
 *
 * Written by hand rather than pulled from a toolchain because the drawing is five
 * rounded bars and the alternative is a native dependency that has to build on
 * Node 18 locally and Node 24 on Vercel. Run it with `npm run icons` after
 * changing the art; the outputs are committed, so a normal build never needs it.
 *
 * The art is the app's subject: two chords over the lines of a lyric. The colours
 * are the dark theme's own tokens, so the icon and the app agree.
 */

import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

/** Dark theme tokens from globals.css: --bg, --accent, --ink. */
type Rgb = readonly [number, number, number]

const BACKGROUND: Rgb = [0x10, 0x12, 0x16]
const CHORD: Rgb = [0xf0, 0xb2, 0x68]
const LYRIC: Rgb = [0xec, 0xee, 0xf1]

interface Bar {
  /** All values are fractions of the content box. */
  x: number
  y: number
  width: number
  height: number
  colour: Rgb
}

/**
 * Two chords above three lines of lyrics.
 *
 * At 32 pixels and below five bars turn to mush, so the small sizes get a
 * simplified composition — one chord, two lines, everything thicker — rather than
 * a scaled-down version of the full one.
 */
function bars(simplified: boolean): Bar[] {
  if (simplified) {
    return [
      { x: 0, y: 0, width: 0.46, height: 0.2, colour: CHORD },
      { x: 0, y: 0.42, width: 1, height: 0.2, colour: LYRIC },
      { x: 0, y: 0.78, width: 0.7, height: 0.2, colour: LYRIC },
    ]
  }

  return [
    { x: 0, y: 0, width: 0.42, height: 0.135, colour: CHORD },
    { x: 0.52, y: 0, width: 0.3, height: 0.135, colour: CHORD },
    { x: 0, y: 0.355, width: 1, height: 0.135, colour: LYRIC },
    { x: 0, y: 0.575, width: 0.72, height: 0.135, colour: LYRIC },
    { x: 0, y: 0.795, width: 0.86, height: 0.135, colour: LYRIC },
  ]
}

/** Coverage of one pixel by a rounded rectangle, sampled on a 3×3 grid. */
function coverage(px: number, py: number, box: { x: number; y: number; w: number; h: number }) {
  const radius = box.h / 2
  let hits = 0

  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const x = px + (sx + 0.5) / 3
      const y = py + (sy + 0.5) / 3

      // Inside the straight middle, or inside one of the two end caps.
      const withinY = y >= box.y && y <= box.y + box.h
      if (!withinY) continue

      if (x >= box.x + radius && x <= box.x + box.w - radius) {
        hits += 1
        continue
      }

      const cx = x < box.x + radius ? box.x + radius : box.x + box.w - radius
      const cy = box.y + radius
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) hits += 1
    }
  }

  return hits / 9
}

/**
 * Draws one square icon as raw RGBA.
 *
 * `inset` is what separates a normal icon from a maskable one. Android may crop a
 * maskable icon to any shape inside the central circle of 80% diameter, so the art
 * has to live in the square inscribed in that circle — about 57% of the side,
 * which is an inset of 0.22. Anything closer to the edge can be shaved off.
 */
function draw(size: number, inset: number): Buffer {
  const pixels = Buffer.alloc(size * size * 4)
  const content = size * (1 - 2 * inset)
  const origin = size * inset

  const boxes = bars(size <= 32).map((bar) => ({
    x: origin + bar.x * content,
    y: origin + bar.y * content,
    w: bar.width * content,
    h: bar.height * content,
    colour: bar.colour,
  }))

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let [r, g, b] = BACKGROUND

      for (const box of boxes) {
        const alpha = coverage(x, y, box)
        if (alpha === 0) continue

        r = Math.round(r * (1 - alpha) + box.colour[0] * alpha)
        g = Math.round(g * (1 - alpha) + box.colour[1] * alpha)
        b = Math.round(b * (1 - alpha) + box.colour[2] * alpha)
      }

      const at = (y * size + x) * 4
      pixels[at] = r
      pixels[at + 1] = g
      pixels[at + 2] = b
      // Opaque throughout: iOS renders a transparent touch icon on black.
      pixels[at + 3] = 0xff
    }
  }

  return pixels
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer: Buffer): number {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))

  return Buffer.concat([length, body, crc])
}

/** Minimal PNG: one IDAT, no interlacing, filter 0 on every scanline. */
function png(size: number, pixels: Buffer): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // truecolour with alpha
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * An .ico holding PNGs, one per size.
 *
 * Browsers ask for /favicon.ico whatever the markup says, and an .ico is the only
 * format that can carry 16, 32 and 48 in one file — which matters because each of
 * those is a different drawing here, not one image resampled.
 */
function ico(entries: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(16 * entries.length)
  let offset = header.length + directory.length

  entries.forEach((entry, index) => {
    const at = index * 16
    directory[at] = entry.size >= 256 ? 0 : entry.size
    directory[at + 1] = entry.size >= 256 ? 0 : entry.size
    directory[at + 2] = 0 // palette size: not paletted
    directory[at + 3] = 0
    directory.writeUInt16LE(1, at + 4) // colour planes
    directory.writeUInt16LE(32, at + 6) // bits per pixel
    directory.writeUInt32LE(entry.data.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += entry.data.length
  })

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)])
}

async function main() {
  const root = process.cwd()
  const image = (size: number, inset = 0.16) => png(size, draw(size, inset))

  const files: { file: string; data: Buffer }[] = [
    // Browser tab, and whatever asks for /favicon.ico regardless of markup.
    {
      file: 'src/app/favicon.ico',
      data: ico([16, 32, 48].map((size) => ({ size, data: image(size) }))),
    },
    { file: 'public/icon-16.png', data: image(16) },
    { file: 'public/icon-32.png', data: image(32) },
    { file: 'public/icon-192.png', data: image(192) },
    { file: 'public/icon-512.png', data: image(512) },
    // Cropped to any shape by Android, so the art sits well inside the safe circle.
    { file: 'public/icon-maskable-192.png', data: image(192, 0.24) },
    { file: 'public/icon-maskable-512.png', data: image(512, 0.24) },
    // iOS rounds the corners itself and never masks further than that.
    { file: 'public/apple-touch-icon.png', data: image(180) },
  ]

  for (const { file, data } of files) {
    await writeFile(path.join(root, file), data)
    const digest = createHash('md5').update(data).digest('hex').slice(0, 8)
    console.log(`${file.padEnd(34)} ${String(data.length).padStart(7)} B  ${digest}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
