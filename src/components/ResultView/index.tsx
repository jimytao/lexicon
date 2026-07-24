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
import { useT } from '../../i18n'
import { CollocationCard } from './AiSection/CollocationCard'
import { CulturalLoreCard } from './AiSection/CulturalLoreCard'

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
  const t = useT()
  const { modules } = useSettingsStore()
  const updateMnemonic = useResultStore(state => state.updateMnemonic)
  const displayedExamples = wordResult.examples.length > 0 ? wordResult.examples : aiAnalysis?.examples ?? []

  return (
    <div className="px-3 py-3 min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere]">
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
                      {t('result.aiModeHint')}
                    </p>
                  )}
                </div>
              )
            case 'semantic':
              return null
            case 'collocations':
              return mode === 'ai' && aiStatus === 'success' && aiAnalysis?.collocations && (
                <CollocationCard key={module.id} collocations={aiAnalysis.collocations} />
              )
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
            case 'culture':
              return mode === 'ai' && aiStatus === 'success' && aiAnalysis?.culturalLore && (
                <CulturalLoreCard key={module.id} lore={aiAnalysis.culturalLore} />
              )
            case 'chat': {
              if (mode === 'ai' && aiStatus !== 'success') return null
              // Same single AiChatBox as AiFull/Phrase — only wire enrichedContext when
              // AI analysis is ready so the context bulb can appear (one bulb, no duplicate).
              const parts: string[] = []
              if (mode === 'ai' && aiAnalysis) {
                if (aiAnalysis.meanings?.length) {
                  parts.push('释义:\n' + aiAnalysis.meanings.map(m => `  · ${m.zh}`).join('\n'))
                }
                if (displayedExamples.length) {
                  parts.push('例句:\n' + displayedExamples.slice(0, 3).map(e => `  · ${e.en}`).join('\n'))
                }
                if (aiAnalysis.synonyms?.length) {
                  parts.push('近义词: ' + aiAnalysis.synonyms.map(s => s.word).join(', '))
                }
                if (aiAnalysis.mnemonic) {
                  const best = aiAnalysis.mnemonic[aiAnalysis.mnemonic.bestType]
                  parts.push(`助记法 (${aiAnalysis.mnemonic.bestType}): ${best.content}`)
                }
                if (aiAnalysis.collocations) {
                  const chunkList = aiAnalysis.collocations.chunks?.map(c => c.chunk).join(', ')
                  const colloList = aiAnalysis.collocations.collocations?.map(c => c.chunk).join(', ')
                  if (chunkList) parts.push(`Chunks: ${chunkList}`)
                  if (colloList) parts.push(`Collocations: ${colloList}`)
                }
                if (aiAnalysis.culturalLore?.content) {
                  parts.push(`文化背景: ${aiAnalysis.culturalLore.content}`)
                }
              }
              const enrichedContext = parts.length > 0 ? parts.join('\n') : undefined
              return (
                <AiChatBox key={module.id} context={wordResult.word} enrichedContext={enrichedContext} />
              )
            }
            default:
              return null
          }
        })}
      </div>
    </div>
  )
}
