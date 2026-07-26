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
import { useSearchStore, detectLanguage } from '../../stores/searchStore'
import { PrepImageryCard } from './AiSection/PrepImageryCard'
import { detectSpatialPreps } from '../../utils/prepDetect'
import { CulturalLoreCard } from './AiSection/CulturalLoreCard'
import { playPronunciation } from '../../services/audio'

import { UnnaturalMindModelCard } from './AiSection/UnnaturalMindModelCard'
import { WordChoiceCard } from './AiSection/WordChoiceCard'
import { LexiconMemoryBadge } from './LexiconMemoryBadge'
import { SectionHeading } from './SectionHeading'
import { phraseCognitiveFromSearchMode } from '../../utils/text'
import { migrateNativeMindToCoreFields } from '../../utils/coreMindsetPipeline'
import { isCorrectFormLong } from '../../utils/phraseHeaderFold'

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
  const {
    modules,
    corePhraseModules,
    monolingualPhrase,
    monolingualSentence,
    pronunciationAccent,
    autoPlayPronunciation,
  } = useSettingsStore()
  const updatePhraseMnemonic = useResultStore(state => state.updatePhraseMnemonic)
  const usageScenes = phraseResult?.usageScenes ?? []
  const usageIntro = phraseResult?.usageIntro?.trim() || ''
  const hasUsageContexts = Boolean(usageIntro) || usageScenes.length > 0
  const queryType = useSearchStore(s => s.queryType)
  const searchMode = useSearchStore(s => s.mode)
  const isCoreMode = searchMode === 'core'
  const activeModules = isCoreMode ? corePhraseModules : modules
  const phraseCognitive = phraseCognitiveFromSearchMode(searchMode)
  const hideTranslation = (queryType === 'phrase' && monolingualPhrase) || (queryType === 'sentence' && monolingualSentence)
  const [noteExpanded, setNoteExpanded] = useState(false)
  const [headerExpanded, setHeaderExpanded] = useState(false)
  const [meaningExpanded, setMeaningExpanded] = useState(false)
  const [playingAccent, setPlayingAccent] = useState<'uk' | 'us' | 'generic' | null>(null)

  const targetPhrase = phraseResult?.correctForm || phrase
  const isEnglish = detectLanguage(targetPhrase) === 'en'

  const correctFormLong = isCorrectFormLong(targetPhrase)
  const isMeaningLong = (phraseResult?.meaning ?? '').length > 160 || (phraseResult?.meaning ?? '').includes('\n')
  const hasFormCorrection = Boolean(
    phraseResult?.correctForm
    && phraseResult.correctForm.toLowerCase() !== phrase.toLowerCase(),
  )

  const handlePlay = async (accent?: 'uk' | 'us') => {
    const key = accent || 'generic'
    setPlayingAccent(key)
    try {
      await playPronunciation(targetPhrase, accent)
    } finally {
      setPlayingAccent(null)
    }
  }

  // Auto play pronunciation on mount/lookup
  useEffect(() => {
    if (autoPlayPronunciation && targetPhrase) {
      const timer = setTimeout(() => {
        handlePlay(isEnglish ? pronunciationAccent : undefined)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [targetPhrase, autoPlayPronunciation, pronunciationAccent, isEnglish])

  // 切换到新的句子搜索时，重置折叠状态，避免上次展开的解释残留
  useEffect(() => {
    setNoteExpanded(false)
    setHeaderExpanded(false)
    setMeaningExpanded(false)
  }, [phrase, phraseResult?.correctForm])

  return (
    <div className="px-3 py-3 min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere]">
      {/* Mode badge */}
      <div className="mb-3 flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          isCoreMode
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
            : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
        }`}>
          {isCoreMode ? t('mode.core') : t('phrase.queryLabel')}
        </span>
        <LexiconMemoryBadge word={targetPhrase} />
      </div>

      {/* Correct form (white title) folds alone; DiffText + amber why-changed stay outside */}
      <div className="mb-3">
        <div className={correctFormLong && !headerExpanded ? 'relative max-h-36 overflow-hidden transition-all duration-300' : ''}>
          <h1 className={`text-xl font-semibold text-gray-900 dark:text-gray-100 leading-snug break-words [overflow-wrap:anywhere] max-w-full ${hasFormCorrection ? 'mb-1' : 'mb-2'}`}>
            {phraseResult?.correctForm || phrase}
          </h1>
          {correctFormLong && !headerExpanded && (
            <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
          )}
        </div>

        {correctFormLong && (
          <button
            onClick={() => setHeaderExpanded(v => !v)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors cursor-pointer"
          >
            <span>{headerExpanded ? t('phrase.collapseHeader') : t('phrase.expandHeader')}</span>
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${headerExpanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {hasFormCorrection && phraseResult && (
          <>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 mb-1 break-words [overflow-wrap:anywhere]">
              {t('phrase.youEntered')} <DiffText original={phrase} corrected={phraseResult.correctForm} />
            </p>
            {/* Lookup: amber why-changed — independent of correctForm fold */}
            {!isCoreMode && (phraseResult.correctionNote?.trim() || phraseResult.unnaturalMindModel) ? (
              <div className="mb-2">
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
                  <div className="mt-1.5 ml-4 pl-3 border-l-2 border-amber-300 dark:border-amber-700 space-y-2">
                    {phraseResult.correctionNote?.trim() && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed break-words [overflow-wrap:anywhere]">
                        {phraseResult.correctionNote}
                      </p>
                    )}
                    {phraseResult.unnaturalMindModel && (
                      <UnnaturalMindModelCard model={phraseResult.unnaturalMindModel} />
                    )}
                  </div>
                )}
              </div>
            ) : null}
            {isCoreMode && phraseResult.correctionNote?.trim() && (
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-2 break-words [overflow-wrap:anywhere]">
                {phraseResult.correctionNote}
              </p>
            )}
          </>
        )}
      </div>

      {/* Play buttons for Phrase/Sentence */}
      <div className="flex items-center gap-2 mb-4">
        {isEnglish ? (
          <>
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
          </>
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

      <AiStatusBar status={aiStatus} error={aiError} onRetry={onRetry} onGoToSettings={onGoToSettings} word={phrase} />

      {aiStatus === 'loading' && (
        <div className="space-y-4">
          <SkeletonBlock lines={2} variant="card" />
          <SkeletonBlock lines={3} variant="pill" />
        </div>
      )}

      {aiStatus === 'success' && phraseResult && (() => {
        const phraseMind = migrateNativeMindToCoreFields({
          coreConcept: {
            image: '',
            explanation: '',
            feelAnchor: phraseResult.feelAnchor,
            emotionalTone: phraseResult.emotionalTone,
          },
          nativeMindModel: phraseResult.nativeMindModel,
          wordChoiceContrast: phraseResult.wordChoiceContrast,
        })
        return (
        <div className="space-y-2">
          {/* Pure Core: unnatural contrast only (mindset folded into meaning / wordChoice) */}
          {isCoreMode && phraseResult.unnaturalMindModel && (
            <div className="mb-1">
              <UnnaturalMindModelCard model={phraseResult.unnaturalMindModel} />
            </div>
          )}

          {/* Core 无 dictionary 模组：释义仍作固定轻量展示，不占模组位 */}
          {isCoreMode && phraseResult.meaning && (
            <div className="mb-2">
              <SectionHeading title={t('phrase.meaning')} />
              <div className={isMeaningLong && !meaningExpanded ? 'relative max-h-36 overflow-hidden transition-all duration-300' : ''}>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere]">
                  {phraseResult.meaning}
                </p>
                {isMeaningLong && !meaningExpanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
                )}
              </div>
              {(phraseMind.coreConcept?.feelAnchor || phraseMind.coreConcept?.emotionalTone) && (
                <div className="mt-2 space-y-1 border-l-2 border-l-accent/40 pl-3">
                  {phraseMind.coreConcept?.feelAnchor && (
                    <p className="text-[11px] text-foreground-muted leading-relaxed">
                      <span className="font-semibold text-foreground/80 mr-1">{t('coreConcept.feelAnchor')}</span>
                      {phraseMind.coreConcept.feelAnchor}
                    </p>
                  )}
                  {phraseMind.coreConcept?.emotionalTone && (
                    <p className="text-[11px] text-foreground-muted leading-relaxed">
                      <span className="font-semibold text-foreground/80 mr-1">{t('coreConcept.emotionalTone')}</span>
                      {phraseMind.coreConcept.emotionalTone}
                    </p>
                  )}
                </div>
              )}
              {isMeaningLong && (
                <button
                  onClick={() => setMeaningExpanded(v => !v)}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:opacity-80 transition-colors cursor-pointer"
                >
                  <span>{meaningExpanded ? t('phrase.collapseMeaning') : t('phrase.expandMeaning')}</span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${meaningExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {activeModules.map((module) => {
            if (!module.enabled) return null

            switch (module.id) {
              case 'dictionary':
                if (isCoreMode) return null
                return (
                  <div key={module.id} className="space-y-4">
                    <div>
                      <SectionHeading title={t('phrase.meaning')} />
                      <div className={isMeaningLong && !meaningExpanded ? 'relative max-h-36 overflow-hidden transition-all duration-300' : ''}>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere]">
                          {phraseResult.meaning}
                        </p>
                        {isMeaningLong && !meaningExpanded && (
                          <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
                        )}
                      </div>
                      {isMeaningLong && (
                        <button
                          onClick={() => setMeaningExpanded(v => !v)}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:opacity-80 transition-colors cursor-pointer"
                        >
                          <span>{meaningExpanded ? t('phrase.collapseMeaning') : t('phrase.expandMeaning')}</span>
                          <svg
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${meaningExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {hasUsageContexts && (
                      <div>
                        <SectionHeading title={t('phrase.usageScenes')} />
                        {usageIntro && (
                          <p className="text-sm text-foreground leading-relaxed mb-2.5 whitespace-pre-line break-words [overflow-wrap:anywhere]">
                            {usageIntro}
                          </p>
                        )}
                        {usageScenes.length > 0 && (
                          <div className="space-y-2">
                            {usageScenes.map((s, i) => (
                              <div key={i} className="border-l-2 border-l-border bg-background-soft/40 pl-3.5 pr-3 py-2.5 rounded-r-xl">
                                <div className="mb-0.5">
                                  <span className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider">{s.label}</span>
                                </div>
                                <p className="text-xs text-foreground-muted leading-relaxed font-medium break-words [overflow-wrap:anywhere]">{s.description}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              case 'usageScenes':
                if (!isCoreMode || !hasUsageContexts) return null
                return (
                  <div key={module.id}>
                    <SectionHeading title={t('phrase.usageScenes')} />
                    {usageIntro && (
                      <p className="text-sm text-foreground leading-relaxed mb-2.5 whitespace-pre-line break-words [overflow-wrap:anywhere]">
                        {usageIntro}
                      </p>
                    )}
                    {usageScenes.length > 0 && (
                      <div className="space-y-2">
                        {usageScenes.map((s, i) => (
                          <div key={i} className="border-l-2 border-l-border bg-background-soft/40 pl-3.5 pr-3 py-2.5 rounded-r-xl">
                            <div className="mb-0.5">
                              <span className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider">{s.label}</span>
                            </div>
                            <p className="text-xs text-foreground-muted leading-relaxed font-medium break-words [overflow-wrap:anywhere]">{s.description}</p>
                          </div>
                        ))}
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
              case 'wordChoice':
                if (!isCoreMode) return null
                return (
                  <WordChoiceCard
                    key={module.id}
                    wordChoiceContrast={phraseMind.wordChoiceContrast ?? phraseResult.wordChoiceContrast}
                    whyChooseFallback={phraseMind.whyChooseFallback}
                  />
                )
              case 'mnemonic':
                if (isCoreMode) return null
                return (
                  <MnemonicCard
                    key={module.id}
                    word={phraseResult.correctForm || phrase}
                    initialMnemonic={phraseResult.mnemonic}
                    isPhrase={true}
                    onUpdateMnemonic={(m) => updatePhraseMnemonic(phrase, m, phraseCognitive)}
                  />
                )
              case 'examples':
                if (isCoreMode) return null
                return (
                  <div key={module.id}>
                    {(phraseResult.examples?.length ?? 0) > 0 && (
                      <ExampleList examples={phraseResult.examples} hideTranslation={hideTranslation} />
                    )}
                  </div>
                )
              case 'practice':
                return (
                  <PracticeSection
                    key={module.id}
                    mode={isCoreMode ? 'usage-output' : 'meaning-check'}
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
                if (phraseMind.coreConcept?.feelAnchor || phraseMind.coreConcept?.emotionalTone) {
                  parts.push(
                    `感觉/情绪: ${phraseMind.coreConcept?.feelAnchor || ''}`
                    + (phraseMind.coreConcept?.emotionalTone ? ` | ${phraseMind.coreConcept.emotionalTone}` : ''),
                  )
                }
                const pContrast = phraseMind.wordChoiceContrast ?? phraseResult.wordChoiceContrast
                if (pContrast?.length) {
                  parts.push('选用对照:\n' + pContrast.map((r) => `  · vs ${r.vs}: ${r.reason}`).join('\n'))
                } else if (phraseMind.whyChooseFallback) {
                  parts.push(`选用说明: ${phraseMind.whyChooseFallback}`)
                }
                if (phraseResult.unnaturalMindModel) {
                  parts.push(`思维违和感剖析: 中文直译("${phraseResult.unnaturalMindModel.chineseThought}") → 母语心智("${phraseResult.unnaturalMindModel.nativeConcept}") [法则: ${phraseResult.unnaturalMindModel.reusablePrinciple}]`)
                }
                if (phraseResult.meaning) parts.push(`释义: ${phraseResult.meaning}`)
                if (usageIntro) parts.push(`使用场景开场: ${usageIntro}`)
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
                return <AiChatBox key={module.id} context={corrected} cognitive={phraseCognitive} enrichedContext={enrichedContext} />
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
        )
      })()}
    </div>
  )
}


