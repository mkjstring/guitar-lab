import { useState, useRef, useCallback, useEffect } from 'react'
import * as Tone from 'tone'
import type { ChordInfo } from './Fretboard'
import type { ChordType } from '../utils/chordVoicings'
import { getDiatonicChordTones } from '../utils/chordVoicings'
import { CustomSelect } from './CustomSelect'
import { pitchClassesToMidi } from '../utils/midiUtils'
import { playChord, stopAll, setBpm as engineSetBpm, setTimeSignature as engineSetTimeSig, scheduleMetronome } from '../utils/audioEngine'

export type ChordQuality = 'major' | 'minor' | 'dominant' | 'augmented' | 'diminished' | 'half-dim' | 'min-maj'

export interface ProgressionBar {
  degree: string | null
  chordType?: ChordType
  rootOffset?: number       // -1 = ♭, +1 = ♯, undefined = natural
  qualityOverride?: ChordQuality
}

interface ProgressionLabProps {
  chords: ChordInfo[]
  scaleSemitones: Set<number>
  mode: 'major' | 'minor'
  bars: ProgressionBar[]
  barCount: number
  onBarsChange: (bars: ProgressionBar[]) => void
  onBarCountChange: (n: number) => void
  primedBar: number | null
  onPrimedBarChange: (idx: number | null) => void
  onPlayingChange: (playing: boolean) => void
  onActiveBarChange?: (bar: number | null) => void
  stopRequested: boolean
}

const CHROMATIC_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const CHROMATIC_FLAT  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

function noteToSemitone(note: string): number {
  let idx = CHROMATIC_SHARP.indexOf(note)
  if (idx === -1) idx = CHROMATIC_FLAT.indexOf(note)
  return idx
}

const DENOM_OPTIONS = [1, 2, 4, 8, 16, 32]
const BAR_COUNT_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12]

const CHORD_TYPES: { value: ChordType; label: string; sup: string }[] = [
  { value: 'triad', label: 'Triad', sup: '' },
  { value: '6th',   label: '6',     sup: '⁶' },
  { value: '7th',   label: '7',     sup: '⁷' },
  { value: '9th',   label: '9',     sup: '⁹' },
]

const QUALITY_OPTIONS: { value: ChordQuality | 'auto'; label: string }[] = [
  { value: 'auto',       label: 'auto' },
  { value: 'major',      label: 'maj' },
  { value: 'minor',      label: 'min' },
  { value: 'dominant',   label: 'dom' },
  { value: 'augmented',  label: 'aug' },
  { value: 'diminished', label: 'dim' },
  { value: 'half-dim',   label: 'ø' },
  { value: 'min-maj',    label: 'm△' },
]

// Fixed intervals per quality (relative to root, 0-based semitones)
const QUALITY_INTERVALS: Record<ChordQuality, number[]> = {
  major:      [0, 4, 7],
  minor:      [0, 3, 7],
  dominant:   [0, 4, 7],
  augmented:  [0, 4, 8],
  diminished: [0, 3, 6],
  'half-dim': [0, 3, 6, 10],
  'min-maj':  [0, 3, 7, 11],
}

// 7th to add for each quality when chordType is '7th'/'9th' and base is a triad
const QUALITY_SEVENTH: Record<ChordQuality, number> = {
  major: 11, minor: 10, dominant: 10, augmented: 11, diminished: 9, 'half-dim': 10, 'min-maj': 11,
}

function buildOverrideTones(rootSt: number, quality: ChordQuality, chordType: ChordType): number[] {
  const triad = QUALITY_INTERVALS[quality].slice(0, 3)

  let intervals: number[]
  if (chordType === 'triad') {
    intervals = triad
  } else if (chordType === '6th') {
    intervals = [...triad, 9]
  } else if (chordType === '7th') {
    intervals = [...triad, QUALITY_SEVENTH[quality]]
  } else { // '9th'
    intervals = [...triad, QUALITY_SEVENTH[quality], 2]
  }
  return intervals.map(i => (rootSt + i) % 12)
}

interface PresetBar {
  degree: string
  qualityOverride?: ChordQuality
  rootOffset?: number
}
interface Preset { name: string; bars: PresetBar[]; defaultChordType?: ChordType }

const COMMON_PROGRESSIONS_MAJOR: Preset[] = [
  { name: 'I–V–vi–IV',     bars: [{ degree: 'I' }, { degree: 'V' }, { degree: 'vi' }, { degree: 'IV' }] },
  { name: 'I–IV–V–I',      bars: [{ degree: 'I' }, { degree: 'IV' }, { degree: 'V' }, { degree: 'I' }] },
  { name: 'I–vi–IV–V',     bars: [{ degree: 'I' }, { degree: 'vi' }, { degree: 'IV' }, { degree: 'V' }] },
  { name: 'ii–V–I',        bars: [{ degree: 'ii' }, { degree: 'V' }, { degree: 'I' }] },
  { name: 'I–iii–IV–V',    bars: [{ degree: 'I' }, { degree: 'iii' }, { degree: 'IV' }, { degree: 'V' }] },
  { name: 'I–V–vi–iii–IV', bars: [{ degree: 'I' }, { degree: 'V' }, { degree: 'vi' }, { degree: 'iii' }, { degree: 'IV' }] },
  { name: 'vi–IV–I–V',     bars: [{ degree: 'vi' }, { degree: 'IV' }, { degree: 'I' }, { degree: 'V' }] },
  { name: 'I–IV–vii°–iii', bars: [{ degree: 'I' }, { degree: 'IV' }, { degree: 'vii°' }, { degree: 'iii' }] },
  { name: 'I–I–I–I–IV–IV–I–I–V–IV–I–V', defaultChordType: '7th', bars: [
    { degree: 'I',  qualityOverride: 'dominant' }, { degree: 'I',  qualityOverride: 'dominant' },
    { degree: 'I',  qualityOverride: 'dominant' }, { degree: 'I',  qualityOverride: 'dominant' },
    { degree: 'IV', qualityOverride: 'dominant' }, { degree: 'IV', qualityOverride: 'dominant' },
    { degree: 'I',  qualityOverride: 'dominant' }, { degree: 'I',  qualityOverride: 'dominant' },
    { degree: 'V',  qualityOverride: 'dominant' }, { degree: 'IV', qualityOverride: 'dominant' },
    { degree: 'I',  qualityOverride: 'dominant' }, { degree: 'V',  qualityOverride: 'dominant' },
  ]},
]

const COMMON_PROGRESSIONS_MINOR: Preset[] = [
  { name: 'i–VII–VI–VII', bars: [{ degree: 'i' }, { degree: 'VII' }, { degree: 'VI' }, { degree: 'VII' }] },
  { name: 'i–iv–v–i',     bars: [{ degree: 'i' }, { degree: 'iv' }, { degree: 'v' }, { degree: 'i' }] },
  { name: 'i–VI–III–VII', bars: [{ degree: 'i' }, { degree: 'VI' }, { degree: 'III' }, { degree: 'VII' }] },
  { name: 'i–VII–VI–v',   bars: [{ degree: 'i' }, { degree: 'VII' }, { degree: 'VI' }, { degree: 'v' }] },
  { name: 'i–iv–VII–III', bars: [{ degree: 'i' }, { degree: 'iv' }, { degree: 'VII' }, { degree: 'III' }] },
  { name: 'ii°–v–i',      bars: [{ degree: 'ii°' }, { degree: 'v' }, { degree: 'i' }] },
]

const COMMON_PROGRESSIONS_JPOP: Preset[] = [
  { name: 'IV–V–iii–vi', defaultChordType: '7th', bars: [
    { degree: 'IV' }, { degree: 'V' }, { degree: 'iii' }, { degree: 'vi' },
  ]},
  { name: 'IV–III–vi–I', defaultChordType: '7th', bars: [
    { degree: 'IV' }, { degree: 'iii', qualityOverride: 'major' }, { degree: 'vi' }, { degree: 'I' },
  ]},
  { name: 'IV–V–vi', defaultChordType: '7th', bars: [
    { degree: 'IV' }, { degree: 'V' }, { degree: 'vi' },
  ]},
  { name: '♭VI–♭VII–I', defaultChordType: '7th', bars: [
    { degree: 'vi', rootOffset: -1, qualityOverride: 'major' },
    { degree: 'vii°', rootOffset: -1, qualityOverride: 'major' },
    { degree: 'I' },
  ]},
  { name: 'IV–V–iii–vi–ii–V–I', defaultChordType: '7th', bars: [
    { degree: 'IV' }, { degree: 'V' }, { degree: 'iii' },
    { degree: 'vi' }, { degree: 'ii' }, { degree: 'V' }, { degree: 'I' },
  ]},
  { name: 'IV–V–I–vi', defaultChordType: '7th', bars: [
    { degree: 'IV' }, { degree: 'V' }, { degree: 'I' }, { degree: 'vi' },
  ]},
]

export function ProgressionLab({
  chords,
  scaleSemitones,
  mode,
  bars,
  barCount,
  onBarsChange,
  onBarCountChange,
  primedBar,
  onPrimedBarChange,
  onPlayingChange,
  onActiveBarChange,
  stopRequested,
}: ProgressionLabProps) {
  const [bpm, setBpmState] = useState(120)
  const [timeSig, setTimeSig] = useState<[number, number]>([4, 4])
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeBar, setActiveBar] = useState<number | null>(null)

  useEffect(() => {
    if (stopRequested && isPlaying) {
      handleStop()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopRequested])

  const barsRef = useRef(bars)
  barsRef.current = bars
  const timeSigRef = useRef(timeSig)
  timeSigRef.current = timeSig
  const bpmRef = useRef(bpm)
  bpmRef.current = bpm

  function handleBarClick(idx: number) {
    if (isPlaying) return
    if (primedBar === idx) {
      onPrimedBarChange(null)
    } else if (primedBar === null) {
      onPrimedBarChange(idx)
    }
  }

  function handleClearBar(idx: number) {
    onBarsChange(bars.map((b, i) => i === idx ? { degree: null } : b))
    if (primedBar === idx) onPrimedBarChange(null)
  }

  function handleBarCountChange(n: number) {
    onBarCountChange(n)
    if (n > bars.length) {
      onBarsChange([...bars, ...Array(n - bars.length).fill(null).map(() => ({ degree: null }))])
    } else {
      onBarsChange(bars.slice(0, n))
    }
  }

  function handleAddBar() {
    const newCount = barCount + 1
    onBarCountChange(newCount)
    onBarsChange([...bars, { degree: null }])
    onPrimedBarChange(barCount)
  }

  function handleBpmChange(val: number) {
    const clamped = Math.max(20, Math.min(300, val))
    setBpmState(clamped)
    engineSetBpm(clamped)
  }

  function handleChordTypeChange(type: ChordType) {
    if (primedBar === null) return
    onBarsChange(bars.map((b, i) => i === primedBar ? { ...b, chordType: type } : b))
  }

  function handleRootOffsetChange(offset: number | undefined) {
    if (primedBar === null) return
    onBarsChange(bars.map((b, i) => i === primedBar ? { ...b, rootOffset: offset } : b))
  }

  function handleQualityOverrideChange(quality: ChordQuality | 'auto') {
    if (primedBar === null) return
    const override = quality === 'auto' ? undefined : quality
    onBarsChange(bars.map((b, i) => i === primedBar ? { ...b, qualityOverride: override } : b))
  }

  function handleLoadPreset(preset: Preset) {
    const newBars: ProgressionBar[] = preset.bars.map(pb => ({
      degree: pb.degree,
      chordType: preset.defaultChordType ?? 'triad',
      rootOffset: pb.rootOffset,
      qualityOverride: pb.qualityOverride,
    }))
    onBarCountChange(newBars.length)
    onBarsChange(newBars)
    onPrimedBarChange(null)
  }

  const startPlayback = useCallback(async () => {
    await Tone.start()

    const currentBars = barsRef.current
    const [num, denom] = timeSigRef.current
    const currentBpm = bpmRef.current

    engineSetBpm(currentBpm)
    engineSetTimeSig(num, denom)

    const secPerBeat = (60 / currentBpm) * (4 / denom)
    const barDuration = num * secPerBeat

    Tone.getTransport().cancel()
    Tone.getTransport().stop()

    onPrimedBarChange(null)

    scheduleMetronome(denom)

    const loopDuration = currentBars.length * barDuration
    Tone.getTransport().loop = true
    Tone.getTransport().loopStart = 0
    Tone.getTransport().loopEnd = loopDuration

    currentBars.forEach((bar, i) => {
      Tone.getTransport().schedule((time: number) => {
        Tone.getDraw().schedule(() => { setActiveBar(i); onActiveBarChange?.(i) }, time)

        if (bar.degree) {
          const chord = chords.find(c => c.numeral === bar.degree)
          if (chord) {
            const baseRootSt = noteToSemitone(chord.note)
            const rootSt = ((baseRootSt + (bar.rootOffset ?? 0)) + 12) % 12
            const tones = bar.qualityOverride
              ? buildOverrideTones(rootSt, bar.qualityOverride, bar.chordType ?? 'triad')
              : getDiatonicChordTones(rootSt, scaleSemitones, bar.chordType ?? 'triad')
            const midiNotes = pitchClassesToMidi(tones, rootSt)
            playChord(midiNotes, barDuration * 0.88, time)
          }
        }
      }, i * barDuration)
    })

    Tone.getTransport().start()
    setIsPlaying(true)
    onPlayingChange(true)
  }, [chords, scaleSemitones, onPrimedBarChange, onPlayingChange])

  function handleStop() {
    stopAll()
    setIsPlaying(false)
    setActiveBar(null)
    onActiveBarChange?.(null)
    onPlayingChange(false)
  }

  const [presetTab, setPresetTab] = useState<'common' | 'jpop'>('common')

  const diatonicProgressions = mode === 'major' ? COMMON_PROGRESSIONS_MAJOR : COMMON_PROGRESSIONS_MINOR

  const primedBarChordType = primedBar !== null ? (bars[primedBar]?.chordType ?? 'triad') : 'triad'
  const primedRootOffset = primedBar !== null ? (bars[primedBar]?.rootOffset ?? 0) : 0
  const primedQuality: ChordQuality | 'auto' = primedBar !== null ? (bars[primedBar]?.qualityOverride ?? 'auto') : 'auto'

  const attrBtnBase = 'rounded-md text-[12px] font-semibold px-3 py-1 border cursor-pointer transition-[background,border-color,color] duration-150'
  const attrBtnActive = 'bg-[rgba(102,126,234,0.22)] border-[rgba(102,126,234,0.6)] text-accent-soft'
  const attrBtnInactive = 'bg-bg-input border-border-dim text-text-dim hover:bg-bg-raised hover:border-border hover:text-text-soft'

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Transport controls */}
      <div className="flex items-end gap-5 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="prog-bpm" className="text-text-dim text-[10px] font-semibold tracking-[0.08em] uppercase">BPM</label>
          <input
            id="prog-bpm"
            type="number"
            className="progression-bpm-input bg-bg-input border border-border rounded-lg text-text text-sm px-[10px] py-2 w-[72px] outline-none transition-colors duration-200 focus:border-accent"
            value={bpm}
            min={20}
            max={300}
            disabled={isPlaying}
            onChange={e => handleBpmChange(Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-text-dim text-[10px] font-semibold tracking-[0.08em] uppercase">Time</label>
          <div className="flex items-center gap-1">
            <input
              id="prog-timesig-num"
              type="number"
              className="progression-timesig-input bg-bg-input border border-border rounded-lg text-text text-sm px-[10px] py-2 w-[52px] outline-none text-center transition-colors duration-200 focus:border-accent"
              value={timeSig[0]}
              min={1}
              max={12}
              disabled={isPlaying}
              onChange={e => setTimeSig([Math.max(1, Math.min(12, Number(e.target.value))), timeSig[1]])}
            />
            <span className="text-muted text-lg font-light leading-none pb-0.5">/</span>
            <CustomSelect
              id="prog-timesig-denom"
              className="w-[60px]"
              value={String(timeSig[1])}
              disabled={isPlaying}
              showChevron={false}
              onChange={v => setTimeSig([timeSig[0], Number(v)])}
              options={DENOM_OPTIONS.map(d => ({ value: String(d), label: String(d) }))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="prog-bars" className="text-text-dim text-[10px] font-semibold tracking-[0.08em] uppercase">Bars</label>
          <CustomSelect
            id="prog-bars"
            className="w-[60px]"
            value={String(barCount)}
            disabled={isPlaying}
            showChevron={false}
            onChange={v => handleBarCountChange(Number(v))}
            options={BAR_COUNT_OPTIONS.map(n => ({ value: String(n), label: String(n) }))}
          />
        </div>

        <button
          className={`border rounded-lg cursor-pointer text-[13px] font-semibold px-5 py-[9px] transition-[background,border-color,color] duration-200 tracking-[0.02em] ${isPlaying ? 'bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.35)] text-[#fca5a5] hover:bg-[rgba(239,68,68,0.22)] hover:border-[rgba(239,68,68,0.6)] hover:text-[#fecaca]' : 'bg-[rgba(102,126,234,0.15)] border-[rgba(102,126,234,0.4)] text-accent-soft hover:bg-[rgba(102,126,234,0.28)] hover:border-[rgba(102,126,234,0.7)] hover:text-[#c7d2fe]'}`}
          onClick={isPlaying ? handleStop : startPlayback}
        >
          {isPlaying ? '■ Stop' : '▶ Play'}
        </button>
      </div>

      {/* Preset progressions — subtabbed */}
      {!isPlaying && (
        <div className="flex flex-col gap-3 pt-2 border-t border-border-dim">
          <div className="flex gap-1">
            {(['common', 'jpop'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setPresetTab(tab)}
                className={`text-[11px] font-semibold px-3 py-1 rounded-md border cursor-pointer transition-[background,border-color,color] duration-150 ${
                  presetTab === tab
                    ? 'bg-[rgba(102,126,234,0.18)] border-[rgba(102,126,234,0.45)] text-accent-soft'
                    : 'bg-transparent border-transparent text-text-dim hover:text-text-soft hover:bg-bg-raised'
                }`}
              >
                {tab === 'common' ? 'Common Progressions' : 'J-Pop / Anime'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(presetTab === 'common' ? diatonicProgressions : COMMON_PROGRESSIONS_JPOP).map(preset => (
              <button
                key={preset.name}
                onClick={() => handleLoadPreset(preset)}
                className="bg-bg-input border border-border-dim rounded-lg text-text-soft text-[12px] font-medium px-3 py-1.5 cursor-pointer transition-[background,border-color,color] duration-150 hover:bg-bg-raised hover:border-[rgba(102,126,234,0.35)] hover:text-accent-soft"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bar grid */}
      <div className="flex gap-3 flex-wrap">
        {bars.map((bar, i) => {
          const chord = bar.degree ? chords.find(c => c.numeral === bar.degree) : null
          const chordType = bar.chordType ?? 'triad'
          const typeSup = CHORD_TYPES.find(t => t.value === chordType)?.sup ?? ''
          const rootPrefix = bar.rootOffset === -1 ? '♭' : bar.rootOffset === 1 ? '♯' : ''
          const qualityLabel = bar.qualityOverride ? QUALITY_OPTIONS.find(q => q.value === bar.qualityOverride)?.label : null
          const isActive = activeBar === i
          const isPrimed = primedBar === i
          const isLocked = primedBar !== null && primedBar !== i
          return (
            <button
              key={i}
              className={[
                'bg-bg-input border border-border-dim rounded-[10px] cursor-pointer flex flex-col items-center gap-1 min-w-[72px] px-[10px] pt-3 pb-[10px] relative transition-[background,border-color,transform] duration-150',
                'hover:enabled:bg-bg-raised hover:enabled:border-[rgba(102,126,234,0.3)]',
                chord ? 'border-border' : '',
                isActive ? '!bg-[rgba(102,126,234,0.18)] !border-[rgba(102,126,234,0.65)] -translate-y-0.5 shadow-[0_4px_16px_rgba(102,126,234,0.2)]' : '',
                isPrimed ? '!border-accent !bg-[rgba(102,126,234,0.12)] shadow-[0_0_0_2px_rgba(102,126,234,0.25)]' : '',
                isLocked ? 'opacity-30 cursor-not-allowed' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleBarClick(i)}
              disabled={isPlaying || isLocked}
            >
              <span className="absolute top-[5px] left-1/2 -translate-x-1/2 text-muted text-[9px] font-semibold tracking-[0.05em] pointer-events-none">{i + 1}</span>
              {chord && !isPlaying && (
                <span
                  className="absolute top-[3px] left-1 bg-transparent border-none rounded-[3px] text-border cursor-pointer text-[13px] leading-none px-[3px] py-px transition-[color,background] duration-150 hover:text-red-soft hover:bg-[rgba(239,68,68,0.12)]"
                  role="button"
                  aria-label="Clear chord"
                  onClick={e => { e.stopPropagation(); handleClearBar(i) }}
                >
                  ×
                </span>
              )}
              {chord ? (
                <>
                  <span className="text-accent text-[13px] font-bold mt-2 leading-none">
                    {rootPrefix}{chord.numeral}<sup className="text-[9px] font-bold">{typeSup}</sup>
                  </span>
                  <span className="text-text text-[15px] font-semibold leading-none">{chord.note}</span>
                  <span className="text-text-dim text-[10px]">{chord.quality}</span>
                  {qualityLabel && (
                    <span className="text-muted text-[9px] font-medium leading-none">{qualityLabel}</span>
                  )}
                </>
              ) : (
                <span className="text-border text-[20px] font-light mt-2 leading-[1.2]">{isPrimed ? '?' : '—'}</span>
              )}
            </button>
          )
        })}
        {!isPlaying && barCount < 12 && (
          <button className="bg-transparent border border-dashed border-border rounded-[10px] text-muted cursor-pointer text-[22px] font-light min-w-[72px] px-[10px] pt-3 pb-[10px] transition-[border-color,color] duration-150 leading-none self-stretch hover:border-[rgba(102,126,234,0.5)] hover:text-accent" onClick={handleAddBar}>+</button>
        )}
      </div>

      {/* Chord attribute panel — shown when a bar is primed */}
      {!isPlaying && primedBar !== null && (
        <div className="flex flex-col gap-3">
          {/* Root offset row */}
          <div className="flex items-center gap-3">
            <span className="text-text-dim text-[10px] font-semibold tracking-[0.08em] uppercase shrink-0 w-[52px]">Root</span>
            <div className="flex gap-1.5">
              {([{ value: -1, label: '♭' }, { value: 0, label: '♮' }, { value: 1, label: '♯' }] as const).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleRootOffsetChange(value === 0 ? undefined : value)}
                  className={`${attrBtnBase} ${primedRootOffset === value ? attrBtnActive : attrBtnInactive}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Quality override row */}
          <div className="flex items-center gap-3">
            <span className="text-text-dim text-[10px] font-semibold tracking-[0.08em] uppercase shrink-0 w-[52px]">Quality</span>
            <div className="flex gap-1.5 flex-wrap">
              {QUALITY_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleQualityOverrideChange(value)}
                  className={`${attrBtnBase} ${primedQuality === value ? attrBtnActive : attrBtnInactive}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Chord type row */}
          <div className="flex items-center gap-3">
            <span className="text-text-dim text-[10px] font-semibold tracking-[0.08em] uppercase shrink-0 w-[52px]">Type</span>
            <div className="flex gap-1.5">
              {CHORD_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleChordTypeChange(value)}
                  className={`${attrBtnBase} ${primedBarChordType === value ? attrBtnActive : attrBtnInactive}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="text-muted text-xs m-0">
        {isPlaying
          ? 'Playing…'
          : primedBar !== null
          ? 'Select a chord from the info panel above to assign it to this bar.'
          : 'Click a bar to select it, then choose a chord from the panel above. Click again to deselect.'}
      </p>
    </div>
  )
}
