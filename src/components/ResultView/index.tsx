import type { WordResult, AiAnalysis, SuggestItem } from '../../types'
import type { AiStatus } from '../../stores/resultStore'
import { WordHeader } from './WordHeader'
import { InstantSection } from './InstantSection'
import { AiSection } from './AiSection'

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
  const scenes = aiAnalysis?.meanings.map((m) => m.scene)

  return (
    <div className="px-4 py-4">
      <WordHeader word={wordResult.word} phonetic={wordResult.phonetic} pos={wordResult.pos} />

      {mode === 'ai' ? (
        <>
          <InstantSection meanings={wordResult.meanings} examples={[]} scenes={scenes} />
          <AiSection
            status={aiStatus}
            aiAnalysis={aiAnalysis}
            error={aiError}
            word={wordResult.word}
            meanings={wordResult.meanings}
            onRetry={onRetry}
            onSynonymClick={onWordClick}
          />
          <InstantSection
            meanings={[]}
            examples={wordResult.examples}
            relatedPhrases={relatedPhrases}
            onPhraseClick={onWordClick}
          />
        </>
      ) : (
        <InstantSection
          meanings={wordResult.meanings}
          examples={wordResult.examples}
          relatedPhrases={relatedPhrases}
          showAiHint
          onPhraseClick={onWordClick}
        />
      )}
    </div>
  )
}
