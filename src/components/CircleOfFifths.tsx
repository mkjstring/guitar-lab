import { useState, useEffect } from 'react'
import { FretboardV2 } from './FretboardV2'
import { ChordsPanel } from './ChordsPanel'
import { ProgressionLab, type ProgressionBar } from './ProgressionLab'

const CX = 250, CY = 250
const R_OUTER_MAJOR = 230, R_INNER_MAJOR = 160
const R_OUTER_MINOR = 160, R_INNER_MINOR = 105
const R_OUTER_KEYSIG = 105, R_INNER_KEYSIG = 65
const R_CENTER = 55

const CIRCLE_KEYS = [
  { major: 'C',  minor: 'Am',  sharps: 0, flats: 0 },
  { major: 'G',  minor: 'Em',  sharps: 1, flats: 0 },
  { major: 'D',  minor: 'Bm',  sharps: 2, flats: 0 },
  { major: 'A',  minor: 'F♯m', sharps: 3, flats: 0 },
  { major: 'E',  minor: 'C♯m', sharps: 4, flats: 0 },
  { major: 'B',  minor: 'G♯m', sharps: 5, flats: 0 },
  { major: 'F♯', minor: 'E♭m', sharps: 6, flats: 6 },
  { major: 'D♭', minor: 'B♭m', sharps: 0, flats: 5 },
  { major: 'A♭', minor: 'Fm',  sharps: 0, flats: 4 },
  { major: 'E♭', minor: 'Cm',  sharps: 0, flats: 3 },
  { major: 'B♭', minor: 'Gm',  sharps: 0, flats: 2 },
  { major: 'F',  minor: 'Dm',  sharps: 0, flats: 1 },
]

const CHROMATIC_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const CHROMATIC_FLAT  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

const SHARPS_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLATS_ORDER  = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

const MAJOR_INTERVALS  = [0, 2, 4, 5, 7, 9, 11]
const MAJOR_QUALITIES  = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'] as const
const MAJOR_NUMERALS   = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] as const

const MINOR_INTERVALS  = [0, 2, 3, 5, 7, 8, 10]
const MINOR_QUALITIES  = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'] as const
const MINOR_NUMERALS   = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] as const

// Scale degree labels for each clockwise step away from the selected tonic
// dist 0=tonic, 1=V, 2=II, 3=VI, 4=III, 5=VII, 6=♭V, 7=♭II, 8=♭VI, 9=♭III, 10=♭VII, 11=IV
const MAJOR_DEGREE_LABELS = ['I', 'V', 'II', 'VI', 'III', 'VII', '♭V', '♭II', '♭VI', '♭III', '♭VII', 'IV']
const MINOR_DEGREE_LABELS = ['i', 'v', 'ii', 'vi', 'iii', 'vii', '♭v', '♭ii', '♭vi', '♭iii', '♭vii', 'iv']

type Mode = 'major' | 'minor'

function findMatchingDegree(
  currentDegree: string,
  currentChords: { numeral: string }[],
  newChords: { numeral: string }[]
): string {
  if (currentDegree === 'scale' || currentDegree === 'pentatonic') return currentDegree
  const idx = currentChords.findIndex(c => c.numeral === currentDegree)
  if (idx === -1) return 'scale'
  return newChords[idx]?.numeral ?? 'scale'
}

function toRad(deg: number) { return (deg * Math.PI) / 180 }

function arcPath(
  cx: number, cy: number,
  rOuter: number, rInner: number,
  startDeg: number, endDeg: number
): string {
  const s = toRad(startDeg)
  const e = toRad(endDeg)
  const x1 = cx + rOuter * Math.cos(s)
  const y1 = cy + rOuter * Math.sin(s)
  const x2 = cx + rOuter * Math.cos(e)
  const y2 = cy + rOuter * Math.sin(e)
  const x3 = cx + rInner * Math.cos(e)
  const y3 = cy + rInner * Math.sin(e)
  const x4 = cx + rInner * Math.cos(s)
  const y4 = cy + rInner * Math.sin(s)
  return [
    `M ${x1.toFixed(3)} ${y1.toFixed(3)}`,
    `A ${rOuter} ${rOuter} 0 0 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`,
    `L ${x3.toFixed(3)} ${y3.toFixed(3)}`,
    `A ${rInner} ${rInner} 0 0 0 ${x4.toFixed(3)} ${y4.toFixed(3)}`,
    'Z',
  ].join(' ')
}

function labelPos(rOuter: number, rInner: number, segIndex: number) {
  const midAngleDeg = -90 + segIndex * 30 + 15
  const midAngleRad = toRad(midAngleDeg)
  const r = (rOuter + rInner) / 2
  return {
    x: CX + r * Math.cos(midAngleRad),
    y: CY + r * Math.sin(midAngleRad),
  }
}

function getRootSemitone(note: string): number {
  let idx = CHROMATIC_SHARP.indexOf(note)
  if (idx === -1) idx = CHROMATIC_FLAT.indexOf(note)
  return idx
}

// Strip trailing 'm' to get the root note of a minor key string (e.g. "F♯m" → "F♯")
function minorRoot(minorKey: string): string {
  return minorKey.endsWith('m') ? minorKey.slice(0, -1) : minorKey
}

function getMajorChords(keyIndex: number) {
  const key = CIRCLE_KEYS[keyIndex]
  const chromatic = key.flats > 0 ? CHROMATIC_FLAT : CHROMATIC_SHARP
  const root = getRootSemitone(key.major)
  return MAJOR_INTERVALS.map((offset, degree) => ({
    numeral: MAJOR_NUMERALS[degree],
    note: chromatic[(root + offset) % 12],
    quality: MAJOR_QUALITIES[degree],
  }))
}

function getMajorScaleNotes(keyIndex: number): string[] {
  const key = CIRCLE_KEYS[keyIndex]
  const chromatic = key.flats > 0 ? CHROMATIC_FLAT : CHROMATIC_SHARP
  const root = getRootSemitone(key.major)
  return MAJOR_INTERVALS.map(offset => chromatic[(root + offset) % 12])
}

function getMinorChords(keyIndex: number) {
  const key = CIRCLE_KEYS[keyIndex]
  const chromatic = key.flats > 0 ? CHROMATIC_FLAT : CHROMATIC_SHARP
  const root = getRootSemitone(minorRoot(key.minor))
  return MINOR_INTERVALS.map((offset, degree) => ({
    numeral: MINOR_NUMERALS[degree],
    note: chromatic[(root + offset) % 12],
    quality: MINOR_QUALITIES[degree],
  }))
}

function getMinorScaleNotes(keyIndex: number): string[] {
  const key = CIRCLE_KEYS[keyIndex]
  const chromatic = key.flats > 0 ? CHROMATIC_FLAT : CHROMATIC_SHARP
  const root = getRootSemitone(minorRoot(key.minor))
  return MINOR_INTERVALS.map(offset => chromatic[(root + offset) % 12])
}

export function CircleOfFifths() {
  const [rotation, setRotation] = useState(-15)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [selectedMode, setSelectedMode] = useState<Mode>('major')
  const [selectedDegree, setSelectedDegree] = useState('scale')
  const [activeFretboardDegrees, setActiveFretboardDegrees] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6, 7]))
  const [activeTab, setActiveTab] = useState<'fretboard' | 'chords' | 'progression'>('fretboard')
  const [primedBar, setPrimedBar] = useState<number | null>(null)
  const [progressionBars, setProgressionBars] = useState<ProgressionBar[]>(
    Array(4).fill(null).map(() => ({ degree: null }))
  )
  const [progressionBarCount, setProgressionBarCount] = useState(4)
  const [isProgressionPlaying, setIsProgressionPlaying] = useState(false)
  const [stopRequest, setStopRequest] = useState(false)
  const [activeProgressionBar, setActiveProgressionBar] = useState<number | null>(null)

  useEffect(() => {
    if (!isProgressionPlaying) {
      setStopRequest(false)
      if (activeTab === 'progression' && progressionBars.every(b => b.degree === null)) {
        setPrimedBar(0)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProgressionPlaying])

  useEffect(() => {
    if (activeTab === 'progression' && !isProgressionPlaying && primedBar === null) {
      const firstEmpty = progressionBars.findIndex(b => b.degree === null)
      if (firstEmpty !== -1) setPrimedBar(firstEmpty)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  function rotate(index: number) {
    const currentMod = ((rotation % 360) + 360) % 360
    const targetMod  = ((-(index * 30 + 15) % 360) + 360) % 360
    let delta = targetMod - currentMod
    if (delta > 180)  delta -= 360
    if (delta <= -180) delta += 360
    setRotation(prev => prev + delta)
  }

  function handleMajorClick(index: number) {
    if (isProgressionPlaying && activeTab === 'progression') return
    const newChords = getMajorChords(index)
    setSelectedDegree(prev => findMatchingDegree(prev, chords, newChords))
    setSelectedIndex(index)
    setSelectedMode('major')
    rotate(index)
  }

  function handleMinorClick(index: number) {
    if (isProgressionPlaying && activeTab === 'progression') return
    const newChords = getMinorChords(index)
    setSelectedDegree(prev => findMatchingDegree(prev, chords, newChords))
    setSelectedIndex(index)
    setSelectedMode('minor')
    rotate(index)
  }

  const selectedKey = CIRCLE_KEYS[selectedIndex]
  const isMajor = selectedMode === 'major'

  const chords     = isMajor ? getMajorChords(selectedIndex)     : getMinorChords(selectedIndex)
  const scaleNotes = isMajor ? getMajorScaleNotes(selectedIndex) : getMinorScaleNotes(selectedIndex)

  const keyDisplayName = isMajor
    ? `${selectedKey.major} Major`
    : `${minorRoot(selectedKey.minor)} Minor`

  const keySigLabel = selectedKey.sharps > 0
    ? `${selectedKey.sharps} sharp${selectedKey.sharps > 1 ? 's' : ''}`
    : selectedKey.flats > 0
    ? `${selectedKey.flats} flat${selectedKey.flats > 1 ? 's' : ''}`
    : 'No sharps or flats'

  const centerLabel = isMajor ? selectedKey.major : minorRoot(selectedKey.minor)

  const tonicSemitone = getRootSemitone(isMajor ? selectedKey.major : minorRoot(selectedKey.minor))
  const scaleSemitones = new Set(scaleNotes.map(n => getRootSemitone(n)))
  const useFlats = selectedKey.flats > 0

  return (
    <div className="flex flex-col items-stretch gap-8 max-w-[960px] w-full">
      <div className="flex flex-col items-center gap-10 w-full min-[800px]:flex-row min-[800px]:items-start min-[800px]:justify-between">
      <div className="w-full max-w-[500px] shrink-0 min-[800px]:w-[min(460px,50%)] min-[800px]:flex-none">
        <svg
          viewBox="0 0 500 500"
          className="cof-svg w-full h-auto block"
          aria-label="Circle of fifths — click a key to select it"
          role="img"
          style={isProgressionPlaying && activeTab === 'progression' ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
        >
          <defs>
            <linearGradient id="centerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#667eea" />
              <stop offset="100%" stopColor="#764ba2" />
            </linearGradient>
            <linearGradient id="centerGradientMinor" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#764ba2" />
              <stop offset="100%" stopColor="#9f3fbf" />
            </linearGradient>
          </defs>

          <g
            className="cof-rotating-group"
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: 'transform 0.6s cubic-bezier(0.34, 1.2, 0.64, 1)',
            }}
          >
            {/* Center circle */}
            <circle
              cx={CX} cy={CY} r={R_CENTER}
              fill={isMajor ? 'url(#centerGradient)' : 'url(#centerGradientMinor)'}
            />
            <text
              x={CX} y={CY}
              transform={`rotate(${-rotation}, ${CX}, ${CY})`}
              textAnchor="middle"
              dominantBaseline="central"
              className="cof-center-label"
            >
              {centerLabel}
            </text>

            {CIRCLE_KEYS.map((key, i) => {
              const startDeg = -90 + i * 30
              const endDeg = startDeg + 30
              const isSelected = i === selectedIndex
              const isMajorActive = isSelected && isMajor
              const isMinorActive = isSelected && !isMajor

              const majorPos  = labelPos(R_OUTER_MAJOR,  R_INNER_MAJOR,  i)
              const minorPos  = labelPos(R_OUTER_MINOR,  R_INNER_MINOR,  i)
              const keySigPos = labelPos(R_OUTER_KEYSIG, R_INNER_KEYSIG, i)
              const dist = (i - selectedIndex + 12) % 12
              const degreeLabel = isMajor ? MAJOR_DEGREE_LABELS[dist] : MINOR_DEGREE_LABELS[dist]
              const isTonic = dist === 0
              const diatonic = dist <= 5 || dist === 11

              return (
                <g key={key.major}>
                  {/* Diatonic indicator arc (outer rim of major ring) */}
                  {diatonic && (
                    <path
                      d={arcPath(CX, CY, 232, 228, startDeg, endDeg)}
                      className="seg-diatonic-indicator"
                    />
                  )}

                  {/* Major ring */}
                  <path
                    d={arcPath(CX, CY, R_OUTER_MAJOR, R_INNER_MAJOR, startDeg, endDeg)}
                    className={`seg-major${isMajorActive ? ' seg-major-active' : ''}${!diatonic ? ' non-diatonic' : ''}`}
                    onClick={() => handleMajorClick(i)}
                    role="button"
                    aria-label={`${key.major} major`}
                  />
                  {/* Minor ring */}
                  <path
                    d={arcPath(CX, CY, R_OUTER_MINOR, R_INNER_MINOR, startDeg, endDeg)}
                    className={`seg-minor${isMinorActive ? ' seg-minor-active' : ''}${!diatonic ? ' non-diatonic' : ''}`}
                    onClick={() => handleMinorClick(i)}
                    role="button"
                    aria-label={`${key.minor}`}
                  />
                  {/* Key signature ring */}
                  <path
                    d={arcPath(CX, CY, R_OUTER_KEYSIG, R_INNER_KEYSIG, startDeg, endDeg)}
                    className="seg-keysig"
                  />

                  {/* Major label */}
                  <text
                    x={majorPos.x} y={majorPos.y}
                    transform={`rotate(${-rotation}, ${majorPos.x}, ${majorPos.y})`}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`label-major${isMajorActive ? ' label-major-active' : ''}${!diatonic ? ' non-diatonic' : ''}`}
                  >
                    {key.major}
                  </text>

                  {/* Minor label */}
                  <text
                    x={minorPos.x} y={minorPos.y}
                    transform={`rotate(${-rotation}, ${minorPos.x}, ${minorPos.y})`}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`label-minor${isMinorActive ? ' label-minor-active' : ''}${!diatonic ? ' non-diatonic' : ''}`}
                  >
                    {key.minor}
                  </text>

                  {/* Degree label */}
                  <text
                    x={keySigPos.x} y={keySigPos.y}
                    transform={`rotate(${-rotation}, ${keySigPos.x}, ${keySigPos.y})`}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`label-keysig${isTonic ? ' label-keysig-tonic' : ''}`}
                  >
                    {degreeLabel}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      <div className={`bg-bg-card border border-transparent rounded-2xl p-7 w-full max-w-[500px] transition-[border-color] duration-300 max-[480px]:p-5 max-[480px]:px-4 min-[800px]:flex-none min-[800px]:w-[min(380px,45%)] min-[800px]:max-w-[380px] min-[800px]:mr-[18px]${isMajor ? '' : ' cof-info-panel--minor'}`}>
        <div className="flex justify-between items-start gap-3 mb-7">
          <div>
            <h2 className="text-text text-[26px] font-bold m-0 mb-1">{keyDisplayName}</h2>
            <p className="text-text-dim text-sm m-0">{keySigLabel}</p>
          </div>
          <div className="shrink-0">
            {selectedKey.sharps === 0 && selectedKey.flats === 0 ? (
              <div className="text-muted text-[22px] font-light leading-none pt-1">♮</div>
            ) : (
              <div className="flex gap-[5px] flex-wrap justify-end max-w-[120px]">
                {(selectedKey.sharps > 0
                  ? SHARPS_ORDER.slice(0, selectedKey.sharps)
                  : FLATS_ORDER.slice(0, selectedKey.flats)
                ).map(note => (
                  <div key={note} className="flex flex-col items-center gap-px">
                    <span className="key-sig-sym text-accent text-[13px] font-bold leading-none">{selectedKey.sharps > 0 ? '♯' : '♭'}</span>
                    <span className="text-muted text-[9px] font-semibold tracking-[0.02em]">{note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mb-6 last:mb-0">
          <h3 className="text-text-soft text-[11px] font-semibold tracking-[0.08em] uppercase m-0 mb-[10px]">Scale Notes</h3>
          <div className="grid grid-cols-7 gap-1.5">
            {scaleNotes.map((note, i) => (
              <span key={i} className="info-note-badge bg-[rgba(102,126,234,0.15)] border border-[rgba(102,126,234,0.3)] rounded-md text-accent-soft text-[13px] font-semibold py-1.5 px-1 text-center">{note}</span>
            ))}
          </div>
        </div>

        <div className="mb-6 last:mb-0">
          <h3 className="text-text-soft text-[11px] font-semibold tracking-[0.08em] uppercase m-0 mb-[10px]">Diatonic Chords</h3>
          <div className={`info-chords grid grid-cols-7 gap-1.5 transition-[outline] duration-150 max-[480px]:grid-cols-4${activeTab === 'progression' && primedBar !== null ? ' info-chords--selecting' : ''}`}>
            {chords.map(chord => (
              <div
                key={chord.numeral}
                className={`info-chord${selectedDegree === chord.numeral ? ' info-chord-active' : ''}`}
                onClick={() => {
                  if (activeTab === 'progression' && primedBar !== null) {
                    const nextBars = progressionBars.map((b, i) =>
                      i === primedBar ? { ...b, degree: chord.numeral } : b
                    )
                    setProgressionBars(nextBars)
                    const nextIdx = primedBar + 1
                    if (nextIdx < nextBars.length && nextBars[nextIdx].degree === null) {
                      setPrimedBar(nextIdx)
                    } else {
                      setPrimedBar(null)
                    }
                  } else {
                    setSelectedDegree(prev => prev === chord.numeral ? 'scale' : chord.numeral)
                  }
                }}
                role="button"
                aria-label={`Show ${chord.numeral} triad on fretboard`}
              >
                <span className="chord-numeral">{chord.numeral}</span>
                <span className="chord-name">{chord.note}</span>
                <span className="chord-quality">{chord.quality}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6 last:mb-0">
          <h3 className="text-text-soft text-[11px] font-semibold tracking-[0.08em] uppercase m-0 mb-[10px]">{isMajor ? 'Relative Minor' : 'Relative Major'}</h3>
          <button
            className="info-relative-link bg-[rgba(102,126,234,0.12)] border border-[rgba(102,126,234,0.3)] rounded-lg text-accent-soft text-lg font-semibold py-2 px-4 cursor-pointer transition-[background,border-color,color] duration-200 hover:bg-[rgba(102,126,234,0.25)] hover:border-[rgba(102,126,234,0.55)] hover:text-[#c7d2fe]"
            disabled={isProgressionPlaying && activeTab === 'progression'}
            onClick={() => isMajor ? handleMinorClick(selectedIndex) : handleMajorClick(selectedIndex)}
          >
            {isMajor ? selectedKey.minor : selectedKey.major}
          </button>
        </div>
      </div>
      </div>{/* end cof-top-row */}

      <div className="w-full bg-bg-deep rounded-2xl border border-border-dim overflow-hidden">
        <div className="flex gap-1 border-b border-border-dim">
          <button
            className={`bg-transparent border-0 border-b-2 border-b-transparent text-text-dim cursor-pointer text-sm font-medium px-5 py-2.5 -mb-px transition-[color,border-color] duration-200 hover:text-text-soft${activeTab === 'fretboard' ? ' !text-accent !border-b-accent' : ''}`}
            onClick={() => {
              if (selectedDegree !== 'scale' && selectedDegree !== 'pentatonic') {
                setActiveFretboardDegrees(new Set([1, 3, 5]))
              }
              setActiveTab('fretboard')
            }}
          >
            Fretboard
          </button>
          <button
            className={`bg-transparent border-0 border-b-2 border-b-transparent text-text-dim cursor-pointer text-sm font-medium px-5 py-2.5 -mb-px transition-[color,border-color] duration-200 hover:text-text-soft${activeTab === 'chords' ? ' !text-accent !border-b-accent' : ''}`}
            onClick={() => {
              setActiveTab('chords')
              if (selectedDegree === 'scale') setSelectedDegree(chords[0].numeral)
            }}
          >
            Chords
          </button>
          <button
            className={`bg-transparent border-0 border-b-2 border-b-transparent text-text-dim cursor-pointer text-sm font-medium px-5 py-2.5 -mb-px transition-[color,border-color] duration-200 hover:text-text-soft${activeTab === 'progression' ? ' !text-accent !border-b-accent' : ''}`}
            onClick={() => setActiveTab('progression')}
          >
            Progression
          </button>
          {progressionBars.some(b => b.degree !== null) && activeTab !== 'progression' && (
            <div className={`progression-mini-transport flex items-center gap-2 ml-auto py-1 px-3 pl-3 bg-[rgba(102,126,234,0.08)] border border-[rgba(102,126,234,0.2)] rounded-lg${stopRequest ? ' progression-mini-transport--stopping' : ''}`}>
              {isProgressionPlaying && (
                <span className="text-accent text-xs font-semibold tracking-[0.04em]">● Playing</span>
              )}
              <div className="flex gap-1">
                {progressionBars.map((bar, i) => {
                  const chord = bar.degree ? chords.find(c => c.numeral === bar.degree) : null
                  return (
                    <div
                      key={i}
                      className={`flex flex-col items-center gap-px bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-[5px] py-[3px] px-[7px] min-w-[36px] transition-[background,border-color] duration-150${activeProgressionBar === i ? ' !bg-[rgba(102,126,234,0.2)] !border-[rgba(102,126,234,0.5)]' : ''}`}
                    >
                      <span className={`text-accent text-[11px] font-bold${activeProgressionBar === i ? ' !text-accent-soft' : ''}`}>{chord ? `${bar.rootOffset === -1 ? '♭' : bar.rootOffset === 1 ? '♯' : ''}${chord.numeral}` : '—'}</span>
                      {chord && <span className={`text-text-soft text-[11px] font-medium${activeProgressionBar === i ? ' !text-text' : ''}`}>{chord.note}</span>}
                    </div>
                  )
                })}
              </div>
              {isProgressionPlaying && (
                <button
                  className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-md text-[#fca5a5] cursor-pointer text-[11px] font-semibold py-1 px-3 transition-[background,border-color] duration-150 hover:bg-[rgba(239,68,68,0.2)] hover:border-[rgba(239,68,68,0.55)] active:scale-[0.92] active:bg-[rgba(239,68,68,0.35)]"
                  onClick={() => setStopRequest(true)}
                >
                  ■ Stop
                </button>
              )}
            </div>
          )}
        </div>
        {activeTab === 'fretboard' && (
          <FretboardV2
            tonicSemitone={tonicSemitone}
            scaleSemitones={scaleSemitones}
            chords={chords}
            useFlats={useFlats}
            mode={selectedMode}
            selectedDegree={selectedDegree}
            onDegreeChange={setSelectedDegree}
            activeDegrees={activeFretboardDegrees}
            onActiveDegreesChange={setActiveFretboardDegrees}
          />
        )}
        {activeTab === 'chords' && (
          <ChordsPanel
            chords={chords}
            scaleSemitones={scaleSemitones}
            useFlats={useFlats}
            mode={selectedMode}
            selectedDegree={selectedDegree}
            onDegreeChange={setSelectedDegree}
          />
        )}
        <div style={{ display: activeTab === 'progression' ? 'block' : 'none' }}>
          <ProgressionLab
            chords={chords}
            scaleSemitones={scaleSemitones}
            mode={selectedMode}
            bars={progressionBars}
            barCount={progressionBarCount}
            onBarsChange={setProgressionBars}
            onBarCountChange={setProgressionBarCount}
            primedBar={primedBar}
            onPrimedBarChange={setPrimedBar}
            onPlayingChange={setIsProgressionPlaying}
            onActiveBarChange={setActiveProgressionBar}
            stopRequested={stopRequest}
          />
        </div>
      </div>
    </div>
  )
}
