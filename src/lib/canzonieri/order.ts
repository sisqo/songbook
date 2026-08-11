/**
 * The arithmetic behind dragging a song into another place.
 *
 * Kept out of the component because it is the part that can be wrong in ways no
 * screenshot shows: an off-by-one here silently files a song one row from where the
 * finger let go, and that is exactly the kind of thing a test can pin down and an
 * eye cannot.
 */

/** Moves one item to another index, leaving everything else in its relative order. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items

  const target = Math.max(0, Math.min(items.length - 1, to))
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  return next
}

/** Whether two lists hold the same members, in any order. */
export function sameMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false

  const counts = new Map<string, number>()
  for (const entry of a) counts.set(entry, (counts.get(entry) ?? 0) + 1)

  for (const entry of b) {
    const seen = counts.get(entry)
    if (seen === undefined || seen === 0) return false
    counts.set(entry, seen - 1)
  }

  return true
}

/**
 * Puts a saved order back into the flat list the whole screen is drawn from.
 *
 * That list holds every song, of every canzoniere, and the reorder only spoke for
 * one of them. So the slots the named songs already occupy are kept and refilled in
 * the new order: whatever sits between them — a song of another canzoniere, which
 * nothing here should move — stays exactly where it was.
 *
 * It rearranges exactly the names it is given and asks no questions about the rest,
 * because it cannot answer them: whether a song missing from the order belongs to the
 * same canzoniere is known on the server, and that is where a partial order is
 * refused. What it does refuse is a name the list has not got, which would otherwise
 * mean dropping a row to make the count fit.
 */
export function applyOrder<T extends { slug: string }>(items: T[], order: string[]): T[] {
  const wanted = new Set(order)
  const slots = items.flatMap((item, index) => (wanted.has(item.slug) ? [index] : []))
  if (slots.length !== order.length) return items

  const byslug = new Map(items.map((item) => [item.slug, item]))
  const moved = order.map((slug) => byslug.get(slug))
  if (moved.some((item) => item === undefined)) return items

  const next = [...items]
  slots.forEach((slot, index) => {
    next[slot] = moved[index] as T
  })
  return next
}

/** A row's vertical extent, as it was measured before anything moved. */
export interface Band {
  top: number
  bottom: number
}

/**
 * Which row a pointer at `y` is over.
 *
 * The bands are measured once, when the drag starts, and are *not* re-measured as
 * the rows move under the finger. That is deliberate: the rows are reordered live,
 * so measuring again would move the very boundaries the pointer is being compared
 * against, and the list would oscillate between two orders while the finger sat
 * still. Fixed bands mean the finger has to travel a whole row to displace one,
 * which is also what it looks like it should do.
 *
 * Rows are not all the same height — a song with an artist is taller than one
 * without — so this walks the bands rather than dividing by a row height.
 */
export function bandAt(bands: Band[], y: number): number {
  if (bands.length === 0) return 0
  if (y < bands[0].top) return 0

  const found = bands.findIndex((band) => y < band.bottom)
  return found === -1 ? bands.length - 1 : found
}
