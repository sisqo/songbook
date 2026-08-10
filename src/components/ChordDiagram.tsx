import type { ChordShape } from '@/lib/music/shapes'

/**
 * A chord box: six strings, five frets, a dot where a finger goes.
 *
 * Drawn as SVG with `currentColor` so it belongs to whichever theme is on, and
 * sized in `em` so the dialog controls how big it is.
 */

const STRING_GAP = 16
const FRET_GAP = 22
const LEFT = 14
const TOP = 26
const FRETS_SHOWN = 5

const RIGHT = LEFT + STRING_GAP * 5
const BOTTOM = TOP + FRET_GAP * FRETS_SHOWN

export function ChordDiagram({ shape }: { shape: ChordShape }) {
  const fretted = shape.frets.filter((fret): fret is number => fret !== null && fret > 0)
  const lowest = fretted.length === 0 ? 1 : Math.min(...fretted)
  const highest = fretted.length === 0 ? 1 : Math.max(...fretted)

  /**
   * Where the window starts. Anything reachable inside the first four frets is
   * drawn at the nut, which is how the shape is recognised; higher up the window
   * slides and says which fret it starts on.
   */
  const atNut = highest <= FRETS_SHOWN - 1
  const base = atNut ? 1 : lowest

  /**
   * One finger across several strings. Every movable form is played this way, and
   * without the bar an F#m reads as six separate fingers at two different frets.
   * Drawn from the lowest string on that fret to the highest, as a chord chart
   * does — the strings in between belong to the bar even when another finger
   * frets them higher up.
   */
  const onLowest = shape.frets
    .map((fret, string) => (fret === lowest && fret > 0 ? string : -1))
    .filter((string) => string !== -1)
  const barre = onLowest.length >= 3 ? { fret: lowest, from: onLowest[0], to: onLowest.at(-1)! } : null

  const y = (fret: number) => TOP + FRET_GAP * (fret - base) + FRET_GAP / 2

  return (
    <svg
      viewBox={`0 0 ${RIGHT + LEFT} ${BOTTOM + 8}`}
      className="chord-diagram"
      role="img"
      aria-hidden
      focusable="false"
    >
      {/* The nut, or a plain fret when the window has moved up the neck. */}
      <line
        x1={LEFT}
        y1={TOP}
        x2={RIGHT}
        y2={TOP}
        strokeWidth={atNut ? 4 : 1.2}
        strokeLinecap="butt"
      />

      {Array.from({ length: FRETS_SHOWN }, (_, index) => (
        <line
          key={index}
          x1={LEFT}
          y1={TOP + FRET_GAP * (index + 1)}
          x2={RIGHT}
          y2={TOP + FRET_GAP * (index + 1)}
          strokeWidth={1.2}
        />
      ))}

      {shape.frets.map((_, string) => (
        <line
          key={string}
          x1={LEFT + STRING_GAP * string}
          y1={TOP}
          x2={LEFT + STRING_GAP * string}
          y2={BOTTOM}
          strokeWidth={1.2}
        />
      ))}

      {!atNut && (
        <text x={LEFT - 5} y={TOP + FRET_GAP * 0.72} className="chord-diagram-fret" textAnchor="end">
          {base}
        </text>
      )}

      {barre !== null && (
        <rect
          x={LEFT + STRING_GAP * barre.from - 6}
          y={y(barre.fret) - 6}
          width={STRING_GAP * (barre.to - barre.from) + 12}
          height={12}
          rx={6}
          className="chord-diagram-dot"
          stroke="none"
        />
      )}

      {shape.frets.map((fret, string) => {
        const x = LEFT + STRING_GAP * string

        // Already covered by the bar.
        if (barre !== null && fret === barre.fret) return null

        if (fret === null) {
          return (
            <g key={string} className="chord-diagram-mute">
              <line x1={x - 4} y1={TOP - 15} x2={x + 4} y2={TOP - 7} strokeWidth={1.6} />
              <line x1={x - 4} y1={TOP - 7} x2={x + 4} y2={TOP - 15} strokeWidth={1.6} />
            </g>
          )
        }

        if (fret === 0) {
          return (
            <circle
              key={string}
              cx={x}
              cy={TOP - 11}
              r={4}
              fill="none"
              strokeWidth={1.6}
              className="chord-diagram-open"
            />
          )
        }

        return (
          <circle
            key={string}
            cx={x}
            cy={y(fret)}
            r={6}
            className="chord-diagram-dot"
            stroke="none"
          />
        )
      })}
    </svg>
  )
}
