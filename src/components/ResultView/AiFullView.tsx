import type { AiFullResult } from '../../types'
import type { AiStatus } from '../../stores/resultStore'
import { WordHeader } from './WordHeader'
import { MeaningList } from './InstantSection/MeaningList'
import { ExampleList } from './InstantSection/ExampleList'
import { AiStatusBar, SkeletonBlock } from './AiSection/AiStatusBar'
import { SemanticScene } from './AiSection/SemanticScene'
import { EtymologyCard } from './AiSection/EtymologyCard'
import { SynonymList } from './AiSection/SynonymList'
import { PracticeSection } from './AiSection/PracticeSection'
import { MnemonicCard } from './AiSection/MnemonicCard'
import { AiChatBox } from './AiSection/AiChatBox'
import { useResultStore } from '../../stores/resultStore'
import { useSettingsStore } from '../../stores/settingsStore'

interface AiFullViewProps {
  word: string
  aiFullResult: AiFullResult | null
  aiStatus: AiStatus
  aiError: string | null
  onRetry: () => void
  onWordClick: (word: string) => void
}

export function AiFullView({ word, aiFullResult, aiStatus, aiError, onRetry, onWordClick }: AiFullViewProps) {
  const { modules } = useSettingsStore()
  const updateFullMnemonic = useResultStore(state => state.updateFullMnemonic)

  return (
    <div className="px-4 py-4">
      {/* AI badge */}
      <div className="mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
          AI 查询
        </span>
      </div>

      <AiStatusBar status={aiStatus} error={aiError} onRetry={onRetry} />

      {aiStatus === 'loading' && (
        <div className="space-y-4">
          <div className="mb-4">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{word}</h1>
          </div>
          <SkeletonBlock lines={3} variant="card" />
          <SkeletonBlock lines={4} variant="pill" />
          <SkeletonBlock lines={4} variant="pill" />
        </div>
      )}

      {aiStatus === 'success' && aiFullResult && (
        <div className="space-y-2">
          <WordHeader word={aiFullResult.correctForm || word} phonetic={aiFullResult.phonetic} pos={aiFullResult.pos} />
          {aiFullResult.correctForm && aiFullResult.correctForm.toLowerCase() !== word.toLowerCase() && (
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-3 mb-3">
              你输入的是 <span className="line-through text-red-400 dark:text-red-500">{word}</span>
            </p>
          )}

          {modules.map((module) => {
            if (!module.enabled) return null

            switch (module.id) {
              case 'dictionary':
                return (
                  <div key={module.id}>
                    <MeaningList
                      meanings={aiFullResult.meanings.map((m) => ({ zh: m.zh, en: m.en }))}
                      scenes={aiFullResult.meanings.map((m) => m.scene)}
                    />
                    <SemanticScene
                      meanings={aiFullResult.meanings.map((m) => ({ zh: m.zh, scene: m.scene }))}
                    />
                  </div>
                )
              case 'examples':
                return (
                  <div key={module.id}>
                    {aiFullResult.examples.length > 0 && (
                      <ExampleList examples={aiFullResult.examples} />
                    )}
                  </div>
                )
              case 'synonyms':
                return (
                  <SynonymList key={module.id} synonyms={aiFullResult.synonyms} onSynonymClick={onWordClick} />
                )
              case 'etymology':
                return (
                  <EtymologyCard key={module.id} etymology={aiFullResult.etymology} />
                )
              case 'mnemonic':
                return (
                  <MnemonicCard
                    key={module.id}
                    word={aiFullResult.correctForm || word}
                    initialMnemonic={aiFullResult.mnemonic}
                    onUpdateMnemonic={(m) => updateFullMnemonic(word, m)}
                  />
                )
              case 'practice':
                return (
                  <PracticeSection
                    key={module.id}
                    word={word}
                    meanings={aiFullResult.meanings.map((m) => ({ zh: m.zh, en: m.en }))}
                  />
                )
              case 'chat':
                return (
                  <AiChatBox key={module.id} context={word} />
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
