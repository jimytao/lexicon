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
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            {t('phrase.youEntered')} <DiffText original={phrase} corrected={phraseResult.correctForm} />
          </p>
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
                    word={phrase} 
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
              case 'chat':
                return <AiChatBox key={module.id} context={phrase} />
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
