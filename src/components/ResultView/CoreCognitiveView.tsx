import type { AiFullResult } from '../../types'
import type { AiStatus } from '../../stores/resultStore'
import { WordHeader } from './WordHeader'
import { MeaningList } from './InstantSection/MeaningList'
import { AiStatusBar, SkeletonBlock } from './AiSection/AiStatusBar'
import { NativeMindModelCard } from './AiSection/NativeMindModelCard'
import { CoreConceptCard } from './AiSection/CoreConceptCard'
import { WordGraphCard } from './AiSection/WordGraphCard'
import { CollocationCard } from './AiSection/CollocationCard'
import { SynonymList } from './AiSection/SynonymList'
import { AiChatBox } from './AiSection/AiChatBox'
import { DiffText } from './DiffText'
import { useT } from '../../i18n'

import { useSettingsStore, DEFAULT_CORE_MODULES } from '../../stores/settingsStore'

interface CoreCognitiveViewProps {
  word: string
  aiFullResult: AiFullResult | null
  aiStatus: AiStatus
  aiError: string | null
  onRetry: () => void
  onWordClick: (word: string) => void
  onGoToSettings?: () => void
}

import { LexiconMemoryBadge } from './LexiconMemoryBadge'

export function CoreCognitiveView({
  word,
  aiFullResult,
  aiStatus,
  aiError,
  onRetry,
  onWordClick,
  onGoToSettings,
}: CoreCognitiveViewProps) {
  const t = useT()
  const { coreModules = DEFAULT_CORE_MODULES } = useSettingsStore()

  return (
    <div className="px-3 py-3 min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere]">
      {/* Mode 3 Pure Core Badge */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-500/20 flex items-center gap-1">
          <span>🌌</span>
          <span>Pure Core Cognitive Mode</span>
        </span>
        <LexiconMemoryBadge word={word} />
      </div>


      {/* Header for Loading / Error states */}
      {aiStatus !== 'success' && (
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 break-words [overflow-wrap:anywhere] max-w-full">
            {word}
          </h1>
        </div>
      )}

      <AiStatusBar status={aiStatus} error={aiError} onRetry={onRetry} onGoToSettings={onGoToSettings} word={word} />

      {aiStatus === 'loading' && (
        <div className="space-y-4">
          <SkeletonBlock lines={3} variant="card" />
          <SkeletonBlock lines={4} variant="pill" />
          <SkeletonBlock lines={4} variant="pill" />
        </div>
      )}

      {aiStatus === 'success' && aiFullResult && (
        <div className="space-y-3">
          <WordHeader word={aiFullResult.correctForm || word} phonetic={aiFullResult.phonetic} pos={aiFullResult.pos} />

          {aiFullResult.correctForm && aiFullResult.correctForm.toLowerCase() !== word.toLowerCase() && (
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2 mb-2">
              {t('aifull.youEntered')} <DiffText original={word} corrected={aiFullResult.correctForm} />
            </p>
          )}

          <NativeMindModelCard nativeMindModel={aiFullResult.nativeMindModel} />

          {coreModules.map((module) => {
            if (!module.enabled) return null

            switch (module.id) {
              case 'coreConcept':
                return <CoreConceptCard key={module.id} coreConcept={aiFullResult.coreConcept} />
              case 'wordGraph':
                return <WordGraphCard key={module.id} conceptGraph={aiFullResult.conceptGraph} />
              case 'collocations':
                return aiFullResult.collocations && (
                  <CollocationCard key={module.id} collocations={aiFullResult.collocations} />
                )
              case 'synonyms':
                return (aiFullResult.synonyms || aiFullResult.antonyms) && (
                  <SynonymList
                    key={module.id}
                    synonyms={aiFullResult.synonyms}
                    antonyms={aiFullResult.antonyms}
                    onSynonymClick={onWordClick}
                  />
                )
              case 'dictionary':
                return aiFullResult.meanings && aiFullResult.meanings.length > 0 && (
                  <MeaningList
                    key={module.id}
                    meanings={aiFullResult.meanings.map(m => ({ zh: m.zh, en: m.en, pos: m.pos, imageQuery: m.imageQuery }))}
                    scenes={aiFullResult.meanings.map(m => m.scene)}
                  />
                )
              case 'chat': {
                const corrected = aiFullResult.correctForm || word
                const parts: string[] = []
                if (aiFullResult.coreConcept?.image) {
                  parts.push(`核心意象: "${aiFullResult.coreConcept.image}" — ${aiFullResult.coreConcept.explanation || ''}`)
                }
                if (aiFullResult.conceptGraph?.branches?.length) {
                  parts.push('延伸分支领域:\n' + aiFullResult.conceptGraph.branches.map(
                    b => `  · ${b.category}: ${b.examples.join(', ')}`
                  ).join('\n'))
                }
                if (aiFullResult.collocations?.chunks?.length) {
                  parts.push('Chunks: ' + aiFullResult.collocations.chunks.map(c => c.chunk + (c.spatialExtension ? ` (${c.spatialExtension})` : '')).join(', '))
                }
                if (aiFullResult.meanings?.length) {
                  parts.push('基本释义:\n' + aiFullResult.meanings.map(m => `  · ${m.en || m.zh}`).join('\n'))
                }
                const enrichedContext = parts.length > 0 ? parts.join('\n') : undefined
                return <AiChatBox key={module.id} context={corrected} enrichedContext={enrichedContext} />
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

