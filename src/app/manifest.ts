import type { MetadataRoute } from 'next'

import { APP_NAME, APP_PAYOFF } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — lyrics and chords for your repertoire`,
    short_name: APP_NAME,
    description: `${APP_PAYOFF}. Lyrics and chords, with transposition, notation and auto-scroll.`,
    lang: 'en',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#101216',
    theme_color: '#101216',
    /**
     * Both purposes are listed at both sizes, and they are different drawings: a
     * maskable icon may be cropped to any shape inside the central circle, so its
     * art sits further in. Offering only one purpose makes Android either crop the
     * full-bleed art or letterbox the inset one inside another rounded square.
     */
    icons: [
      { src: '/brand/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/brand/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
