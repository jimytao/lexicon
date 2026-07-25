import { useState } from 'react'
import type { Synonym, Antonym } from '../../../types'
import { useT } from '../../../i18n'
import { SectionHeading } from '../SectionHeading'

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

  if (synonymsList.length === 0 && antonymsList.length === 0) {
    return null
  }

  const heading =
    synonymsList.length > 0 && antonymsList.length > 0
      ? t('synonyms.heading.both')
      : synonymsList.length > 0
        ? t('synonyms.heading.synonyms')
        : t('synonyms.heading.antonyms')

  const renderToneBadge = (tone?: 'positive' | 'negative' | 'neutral' | 'informal') => {
    if (!tone) return null
    const toneClass = {
      positive: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/40',
      negative: 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/40',
      informal: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/40',
      neutral: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
    }[tone]
    const toneLabel = {
      positive: t('synonyms.tone.positive'),
      negative: t('synonyms.tone.negative'),
      informal: t('synonyms.tone.colloquial'),
      neutral: t('synonyms.tone.neutral'),
    }[tone]
    return (
      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-md border shrink-0 ${toneClass}`}>
        {toneLabel}
      </span>
    )
  }

  const renderSynonyms = () => (
    <div className="space-y-2 animate-in fade-in duration-200">
      {synonymsList.map((s, i) => (
        <div
          key={i}
          className="flex flex-col gap-1 p-2 -mx-2 rounded-xl transition-colors hover:bg-foreground/5"
        >
          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={() => onSynonymClick(s.word)}
              className="shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-lg border border-border bg-background-soft text-foreground hover:bg-foreground/5 active:scale-95 duration-100 transition-all cursor-pointer"
            >
              {s.word}
            </button>
            {renderToneBadge(s.tone)}
          </div>
          <p className="text-xs text-foreground-muted leading-relaxed pt-0.5">{s.distinction}</p>
          {s.whenToUse && (
            <p className="text-[11px] text-foreground-muted font-medium bg-background-soft/60 px-2 py-1 rounded-lg border border-border/40">
              {t('synonyms.whenToUse')}{s.whenToUse}
            </p>
          )}
        </div>
      ))}
    </div>
  )

  const renderAntonyms = () => (
    <div className="space-y-1.5 animate-in fade-in duration-200">
      {antonymsList.map((a, i) => (
        <div
          key={i}
          className="flex gap-3 items-start p-2 -mx-2 rounded-xl transition-colors hover:bg-foreground/5"
        >
          <button
            onClick={() => onSynonymClick(a.word)}
            className="shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-lg border border-border bg-background-soft text-foreground hover:bg-foreground/5 active:scale-95 duration-100 transition-all cursor-pointer"
          >
            {a.word}
          </button>
          <p className="text-xs text-foreground-muted leading-relaxed pt-0.5">{a.distinction}</p>
        </div>
      ))}
    </div>
  )

  return (
    <div className="mb-3">
      <SectionHeading title={heading} />

      {synonymsList.length > 0 && antonymsList.length > 0 ? (
        <>
          <div className="md:hidden relative bg-background-soft/80 p-1 rounded-xl flex gap-1 mb-4 border border-border/50">
            <button
              onClick={() => setActiveTab('synonyms')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 relative z-10 cursor-pointer ${
                activeTab === 'synonyms'
                  ? 'bg-background text-foreground shadow-sm border border-border/50'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              {t('synonyms.tab')} ({synonymsList.length})
            </button>
            <button
              onClick={() => setActiveTab('antonyms')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 relative z-10 cursor-pointer ${
                activeTab === 'antonyms'
                  ? 'bg-background text-foreground shadow-sm border border-border/50'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              {t('antonyms.tab')} ({antonymsList.length})
            </button>
          </div>

          <div className="hidden md:grid md:grid-cols-2 md:gap-8">
            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50 border-b border-border/40 pb-1.5">
                {t('synonyms.sectionLabel')}
              </h3>
              {renderSynonyms()}
            </div>
            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50 border-b border-border/40 pb-1.5">
                {t('antonyms.sectionLabel')}
              </h3>
              {renderAntonyms()}
            </div>
          </div>

          <div className="md:hidden">
            {activeTab === 'synonyms' ? (
              <div className="space-y-1">{renderSynonyms()}</div>
            ) : (
              <div className="space-y-1">{renderAntonyms()}</div>
            )}
          </div>
        </>
      ) : (
        <div className="w-full">
          {synonymsList.length > 0 ? (
            <div className="space-y-3">
              {renderSynonyms()}
            </div>
          ) : (
            <div className="space-y-3">
              {renderAntonyms()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
