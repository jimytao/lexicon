import type { Meaning, Example, Scene, SuggestItem } from '../../../types'
import { MeaningList } from './MeaningList'
import { ExampleList } from './ExampleList'
import { PhrasesSection } from './PhrasesSection'

interface InstantSectionProps {
  meanings: Meaning[]
  examples: Example[]
  relatedPhrases?: SuggestItem[]
  scenes?: Scene[]
  showAiHint?: boolean
  onPhraseClick?: (word: string) => void
}

export function InstantSection({
  meanings,
  examples,
  relatedPhrases = [],
  scenes,
  showAiHint,
  onPhraseClick,
}: InstantSectionProps) {
  return (
    <div>
      {meanings.length > 0 && <MeaningList meanings={meanings} scenes={scenes} />}
      {showAiHint && !scenes && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          切换 AI mode 可查看：语义情景 · 词根词缀 · 近义词辨析
        </p>
      )}
      {relatedPhrases.length > 0 && onPhraseClick && (
        <PhrasesSection phrases={relatedPhrases} onPhraseClick={onPhraseClick} />
      )}
      {examples.length > 0 && <ExampleList examples={examples} />}
    </div>
  )
}
