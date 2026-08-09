/** Applies the generated migrations. Run with `npm run db:migrate`. */

import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { loadEnv } from './load-env'

loadEnv()

const { closeDatabase, db, hasDatabase } = await import('../src/lib/db/client')

if (!hasDatabase) {
  console.error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.')
  process.exit(1)
}

await migrate(db(), { migrationsFolder: './drizzle' })
await closeDatabase()

console.log('Migrations applied.')
