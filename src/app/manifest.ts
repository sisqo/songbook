import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'songs — testi e accordi',
    short_name: 'songs',
    description: 'Testi e accordi, con trasposizione, notazione e scorrimento automatico.',
    lang: 'it',
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
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
