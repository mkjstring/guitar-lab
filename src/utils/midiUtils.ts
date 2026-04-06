// Maps pitch classes to absolute MIDI note numbers in a close-position voicing.
// Root is placed at baseOctave (default 4 = middle C range = MIDI 48–59),
// and each subsequent voice stacks upward without wrapping back down.
//
// Example: Cmaj7 (pitch classes [0, 4, 7, 11]) at baseOctave=4
//   → [48, 52, 55, 59]  (C3, E3, G3, B3)
//
export function pitchClassesToMidi(
  chordTones: number[],   // [root, 3rd, 5th, ...] as pitch classes 0–11
  rootSemitone: number,
  baseOctave = 4,         // root octave (4 → rootMidi = semitone + 48 for C = MIDI 48 = C3)
): number[] {
  if (chordTones.length === 0) return []
  const rootMidi = rootSemitone + baseOctave * 12
  let prev = rootMidi - 1   // allow root itself to be the first "step up"
  return chordTones.map(pc => {
    let midi = pc + Math.floor((prev + 1) / 12) * 12
    if (midi <= prev) midi += 12
    prev = midi
    return midi
  })
}
