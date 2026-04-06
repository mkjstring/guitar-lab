import type { Voicing } from './chordVoicings'

// Open string MIDI pitches: low E → high e
const GUITAR_STRINGS_MIDI = [40, 45, 50, 55, 59, 64]

function rawToVoicing(frets: (number | 'x')[]): Voicing {
  const pressedFrets = frets.filter((f): f is number => typeof f === 'number' && f > 0)
  const baseFret = pressedFrets.length > 0 ? Math.min(...pressedFrets) : 0
  const tonesPresent = frets
    .map((f, i) => f !== 'x' ? (GUITAR_STRINGS_MIDI[i] + (f as number)) % 12 : -1)
    .filter(pc => pc >= 0)
  return { frets: frets as (number | 'x')[], baseFret, tonesPresent }
}

// A shape template defines a moveable chord fingering pattern.
//
// bassString:  which string (0=low E … 5=high e) carries the root
// offsets:     per-string instruction — index 0=low E, 5=high e
//   null       → mute ('x')
//   number     → fret = rootFret + this offset  (0 = same fret as root)
//
// Open strings are NOT encoded here. After applying the template, any string
// still marked 'x' is checked: if its open-string pitch class is present in
// the chord tones it is included as fret 0. Scanning proceeds outward from
// the highest fretted string and stops at the first miss, so no unplayable
// gaps are created.
interface ShapeTemplate {
  label: string
  bassString: number
  offsets: (number | null)[]
}

// ── Maj7 root-position shape templates ────────────────────────────────────────
//
//   A-string root (moveable)
//     G @ R+1 → M7  (G string is 10 st above A; +1 makes 11 = M7)
//     B @ R+2 → M3  (B string is 14 st above A; +2 makes 16%12 = 4 = M3)
//     e @ R+0 → P5  (e string is 19 st above A; +0 makes 19%12 = 7 = P5)
//
//   D-string barre (moveable)
//     G @ R+2 → P5  (G is 5 st above D; +2 makes 7 = P5)
//     B @ R+2 → M7  (B is 9 st above D; +2 makes 11 = M7)
//     e @ R+2 → M3  (e is 14 st above D; +2 makes 16%12 = 4 = M3)
//     (all three land on the same fret = natural barre)
//
//   A-string root + upper strings
//     G @ R+1 → M7, B @ R+2 → M3; high-e open added if E is in chord
//
//   E-string root + upper strings
//     A @ R+2 → P5, D @ R+1 → M7, G @ R+1 → M3
//     B and/or high-e open added if their PCs are in chord
//
//   E-string root (compact)
//     D @ R+1 → M7, G @ R+1 → M3, B @ R+0 → P5
//     high-e open added if E is in chord
//
const MAJ7_TEMPLATES: ShapeTemplate[] = [
  {
    label: 'A str.',
    bassString: 1,
    offsets: [null, 0, null, 1, 2, 0],
  },
  {
    label: 'D str.',
    bassString: 2,
    offsets: [null, null, 0, 2, 2, 2],
  },
  {
    label: 'A str. +',
    bassString: 1,
    offsets: [null, 0, 2, 1, 2, null],
  },
  {
    label: 'E str. +',
    bassString: 0,
    offsets: [0, 2, 1, 1, null, null],
  },
  {
    label: 'E str.',
    bassString: 0,
    offsets: [0, null, 1, 1, 0, null],
  },
]

function applyTemplate(
  template: ShapeTemplate,
  rootSemitone: number,
  chordTones: number[],
): { voicing: Voicing; label: string } | null {
  // Root fret on the bass string (lowest position, 0–11)
  const openMidi = GUITAR_STRINGS_MIDI[template.bassString]
  let rootFret = ((rootSemitone - openMidi % 12) + 12) % 12

  // If any offset would produce a negative fret, try one octave higher.
  // This handles shapes where the root coincides with an open string (rootFret=0)
  // but the template was designed for that note at the 12th fret position.
  if (template.offsets.some(o => o !== null && rootFret + o < 0)) {
    rootFret += 12
  }
  // Still negative after octave shift (offset < -12) — reject
  if (template.offsets.some(o => o !== null && rootFret + o < 0)) return null

  const frets: (number | 'x')[] = template.offsets.map((offset) => {
    if (offset === null) return 'x'
    return rootFret + offset
  })

  // Opportunistically extend open strings upward from the highest fretted string.
  // Stop at the first string whose open PC is not in the chord — this prevents
  // unplayable gaps between sounded strings.
  const highestPlayed = frets.reduce<number>((hi, f, i) => f !== 'x' ? i : hi, -1)
  for (let s = highestPlayed + 1; s < 6; s++) {
    const openPc = GUITAR_STRINGS_MIDI[s] % 12
    if (chordTones.includes(openPc)) {
      frets[s] = 0
    } else {
      break
    }
  }

  return { label: template.label, voicing: rawToVoicing(frets) }
}

export function getStandardMaj7Voicings(
  rootSemitone: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  return MAJ7_TEMPLATES
    .map(template => applyTemplate(template, rootSemitone, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Maj6 root-position shape templates ────────────────────────────────────────
//
// Derived from Cmaj6 voicings (root = fret 8 on E-string, fret 3 on A-string,
// fret 10 on D-string). Offsets are relative to rootFret on the bassString.
// Negative offsets (-1) occur when an upper string is tuned higher than the
// interval distance from the root string would place the note — valid only
// when rootFret >= 1.
//
//   E str.   [0,  2, -1,  1, null, null]  — C E G A (low cluster)
//   E str. + [0, null, -1, 1,  0,  null]  — C G A E (4-string)
//   A str.   [null, 0,  2, -1,  2,  null] — C E A E (A-string root)
//   A str. + [null, 0, null, -1, 2,  0]   — C A E C (spread)
//   D str.   [null, null, 0,  2,  0,  2]  — C E C E (high barre)
//
const MAJ6_TEMPLATES: ShapeTemplate[] = [
  {
    label: 'E str.',
    bassString: 0,
    offsets: [0, 2, -1, 1, null, null],
  },
  {
    label: 'E str. +',
    bassString: 0,
    offsets: [0, null, -1, 1, 0, null],
  },
  {
    label: 'A str.',
    bassString: 1,
    offsets: [null, 0, 2, -1, 2, null],
  },
  {
    label: 'A str. +',
    bassString: 1,
    offsets: [null, 0, null, -1, 2, 0],
  },
  {
    label: 'D str.',
    bassString: 2,
    offsets: [null, null, 0, 2, 0, 2],
  },
]

export function getStandardMaj6Voicings(
  rootSemitone: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  return MAJ6_TEMPLATES
    .map(template => applyTemplate(template, rootSemitone, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Maj7 1st-inversion shape templates ────────────────────────────────────────
//
// Derived from Cmaj7/E voicings (E = major 3rd of C, fret 12 on E-string,
// fret 7 on A-string, fret 2 on D-string).
//
// The `rootSemitone` passed to applyTemplate is the BASS NOTE (the major 3rd),
// not the chord root. Callers compute: bass = (chordRoot + 4) % 12.
//
// Enharmonic equivalency: Xmaj7/3rd == X-relative-minor root-position m6
//   e.g. Cmaj7/E == Em6 (both = {C, E, G, B}, E in bass)
// Both getStandardMaj7Inv1Voicings and getStandardMinor6Voicings use this array.
//
// Negative offsets (-2) are valid for most keys; for the case where the bass
// note on the E-string is at fret 0 (e.g. Cmaj7/E), those shapes are filtered
// by the negative-fret guard — A-string and D-string shapes provide coverage.
//
const MAJ7_INV1_TEMPLATES: ShapeTemplate[] = [
  {
    label: 'E str.',
    bassString: 0,
    offsets: [0, 2, -2, 0, null, null],
  },
  {
    label: 'E str. +',
    bassString: 0,
    offsets: [0, null, -2, 0, 0, null],
  },
  {
    label: 'A str.',
    bassString: 1,
    offsets: [null, 0, 2, -2, 1, null],
  },
  {
    label: 'A str. +',
    bassString: 1,
    offsets: [null, 0, null, -2, 1, 0],
  },
  {
    label: 'D str.',
    bassString: 2,
    offsets: [null, null, 0, 2, -1, 1],
  },
]

export function getStandardMaj7Inv1Voicings(
  chordRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const thirdSemitone = (chordRoot + 4) % 12
  return MAJ7_INV1_TEMPLATES
    .map(template => applyTemplate(template, thirdSemitone, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Maj7 2nd-inversion shape templates (5th in bass) ─────────────────────────
//
// Derived from Cmaj7/G voicings (G = P5 of C).
// applyTemplate called with fifthSemitone = (chordRoot + 7) % 12.
//
//   E str.  [0,  0, -1,  1, null, null]  — G C E B  (from [3,3,2,4,x,x])
//   A str.  [null, 0,  0, -1,  2, null]  — G C E B  (from [x,10,10,9,12,x])
//   D str.  [null, null, 0,  0,  0,  2]  — G C E B  (from [x,x,5,5,5,7])
//
const MAJ7_INV2_TEMPLATES: ShapeTemplate[] = [
  { label: 'E str.', bassString: 0, offsets: [0,    0,    -1,  1, null, null] },
  { label: 'A str.', bassString: 1, offsets: [null, 0,     0, -1,  2,   null] },
  { label: 'D str.', bassString: 2, offsets: [null, null,  0,  0,  0,    2  ] },
]

export function getStandardMaj7Inv2Voicings(
  chordRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const fifthSemitone = (chordRoot + 7) % 12
  return MAJ7_INV2_TEMPLATES
    .map(template => applyTemplate(template, fifthSemitone, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Maj7 3rd-inversion shape templates (7th in bass) ─────────────────────────
//
// Derived from Cmaj7/B voicings (B = M7 of C).
// applyTemplate called with seventhSemitone = (chordRoot + 11) % 12.
//
//   E str.  [0,  0, -2, -2, null, null]  — B E G C  (from [7,7,5,5,x,x])
//   A str.  [null, 0,  0, -2, -1, null]  — B E G C  (from [x,2,2,0,1,x])
//   D str.  [null, null, 0,  0, -1, -1]  — B E G C  (from [x,x,9,9,8,8])
//
const MAJ7_INV3_TEMPLATES: ShapeTemplate[] = [
  { label: 'E str.', bassString: 0, offsets: [0,    0,    -2, -2, null, null] },
  { label: 'A str.', bassString: 1, offsets: [null, 0,     0, -2, -1,   null] },
  { label: 'D str.', bassString: 2, offsets: [null, null,  0,  0, -1,   -1  ] },
]

export function getStandardMaj7Inv3Voicings(
  chordRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const seventhSemitone = (chordRoot + 11) % 12
  return MAJ7_INV3_TEMPLATES
    .map(template => applyTemplate(template, seventhSemitone, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// Em6 root-position voicings are enharmonically identical to Xmaj7 1st inversion
// (same pitch classes, same bass note). Uses the same MAJ7_INV1_TEMPLATES.
export function getStandardMinor6Voicings(
  minorRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  return MAJ7_INV1_TEMPLATES
    .map(template => applyTemplate(template, minorRoot, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Minor maj6 (m+M6) root-position shape templates ──────────────────────────
//
// Interval structure: root + m3(3) + P5(7) + M6(9)
// Example: Dm6 = D F A B  (D=2, F=5, A=9, B=11)
//
// This is DISTINCT from the minor-6th (m6) templates which encode m6(8).
// Dm6 has a major 6th (M6=9), not a minor 6th (m6=8).
//
// Derived from Dm6 voicing [null, 5, 3, 2, 0, null] (D on A-string, rootFret=5):
//   A str.  offsets [null, 0, -2, -3, -5, null]
//     A@0=D(root), D@-2=F(m3), G@-3=A(P5), B@-5=B(M6)
//
const MINOR_MAJ6_TEMPLATES: ShapeTemplate[] = [
  {
    label: 'A str.',
    bassString: 1,
    offsets: [null, 0, -2, -3, -5, null],
  },
]

export function getStandardMinorMaj6Voicings(
  minorRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  return MINOR_MAJ6_TEMPLATES
    .map(template => applyTemplate(template, minorRoot, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Half-diminished 7th (ø7) shape templates ─────────────────────────────────
//
// Interval structure from bass: dim5(+6), m7(+10), m3(+3)
// Example: Bø7 = B D F A  (B=11, D=2, F=5, A=9)
//
// Enharmonic equivalency: Dm6 {D,F,A,B} = Bø7 {B,D,F,A} (same pitch classes).
// These templates are used as the substitute voicing for isMinorMaj6 chords.
//
// Root position — offsets derived from Bø7 [null,2,3,2,3,null] (A-string) and
// verified for E-string [7,8,7,7,null,null] and D-string [null,null,9,10,10,10]:
//
const HALF_DIM7_ROOT_TEMPLATES: ShapeTemplate[] = [
  { label: 'A str.', bassString: 1, offsets: [null, 0, 1, 0, 1, null] },
  { label: 'E str.', bassString: 0, offsets: [0, 1, 0, 0, null, null] },
  { label: 'D str.', bassString: 2, offsets: [null, null, 0, 1, 1, 1] },
]

// 1st inversion — m3 in bass (D for Bø7). User: [null,5,7,4,6,null].
// E str. derived: [10,12,9,10,null,null].
const HALF_DIM7_INV1_TEMPLATES: ShapeTemplate[] = [
  { label: 'A str.', bassString: 1, offsets: [null, 0, 2, -1, 1, null] },
  { label: 'E str.', bassString: 0, offsets: [0, 2, -1, 0, null, null] },
]

// 2nd inversion — dim5 in bass (F for Bø7). User's B-string fret was Ab (error);
// corrected to [null,8,9,7,10,null] = F B D A, all four unique tones.
// E str. derived: [1,2,0,2,null,null] — uses open D-string at fret 0.
const HALF_DIM7_INV2_TEMPLATES: ShapeTemplate[] = [
  { label: 'A str.', bassString: 1, offsets: [null, 0, 1, -1, 2, null] },
  { label: 'E str.', bassString: 0, offsets: [0, 1, -1, 1, null, null] },
]

// 3rd inversion — m7 in bass (A for Bø7). User: [null,12,12,10,12,null]
// (rootFret=12 because A open → octave shift). E str. derived: [5,5,3,4,null,null].
const HALF_DIM7_INV3_TEMPLATES: ShapeTemplate[] = [
  { label: 'A str.', bassString: 1, offsets: [null, 0, 0, -2, 0, null] },
  { label: 'E str.', bassString: 0, offsets: [0, 0, -2, -1, null, null] },
]

export function getStandardHalfDim7Voicings(
  root: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  return HALF_DIM7_ROOT_TEMPLATES
    .map(t => applyTemplate(t, root, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

export function getStandardHalfDim7Inv1Voicings(
  root: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const bass = (root + 3) % 12
  return HALF_DIM7_INV1_TEMPLATES
    .map(t => applyTemplate(t, bass, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

export function getStandardHalfDim7Inv2Voicings(
  root: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const bass = (root + 6) % 12
  return HALF_DIM7_INV2_TEMPLATES
    .map(t => applyTemplate(t, bass, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

export function getStandardHalfDim7Inv3Voicings(
  root: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const bass = (root + 10) % 12
  return HALF_DIM7_INV3_TEMPLATES
    .map(t => applyTemplate(t, bass, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Maj6 2nd-inversion shape templates (5th in bass) ─────────────────────────
//
// Derived from Cmaj6/G voicings (G = perfect 5th of C).
// applyTemplate is called with fifthSemitone = (chordRoot + 7) % 12.
//
//   E str.  [0, 0, -1, -1, null, null]  — G C E A  (from [3,3,2,2,x,x])
//   A str.  [null, 0, 0, -1, 0, null]   — G C E A  (from [x,10,10,9,10,x])
//   D str.  [null, null, 0, 0, 0, 0]    — G C E A  (from [x,x,5,5,5,5])
//
const MAJ6_INV2_TEMPLATES: ShapeTemplate[] = [
  { label: 'E str.', bassString: 0, offsets: [0,    0,    -1, -1, null, null] },
  { label: 'A str.', bassString: 1, offsets: [null, 0,     0, -1,  0,   null] },
  { label: 'D str.', bassString: 2, offsets: [null, null,  0,  0,  0,    0  ] },
]

export function getStandardMaj6Inv2Voicings(
  chordRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const fifthSemitone = (chordRoot + 7) % 12
  return MAJ6_INV2_TEMPLATES
    .map(template => applyTemplate(template, fifthSemitone, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Maj6 3rd-inversion shape templates (6th in bass) ─────────────────────────
//
// Derived from Cmaj6/A voicings (A = major 6th of C).
// applyTemplate is called with sixthSemitone = (chordRoot + 9) % 12.
//
// Negative offsets (-2, -3) trigger the automatic octave shift in applyTemplate
// for keys where the bass note falls at a low fret on the reference string.
//
//   E str.  [0, -2, 0, -3, null, null]  — A C G A  (from [5,3,5,2,x,x])
//   A str.  [null, 0, -2, 0, -2, null]  — A C G A  (from [x,12,10,12,10,x])
//   D str.  [null, null, 0, -2, 1, -2]  — A C G A  (from [x,x,7,5,8,5])
//
const MAJ6_INV3_TEMPLATES: ShapeTemplate[] = [
  { label: 'E str.', bassString: 0, offsets: [0,    -2,    0, -3,  null, null] },
  { label: 'A str.', bassString: 1, offsets: [null,  0,   -2,  0,  -2,   null] },
  { label: 'D str.', bassString: 2, offsets: [null,  null,  0, -2,   1,   -2 ] },
]

export function getStandardMaj6Inv3Voicings(
  chordRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const sixthSemitone = (chordRoot + 9) % 12
  return MAJ6_INV3_TEMPLATES
    .map(template => applyTemplate(template, sixthSemitone, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Maj6 1st-inversion shape templates ────────────────────────────────────────
//
// Derived from Cmaj6/E voicings (E = major 3rd of C, fret 7 on A-string,
// fret 12 on E-string, fret 2 on D-string).
// The `rootSemitone` passed to applyTemplate is the BASS NOTE (the major 3rd),
// not the chord root. Callers compute: thirdSemitone = (chordRoot + 4) % 12.
//
//   A str.  [null, 0, 0, -2, 1, null]   — E A C G  (mid register)
//   E str.  [0, 0, -2, 0, null, null]   — E A C G  (high; offset -2 triggers octave shift for open E)
//   D str.  [null, null, 0, 0, -1, 1]   — E A C G  (treble strings)
//
const MAJ6_INV1_TEMPLATES: ShapeTemplate[] = [
  { label: 'A str.', bassString: 1, offsets: [null,  0,    0, -2,  1, null] },
  { label: 'E str.', bassString: 0, offsets: [0,     0,   -2,  0, null, null] },
  { label: 'D str.', bassString: 2, offsets: [null, null,  0,  0, -1,  1] },
]

export function getStandardMaj6Inv1Voicings(
  chordRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const thirdSemitone = (chordRoot + 4) % 12
  return MAJ6_INV1_TEMPLATES
    .map(template => applyTemplate(template, thirdSemitone, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Dominant 7th shape templates ──────────────────────────────────────────────
//
// Interval structure: root(0) + M3(4) + P5(7) + m7(10)
// Example: G7 = G B D F
//
// Root position — derived from G7 voicings, bassString = root string.
//   E str. 1  [0,  2,  0,  1, null, null]  — G D F B  (from [3,5,3,4,x,x])
//   E str. 2  [0, null, 0,  1,  0,  null]  — G F B D  (from [3,x,3,4,3,x], skip A)
//   A str. 1  [null, 0,  2,  0,  2,  null]  — G D F B  (from [x,10,12,10,12,x])
//   A str. 2  [null, 0, -1,  0, -2,  null]  — G B F G  (from [x,10,9,10,8,x])
//   A str. 3  [null, 0, null, 0,  2,   0]   — G F B D  (from [x,10,x,10,12,10], skip D)
//   D str.    [null, null, 0,  2,  1,  2]   — G D F B  (from [x,x,5,7,6,7])
//
const DOM7_ROOT_TEMPLATES: ShapeTemplate[] = [
  { label: 'E str.',      bassString: 0, offsets: [0,    2,     0,  1,  null, null] },
  { label: 'E str. 2',    bassString: 0, offsets: [0,    null,  0,  1,  0,    null] },
  { label: 'A str.',      bassString: 1, offsets: [null, 0,     2,  0,  2,    null] },
  { label: 'A str. 2',    bassString: 1, offsets: [null, 0,    -1,  0, -2,    null] },
  { label: 'A str. 3',    bassString: 1, offsets: [null, 0,  null,  0,  2,    0   ] },
  { label: 'D str.',      bassString: 2, offsets: [null, null,  0,  2,  1,    2   ] },
]

// 3rd inversion (M3 in bass) — derived from G7/B voicings.
//   E str.  [0,  1, -2,  0, null, null]  — B F G D  (from [7,8,5,7,x,x])
//   A str.  [null, 0,  1, -2,  1, null]  — B F G D  (from [x,2,3,0,3,x])
//   D str.  [null, null, 0,  1, -1,  1]  — B F G D  (from [x,x,9,10,8,10])
//
const DOM7_INV1_TEMPLATES: ShapeTemplate[] = [
  { label: 'E str.', bassString: 0, offsets: [0,    1,     -2,  0, null, null] },
  { label: 'A str.', bassString: 1, offsets: [null, 0,      1, -2,  1,   null] },
  { label: 'D str.', bassString: 2, offsets: [null, null,   0,  1, -1,    1  ] },
]

// 5th inversion (P5 in bass) — derived from G7/D voicings.
//   E str.  [0,  0, -1,  0, null, null]  — D G B F  (from [10,10,9,10,x,x])
//   A str.  [null, 0,  0, -1,  1, null]  — D G B F  (from [x,5,5,4,6,x])
//   D str.  [null, null, 0,  0,  0,  1]  — D G B F  (from [x,x,0,0,0,1])
//
const DOM7_INV2_TEMPLATES: ShapeTemplate[] = [
  { label: 'E str.', bassString: 0, offsets: [0,    0,     -1,  0, null, null] },
  { label: 'A str.', bassString: 1, offsets: [null, 0,      0, -1,  1,   null] },
  { label: 'D str.', bassString: 2, offsets: [null, null,   0,  0,  0,    1  ] },
]

// 7th inversion (m7 in bass) — derived from G7/F voicings.
//   E str.  [0,  1, -1, -1, null, null]  — F B D G  (from [1,2,0,0,x,x])
//   A str.  [null, 0,  1, -1,  0, null]  — F B D G  (from [x,8,9,7,8,x])
//   D str.  [null, null, 0,  1,  0,  0]  — F B D G  (from [x,x,3,4,3,3])
//
const DOM7_INV3_TEMPLATES: ShapeTemplate[] = [
  { label: 'E str.', bassString: 0, offsets: [0,    1,     -1, -1, null, null] },
  { label: 'A str.', bassString: 1, offsets: [null, 0,      1, -1,  0,   null] },
  { label: 'D str.', bassString: 2, offsets: [null, null,   0,  1,  0,    0  ] },
]

export function getStandardDom7Voicings(
  root: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  return DOM7_ROOT_TEMPLATES
    .map(t => applyTemplate(t, root, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

export function getStandardDom7Inv1Voicings(
  root: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const third = (root + 4) % 12
  return DOM7_INV1_TEMPLATES
    .map(t => applyTemplate(t, third, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

export function getStandardDom7Inv2Voicings(
  root: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const fifth = (root + 7) % 12
  return DOM7_INV2_TEMPLATES
    .map(t => applyTemplate(t, fifth, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

export function getStandardDom7Inv3Voicings(
  root: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const seventh = (root + 10) % 12
  return DOM7_INV3_TEMPLATES
    .map(t => applyTemplate(t, seventh, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Minor 7th voicings (all inversions via Xmaj6 enharmonic) ──────────────────
//
// Xm7 {root, m3, P5, m7} = relative Xmaj6 (same 4 pitch classes, different root).
// Each Xm7 inversion maps to an Xmaj6 inversion:
//   Dm7 root  (D bass) = Fmaj6 3rd inv  (6th/D bass) → MAJ6_INV3 at D
//   Dm7 3rd   (F bass) = Fmaj6 root     (F bass)     → MAJ6      at F = minorRoot+3
//   Dm7 5th   (A bass) = Fmaj6 1st inv  (3rd/A bass) → MAJ6_INV1 at A = minorRoot+7
//   Dm7 7th   (C bass) = Fmaj6 2nd inv  (5th/C bass) → MAJ6_INV2 at C = minorRoot+10
//
export function getStandardMinor7Voicings(
  minorRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  return MAJ6_INV3_TEMPLATES
    .map(t => applyTemplate(t, minorRoot, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

export function getStandardMinor7Inv2Voicings(
  minorRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const fifth = (minorRoot + 7) % 12
  return MAJ6_INV1_TEMPLATES
    .map(t => applyTemplate(t, fifth, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

export function getStandardMinor7Inv3Voicings(
  minorRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const seventh = (minorRoot + 10) % 12
  return MAJ6_INV2_TEMPLATES
    .map(t => applyTemplate(t, seventh, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// Am7 1st-inversion voicings are enharmonically identical to Xmaj6 root position
// (same pitch classes, same bass note). Uses the existing MAJ6_TEMPLATES.
// Bass note = minor 3rd above minorRoot = (minorRoot + 3) % 12.
export function getStandardMinor7Inv1Voicings(
  minorRoot: number,
  chordTones: number[],
): Array<{ voicing: Voicing; label: string }> {
  const thirdSemitone = (minorRoot + 3) % 12
  return MAJ6_TEMPLATES
    .map(template => applyTemplate(template, thirdSemitone, chordTones))
    .filter((r): r is { voicing: Voicing; label: string } => r !== null)
}

// ── Standard Triad Voicings ────────────────────────────────────────────────────
//
// Four string groups (E-A-D, A-D-G, D-G-B, G-B-e), each showing root position,
// 1st inversion, and 2nd inversion. Works for all triad qualities (maj/min/dim)
// since positions are derived directly from chord tone pitch classes.
//
// Selection rule: lowest baseFret (most accessible position); ties broken by
// preferring a closed bass (non-open bass string) over an open-string bass.
//
// Example voicings for C major [C=0, E=4, G=7]:
//   E-A-D:  [8,7,5,x,x,x] root  [12,10,10,x,x,x] 1st  [3,3,2,x,x,x] 2nd
//   A-D-G:  [x,3,2,0,x,x] root  [x,7,5,5,x,x]   1st  [x,10,10,9,x,x] 2nd
//   D-G-B:  [x,x,10,9,8,x] root [x,x,2,0,1,x]   1st  [x,x,5,5,5,x]  2nd
//   G-B-e:  [x,x,x,5,5,3] root  [x,x,x,9,8,8]   1st  [x,x,x,0,1,0]  2nd
//
function triadOnStrings(
  tones: number[],
  strIndices: [number, number, number],
  bassIdx: 0 | 1 | 2,
  label: string,
): { voicing: Voicing; label: string } | null {
  const toneOrder = [tones[bassIdx], tones[(bassIdx + 1) % 3], tones[(bassIdx + 2) % 3]]
  const openPcs = strIndices.map(i => GUITAR_STRINGS_MIDI[i] % 12)

  // Candidate frets (base position and +12 octave) for each string
  const fretOpts = toneOrder.map((pc, idx) => {
    const base = ((pc - openPcs[idx]) + 12) % 12
    return [base, base + 12].filter(f => f <= 15)
  })

  let best: { voicing: Voicing; bassOpen: boolean } | null = null

  for (const bf of fretOpts[0]) {
    for (const f1 of fretOpts[1]) {
      for (const f2 of fretOpts[2]) {
        const pressed = [bf, f1, f2].filter(f => f > 0)
        if (pressed.length > 1 && Math.max(...pressed) - Math.min(...pressed) > 4) continue
        const fretArr: (number | 'x')[] = Array(6).fill('x')
        fretArr[strIndices[0]] = bf
        fretArr[strIndices[1]] = f1
        fretArr[strIndices[2]] = f2
        const v = rawToVoicing(fretArr)
        const bassOpen = bf === 0
        if (!best) {
          best = { voicing: v, bassOpen }
        } else {
          const better =
            v.baseFret < best.voicing.baseFret ||
            (v.baseFret === best.voicing.baseFret && !bassOpen && best.bassOpen)
          if (better) best = { voicing: v, bassOpen }
        }
      }
    }
  }

  return best ? { label, voicing: best.voicing } : null
}

export function getStandardTriadVoicings(
  chordTones: number[],
): Array<{ heading: string; voicings: Array<{ voicing: Voicing; label: string }> }> {
  if (chordTones.length < 3) return []

  const STRING_GROUPS: Array<{ strings: [number, number, number]; heading: string }> = [
    { strings: [0, 1, 2], heading: 'E-A-D' },
    { strings: [1, 2, 3], heading: 'A-D-G' },
    { strings: [2, 3, 4], heading: 'D-G-B' },
    { strings: [3, 4, 5], heading: 'G-B-e' },
  ]
  const INV_LABELS = ['Root', '1st inv.', '2nd inv.']

  return STRING_GROUPS.flatMap(({ strings, heading }) => {
    const voicings = ([0, 1, 2] as const).flatMap(bassIdx => {
      const r = triadOnStrings(chordTones, strings, bassIdx, INV_LABELS[bassIdx])
      return r ? [r] : []
    })
    return voicings.length > 0 ? [{ heading, voicings }] : []
  })
}
