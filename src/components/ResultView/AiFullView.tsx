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
  // Only hide translation when the queried word is English — mirrors getFullLookupPrompt's
  // `isMono = monolingualWord && lang === 'en'` guard on the AI side.
  const lang = detectLanguage(word)
  const shouldHideTranslation = monolingualWord && lang === 'en'

  return (
    <div className="px-4 py-4">
      {/* AI badge */}
      <div className="mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
          {t('aifull.queryLabel')}
        </span>
      </div>

      {/* Word Header for Non-Success States (loading, error, idle) */}
      {aiStatus !== 'success' && (
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{word}</h1>
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
              case 'semantic':
                return null
              case 'collocations':
                return aiFullResult.collocations && (
                  <CollocationCard key={module.id} collocations={aiFullResult.collocations} />
                )
              case 'examples':
                return (
                  <div key={module.id}>
                    {(aiFullResult.examples?.length ?? 0) > 0 && (
                      <ExampleList examples={aiFullResult.examples} hideTranslation={shouldHideTranslation} />
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
                    onUpdateMnemonic={(m) => updateFullMnemonic(word, m)}
                  />
                )
              case 'practice':
                return (
                  <PracticeSection
                    key={module.id}
                    word={word}
                    meanings={(aiFullResult.meanings ?? []).map((m) => ({ zh: m.zh, en: m.en }))}
                  />
                )
              case 'culture':
                return aiFullResult.culturalLore ? (
                  <CulturalLoreCard key={module.id} lore={aiFullResult.culturalLore} />
                ) : null
              case 'chat':
                return <AiChatBox key={module.id} context={word} />
              default:
                return null
            }
          })}
        </div>
      )}
    </div>
  )
}
