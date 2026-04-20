import { useState, useEffect, useRef } from 'react'
import { isCapacitor } from './services/platform'
import { useSearchStore, detectQueryType } from './stores/searchStore'
import { useResultStore } from './stores/resultStore'
import { useSettingsStore } from './stores/settingsStore'
import { useSearch } from './hooks/useSearch'
import { useAiLookup } from './hooks/useAiLookup'
import { SearchBar } from './components/SearchBar'
import { ResultView } from './components/ResultView'
import { AiFullView } from './components/ResultView/AiFullView'
import { PhraseView } from './components/ResultView/PhraseView'
import { SettingsDrawer } from './components/Settings/SettingsDrawer'
import { ImageTranslateView } from './components/ImageTranslate'

type AppView = 'dictionary' | 'translate'

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<AppView>('dictionary')
  const { mode, query } = useSearchStore()
  const { darkMode } = useSettingsStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  // Android: when virtual keyboard opens, scroll focused input into view.
  // iOS handles this natively; desktop has no virtual keyboard.
  useEffect(() => {
    if (!isCapacitor() || !window.visualViewport) return
    const isAndroid = (window as any).Capacitor?.getPlatform?.() === 'android'
    if (!isAndroid) return
    function onViewportResize() {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        setTimeout(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 100)
      }
    }
    window.visualViewport!.addEventListener('resize', onViewportResize)
    return () => window.visualViewport!.removeEventListener('resize', onViewportResize)
  }, [])

  const { wordResult, relatedPhrases, aiAnalysis, aiFullResult, phraseResult, aiStatus, aiError } = useResultStore()
  const { selectWord } = useSearch()
  const { trigger: triggerAi, triggerFullLookup, triggerPhraseQuery } = useAiLookup()

  // 切换到 AI mode 时，若已有词结果且尚未分析，自动触发
  const prevModeRef = useRef(mode)
  useEffect(() => {
    if (prevModeRef.current !== 'ai' && mode === 'ai' && wordResult && aiStatus === 'idle') {
      triggerAi(wordResult.word, wordResult.meanings)
    }
    prevModeRef.current = mode
  }, [mode])

  async function handleWordSelect(word: string) {
    const { result, queryType } = await selectWord(word)

    if (result) {
      // Word found in dictionary
      if (mode === 'ai' || queryType === 'word') {
        // If already in AI mode, trigger analysis
        const currentMode = useSearchStore.getState().mode
        if (currentMode === 'ai') {
          triggerAi(word, result.meanings)
        }
      }
    } else {
      // No dictionary result → AI fallback
      if (queryType === 'phrase' || queryType === 'sentence') {
        triggerPhraseQuery(word)
      } else {
        triggerFullLookup(word)
      }
    }
  }

  function handleForceAi(rawQuery: string) {
    const qt = detectQueryType(rawQuery)
    if (qt === 'phrase' || qt === 'sentence') {
      triggerPhraseQuery(rawQuery)
    } else {
      triggerFullLookup(rawQuery)
    }
  }

  function handleRetry() {
    if (wordResult && mode === 'ai') {
      triggerAi(wordResult.word, wordResult.meanings)
    } else if (!wordResult && query) {
      const qt = detectQueryType(query)
      if (qt === 'phrase' || qt === 'sentence') {
        triggerPhraseQuery(query)
      } else {
        triggerFullLookup(query)
      }
    }
  }

  // Determine which view to render
  const showPhraseView = !wordResult && (phraseResult || (aiStatus === 'loading' && detectQueryType(query) !== 'word'))
  const showAiFullView = !wordResult && !showPhraseView && (aiFullResult || aiStatus === 'loading' || aiStatus === 'error')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-[480px] h-screen overflow-y-auto bg-white dark:bg-gray-900 shadow-sm relative pb-safe">
        {/* Top bar: tabs + settings */}
        <div className="flex items-center justify-between px-4 pt-safe pb-1">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setView('dictionary')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                view === 'dictionary'
                  ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              查词
            </button>
            <button
              onClick={() => setView('translate')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                view === 'translate'
                  ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              图片翻译
            </button>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {view === 'translate' ? (
          <ImageTranslateView />
        ) : (
          <>
            <SearchBar onWordSelect={handleWordSelect} onForceAi={handleForceAi} />

            {showPhraseView ? (
              <PhraseView
                phrase={query}
                phraseResult={phraseResult}
                aiStatus={aiStatus}
                aiError={aiError}
                onRetry={handleRetry}
              />
            ) : showAiFullView ? (
              <AiFullView
                word={query}
                aiFullResult={aiFullResult}
                aiStatus={aiStatus}
                aiError={aiError}
                onRetry={handleRetry}
                onWordClick={handleWordSelect}
              />
            ) : wordResult ? (
              <ResultView
                wordResult={wordResult}
                relatedPhrases={relatedPhrases}
                aiAnalysis={aiAnalysis}
                aiStatus={aiStatus}
                aiError={aiError}
                mode={mode}
                onRetry={handleRetry}
                onWordClick={handleWordSelect}
              />
            ) : (
              <div className="flex flex-col items-center justify-center pt-24 text-gray-400 dark:text-gray-600">
                <p className="text-sm">输入单词开始查询</p>
              </div>
            )}
          </>
        )}
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
