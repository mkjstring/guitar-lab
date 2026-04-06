import { useEffect, useRef, useMemo } from 'react'
import { CustomSelect } from './CustomSelect'
import type { ChordInfo } from './Fretboard'

// Standard tuning open string semitones (low E to high e)
const OPEN_STRINGS = [4, 9, 2, 7, 11, 4]
const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e']
const STRING_WIDTHS = [2.8, 2.4, 2.0, 1.5, 1.1, 0.8]

const FRET_COUNT = 15
const INLAY_FRETS = [3, 5, 7, 9, 12, 15]
const STRING_COUNT = 6

const OPEN_COL_W = 44
const NUT_W = 5
const FRET_SPACING = 50
const NUT_X = OPEN_COL_W + NUT_W
const TOP_PAD = 30
const BOT_PAD = 22
const SVG_H = 185
const SVG_W = NUT_X + FRET_COUNT * FRET_SPACING + 16

const STR_SPAN = SVG_H - TOP_PAD - BOT_PAD
const STRING_SPACING = STR_SPAN / (STRING_COUNT - 1)

const CHROMATIC_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const CHROMATIC_FLAT  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

const PENTATONIC_INTERVALS: Record<'major' | 'minor', number[]> = {
  major: [0, 2, 4, 7, 9],
  minor: [0, 3, 5, 7, 10],
}

function noteToSemitone(note: string): number {
  let idx = CHROMATIC_SHARP.indexOf(note)
  if (idx === -1) idx = CHROMATIC_FLAT.indexOf(note)
  return idx
}

function stringY(s: number) { return TOP_PAD + s * STRING_SPACING }
function fretLineX(n: number) { return NUT_X + n * FRET_SPACING }
function dotCenterX(fret: number) {
  return fret === 0 ? OPEN_COL_W / 2 : NUT_X + (fret - 0.5) * FRET_SPACING
}

const midStringY = stringY(0) + STR_SPAN / 2

// Degree colors: index 0 = degree 1 (root), …, index 6 = degree 7
const DEGREE_COLORS = [
  '#818cf8', // 1 — root (indigo)
  '#94a3b8', // 2 — 2nd (slate)
  '#f59e0b', // 3 — 3rd (amber)
  '#2dd4bf', // 4 — 4th (teal)
  '#4ade80', // 5 — 5th (green)
  '#f472b6', // 6 — 6th (pink)
  '#f87171', // 7 — 7th (red)
]

const DEGREE_LABELS = ['R', '2', '3', '4', '5', '6', '7']

const GHOST_FILL    = '#2a2f45'
const GHOST_OPACITY = 0.45
const NEUTRAL_FILL  = '#667eea'
const NEUTRAL_OPACITY = 0.55

const ALL_DEGREES = new Set([1, 2, 3, 4, 5, 6, 7])
const CHORD_DEFAULT_DEGREES = new Set([1, 3, 5])

// Sort scale PCs from the chord root ascending by interval distance
function sortedFromRoot(root: number, scale: Set<number>): number[] {
  return [...scale].sort((a, b) =>
    ((a - root + 12) % 12) - ((b - root + 12) % 12)
  )
}

interface FretboardV2Props {
  tonicSemitone: number
  scaleSemitones: Set<number>
  chords: ChordInfo[]
  useFlats: boolean
  mode: 'major' | 'minor'
  selectedDegree: string
  onDegreeChange: (degree: string) => void
  activeDegrees: Set<number>
  onActiveDegreesChange: (degrees: Set<number>) => void
}

export function FretboardV2({
  tonicSemitone,
  scaleSemitones,
  chords,
  useFlats,
  mode,
  selectedDegree,
  onDegreeChange,
  activeDegrees,
  onActiveDegreesChange,
}: FretboardV2Props) {
  const chromatic = useFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP

  const isScale = selectedDegree === 'scale' || selectedDegree === 'pentatonic'
  const chord = chords.find(c => c.numeral === selectedDegree) ?? null

  // Only reset activeDegrees on scale↔chord transitions, not on chord→chord changes
  const wasScaleRef = useRef(isScale)
  useEffect(() => {
    const wasScale = wasScaleRef.current
    wasScaleRef.current = isScale
    if (wasScale && !isScale) {
      // scale → chord: reset to default [1,3,5]
      onActiveDegreesChange(new Set(CHORD_DEFAULT_DEGREES))
    } else if (!wasScale && isScale) {
      // chord → scale: show all
      onActiveDegreesChange(new Set(ALL_DEGREES))
    }
    // chord → chord: no change — activeDegrees persists
  }, [isScale])

  const pentatonicSemitones = new Set(
    PENTATONIC_INTERVALS[mode].map(i => (tonicSemitone + i) % 12)
  )

  const activeNoteSet = selectedDegree === 'pentatonic' ? pentatonicSemitones : scaleSemitones

  const chordRoot = chord ? noteToSemitone(chord.note) : tonicSemitone

  // Sorted scale PCs from the current reference root
  const sortedDegrees = useMemo(
    () => sortedFromRoot(chordRoot, scaleSemitones),
    [chordRoot, scaleSemitones]
  )

  function degreeIndex(pc: number): number {
    return sortedDegrees.indexOf(pc)
  }

  function toggleDegree(deg: number) {
    const next = new Set(activeDegrees)
    if (next.has(deg)) {
      if (next.size > 1) next.delete(deg)
    } else {
      next.add(deg)
    }
    onActiveDegreesChange(next)
  }

  return (
    <div className="w-full p-6">
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <CustomSelect
          id="fretboard-v2-degree-select"
          value={selectedDegree}
          onChange={onDegreeChange}
          options={[
            { value: 'scale', label: 'Scale — all diatonic notes' },
            { value: 'pentatonic', label: `Pentatonic — ${mode} pentatonic notes` },
            ...chords.map(c => ({ value: c.numeral, label: `${c.numeral} — ${c.note} (${c.quality})` })),
          ]}
        />
        {!isScale && (
          <p className="text-muted text-xs m-0">Click any note to toggle that degree</p>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="block min-w-[600px] w-full h-auto"
          aria-label="Guitar fretboard — all diatonic notes"
        >
          {/* Fret number labels */}
          {Array.from({ length: FRET_COUNT }, (_, i) => i + 1).map(fret => (
            <text key={fret} x={dotCenterX(fret)} y={14} textAnchor="middle" className="fret-number">
              {fret}
            </text>
          ))}

          {/* Inlay dots */}
          {INLAY_FRETS.map(fret => {
            const x = dotCenterX(fret)
            return fret === 12 ? (
              <g key={fret}>
                <circle cx={x} cy={midStringY - 9} r={3.5} className="fret-inlay" />
                <circle cx={x} cy={midStringY + 9} r={3.5} className="fret-inlay" />
              </g>
            ) : (
              <circle key={fret} cx={x} cy={midStringY} r={3.5} className="fret-inlay" />
            )
          })}

          {/* Nut */}
          <rect
            x={NUT_X - NUT_W} y={stringY(0) - 3}
            width={NUT_W} height={stringY(STRING_COUNT - 1) - stringY(0) + 6}
            rx={1} className="fret-nut"
          />

          {/* Fret lines */}
          {Array.from({ length: FRET_COUNT }, (_, i) => i + 1).map(fret => (
            <line key={fret}
              x1={fretLineX(fret)} y1={stringY(0) - 2}
              x2={fretLineX(fret)} y2={stringY(STRING_COUNT - 1) + 2}
              className="fret-line"
            />
          ))}

          {/* String lines + labels */}
          {Array.from({ length: STRING_COUNT }, (_, s) => {
            const y = stringY(STRING_COUNT - 1 - s)
            return (
              <g key={s}>
                <text x={OPEN_COL_W / 2} y={y} textAnchor="middle" dominantBaseline="central" className="string-label">
                  {STRING_LABELS[s]}
                </text>
                <line
                  x1={NUT_X - NUT_W} y1={y}
                  x2={SVG_W - 8} y2={y}
                  className="string-line"
                  strokeWidth={STRING_WIDTHS[s]}
                />
              </g>
            )
          })}

          {/* Note dots — always show all diatonic notes */}
          {Array.from({ length: STRING_COUNT }, (_, s) =>
            Array.from({ length: FRET_COUNT + 1 }, (_, fret) => {
              const semitone = (OPEN_STRINGS[s] + fret) % 12
              if (!activeNoteSet.has(semitone)) return null

              const x = dotCenterX(fret)
              const y = stringY(STRING_COUNT - 1 - s)

              if (isScale) {
                const isTonic = semitone === tonicSemitone
                const fill = isTonic ? DEGREE_COLORS[0] : NEUTRAL_FILL
                const fillOpacity = isTonic ? 1 : NEUTRAL_OPACITY
                return (
                  <g key={`${s}-${fret}`}>
                    <circle cx={x} cy={y} r={12} fill={fill} fillOpacity={fillOpacity} />
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="note-dot-label">
                      {chromatic[semitone]}
                    </text>
                  </g>
                )
              }

              // Chord selected: color by degree
              const deg = degreeIndex(semitone)
              const degNum = deg + 1  // 1-based
              const isActive = activeDegrees.has(degNum)
              const fill = isActive ? DEGREE_COLORS[deg] : GHOST_FILL
              const opacity = isActive ? 1 : GHOST_OPACITY

              return (
                <g
                  key={`${s}-${fret}`}
                  onClick={() => toggleDegree(degNum)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={x} cy={y} r={12} fill={fill} fillOpacity={opacity} />
                  <text
                    x={x} y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="note-dot-label"
                    fillOpacity={isActive ? 1 : GHOST_OPACITY + 0.15}
                  >
                    {chromatic[semitone]}
                  </text>
                </g>
              )
            })
          )}
        </svg>
      </div>

      {/* Degree legend — shown when a chord is selected */}
      {!isScale && (
        <div className="flex gap-3 flex-wrap mt-3">
          {sortedDegrees.map((pc, i) => {
            const degNum = i + 1
            const isActive = activeDegrees.has(degNum)
            const color = DEGREE_COLORS[i]
            return (
              <button
                key={i}
                onClick={() => toggleDegree(degNum)}
                className="flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
                style={{ opacity: isActive ? 1 : 0.35 }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                  style={{ background: color }}
                />
                <span className="text-xs font-semibold" style={{ color }}>
                  {DEGREE_LABELS[i]} — {chromatic[pc]}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
