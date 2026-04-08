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
  const palette = POS_COLORS[pos] ?? { bg: '#F3F4F6', text: '#374151', darkBg: '#1F2937', darkText: '#D1D5DB' }
  const badgeBg = darkMode ? palette.darkBg : palette.bg
  const badgeText = darkMode ? palette.darkText : palette.text

  return (
    <div className="flex items-baseline gap-3 mb-4 flex-wrap">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{word}</h1>
      <span className="text-sm text-gray-500 dark:text-gray-400">{phonetic}</span>
      <span
        className="text-xs font-medium px-2 py-0.5 rounded-full"
        style={{ backgroundColor: badgeBg, color: badgeText }}
      >
        {pos}
      </span>
    </div>
  )
}
