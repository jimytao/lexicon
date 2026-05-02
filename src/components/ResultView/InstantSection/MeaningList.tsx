import { useState } from 'react'
import type { Meaning, Scene } from '../../../types'
import { useSettingsStore } from '../../../stores/settingsStore'

interface MeaningListProps {
  meanings: Meaning[]
  scenes?: Scene[]
}

const COLLAPSE_THRESHOLD = 4

const POS_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  noun:   { bg: '#E6F1FB', text: '#0C447C', darkBg: '#0C2A4A', darkText: '#7BB8F0' },
  verb:   { bg: '#EAF3DE', text: '#27500A', darkBg: '#1A3309', darkText: '#8ECF5A' },
  adj:    { bg: '#FAEEDA', text: '#633806', darkBg: '#3D2104', darkText: '#F0B46A' },
  adv:    { bg: '#EEEDFE', text: '#3C3489', darkBg: '#1E1B4B', darkText: '#A09CF0' },
  phrase: { bg: '#FAECE7', text: '#712B13', darkBg: '#3D1608', darkText: '#F0906A' },
}

export function MeaningList({ meanings, scenes }: MeaningListProps) {
  const [expanded, setExpanded] = useState(false)
  const { darkMode } = useSettingsStore()

  const needsCollapse = meanings.length > COLLAPSE_THRESHOLD
  const visible = needsCollapse && !expanded ? meanings.slice(0, COLLAPSE_THRESHOLD) : meanings

  return (
    <div className="mb-8 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-100">
      <h2 className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest mb-4">Meanings</h2>
      <div className="space-y-6">
        {visible.map((m, i) => {
          const palette = POS_COLORS[m.pos ?? ''] ?? { bg: '#F3F4F6', text: '#374151', darkBg: '#1F2937', darkText: '#D1D5DB' }
          const badgeBg = darkMode ? palette.darkBg : palette.bg
          const badgeText = darkMode ? palette.darkText : palette.text

          return (
            <div key={i} className="group relative">
              <div className="flex gap-4">
                <span className="text-sm font-bold text-accent/40 mt-0.5 shrink-0 tabular-nums">{(i + 1).toString().padStart(2, '0')}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-base font-bold text-foreground leading-snug">{m.zh}</p>
                    {m.pos && (
                      <span
                        className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0"
                        style={{ backgroundColor: badgeBg, color: badgeText }}
                      >
                        {m.pos}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground-muted mt-1 leading-relaxed font-medium">{m.en}</p>
                  {scenes?.[i] && (
                    <div className="mt-3 rounded-2xl px-4 py-3 bg-accent-soft border border-accent/10">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
                          {scenes[i].label}
                        </span>
                      </div>
                      <p className="text-xs text-accent/80 font-medium">
                        {scenes[i].description}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {expanded ? '收起' : `展开更多 (${meanings.length - COLLAPSE_THRESHOLD})`}
        </button>
      )}
    </div>
  )
}
