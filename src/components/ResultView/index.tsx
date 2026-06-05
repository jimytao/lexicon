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
  onGoToSettings?: () => void
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
  onGoToSettings,
}: ResultViewProps) {
  const { modules } = useSettingsStore()
  const updateMnemonic = useResultStore(state => state.updateMnemonic)
  const displayedExamples = wordResult.examples.length > 0 ? wordResult.examples : aiAnalysis?.examples ?? []

  return (
    <div className="px-4 py-4">
      <WordHeader word={wordResult.word} phonetic={wordResult.phonetic} pos={wordResult.pos} />

      {/* AI Status & Loading state for AI mode */}
      {mode === 'ai' && (
        <div className="mb-4">
          <AiStatusBar status={aiStatus} error={aiError} onRetry={onRetry} onGoToSettings={onGoToSettings} word={wordResult.word} />
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
              const mergedMeanings = mode === 'ai' && aiStatus === 'success' && aiAnalysis?.meanings
                ? wordResult.meanings.map((m, idx) => ({
                    ...m,
                    imageQuery: aiAnalysis.meanings[idx]?.imageQuery
                  }))
                : wordResult.meanings;
              return (
                <div key={module.id}>
                  <MeaningList
                    key={wordResult.word}
                    meanings={mergedMeanings}
                    scenes={mode === 'ai' && aiStatus === 'success' ? aiAnalysis?.meanings?.map(m => m.scene) : undefined}
                  />
                  {mode === 'instant' && !aiAnalysis?.meanings?.length && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-8 animate-in fade-in duration-700">
                      切换 AI mode 可查看：语义情景 · 词根词缀 · 近义词辨析
                    </p>
                  )}
                </div>
              )
            case 'semantic':
              return null
            case 'examples':
              return (
                <div key={module.id}>
                  <ExampleList examples={displayedExamples} />
                </div>
              )
            case 'related':
              return relatedPhrases.length > 0 && (
                <PhrasesSection key={module.id} phrases={relatedPhrases} onPhraseClick={onWordClick} />
              )
            case 'synonyms':
              return mode === 'ai' && aiStatus === 'success' && (aiAnalysis?.synonyms || aiAnalysis?.antonyms) && (
                <SynonymList
                  key={module.id}
                  synonyms={aiAnalysis.synonyms}
                  antonyms={aiAnalysis.antonyms}
                  onSynonymClick={onWordClick}
                />
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
