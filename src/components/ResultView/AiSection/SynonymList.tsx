import { useState } from 'react'
import type { Synonym, Antonym } from '../../../types'
import { useT } from '../../../i18n'

interface SynonymListProps {
  synonyms?: Synonym[]
  antonyms?: Antonym[]
  onSynonymClick: (word: string) => void
}

export function SynonymList({ synonyms = [], antonyms = [], onSynonymClick }: SynonymListProps) {
  const t = useT()
  const [activeTab, setActiveTab] = useState<'synonyms' | 'antonyms'>('synonyms')

  const synonymsList = synonyms || []
  const antonymsList = antonyms || []

  // If there's absolutely no data, do not render this section
  if (synonymsList.length === 0 && antonymsList.length === 0) {
    return null
  }

  const renderToneBadge = (tone?: 'positive' | 'negative' | 'neutral' | 'informal') => {
    if (!tone) return null
    const toneClass = {
      positive: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/40',
      negative: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/40',
      informal: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/40',
      neutral: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
    }[tone]
    const toneLabel = {
      positive: `🟢 ${t('synonyms.tone.positive')}`,
      negative: `🔴 ${t('synonyms.tone.negative')}`,
      informal: `💬 ${t('synonyms.tone.colloquial')}`,
      neutral: `⚪ ${t('synonyms.tone.neutral')}`,
    }[tone]
    return (
      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-md border shrink-0 ${toneClass}`}>
        {toneLabel}
      </span>
    )
  }

  // Helper render for Synonyms List
  const renderSynonyms = () => (
    <div className="space-y-2 animate-in fade-in duration-200">
      {synonymsList.map((s, i) => (
        <div 
          key={i} 
          className="flex flex-col gap-1 p-2 -mx-2 rounded-xl transition-all duration-200 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/10 border border-transparent hover:border-indigo-100/20 dark:hover:border-indigo-900/10"
        >
          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={() => onSynonymClick(s.word)}
              className="shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-indigo-100/60 dark:border-indigo-900/30 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/60 active:scale-95 duration-100 transition-all cursor-pointer"
            >
              {s.word}
            </button>
            {renderToneBadge(s.tone)}
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed pt-0.5">{s.distinction}</p>
          {s.whenToUse && (
            <p className="text-[11px] text-indigo-800 dark:text-indigo-200 font-medium bg-indigo-50/60 dark:bg-indigo-950/40 px-2 py-1 rounded-lg border border-indigo-100/40 dark:border-indigo-900/30">
              💡 {t('synonyms.whenToUse')}{s.whenToUse}
            </p>
          )}
        </div>
      ))}
    </div>
  )

  // Helper render for Antonyms List
  const renderAntonyms = () => (
    <div className="space-y-1.5 animate-in fade-in duration-200">
      {antonymsList.map((a, i) => (
        <div 
          key={i} 
          className="flex gap-3 items-start p-2 -mx-2 rounded-xl transition-all duration-200 hover:bg-rose-50/30 dark:hover:bg-rose-950/10 border border-transparent hover:border-rose-100/20 dark:hover:border-rose-900/10"
        >
          <button
            onClick={() => onSynonymClick(a.word)}
            className="shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-rose-100/60 dark:border-rose-900/30 bg-rose-50/60 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 hover:bg-rose-100/80 dark:hover:bg-rose-900/60 active:scale-95 duration-100 transition-all cursor-pointer"
          >
            {a.word}
          </button>
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed pt-0.5">{a.distinction}</p>
        </div>
      ))}
    </div>
  )

  return (
    <div className="mb-3 rounded-xl p-3.5 bg-white dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800/40 shadow-sm">
      {/* Title Header */}
      <div className="flex items-center justify-between mb-4 border-b border-gray-100/80 dark:border-gray-800/50 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-indigo-500 to-rose-400" />
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {synonymsList.length > 0 && antonymsList.length > 0 ? t('synonyms.heading.both') : synonymsList.length > 0 ? t('synonyms.heading.synonyms') : t('synonyms.heading.antonyms')}
          </h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
            {t('synonyms.aiLabel')}
          </span>
        </div>
      </div>

      {/* Case 1: Both lists are present - Use Responsive Dual-Wing layout */}
      {synonymsList.length > 0 && antonymsList.length > 0 ? (
        <>
          {/* Mobile Switcher (Pill control) */}
          <div className="md:hidden relative bg-gray-50/80 dark:bg-gray-800/40 p-1 rounded-full flex gap-1 mb-4 border border-gray-100/50 dark:border-gray-800/30">
            <button
              onClick={() => setActiveTab('synonyms')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 relative z-10 cursor-pointer ${
                activeTab === 'synonyms'
                  ? 'bg-white dark:bg-gray-800 text-indigo-900 dark:text-indigo-200 shadow-sm border border-gray-100/30 dark:border-gray-700/50'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t('synonyms.tab')} ({synonymsList.length})
            </button>
            <button
              onClick={() => setActiveTab('antonyms')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 relative z-10 cursor-pointer ${
                activeTab === 'antonyms'
                  ? 'bg-white dark:bg-gray-800 text-rose-900 dark:text-rose-200 shadow-sm border border-gray-100/30 dark:border-gray-700/50'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t('antonyms.tab')} ({antonymsList.length})
            </button>
          </div>

          {/* Desktop Dual Column Layout */}
          <div className="hidden md:grid md:grid-cols-2 md:gap-8">
            {/* Left Column: Synonyms */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 border-b border-indigo-50/50 dark:border-indigo-950/20 pb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <h3 className="text-xs font-bold text-indigo-950 dark:text-indigo-300 tracking-wider">{t('synonyms.sectionLabel')}</h3>
              </div>
              {renderSynonyms()}
            </div>

            {/* Right Column: Antonyms */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 border-b border-rose-50/50 dark:border-rose-950/20 pb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <h3 className="text-xs font-bold text-rose-950 dark:text-rose-300 tracking-wider">{t('antonyms.sectionLabel')}</h3>
              </div>
              {renderAntonyms()}
            </div>
          </div>

          {/* Mobile Display */}
          <div className="md:hidden">
            {activeTab === 'synonyms' ? (
              <div className="space-y-1">{renderSynonyms()}</div>
            ) : (
              <div className="space-y-1">{renderAntonyms()}</div>
            )}
          </div>
        </>
      ) : (
        /* Case 2: Only one of the lists is present (e.g. backward compatibility) */
        <div className="w-full">
          {synonymsList.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 border-b border-indigo-50/50 dark:border-indigo-950/20 pb-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <h3 className="text-xs font-bold text-indigo-950 dark:text-indigo-300 tracking-wider">{t('synonyms.sectionLabel')}</h3>
              </div>
              {renderSynonyms()}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 border-b border-rose-50/50 dark:border-rose-950/20 pb-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <h3 className="text-xs font-bold text-rose-950 dark:text-rose-300 tracking-wider">{t('antonyms.sectionLabel')}</h3>
              </div>
              {renderAntonyms()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
