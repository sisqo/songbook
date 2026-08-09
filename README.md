# songs

Next.js 15 + TypeScript + Tailwind CSS.

- Production: https://songs.sisqo.dev
- Repo: https://github.com/sisqo/songs

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

## Notes

Tailwind is pinned to v3. Tailwind v4's `@tailwindcss/oxide` native binding
requires Node >= 20, and local development runs on Node 18; v3 also matches the
other projects. Vercel builds on Node 24.

Pushes to `main` auto-deploy to production via the Vercel GitHub integration.
