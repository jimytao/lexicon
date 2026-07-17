import { useState, useEffect } from 'react'
import type { PhraseResult } from '../../types'
import type { AiStatus } from '../../stores/resultStore'
import { DiffText } from './DiffText'
import { ExampleList } from './InstantSection/ExampleList'
import { AiStatusBar, SkeletonBlock } from './AiSection/AiStatusBar'
import { AiChatBox } from './AiSection/AiChatBox'
import { PracticeSection } from './AiSection/PracticeSection'
import { MnemonicCard } from './AiSection/MnemonicCard'
import { useResultStore } from '../../stores/resultStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useT } from '../../i18n'
import { useSearchStore } from '../../stores/searchStore'
import { PrepImageryCard } from './AiSection/PrepImageryCard'
import { detectSpatialPreps } from '../../utils/prepDetect'
import { CulturalLoreCard } from './AiSection/CulturalLoreCard'

interface PhraseViewProps {
  phrase: string
  phraseResult: PhraseResult | null
  aiStatus: AiStatus
  aiError: string | null
  onRetry: () => void
  onGoToSettings?: () => void
}

export function PhraseView({ phrase, phraseResult, aiStatus, aiError, onRetry, onGoToSettings }: PhraseViewProps) {
  const t = useT()
  const { modules, monolingualPhrase, monolingualSentence } = useSettingsStore()
  const updatePhraseMnemonic = useResultStore(state => state.updatePhraseMnemonic)
  const usageScenes = phraseResult?.usageScenes ?? []
  const queryType = useSearchStore(s => s.queryType)
  const hideTranslation = (queryType === 'phrase' && monolingualPhrase) || (queryType === 'sentence' && monolingualSentence)
  const [noteExpanded, setNoteExpanded] = useState(false)

  // 切换到新的句子搜索时，重置折叠状态，避免上次展开的解释残留
  useEffect(() => {
    setNoteExpanded(false)
  }, [phrase, phraseResult?.correctForm])

  return (
    <div className="px-3 py-3">
      {/* AI badge */}
      <div className="mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-medium">
          {t('phrase.queryLabel')}
        </span>
      </div>

      {phraseResult && phraseResult.correctForm && phraseResult.correctForm.toLowerCase() !== phrase.toLowerCase() ? (
        <>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1 leading-snug">{phraseResult.correctForm}</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
            {t('phrase.youEntered')} <DiffText original={phrase} corrected={phraseResult.correctForm} />
          </p>
          {phraseResult.correctionNote?.trim() ? (
            <div className="mb-4">
              <button
                onClick={() => setNoteExpanded(v => !v)}
                className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors duration-150 group"
              >
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${noteExpanded ? 'rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium">{t('phrase.whyChanged')}</span>
              </button>
              {noteExpanded && (
                <div className="mt-1.5 ml-4 pl-3 border-l-2 border-amber-300 dark:border-amber-700">
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{phraseResult.correctionNote}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="mb-4" />
          )}
        </>
      ) : (
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 leading-snug">{phraseResult?.correctForm || phrase}</h1>
      )}

      <AiStatusBar status={aiStatus} error={aiError} onRetry={onRetry} onGoToSettings={onGoToSettings} word={phrase} />

      {aiStatus === 'loading' && (
        <div className="space-y-4">
          <SkeletonBlock lines={2} variant="card" />
          <SkeletonBlock lines={3} variant="pill" />
        </div>
      )}

      {aiStatus === 'success' && phraseResult && (
        <div className="space-y-2">
          {modules.map((module) => {
            if (!module.enabled) return null

            switch (module.id) {
              case 'dictionary':
                return (
                  <div key={module.id} className="space-y-4">
                    {/* 释义 */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                        <h2 className="text-xs font-semibold text-teal-900 dark:text-teal-300">{t('phrase.meaning')}</h2>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{phraseResult.meaning}</p>
                    </div>
                    {/* 使用场景 */}
                    {usageScenes.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                          <h2 className="text-xs font-semibold text-teal-900 dark:text-teal-300">{t('phrase.usageScenes')}</h2>
                        </div>
                        <div className="space-y-2">
                          {usageScenes.map((s, i) => (
                            <div key={i} className="border-l-2 border-l-teal-500 bg-teal-50/40 dark:bg-teal-950/20 pl-3.5 pr-3 py-2.5 rounded-r-xl transition-all duration-300 hover:bg-teal-50/60 dark:hover:bg-teal-950/30">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">{s.label}</span>
                              </div>
                              <p className="text-xs text-foreground-muted leading-relaxed font-medium">{s.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              case 'semantic':
                return null
              case 'culture':
                return phraseResult.culturalLore ? (
                  <CulturalLoreCard key={module.id} lore={phraseResult.culturalLore} />
                ) : null
              case 'mnemonic':
                return (
                  <MnemonicCard 
                    key={module.id}
                    word={phraseResult.correctForm || phrase} 
                    initialMnemonic={phraseResult.mnemonic} 
                    isPhrase={true} 
                    onUpdateMnemonic={(m) => updatePhraseMnemonic(phrase, m)}
                  />
                )
              case 'examples':
                return (
                  <div key={module.id}>
                    {phraseResult.examples.length > 0 && (
                      <ExampleList examples={phraseResult.examples} hideTranslation={hideTranslation} />
                    )}
                  </div>
                )
              case 'practice':
                return (
                  <PracticeSection
                    key={module.id}
                    word={phraseResult.correctForm || phrase}
                    meanings={[{ zh: phraseResult.meaning, en: '' }]}
                  />
                )
              case 'chat': {
                const corrected = phraseResult.correctForm || phrase
                const parts: string[] = []
                if (phrase.toLowerCase() !== corrected.toLowerCase()) {
                  parts.push(`用户原始输入: "${phrase}" → 纠正为: "${corrected}"`)
                  if (phraseResult.correctionNote) parts.push(`纠正说明: ${phraseResult.correctionNote}`)
                }
                if (phraseResult.meaning) parts.push(`释义: ${phraseResult.meaning}`)
                if (phraseResult.usageScenes?.length) {
                  parts.push('使用场景:\n' + phraseResult.usageScenes.map(s => `  · ${s.label}: ${s.description}`).join('\n'))
                }
                if (phraseResult.examples?.length) {
                  parts.push('例句:\n' + phraseResult.examples.slice(0, 3).map(e => `  · ${e.en}`).join('\n'))
                }
                if (phraseResult.mnemonic) {
                  const best = phraseResult.mnemonic[phraseResult.mnemonic.bestType]
                  parts.push(`助记法 (${phraseResult.mnemonic.bestType}): ${best.content}`)
                }
                if (phraseResult.prepSpatial?.items?.length) {
                  parts.push('介词空间意象:\n' + phraseResult.prepSpatial.items.map(
                    i => `  · ${i.preposition}: ${i.coreIdea} — ${i.phraseExplanation}`
                  ).join('\n'))
                }
                if (phraseResult.culturalLore?.content) {
                  parts.push(`文化背景: ${phraseResult.culturalLore.content}`)
                }
                const enrichedContext = parts.length > 0 ? parts.join('\n') : undefined
                return <AiChatBox key={module.id} context={corrected} enrichedContext={enrichedContext} />
              }
              case 'preposition': {
                const preps = detectSpatialPreps(phraseResult.correctForm || phrase)
                if (preps.length === 0) return null
                return (
                  <PrepImageryCard
                    key={module.id}
                    phrase={phraseResult.correctForm || phrase}
                    prepositions={preps}
                  />
                )
              }
              default:
                return null
            }
          })}
        </div>
      )}
    </div>
  )
}
