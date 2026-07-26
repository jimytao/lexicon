import type { AiFullResult } from '../../types'
import type { AiStatus } from '../../stores/resultStore'
import { WordHeader } from './WordHeader'
import { MeaningList } from './InstantSection/MeaningList'
import { ExampleList } from './InstantSection/ExampleList'
import { AiStatusBar, SkeletonBlock } from './AiSection/AiStatusBar'
import { EtymologyCard } from './AiSection/EtymologyCard'
import { SynonymList } from './AiSection/SynonymList'
import { PracticeSection } from './AiSection/PracticeSection'
import { MnemonicCard } from './AiSection/MnemonicCard'
import { AiChatBox } from './AiSection/AiChatBox'
import { DiffText } from './DiffText'
import { useResultStore } from '../../stores/resultStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useT } from '../../i18n'
import { CollocationCard } from './AiSection/CollocationCard'
import { detectLanguage } from '../../stores/searchStore'
import { CulturalLoreCard } from './AiSection/CulturalLoreCard'
import { CoreConceptCard } from './AiSection/CoreConceptCard'
import { PrepImageryCard } from './AiSection/PrepImageryCard'
import { LexiconMemoryBadge } from './LexiconMemoryBadge'
import { cognitiveFromSearchMode } from '../../utils/text'
import { detectSpatialPreps } from '../../utils/prepDetect'
import { shouldShowPrepImageryModule } from '../../utils/resultAiVisibility'
import { useSearchStore } from '../../stores/searchStore'
import { useAiLookup } from '../../hooks/useAiLookup'

interface AiFullViewProps {
  word: string
  aiFullResult: AiFullResult | null
  aiStatus: AiStatus
  aiError: string | null
  onRetry: () => void
  onWordClick: (word: string) => void
  onGoToSettings?: () => void
}

export function AiFullView({ word, aiFullResult, aiStatus, aiError, onRetry, onWordClick, onGoToSettings }: AiFullViewProps) {
  const t = useT()
  const { modules, monolingualWord } = useSettingsStore()
  const updateFullMnemonic = useResultStore(state => state.updateFullMnemonic)
  const searchMode = useSearchStore(s => s.mode)
  const cognitive = cognitiveFromSearchMode(searchMode)
  const { repairCollocationNotes } = useAiLookup()
  const lang = detectLanguage(word)
  const shouldHideTranslation = monolingualWord && lang === 'en'

  return (
    <div className="px-3 py-3 min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
          {t('aifull.queryLabel')}
        </span>
        <LexiconMemoryBadge word={aiFullResult?.correctForm || word} />
      </div>

      {aiStatus !== 'success' && (
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 break-words [overflow-wrap:anywhere] max-w-full">{word}</h1>
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
        <div className="space-y-2">
          <WordHeader word={aiFullResult.correctForm || word} phonetic={aiFullResult.phonetic} pos={aiFullResult.pos} />
          {aiFullResult.correctForm && aiFullResult.correctForm.toLowerCase() !== word.toLowerCase() && (
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-3 mb-3">
              {t('aifull.youEntered')} <DiffText original={word} corrected={aiFullResult.correctForm} />
            </p>
          )}

          {modules.map((module) => {
            if (!module.enabled) return null

            switch (module.id) {
              case 'dictionary':
                return (
                  <div key={module.id}>
                    <MeaningList
                      key={word}
                      meanings={(aiFullResult.meanings ?? []).map((m) => ({ zh: m.zh, en: m.en, pos: m.pos, imageQuery: m.imageQuery }))}
                      scenes={(aiFullResult.meanings ?? []).map((m) => m.scene)}
                    />
                  </div>
                )
              case 'coreConcept':
                return (
                  <CoreConceptCard
                    key={module.id}
                    coreConcept={aiFullResult.coreConcept}
                    variant="memory"
                  />
                )
              case 'semantic':
                return null
              case 'chunks':
                return aiFullResult.collocations && (
                  <CollocationCard
                    key={module.id}
                    variant="chunks"
                    collocations={aiFullResult.collocations}
                    word={aiFullResult.correctForm || word}
                    onRepairMissing={() => repairCollocationNotes(aiFullResult.correctForm || word)}
                  />
                )
              case 'collocations':
                return aiFullResult.collocations && (
                  <CollocationCard
                    key={module.id}
                    variant="collocations"
                    collocations={aiFullResult.collocations}
                    word={aiFullResult.correctForm || word}
                    onRepairMissing={() => repairCollocationNotes(aiFullResult.correctForm || word)}
                  />
                )
              case 'examples':
                return (
                  <div key={module.id}>
                    {(aiFullResult.examples?.length ?? 0) > 0 && (
                      <ExampleList examples={aiFullResult.examples ?? []} hideTranslation={shouldHideTranslation} />
                    )}
                  </div>
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
              case 'etymology':
                if (!aiFullResult.etymology) return null
                return (
                  <EtymologyCard key={module.id} etymology={aiFullResult.etymology} />
                )
              case 'mnemonic':
                return (
                  <MnemonicCard
                    key={module.id}
                    word={aiFullResult.correctForm || word}
                    initialMnemonic={aiFullResult.mnemonic}
                    onUpdateMnemonic={(m) => updateFullMnemonic(word, m, cognitive)}
                  />
                )
              case 'practice':
                return (
                  <PracticeSection
                    key={module.id}
                    mode="meaning-check"
                    word={aiFullResult.correctForm || word}
                    meanings={(aiFullResult.meanings ?? []).map((m) => ({ zh: m.zh, en: m.en }))}
                  />
                )
              case 'preposition': {
                const target = aiFullResult.correctForm || word
                const preps = detectSpatialPreps(target)
                if (!shouldShowPrepImageryModule({
                  moduleEnabled: true,
                  searchMode: searchMode,
                  prepositions: preps,
                })) return null
                return (
                  <PrepImageryCard
                    key={module.id}
                    phrase={target}
                    prepositions={preps}
                  />
                )
              }
              case 'culture':
                return aiFullResult.culturalLore ? (
                  <CulturalLoreCard key={module.id} lore={aiFullResult.culturalLore} />
                ) : null
              case 'chat': {
                const corrected = aiFullResult.correctForm || word
                const parts: string[] = []
                if (word.toLowerCase() !== corrected.toLowerCase()) {
                  parts.push(`用户原始输入: "${word}" → 纠正为: "${corrected}"`)
                }
                if (aiFullResult.coreConcept?.image) {
                  parts.push(`核心意象: "${aiFullResult.coreConcept.image}" ${aiFullResult.coreConcept.explanation ? '— ' + aiFullResult.coreConcept.explanation : ''}`)
                }
                if (aiFullResult.meanings?.length) {
                  parts.push('释义:\n' + aiFullResult.meanings.map(m => `  · ${m.en || m.zh}`).join('\n'))
                }
                if (aiFullResult.examples?.length) {
                  parts.push('例句:\n' + aiFullResult.examples.slice(0, 3).map(e => `  · ${e.en}`).join('\n'))
                }
                if (aiFullResult.synonyms?.length) {
                  parts.push('近义词: ' + aiFullResult.synonyms.map(s => s.word).join(', '))
                }
                if (aiFullResult.mnemonic) {
                  const best = aiFullResult.mnemonic[aiFullResult.mnemonic.bestType]
                  parts.push(`助记法 (${aiFullResult.mnemonic.bestType}): ${best.content}`)
                }
                if (aiFullResult.collocations) {
                  const fmt = (c: { chunk: string; note?: string }) =>
                    c.note ? `${c.chunk}（${c.note}）` : c.chunk
                  const chunkList = aiFullResult.collocations.chunks?.map(fmt).join('；')
                  const colloList = aiFullResult.collocations.collocations?.map(fmt).join('；')
                  if (chunkList) parts.push(`介词语组: ${chunkList}`)
                  if (colloList) parts.push(`其他词组: ${colloList}`)
                }
                if (aiFullResult.culturalLore?.content) {
                  parts.push(`文化背景: ${aiFullResult.culturalLore.content}`)
                }
                const enrichedContext = parts.length > 0 ? parts.join('\n') : undefined
                return <AiChatBox key={module.id} context={corrected} cognitive="lookup" enrichedContext={enrichedContext} />
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
