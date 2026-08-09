/**
 * Database connection.
 *
 * postgres.js rather than Neon's serverless driver: reads happen at build time
 * and preference writes happen in server actions, both plain Node. Nothing
 * touches the database from the edge — sessions are JWT and the allowlist is an
 * environment variable — so the HTTP driver would buy nothing, and its current
 * major requires Node >= 19 while this machine runs 18.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

export const databaseUrl = process.env.DATABASE_URL ?? null
export const hasDatabase = databaseUrl !== null && databaseUrl !== ''

type Database = ReturnType<typeof drizzle<typeof schema>>

let cached: Database | null = null
let cachedSql: ReturnType<typeof postgres> | null = null

function connect() {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set — the file repository should be used instead')
  }

  const sql = postgres(databaseUrl, {
    // Neon's pooled endpoint runs PgBouncer in transaction mode, which cannot
    // carry prepared statements across connections.
    prepare: false,
    max: 1,
    idle_timeout: 20,
  })

  cachedSql = sql
  return drizzle(sql, { schema })
}

export function db(): Database {
  cached ??= connect()
  return cached
}

/** Closes the pool so a script can exit instead of hanging on an open socket. */
export async function closeDatabase(): Promise<void> {
  if (cachedSql) {
    await cachedSql.end()
    cachedSql = null
    cached = null
  }
}
