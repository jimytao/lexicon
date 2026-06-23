import { useSettingsStore } from '../../stores/settingsStore'

interface WordHeaderProps {
  word: string
  phonetic: string
  pos: string
}

const POS_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  noun:   { bg: '#E6F1FB', text: '#0C447C', darkBg: '#0C2A4A', darkText: '#7BB8F0' },
  verb:   { bg: '#EAF3DE', text: '#27500A', darkBg: '#1A3309', darkText: '#8ECF5A' },
  adj:    { bg: '#FAEEDA', text: '#633806', darkBg: '#3D2104', darkText: '#F0B46A' },
  adv:    { bg: '#EEEDFE', text: '#3C3489', darkBg: '#1E1B4B', darkText: '#A09CF0' },
  phrase: { bg: '#FAECE7', text: '#712B13', darkBg: '#3D1608', darkText: '#F0906A' },
}

export function WordHeader({ word, phonetic, pos }: WordHeaderProps) {
  const { darkMode } = useSettingsStore()
  const posList = pos.split('/').filter(Boolean)

  return (
    <div className="flex flex-col gap-2 mb-4 animate-in fade-in slide-in-from-left-4 duration-500 overflow-hidden">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground break-words min-w-0">{word}</h1>
        <div className="flex gap-1.5 flex-wrap">
          {posList.map((p) => {
            const palette = POS_COLORS[p] ?? { bg: '#F3F4F6', text: '#374151', darkBg: '#1F2937', darkText: '#D1D5DB' }
            const badgeBg = darkMode ? palette.darkBg : palette.bg
            const badgeText = darkMode ? palette.darkText : palette.text
            return (
              <span
                key={p}
                className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md"
                style={{ backgroundColor: badgeBg, color: badgeText }}
              >
                {p}
              </span>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-medium text-foreground-muted/70 font-mono">{phonetic}</span>
        <button className="p-1.5 rounded-full hover:bg-accent/10 text-accent transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
