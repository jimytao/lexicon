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

interface PhraseViewProps {
  phrase: string
  phraseResult: PhraseResult | null
  aiStatus: AiStatus
  aiError: string | null
  onRetry: () => void
  onGoToSettings?: () => void
}

export function PhraseView({ phrase, phraseResult, aiStatus, aiError, onRetry, onGoToSettings }: PhraseViewProps) {
  const { modules } = useSettingsStore()
  const updatePhraseMnemonic = useResultStore(state => state.updatePhraseMnemonic)

  return (
    <div className="px-4 py-4">
      {/* AI badge */}
      <div className="mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-medium">
          AI 查询 · 词组/句子
        </span>
      </div>

      {phraseResult && phraseResult.correctForm && phraseResult.correctForm.toLowerCase() !== phrase.toLowerCase() ? (
        <>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-1 leading-snug">{phraseResult.correctForm}</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            你输入的是 <DiffText original={phrase} corrected={phraseResult.correctForm} />
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
                        <h2 className="text-xs font-semibold text-teal-900 dark:text-teal-300">释义</h2>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{phraseResult.meaning}</p>
                    </div>

                    {/* 使用场景 */}
                    {phraseResult.usageScenes.length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                          <h2 className="text-xs font-semibold text-teal-900 dark:text-teal-300">使用场景</h2>
                        </div>
                        <div className="space-y-2">
                          {phraseResult.usageScenes.map((s, i) => (
                            <div key={i} className="rounded-lg px-3 py-2.5 bg-teal-50 dark:bg-teal-900/20">
                              <span className="text-xs font-semibold text-teal-900 dark:text-teal-200 mr-2">{s.label}</span>
                              <p className="text-xs leading-relaxed text-teal-800 dark:text-teal-200 mt-0.5">{s.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 文化/背景趣味知识 (针对日语/韩语等) */}
                    {phraseResult.culturalLore && (
                      <div className="mb-4">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                          <h2 className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">{phraseResult.culturalLore.title || '文化背景 & 趣味百科'}</h2>
                        </div>
                        <div className="rounded-xl p-4 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/20">
                          <p className="text-sm leading-relaxed text-indigo-900 dark:text-indigo-200">{phraseResult.culturalLore.content}</p>
                          {phraseResult.culturalLore.subculture && (
                            <div className="mt-3 pt-3 border-t border-indigo-200/30 dark:border-indigo-800/30">
                              <span className="text-[10px] font-bold tracking-wider uppercase text-indigo-500 dark:text-indigo-400 block mb-1">Subculture / Lore</span>
                              <p className="text-xs text-indigo-800/80 dark:text-indigo-300/80 italic">{phraseResult.culturalLore.subculture}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
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
                      <ExampleList examples={phraseResult.examples} />
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
              default:
                return null
            }
          })}
          {/* Global AI Chat */}
          {modules.find(m => m.id === 'chat')?.enabled && (
            <AiChatBox context={phrase} />
          )}
        </div>
      )}
    </div>
  )
}
