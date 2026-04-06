import { useState, useMemo } from 'react'
import type { ChordInfo } from './Fretboard'
import { getDiatonicChordTones, type ChordType } from '../utils/chordVoicings'
import {
  getStandardMaj7Voicings,
  getStandardMaj6Voicings,
  getStandardMaj7Inv1Voicings,
  getStandardMaj7Inv2Voicings,
  getStandardMaj7Inv3Voicings,
  getStandardDom7Voicings,
  getStandardDom7Inv1Voicings,
  getStandardDom7Inv2Voicings,
  getStandardDom7Inv3Voicings,
  getStandardMaj6Inv1Voicings,
  getStandardMaj6Inv2Voicings,
  getStandardMaj6Inv3Voicings,
  getStandardMinor6Voicings,
  getStandardMinorMaj6Voicings,
  getStandardMinor7Voicings,
  getStandardMinor7Inv1Voicings,
  getStandardMinor7Inv2Voicings,
  getStandardMinor7Inv3Voicings,
  getStandardHalfDim7Voicings,
  getStandardHalfDim7Inv1Voicings,
  getStandardHalfDim7Inv2Voicings,
  getStandardHalfDim7Inv3Voicings,
  getStandardTriadVoicings,
} from '../utils/standardVoicings'
import { ChordVoicingsDisplay, type VoicingSection } from './ChordVoicingsDisplay'
import { CustomSelect } from './CustomSelect'

interface ChordsPanelProps {
  chords: ChordInfo[]
  scaleSemitones: Set<number>
  useFlats: boolean
  mode: 'major' | 'minor'
  selectedDegree: string
  onDegreeChange: (degree: string) => void
}

const CHROMATIC_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const CHROMATIC_FLAT  = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

function noteToSemitone(note: string): number {
  let idx = CHROMATIC_SHARP.indexOf(note)
  if (idx === -1) idx = CHROMATIC_FLAT.indexOf(note)
  return idx
}

type SubstituteOption = {
  label: string
  sections: VoicingSection[]
  chordTones?: number[]  // re-ordered from substitute root for correct dot labeling
}

export function ChordsPanel({ chords, scaleSemitones, useFlats, mode, selectedDegree, onDegreeChange }: ChordsPanelProps) {
  const [chordType, setChordType] = useState<ChordType>('triad')

  const selectedChord = chords.find(c => c.numeral === selectedDegree)

  const computed = useMemo(() => {
    if (!selectedChord) return null
    const rootSemitone = noteToSemitone(selectedChord.note)
    const chordTones = getDiatonicChordTones(rootSemitone, scaleSemitones, chordType)

    // Standard template voicings — quality detection
    const third   = chordTones.length >= 2 ? (chordTones[1] - chordTones[0] + 12) % 12 : -1
    const fifth   = chordTones.length >= 3 ? (chordTones[2] - chordTones[0] + 12) % 12 : -1
    const sixth   = chordTones.length >= 4 ? (chordTones[3] - chordTones[0] + 12) % 12 : -1
    const isMaj7      = chordType === '7th' && sixth === 11
    const isDom7      = chordType === '7th' && third === 4 && fifth === 7 && sixth === 10
    const isMinor7    = chordType === '7th' && third === 3 && fifth === 7 && sixth === 10
    const isHalfDim7  = chordType === '7th' && third === 3 && fifth === 6 && sixth === 10
    const isMaj6      = chordType === '6th' && third === 4 && sixth === 9
    // Minor 6th (m6) templates encode root + m3 + P5 + m6 (8 semitones).
    // Bdim6 has dim5 (6) — excluded. Dm6 has M6 (9) — handled by isMinorMaj6.
    const isMinor6    = chordType === '6th' && third === 3 && fifth === 7 && sixth === 8
    // Minor chord with major 6th (M6=9): e.g. Dm6 = D F A B
    const isMinorMaj6 = chordType === '6th' && third === 3 && fifth === 7 && sixth === 9

    const noteNames = useFlats ? CHROMATIC_FLAT : CHROMATIC_SHARP

    // Collect all standard voicing sections across inversions
    const allStandardSections: VoicingSection[] = []
    if (isMinor7) {
      const r  = getStandardMinor7Voicings(rootSemitone, chordTones)
      if (r.length)  allStandardSections.push({ heading: 'Root',     voicings: r })
      const i2 = getStandardMinor7Inv2Voicings(rootSemitone, chordTones)
      if (i2.length) allStandardSections.push({ heading: '5th bass', voicings: i2 })
      const i3 = getStandardMinor7Inv3Voicings(rootSemitone, chordTones)
      if (i3.length) allStandardSections.push({ heading: '7th bass', voicings: i3 })
    } else if (isHalfDim7) {
      const r  = getStandardHalfDim7Voicings(rootSemitone, chordTones)
      if (r.length)  allStandardSections.push({ heading: 'Root',      voicings: r })
      const i1 = getStandardHalfDim7Inv1Voicings(rootSemitone, chordTones)
      if (i1.length) allStandardSections.push({ heading: '3rd bass',  voicings: i1 })
      const i2 = getStandardHalfDim7Inv2Voicings(rootSemitone, chordTones)
      if (i2.length) allStandardSections.push({ heading: 'dim5 bass', voicings: i2 })
      const i3 = getStandardHalfDim7Inv3Voicings(rootSemitone, chordTones)
      if (i3.length) allStandardSections.push({ heading: '7th bass',  voicings: i3 })
    } else if (isDom7) {
      const r  = getStandardDom7Voicings(rootSemitone, chordTones)
      if (r.length)  allStandardSections.push({ heading: 'Root',     voicings: r })
      const i1 = getStandardDom7Inv1Voicings(rootSemitone, chordTones)
      if (i1.length) allStandardSections.push({ heading: '3rd bass', voicings: i1 })
      const i2 = getStandardDom7Inv2Voicings(rootSemitone, chordTones)
      if (i2.length) allStandardSections.push({ heading: '5th bass', voicings: i2 })
      const i3 = getStandardDom7Inv3Voicings(rootSemitone, chordTones)
      if (i3.length) allStandardSections.push({ heading: '7th bass', voicings: i3 })
    } else if (isMaj7) {
      const r  = getStandardMaj7Voicings(rootSemitone, chordTones)
      if (r.length)  allStandardSections.push({ heading: 'Root',     voicings: r })
      const i1 = getStandardMaj7Inv1Voicings(rootSemitone, chordTones)
      if (i1.length) allStandardSections.push({ heading: '3rd bass', voicings: i1 })
      const i2 = getStandardMaj7Inv2Voicings(rootSemitone, chordTones)
      if (i2.length) allStandardSections.push({ heading: '5th bass', voicings: i2 })
      const i3 = getStandardMaj7Inv3Voicings(rootSemitone, chordTones)
      if (i3.length) allStandardSections.push({ heading: '7th bass', voicings: i3 })
    } else if (isMaj6) {
      const r  = getStandardMaj6Voicings(rootSemitone, chordTones)
      if (r.length)  allStandardSections.push({ heading: 'Root',     voicings: r })
      const i1 = getStandardMaj6Inv1Voicings(rootSemitone, chordTones)
      if (i1.length) allStandardSections.push({ heading: '3rd bass', voicings: i1 })
      const i2 = getStandardMaj6Inv2Voicings(rootSemitone, chordTones)
      if (i2.length) allStandardSections.push({ heading: '5th bass', voicings: i2 })
      const i3 = getStandardMaj6Inv3Voicings(rootSemitone, chordTones)
      if (i3.length) allStandardSections.push({ heading: '6th bass', voicings: i3 })
    } else if (isMinor6) {
      const r = getStandardMinor6Voicings(rootSemitone, chordTones)
      if (r.length) allStandardSections.push({ heading: 'Root', voicings: r })
    } else if (isMinorMaj6) {
      const r = getStandardMinorMaj6Voicings(rootSemitone, chordTones)
      if (r.length) allStandardSections.push({ heading: 'Root', voicings: r })
    }

    // Substitute chord options (6th diminished enharmonic equivalencies)
    //
    // Each 6th chord quality has an enharmonic twin — the same pitch classes
    // reinterpreted from a different root. These substitutes are drawn from the
    // 6th-diminished scale tradition (e.g., Dm6 = Bø7, Cmaj6 = Am7/C, Am6 = Fmaj7).
    //
    //   maj6  (M3+M6):  root + M6 → minor 7th   e.g. Cmaj6 → Am7
    //   min6  (m3+m6):  root + M6 → major 7th   e.g. Am6  → Fmaj7  (F = 8st above A)
    //   mM6   (m3+M6):  root + M6 → half-dim 7  e.g. Dm6  → Bø7
    //
    const substituteOptions: SubstituteOption[] = []

    if (chordType === '6th') {
      if (isMaj6) {
        // Cmaj6 {C,E,G,A} = Am7/C — same shapes, re-interpreted from the 6th degree
        const subRoot = (rootSemitone + 9) % 12
        substituteOptions.push({
          label: noteNames[subRoot] + 'm7',
          sections: [{ voicings: getStandardMinor7Inv1Voicings(subRoot, chordTones) }],
        })
      } else if (isMinor6) {
        // Am6 {A,C,E,F} = Fmaj7 — F is 8 semitones above A; shows Fmaj7 root-bass shapes
        const subRoot = (rootSemitone + 8) % 12
        substituteOptions.push({
          label: noteNames[subRoot] + 'maj7',
          sections: [{ voicings: getStandardMaj7Voicings(subRoot, chordTones) }],
        })
      } else if (isMinorMaj6) {
        // Dm6 {D,F,A,B} = Bø7 — same pitch classes, B is the ø7 root (M6 above D)
        // subChordTones re-orders from B so the diagram labels B as root, D as 3rd, etc.
        const subRoot = (rootSemitone + 9) % 12
        const subChordTones = [subRoot, (subRoot + 3) % 12, (subRoot + 6) % 12, (subRoot + 10) % 12]
        substituteOptions.push({
          label: noteNames[subRoot] + 'ø7',
          chordTones: subChordTones,
          sections: [
            { heading: 'Root',      voicings: getStandardHalfDim7Voicings(subRoot, chordTones) },
            { heading: '3rd bass',  voicings: getStandardHalfDim7Inv1Voicings(subRoot, chordTones) },
            { heading: 'dim5 bass', voicings: getStandardHalfDim7Inv2Voicings(subRoot, chordTones) },
            { heading: '7th bass',  voicings: getStandardHalfDim7Inv3Voicings(subRoot, chordTones) },
          ],
        })
      }
    }

    if (chordType === '7th' && isMinor7) {
      // Cm7 {C,Eb,G,Bb} = Ebmaj6 — same pitch classes, Eb is the maj6 root
      const subRoot = (rootSemitone + 3) % 12
      const subChordTones = [subRoot, (subRoot + 4) % 12, (subRoot + 7) % 12, (subRoot + 9) % 12]
      substituteOptions.push({
        label: noteNames[subRoot] + 'maj6',
        chordTones: subChordTones,
        sections: [{ voicings: getStandardMaj6Voicings(subRoot, chordTones) }],
      })
    }

    return { chordTones, allStandardSections, substituteOptions }
  }, [selectedChord, scaleSemitones, chordType, useFlats])

  const chordTones = computed?.chordTones ?? []
  const allStandardSections = computed?.allStandardSections ?? []
  const substituteOptions = computed?.substituteOptions ?? []

  const triadSections = chordType === 'triad' ? getStandardTriadVoicings(chordTones) : []

  const mainSections: VoicingSection[] = chordType === 'triad'
    ? triadSections
    : allStandardSections

  return (
    <div className="w-full p-6 flex flex-col gap-5">
      <div className="flex items-center gap-4 flex-wrap">
        <CustomSelect
          id="chords-type-select"
          value={chordType}
          onChange={v => setChordType(v as ChordType)}
          options={[
            { value: 'triad', label: 'Triads' },
            { value: '6th',   label: '6th chords' },
            { value: '7th',   label: '7th chords' },
          ]}
        />
        <div className="flex gap-2 flex-wrap ml-auto">
          {chords.map(c => (
            <button
              key={c.numeral}
              className={`info-chord${selectedDegree === c.numeral ? ' info-chord-active' : ''}`}
              onClick={() => onDegreeChange(selectedDegree === c.numeral ? 'scale' : c.numeral)}
              aria-label={`${c.numeral} — ${c.note} ${c.quality}`}
            >
              <span className="chord-numeral">{c.numeral}</span>
              <span className="chord-name">{c.note}</span>
              <span className="chord-quality">{c.quality}</span>
            </button>
          ))}
        </div>
      </div>

      {selectedChord ? (
        <div className="flex flex-col gap-5">
          {mainSections.length > 0 ? (
            <ChordVoicingsDisplay
              sections={mainSections}
              chordTones={chordTones}
              useFlats={useFlats}
              mode={mode}
            />
          ) : (
            <p className="text-muted text-sm text-center py-5 m-0">No shape found</p>
          )}
          {substituteOptions.map(sub => (
            <div key={sub.label} className="flex flex-col gap-3">
              <div className="text-slate text-[10px] font-bold font-ui tracking-[0.1em] uppercase">
                = {sub.label}
              </div>
              <ChordVoicingsDisplay
                sections={sub.sections}
                chordTones={sub.chordTones ?? chordTones}
                useFlats={useFlats}
                mode={mode}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted text-sm text-center py-5 m-0">Select a chord above to see shapes</p>
      )}
    </div>
  )
}
