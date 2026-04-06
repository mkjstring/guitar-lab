import * as Tone from 'tone'

let synth: Tone.PolySynth | null = null

function getSynth(): Tone.PolySynth {
  if (!synth) {
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.5, release: 1.4 },
    }).toDestination()
    synth.set({ volume: -6 })
  }
  return synth
}

export function setBpm(bpm: number): void {
  Tone.getTransport().bpm.value = bpm
}

export function setTimeSignature(num: number, denom: number): void {
  Tone.getTransport().timeSignature = [num, denom]
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function playChord(midiNotes: number[], durationSeconds: number, time?: number): void {
  const s = getSynth()
  const freqs = midiNotes.map(midiToHz)
  if (time !== undefined) {
    s.triggerAttackRelease(freqs, durationSeconds, time)
  } else {
    s.triggerAttackRelease(freqs, durationSeconds)
  }
}

let clickSynth: Tone.Synth | null = null

function getClickSynth(): Tone.Synth {
  if (!clickSynth) {
    clickSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.04 },
    }).toDestination()
    clickSynth.set({ volume: -8 })
  }
  return clickSynth
}

// Schedule a click on every beat. denominator=4 → every quarter note, etc.
export function scheduleMetronome(denominator: number): void {
  const interval = `${denominator}n` as Tone.Unit.Time
  Tone.getTransport().scheduleRepeat((time: number) => {
    getClickSynth().triggerAttackRelease('C5', '64n', time)
  }, interval)
}

export function stopAll(): void {
  synth?.releaseAll()
  Tone.getTransport().stop()
  Tone.getTransport().cancel()
}

export async function startAudioContext(): Promise<void> {
  await Tone.start()
}
