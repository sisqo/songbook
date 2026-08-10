/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)'],
        mono: ['var(--font-geist-mono)'],
      },
      /*
       * The palette lives in globals.css as custom properties, because both themes
       * are designed and the switch is a media query. Exposing the same tokens as
       * Tailwind colours is what keeps `style={{ color: 'var(--muted)' }}` out of
       * the markup.
       *
       * Note: opacity modifiers (`bg-surface/80`) do not work on var-backed
       * colours in Tailwind v3. Use color-mix() in CSS instead.
       */
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        raised: 'var(--surface-2)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        line: 'var(--line)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'on-accent': 'var(--on-accent)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)',
      },
      borderRadius: {
        card: 'var(--r-lg)',
      },
      boxShadow: {
        card: 'var(--shadow-1)',
      },
    },
  },
  plugins: [],
}
