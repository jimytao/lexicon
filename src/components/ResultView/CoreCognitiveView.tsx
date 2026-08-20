import type { AiFullResult, WordResult } from '../../types'
import type { AiStatus } from '../../stores/resultStore'
import { WordHeader } from './WordHeader'
import { AiStatusBar, SkeletonBlock } from './AiSection/AiStatusBar'
import { CoreConceptCard } from './AiSection/CoreConceptCard'
import { WordGraphCard } from './AiSection/WordGraphCard'
import { CollocationCard } from './AiSection/CollocationCard'
import { SynonymList } from './AiSection/SynonymList'
import { migrateNativeMindToCoreFields } from '../../utils/coreMindsetPipeline'
import { AiChatBox } from './AiSection/AiChatBox'
import { DiffText } from './DiffText'
import { useT } from '../../i18n'
import { useSettingsStore, DEFAULT_CORE_MODULES } from '../../stores/settingsStore'
import { useResultStore } from '../../stores/resultStore'
import { LexiconMemoryBadge } from './LexiconMemoryBadge'
import { useAiLookup } from '../../hooks/useAiLookup'
import { CulturalLoreCard } from './AiSection/CulturalLoreCard'
import { PracticeSection } from './AiSection/PracticeSection'
import { UsageScenesCard } from './AiSection/UsageScenesCard'
import { SectionHeading } from './SectionHeading'
import { MeaningList } from './InstantSection/MeaningList'
import { detectLanguage } from '../../stores/searchStore'

interface CoreCognitiveViewProps {
  word: string
  aiFullResult: AiFullResult | null
  /** Dictionary L1 when normal search hit the local lexicon (not force-AI bypass). */
  dictWordResult?: WordResult | null
  aiStatus: AiStatus
  aiError: string | null
  onRetry: () => void
  onWordClick: (word: string) => void
  onGoToSettings?: () => void
}

export function CoreCognitiveView({
  word,
  aiFullResult,
  dictWordResult = null,
  aiStatus,
  aiError,
  onRetry,
  onWordClick,
  onGoToSettings,
}: CoreCognitiveViewProps) {
  const t = useT()
  const { coreModules = DEFAULT_CORE_MODULES } = useSettingsStore()
  const { repairCollocationNotes, repairConceptExamples } = useAiLookup()
  const repairKey = aiFullResult?.correctForm || dictWordResult?.word || word
  const isChineseQuery = detectLanguage(word) === 'zh'
  const zhCandidates = isChineseQuery ? (aiFullResult?.meanings ?? []) : []
  const migratedMind = aiFullResult
    ? migrateNativeMindToCoreFields({
        coreConcept: aiFullResult.coreConcept,
        nativeMindModel: aiFullResult.nativeMindModel,
        wordChoiceContrast: aiFullResult.wordChoiceContrast,
      })
    : {}
  const showDictL1 = Boolean(dictWordResult?.meanings?.length)
  const corePending = useResultStore(state => state.aiPendingHalves.core)

  return (
    <div className="px-3 py-3 min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium">
          {t('mode.core')}
        </span>
        <LexiconMemoryBadge word={aiFullResult?.correctForm || dictWordResult?.word || word} />
      </div>

      {showDictL1 && dictWordResult && (
        <div className="mb-3 space-y-2">
          <WordHeader
            word={dictWordResult.word}
            phonetic={dictWordResult.phonetic}
            pos={dictWordResult.pos}
          />
          <MeaningList meanings={dictWordResult.meanings} />
        </div>
      )}

      {!showDictL1 && aiStatus !== 'success' && (
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 break-words [overflow-wrap:anywhere] max-w-full">
            {word}
          </h1>
        </div>
      )}

      <AiStatusBar status={aiStatus} error={aiError} onRetry={onRetry} onGoToSettings={onGoToSettings} word={word} />

      {(aiStatus === 'loading' || (aiStatus === 'success' && corePending)) && (
        <div className="space-y-4">
          <SkeletonBlock lines={3} variant="card" />
          <SkeletonBlock lines={4} variant="pill" />
          <SkeletonBlock lines={4} variant="pill" />
        </div>
      )}

      {aiStatus === 'success' && aiFullResult && (
        <div className="space-y-3">
          {!showDictL1 && (
            <>
              <WordHeader word={aiFullResult.correctForm || word} phonetic={aiFullResult.phonetic} pos={aiFullResult.pos} />

              {aiFullResult.correctForm && aiFullResult.correctForm.toLowerCase() !== word.toLowerCase() && (
                <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2 mb-2">
                  {t('aifull.youEntered')} <DiffText original={word} corrected={aiFullResult.correctForm} />
                </p>
              )}
            </>
          )}

          {/* 中文反查：短英文候选（非 dictionary 墙） */}
          {zhCandidates.length > 0 && (
            <div className="mb-2 rounded-xl border border-border/50 bg-background-soft/40 px-3 py-2.5">
              <SectionHeading title={t('core.zhCandidates')} />
              <ul className="space-y-1.5">
                {zhCandidates.map((m, i) => (
                  <li key={i} className="text-xs leading-relaxed">
                    <button
                      type="button"
                      onClick={() => onWordClick(m.en || m.zh)}
                      className="font-semibold text-accent hover:underline cursor-pointer"
                    >
                      {m.en || m.zh}
                    </button>
                    {m.pos && (
                      <span className="ml-1.5 text-[10px] text-foreground-muted">{m.pos}</span>
                    )}
                    {m.zh && m.en && (
                      <span className="block mt-0.5 text-foreground-muted font-medium">{m.zh}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {coreModules.map((module) => {
            if (!module.enabled) return null

            switch (module.id) {
              case 'coreConcept':
                return (
                  <CoreConceptCard
                    key={module.id}
                    coreConcept={migratedMind.coreConcept ?? aiFullResult.coreConcept}
                    variant="usage"
                  />
                )
              case 'wordGraph':
                return (
                  <WordGraphCard
                    key={module.id}
                    wordGraphEnabled
                    conceptGraph={aiFullResult.conceptGraph}
                    onRepairMissing={() => repairConceptExamples(repairKey)}
                    onRetryGenerate={onRetry}
                  />
                )
              case 'chunks':
                return aiFullResult.collocations && (
                  <CollocationCard
                    key={module.id}
                    variant="chunks"
                    collocations={aiFullResult.collocations}
                    word={repairKey}
                    onRepairMissing={() => repairCollocationNotes(repairKey)}
                  />
                )
              case 'collocations':
                return aiFullResult.collocations && (
                  <CollocationCard
                    key={module.id}
                    variant="collocations"
                    collocations={aiFullResult.collocations}
                    word={repairKey}
                    onRepairMissing={() => repairCollocationNotes(repairKey)}
                  />
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
              case 'wordChoice':
                // Removed: fold why-choose into synonyms[].whenToUse (mental fit)
                return null
              case 'usageScenes':
                return (
                  <UsageScenesCard
                    key={module.id}
                    scenes={aiFullResult.usageScenes}
                    tone="core"
                  />
                )
              case 'culture':
                return aiFullResult.culturalLore ? (
                  <CulturalLoreCard key={module.id} lore={aiFullResult.culturalLore} />
                ) : null
              case 'practice':
                return (
                  <PracticeSection
                    key={module.id}
                    mode="usage-output"
                    word={repairKey}
                    meanings={
                      (aiFullResult.meanings?.length
                        ? aiFullResult.meanings
                        : [{ zh: aiFullResult.coreConcept?.image || repairKey, en: '' }]
                      ).map((m) => ({ zh: m.zh, en: m.en || '' }))
                    }
                  />
                )
              case 'chat': {
                const corrected = aiFullResult.correctForm || word
                const parts: string[] = []
                const cc = migratedMind.coreConcept ?? aiFullResult.coreConcept
                if (cc?.image || cc?.feelAnchor || cc?.emotionalTone) {
                  parts.push(
                    `用法意象: "${cc?.image || ''}" — ${cc?.explanation || ''}`
                    + (cc?.feelAnchor ? ` | 感觉锚: ${cc.feelAnchor}` : '')
                    + (cc?.emotionalTone ? ` | 情绪底色: ${cc.emotionalTone}` : ''),
                  )
                }
                if (aiFullResult.synonyms?.length) {
                  parts.push(
                    '近义心智:\n' + aiFullResult.synonyms.map((s) => {
                      const mental = s.whenToUse ? ` | 适用心智: ${s.whenToUse}` : ''
                      return `  · ${s.word}: ${s.distinction || ''}${mental}`
                    }).join('\n'),
                  )
                }
                if (aiFullResult.conceptGraph?.rootCore) {
                  parts.push(`概念树根: ${aiFullResult.conceptGraph.rootCore}`)
                }
                if (aiFullResult.usageScenes?.length) {
                  parts.push(
                    '用法场景:\n' + aiFullResult.usageScenes.map((s) => `  · ${s.label}: ${s.description}`).join('\n'),
                  )
                }
                const enrichedContext = parts.length > 0 ? parts.join('\n\n') : undefined
                return (
                  <AiChatBox
                    key={module.id}
                    context={corrected}
                    cognitive="core"
                    enrichedContext={enrichedContext}
                  />
                )
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
