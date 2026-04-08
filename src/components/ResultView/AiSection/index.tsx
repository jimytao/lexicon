import type { AiAnalysis, Meaning } from '../../../types'
import type { AiStatus } from '../../../stores/resultStore'
import { AiStatusBar, SkeletonBlock } from './AiStatusBar'
import { SemanticScene } from './SemanticScene'
import { EtymologyCard } from './EtymologyCard'
import { SynonymList } from './SynonymList'
import { PracticeSection } from './PracticeSection'
import { AiChatBox } from './AiChatBox'

interface AiSectionProps {
  status: AiStatus
  aiAnalysis: AiAnalysis | null
  error: string | null
  word: string
  meanings: Meaning[]
  onRetry: () => void
  onSynonymClick: (word: string) => void
}

export function AiSection({ status, aiAnalysis, error, word, meanings, onRetry, onSynonymClick }: AiSectionProps) {
  return (
    <div style={{ transition: 'opacity 0.3s' }}>
      <AiStatusBar status={status} error={error} onRetry={onRetry} />

      {status === 'loading' && (
        <>
          <SkeletonBlock lines={3} variant="card" />
          <SkeletonBlock lines={4} variant="pill" />
          <SkeletonBlock lines={4} variant="pill" />
        </>
      )}

      {status === 'success' && aiAnalysis && (
        <>
          <SemanticScene meanings={aiAnalysis.meanings} />
          <EtymologyCard etymology={aiAnalysis.etymology} />
          <SynonymList synonyms={aiAnalysis.synonyms} onSynonymClick={onSynonymClick} />
          <PracticeSection word={word} meanings={meanings} />
          <AiChatBox context={word} />
        </>
      )}
    </div>
  )
}
