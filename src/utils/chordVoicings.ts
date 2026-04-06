// Guitar open string MIDI pitches (low E to high e)
const GUITAR_STRINGS = [40, 45, 50, 55, 59, 64]
const MAX_FRET = 15

export interface Voicing {
  frets: (number | 'x')[]
  baseFret: number
  tonesPresent: number[]
}

export type ChordType = 'triad' | '6th' | '7th'

export function getDiatonicChordTones(
  rootSemitone: number,
  scaleSemitones: Set<number>,
  chordType: ChordType
): number[] {
  const sorted = Array.from(scaleSemitones).sort((a, b) => {
    return ((a - rootSemitone + 12) % 12) - ((b - rootSemitone + 12) % 12)
  })
  switch (chordType) {
    case 'triad': return [sorted[0], sorted[2], sorted[4]]
    case '6th':   return [sorted[0], sorted[2], sorted[4], sorted[5]]
    case '7th':   return [sorted[0], sorted[2], sorted[4], sorted[6]]
  }
}

function lowestPitchOf(pc: number, minPitch: number): number {
  const offset = ((pc - (minPitch % 12)) + 12) % 12
  return minPitch + offset
}

function buildClosePitches(chordTones: number[], bassNote: number): number[] {
  const bass = lowestPitchOf(bassNote, 36)
  const result: number[] = [bass]
  let prev = bass
  for (const pc of chordTones) {
    if (pc === bassNote) continue
    const next = lowestPitchOf(pc, prev + 1)
    result.push(next)
    prev = next
  }
  return result
}

function applyDrop2(pitches: number[]): number[] {
  if (pitches.length < 3) return pitches
  const dropped = pitches[pitches.length - 2] - 12
  const without = pitches.filter((_, i) => i !== pitches.length - 2)
  return [dropped, ...without].sort((a, b) => a - b)
}

function findExactVoicing(pitches: number[]): Voicing | null {
  interface Slot { str: number; fret: number; pc: number }
  const slots: Slot[] = []

  for (const pitch of pitches) {
    let placed = false
    for (let s = 0; s < 6; s++) {
      if (slots.some(a => a.str === s)) continue
      const fret = pitch - GUITAR_STRINGS[s]
      if (fret >= 0 && fret <= MAX_FRET) {
        slots.push({ str: s, fret, pc: pitch % 12 })
        placed = true
        break
      }
    }
    if (!placed) return null
  }

  if (slots.length !== pitches.length) return null
  slots.sort((a, b) => a.str - b.str)

  const pressedFrets = slots.map(a => a.fret).filter(f => f > 0)
  if (pressedFrets.length > 1) {
    if (Math.max(...pressedFrets) - Math.min(...pressedFrets) > 4) return null
  }

  const lo = slots[0].str, hi = slots[slots.length - 1].str
  const usedStr = new Set(slots.map(a => a.str))
  for (let s = lo; s <= hi; s++) {
    if (!usedStr.has(s)) return null
  }

  const frets: (number | 'x')[] = Array(6).fill('x')
  for (const a of slots) frets[a.str] = a.fret

  const nonOpen = pressedFrets
  const baseFret = nonOpen.length > 0 ? Math.min(...nonOpen) : 0

  return {
    frets,
    baseFret,
    tonesPresent: slots.map(a => a.pc),
  }
}

function findPitchClassVoicing(
  requiredTones: number[],
  optionalTones: number[],
  bassNote: number,
): Voicing | null {
  const allTones = [...new Set([...requiredTones, ...optionalTones])]
  let best: Voicing | null = null

  for (let bassStr = 0; bassStr <= 2 && !best; bassStr++) {
    for (let bassFret = 0; bassFret <= 12 && !best; bassFret++) {
      const bp = (GUITAR_STRINGS[bassStr] + bassFret) % 12
      if (bp !== bassNote) continue

      const wMin = bassFret > 0 ? Math.max(1, bassFret - 1) : 1
      const wMax = bassFret > 0 ? bassFret + 3 : 4

      const opts: (number | 'x')[][] = []
      for (let s = 0; s < 6; s++) {
        if (s < bassStr) {
          opts[s] = ['x']
          continue
        }
        if (s === bassStr) {
          opts[s] = [bassFret]
          continue
        }
        const sOpts: (number | 'x')[] = ['x']
        const openPc = GUITAR_STRINGS[s] % 12
        if (allTones.includes(openPc)) sOpts.push(0)
        for (let f = wMin; f <= Math.min(wMax, MAX_FRET); f++) {
          const pc = (GUITAR_STRINGS[s] + f) % 12
          if (allTones.includes(pc)) sOpts.push(f)
        }
        opts[s] = sOpts
      }

      function dfs(
        s: number,
        assignment: (number | 'x')[],
        covered: Set<number>,
        dynMin: number,
        dynMax: number,
      ) {
        if (s === 6) {
          if (requiredTones.some(t => !covered.has(t))) return
          const played = assignment.reduce<number[]>((acc, f, i) => f !== 'x' ? [...acc, i] : acc, [])
          if (played.length < 3) return
          const lo = played[0], hi = played[played.length - 1]
          for (let i = lo; i <= hi; i++) {
            if (assignment[i] === 'x') return
          }
          const nonOpenFrets = assignment
            .map((f, _i) => (typeof f === 'number' && f > 0) ? f : null)
            .filter((f): f is number => f !== null)
          const bf = nonOpenFrets.length > 0 ? Math.min(...nonOpenFrets) : 0
          if (!best || bf < best.baseFret) {
            best = {
              frets: [...assignment] as (number | 'x')[],
              baseFret: bf,
              tonesPresent: assignment
                .map((f, i) => f !== 'x' ? (GUITAR_STRINGS[i] + (f as number)) % 12 : -1)
                .filter(pc => pc >= 0),
            }
          }
          return
        }
        for (const opt of opts[s]) {
          let newMin = dynMin, newMax = dynMax
          if (typeof opt === 'number' && opt > 0) {
            newMin = Math.min(dynMin, opt)
            newMax = Math.max(dynMax, opt)
            if (newMax - newMin > 4) continue
          }
          const newCovered = new Set(covered)
          if (typeof opt === 'number') {
            newCovered.add((GUITAR_STRINGS[s] + opt) % 12)
          }
          dfs(s + 1, [...assignment, opt], newCovered, newMin, newMax)
        }
      }

      dfs(0, [], new Set([bassNote]), Infinity, 0)
    }
  }

  return best
}

export function findVoicing(
  chordTones: number[],
  bassNote: number,
  drop2 = false,
): Voicing | null {
  if (drop2) {
    const close = buildClosePitches(chordTones, bassNote)
    const transformed = applyDrop2(close)
    const v = findExactVoicing(transformed)
    if (v) return v
  }

  if (chordTones.length === 5) {
    const v1 = findPitchClassVoicing(chordTones, [], bassNote)
    if (v1) return v1
    const req = chordTones.filter((_, i) => i !== 2)
    const opt = [chordTones[2]]
    return findPitchClassVoicing(req, opt, bassNote)
  }

  return findPitchClassVoicing(chordTones, [], bassNote)
}

export function getInversions(chordTones: number[], chordType: ChordType) {
  const count = chordType === 'triad' ? 3 : 4
  const labels = ['Root', '1st inv.', '2nd inv.', '3rd inv.'].slice(0, count)
  return labels.map((label, i) => ({ label, bassNote: chordTones[i] }))
}
