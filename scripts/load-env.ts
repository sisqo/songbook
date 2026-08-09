/**
 * Minimal .env loader for the standalone scripts.
 *
 * Next.js loads .env.local itself, but the seed and migrate scripts run outside
 * it, and Node 18 has no --env-file. This is deliberately small: enough to read
 * a DATABASE_URL written by `vercel env pull`, and nothing more.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const FILES = ['.env.local', '.env']

export function loadEnv(): void {
  for (const file of FILES) {
    let contents: string
    try {
      contents = readFileSync(path.join(process.cwd(), file), 'utf8')
    } catch {
      continue
    }

    for (const line of contents.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (!match) continue

      const key = match[1]
      // Values written by `vercel env pull` are double quoted.
      const value = match[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2')

      // Earlier files win, and a real environment variable always wins.
      process.env[key] ??= value
    }
  }
}
