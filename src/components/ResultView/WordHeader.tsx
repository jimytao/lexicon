import { useEffect, useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { detectLanguage } from '../../stores/searchStore'
import { playPronunciation } from '../../services/audio'
import { useResolvedDark } from '../../hooks/useResolvedDark'
import { useT } from '../../i18n'

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
  const t = useT()
  const darkMode = useResolvedDark()
  const { pronunciationAccent, autoPlayPronunciation } = useSettingsStore()
  const posList = pos.split('/').filter(Boolean)
  const isEnglish = detectLanguage(word) === 'en'

  const [playingAccent, setPlayingAccent] = useState<'uk' | 'us' | 'generic' | null>(null)

  const handlePlay = async (accent?: 'uk' | 'us') => {
    const key = accent || 'generic'
    setPlayingAccent(key)
    try {
      await playPronunciation(word, accent)
    } finally {
      setPlayingAccent(null)
    }
  }

  // Automatic pronunciation playback on load/lookup
  useEffect(() => {
    if (autoPlayPronunciation && word) {
      const timer = setTimeout(() => {
        handlePlay(isEnglish ? pronunciationAccent : undefined)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [word, autoPlayPronunciation, pronunciationAccent, isEnglish])

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
      <div className="flex items-center gap-3 flex-wrap">
        {phonetic && (
          <span className="text-lg font-medium text-foreground-muted/70 font-mono">
            {phonetic}
          </span>
        )}
        
        {isEnglish ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePlay('uk')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer group border ${
                playingAccent === 'uk'
                  ? 'bg-accent text-white border-accent animate-pulse scale-95 shadow-sm font-bold'
                  : 'bg-accent/5 hover:bg-accent/15 text-accent border-accent/10'
              }`}
              title={t('audio.ukTitle')}
            >
              <span>UK</span>
              <svg className={`w-3.5 h-3.5 ${playingAccent === 'uk' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </button>
            <button
              onClick={() => handlePlay('us')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer group border ${
                playingAccent === 'us'
                  ? 'bg-accent text-white border-accent animate-pulse scale-95 shadow-sm font-bold'
                  : 'bg-accent/5 hover:bg-accent/15 text-accent border-accent/10'
              }`}
              title={t('audio.usTitle')}
            >
              <span>US</span>
              <svg className={`w-3.5 h-3.5 ${playingAccent === 'us' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => handlePlay()}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer group border ${
              playingAccent === 'generic'
                ? 'bg-accent text-white border-accent animate-pulse scale-95 shadow-sm font-bold'
                : 'bg-accent/5 hover:bg-accent/15 text-accent border-accent/10'
            }`}
            title={t('audio.pronounce')}
          >
            <span>{t('audio.play')}</span>
            <svg className={`w-3.5 h-3.5 ${playingAccent === 'generic' ? 'animate-bounce' : 'group-hover:scale-110 transition-transform'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
