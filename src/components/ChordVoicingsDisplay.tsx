import type { Voicing } from '../utils/chordVoicings'
import { ChordDiagram } from './ChordDiagram'

export interface VoicingSection {
  heading?: string
  voicings: Array<{ voicing: Voicing; label: string }>
}

interface ChordVoicingsDisplayProps {
  sections: VoicingSection[]
  chordTones: number[]
  useFlats: boolean
  mode: 'major' | 'minor'
}

export function ChordVoicingsDisplay({ sections, chordTones, useFlats, mode }: ChordVoicingsDisplayProps) {
  const filled = sections.filter(s => s.voicings.length > 0)
  if (filled.length === 0) return null

  return (
    <div className="flex flex-col gap-5">
      {filled.map((section, i) => (
        <div key={i} className="flex flex-col gap-3">
          {section.heading && (
            <div className="text-slate text-[10px] font-bold font-ui tracking-[0.1em] uppercase">
              {section.heading}
            </div>
          )}
          <div className="flex justify-evenly flex-wrap gap-4 items-start">
            {section.voicings.map(({ voicing, label }) => (
              <ChordDiagram
                key={label}
                voicing={voicing}
                chordTones={chordTones}
                useFlats={useFlats}
                mode={mode}
                label={label}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
