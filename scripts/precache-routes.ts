/**
 * Writes the list of page URLs the service worker installs with, eagerly, on every
 * device.
 *
 * Songs and songbooks are not among them any more (v3.0): which ones exist is now
 * private per account, and this list is baked once into the build, identical for
 * every device that ever installs it — there is no reader to scope it to yet. Their
 * offline coverage moves to `lib/offline/sync.ts`, a warm-up that runs per signed-in
 * reader instead, over exactly the accounts they can see.
 *
 * What is left here is genuinely account-agnostic: the shell routes fetched with
 * *this device's own* cookies at install time (`/`, `/users`, `/password` render
 * whatever that session's account already is), plus the public routes that need no
 * session at all.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

async function main() {
  const routes = [
    '/',
    '/users',
    '/password',
    // A metadata route, not a file in public/, so it has to be listed here.
    '/manifest.webmanifest',
  ]

  const output = path.join(process.cwd(), 'generated', 'precache-routes.json')
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(routes, null, 2)}\n`, 'utf8')

  console.log(`Precache routes: ${routes.length}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
