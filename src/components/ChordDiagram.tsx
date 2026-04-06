import type { Voicing } from '../utils/chordVoicings'

const STRING_COLS = [37, 57, 77, 97, 117, 137]
const FRET_ROWS   = [50, 77, 104, 131, 158]
const NUT_Y = 36
const SVG_W = 168
const SVG_H = 178
const DOT_R = 11
const OPEN_Y = 22

// Fret position markers (center of fretboard)
const MARKER_X_SINGLE = (STRING_COLS[2] + STRING_COLS[3]) / 2  // = 87, between D and G
const MARKER_X_DOUBLE = [(STRING_COLS[1] + STRING_COLS[2]) / 2, (STRING_COLS[3] + STRING_COLS[4]) / 2]  // = [67, 107]
const MARKER_SINGLE = new Set([3, 5, 7, 9, 15, 17, 19, 21])
const MARKER_DOUBLE = new Set([12, 24])

const GUITAR_STRINGS_MIDI = [40, 45, 50, 55, 59, 64]
const CHROMATIC_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const CHROMATIC_FLAT  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

const TONE_LABELS = ['R', '3', '5', '7', '9']

interface ChordDiagramProps {
  voicing: Voicing
  chordTones: number[]
  useFlats: boolean
  mode: 'major' | 'minor'
  label: string
}

function dotClass(pc: number, chordTones: number[], mode: string): string {
  const idx = chordTones.indexOf(pc)
  if (idx === 0) return `note-dot note-dot-root note-dot-root-${mode}`
  if (idx === 1) return 'note-dot note-dot-third'
  if (idx === 2) return 'note-dot note-dot-fifth'
  if (idx === 3) return 'note-dot note-dot-seventh'
  if (idx === 4) return 'note-dot note-dot-ninth'
  return 'note-dot note-dot-scale'
}

function toneIndClass(i: number, mode: string): string {
  if (i === 0) return `tone-ind tone-ind-root tone-ind-root-${mode}`
  if (i === 1) return 'tone-ind tone-ind-third'
  if (i === 2) return 'tone-ind tone-ind-fifth'
  if (i === 3) return 'tone-ind tone-ind-seventh'
  return 'tone-ind tone-ind-ninth'
}

export function ChordDiagram({ voicing, chordTones, useFlats, mode, label }: ChordDiagramProps) {
  const chromatic = useFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP
  const { frets, baseFret, tonesPresent } = voicing

  const isOpenPosition = baseFret <= 1
  const fretOffset = isOpenPosition ? 0 : baseFret - 1

  const nutLeft  = STRING_COLS[0] - DOT_R
  const nutRight = STRING_COLS[5] + DOT_R
  const nutWidth = nutRight - nutLeft
  const bottomY  = FRET_ROWS[4] + 13

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="block w-[168px] h-auto"
        aria-label={`${label} chord shape`}
      >
        {/* Nut */}
        {isOpenPosition
          ? <rect x={nutLeft} y={NUT_Y - 5} width={nutWidth} height={6} className="cd-nut" />
          : <rect x={nutLeft} y={NUT_Y - 2} width={nutWidth} height={2} className="cd-fret-line-rect" />
        }

        {/* Fret position label */}
        {!isOpenPosition && (
          <text x={nutLeft - 4} y={FRET_ROWS[0]} textAnchor="end" dominantBaseline="central" className="cd-fret-number">
            {baseFret}
          </text>
        )}

        {/* Fret lines */}
        {FRET_ROWS.map((y, i) => (
          <line key={i} x1={nutLeft} y1={y + 13} x2={nutRight} y2={y + 13} className="cd-fret-line" />
        ))}

        {/* String lines */}
        {STRING_COLS.map((x, i) => (
          <line key={i} x1={x} y1={NUT_Y} x2={x} y2={bottomY} className="cd-string-line" />
        ))}

        {/* Fret position markers */}
        {FRET_ROWS.map((y, rowIdx) => {
          const absoluteFret = fretOffset + rowIdx + 1
          if (MARKER_DOUBLE.has(absoluteFret)) {
            return (
              <g key={rowIdx}>
                <circle cx={MARKER_X_DOUBLE[0]} cy={y} r={3} className="cd-fret-marker" />
                <circle cx={MARKER_X_DOUBLE[1]} cy={y} r={3} className="cd-fret-marker" />
              </g>
            )
          }
          if (MARKER_SINGLE.has(absoluteFret)) {
            return <circle key={rowIdx} cx={MARKER_X_SINGLE} cy={y} r={3} className="cd-fret-marker" />
          }
          return null
        })}

        {/* Open / muted markers */}
        {frets.map((f, i) => {
          const x = STRING_COLS[i]
          if (f === 'x') {
            return <text key={i} x={x} y={OPEN_Y} textAnchor="middle" dominantBaseline="central" className="cd-mute-mark">×</text>
          }
          if (f === 0) {
            return <circle key={i} cx={x} cy={OPEN_Y} r={6} className="cd-open-mark" />
          }
          return null
        })}

        {/* Fretted note dots */}
        {frets.map((f, strIdx) => {
          if (f === 'x' || f === 0) return null
          const row = (f as number) - fretOffset
          if (row < 1 || row > 5) return null
          const x = STRING_COLS[strIdx]
          const y = FRET_ROWS[row - 1]
          const pc = (GUITAR_STRINGS_MIDI[strIdx] + (f as number)) % 12
          const cls = tonesPresent.includes(pc) ? dotClass(pc, chordTones, mode) : 'note-dot note-dot-scale'
          return (
            <g key={strIdx}>
              <circle cx={x} cy={y} r={DOT_R} className={cls} />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="note-dot-label">
                {chromatic[pc]}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="text-text-soft text-xs font-medium text-center">{label}</div>
      <div className="flex gap-[3px]">
        {chordTones.map((pc, i) => (
          <span
            key={i}
            className={`${toneIndClass(i, mode)}${tonesPresent.includes(pc) ? '' : ' tone-ind-absent'}`}
          >
            {TONE_LABELS[i]}
          </span>
        ))}
      </div>
    </div>
  )
}
