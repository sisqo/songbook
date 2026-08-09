/** Applies the generated migrations. Run with `npm run db:migrate`. */

import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { loadEnv } from './load-env'

async function main() {
  loadEnv()

  /**
   * Migrations run over the direct connection when one is available. Neon's
   * default URL points at a pooled endpoint running PgBouncer, which is fine for
   * ordinary queries but the wrong place to be issuing schema changes.
   */
  if (process.env.DATABASE_URL_UNPOOLED) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED
  }

  const { closeDatabase, db, hasDatabase } = await import('../src/lib/db/client')

  if (!hasDatabase) {
    console.error('DATABASE_URL is not set. Run `vercel env pull .env.local` first.')
    process.exit(1)
  }

  await migrate(db(), { migrationsFolder: './drizzle' })
  await closeDatabase()

  console.log('Migrations applied.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
