import type { WordResult, AiAnalysis, SuggestItem } from '../../types'
import type { AiStatus } from '../../stores/resultStore'
import { WordHeader } from './WordHeader'
import { useSettingsStore } from '../../stores/settingsStore'
import { useResultStore } from '../../stores/resultStore'
import { MeaningList } from './InstantSection/MeaningList'
import { ExampleList } from './InstantSection/ExampleList'
import { PhrasesSection } from './InstantSection/PhrasesSection'
import { SynonymList } from './AiSection/SynonymList'
import { EtymologyCard } from './AiSection/EtymologyCard'
import { MnemonicCard } from './AiSection/MnemonicCard'
import { PracticeSection } from './AiSection/PracticeSection'
import { AiChatBox } from './AiSection/AiChatBox'
import { AiStatusBar, SkeletonBlock } from './AiSection/AiStatusBar'

interface ResultViewProps {
  wordResult: WordResult
  relatedPhrases: SuggestItem[]
  aiAnalysis: AiAnalysis | null
  aiStatus: AiStatus
  aiError: string | null
  mode: 'instant' | 'ai'
  onRetry: () => void
  onWordClick: (word: string) => void
}

export function ResultView({
  wordResult,
  relatedPhrases,
  aiAnalysis,
  aiStatus,
  aiError,
  mode,
  onRetry,
  onWordClick,
}: ResultViewProps) {
  const { modules } = useSettingsStore()
  const updateMnemonic = useResultStore(state => state.updateMnemonic)
  const scenes = aiAnalysis?.meanings.map((m) => m.scene)

  return (
    <div className="px-4 py-4">
      <WordHeader word={wordResult.word} phonetic={wordResult.phonetic} pos={wordResult.pos} />

      {/* AI Status & Loading state for AI mode */}
      {mode === 'ai' && (
        <div className="mb-4">
          <AiStatusBar status={aiStatus} error={aiError} onRetry={onRetry} />
          {aiStatus === 'loading' && (
            <div className="space-y-4">
              <SkeletonBlock lines={3} variant="card" />
              <SkeletonBlock lines={4} variant="pill" />
              <SkeletonBlock lines={4} variant="pill" />
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {modules.map((module) => {
          if (!module.enabled) return null

          switch (module.id) {
            case 'dictionary':
              return (
                <div key={module.id}>
                  <MeaningList meanings={wordResult.meanings} scenes={scenes} />
                  {relatedPhrases.length > 0 && (
                    <PhrasesSection phrases={relatedPhrases} onPhraseClick={onWordClick} />
                  )}
                  {mode === 'instant' && !scenes && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-8 animate-in fade-in duration-700">
                      切换 AI mode 可查看：语义情景 · 词根词缀 · 近义词辨析
                    </p>
                  )}
                </div>
              )
            case 'examples':
              return (
                <div key={module.id}>
                  <ExampleList examples={wordResult.examples} />
                </div>
              )
            case 'synonyms':
              return mode === 'ai' && aiStatus === 'success' && aiAnalysis?.synonyms && (
                <SynonymList key={module.id} synonyms={aiAnalysis.synonyms} onSynonymClick={onWordClick} />
              )
            case 'etymology':
              return mode === 'ai' && aiStatus === 'success' && aiAnalysis?.etymology && (
                <EtymologyCard key={module.id} etymology={aiAnalysis.etymology} />
              )
            case 'mnemonic':
              return mode === 'ai' && aiStatus === 'success' && (
                <MnemonicCard
                  key={module.id}
                  word={wordResult.word}
                  initialMnemonic={aiAnalysis?.mnemonic}
                  onUpdateMnemonic={(m) => updateMnemonic(wordResult.word, m)}
                />
              )
            case 'practice':
              return mode === 'ai' && aiStatus === 'success' && (
                <PracticeSection key={module.id} word={wordResult.word} meanings={wordResult.meanings} />
              )
            case 'chat':
              if (mode === 'ai' && aiStatus !== 'success') return null
              return (
                <AiChatBox key={module.id} context={wordResult.word} />
              )
            default:
              return null
          }
        })}
      </div>
    </div>
  )
}
