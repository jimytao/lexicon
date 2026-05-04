import type { PhraseResult } from '../../types'
import type { AiStatus } from '../../stores/resultStore'
import { ExampleList } from './InstantSection/ExampleList'
import { AiStatusBar, SkeletonBlock } from './AiSection/AiStatusBar'
import { AiChatBox } from './AiSection/AiChatBox'
import { PhraseExercises } from './PhraseExercises'
import { MnemonicCard } from './AiSection/MnemonicCard'
import { useResultStore } from '../../stores/resultStore'
import { useSettingsStore } from '../../stores/settingsStore'

interface PhraseViewProps {
  phrase: string
  phraseResult: PhraseResult | null
  aiStatus: AiStatus
  aiError: string | null
  onRetry: () => void
}

export function PhraseView({ phrase, phraseResult, aiStatus, aiError, onRetry }: PhraseViewProps) {
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
            你输入的是 <span className="line-through text-red-400 dark:text-red-500">{phrase}</span>
          </p>
        </>
      ) : (
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 leading-snug">{phraseResult?.correctForm || phrase}</h1>
      )}

      <AiStatusBar status={aiStatus} error={aiError} onRetry={onRetry} />

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
                  <div key={module.id}>
                    {phraseResult.exercises.length > 0 && (
                      <PhraseExercises phrase={phraseResult.correctForm || phrase} exercises={phraseResult.exercises} />
                    )}
                  </div>
                )
              case 'chat':
                return (
                  <AiChatBox key={module.id} context={phrase} />
                )
              default:
                return null
            }
          })}
        </div>
      )}
    </div>
  )
}
