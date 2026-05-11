import { useState, useEffect, useRef } from 'react'
import { useSearchStore, detectQueryType } from './stores/searchStore'
import { useResultStore } from './stores/resultStore'
import { useSettingsStore } from './stores/settingsStore'
import { useHistoryStore } from './stores/historyStore'
import { useSearch } from './hooks/useSearch'
import { useAiLookup } from './hooks/useAiLookup'
import type { WordResult, SuggestItem } from './types'
import { SearchBar } from './components/SearchBar'
import { SegmentedControl } from './components/SearchBar/SegmentedControl'
import { ResultView } from './components/ResultView'
import { AiFullView } from './components/ResultView/AiFullView'
import { PhraseView } from './components/ResultView/PhraseView'
import { SettingsDrawer } from './components/Settings/SettingsDrawer'
import { ImageTranslateView } from './components/ImageTranslate'
import { Keyboard } from '@capacitor/keyboard'
import { useUpdateStore } from './stores/updateStore'
import { UpdateModal } from './components/Settings/UpdateModal'

function getScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node && node !== document.body) {
    const { overflow, overflowY } = getComputedStyle(node)
    if (/(auto|scroll)/.test(overflow + overflowY)) return node
    node = node.parentElement
  }
  return document.documentElement
}

type AppView = 'dictionary' | 'translate'
type SearchSource = 'local' | 'ai-full' | 'phrase' | 'none'

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<AppView>('dictionary')
  const [searchSource, setSearchSource] = useState<SearchSource>('none')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const localWordSnapshotRef = useRef<{ wordResult: WordResult; relatedPhrases: SuggestItem[] } | null>(null)
  const { mode, query, setMode } = useSearchStore()
  const { darkMode, performanceMode } = useSettingsStore()
  const { add: addHistory, upgrade: upgradeHistory } = useHistoryStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const { wordResult, relatedPhrases, aiAnalysis, aiFullResult, phraseResult, aiStatus, aiError } = useResultStore()
  const { selectWord } = useSearch()
  const { trigger: triggerAi, triggerFullLookup, triggerPhraseQuery } = useAiLookup()
  const { status, hasSeenBadge, checkUpdate, cleanupOldApks, setHasSeenBadge } = useUpdateStore()

  useEffect(() => {
    // Initial check and cleanup
    checkUpdate()
    cleanupOldApks()
  }, [])

  // 切换到 AI mode 时，若处于 local 状态且尚未分析，自动触发
  const prevModeRef = useRef(mode)
  useEffect(() => {
    if (prevModeRef.current !== 'ai' && mode === 'ai' && searchSource === 'local' && wordResult && aiStatus === 'idle') {
      triggerAi(wordResult.word, wordResult.meanings)
      upgradeHistory(wordResult.word, 'analyze')
    }
    // 从 ai-full 切回 Instant：恢复本地快照
    if (prevModeRef.current === 'ai' && mode === 'instant' && searchSource === 'ai-full') {
      const snap = localWordSnapshotRef.current
      if (snap) {
        useResultStore.getState().setWordResult(snap.wordResult)
        useResultStore.getState().setRelatedPhrases(snap.relatedPhrases)
        setSearchSource('local')
      }
    }
    prevModeRef.current = mode
  }, [mode])

  function scrollToTop() {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleWordSelect(word: string, fromHistory = false) {
    scrollToTop()
    localWordSnapshotRef.current = null

    const historyEntry = useHistoryStore.getState().words.find((e) => e.word === word)
    const historyAiMode = historyEntry?.aiMode ?? null

    const { result, queryType } = await selectWord(word)

    if (result) {
      // Save snapshot for potential AI-full → Instant restore
      localWordSnapshotRef.current = {
        wordResult: result,
        relatedPhrases: useResultStore.getState().relatedPhrases,
      }
      setSearchSource('local')

      if (fromHistory) {
        const store = useResultStore.getState()
        const cachedFull = store.getCachedAiFull(word)
        const cachedPhrase = store.getCachedPhrase(word)
        const cachedAi = store.getCachedAi(word)

        if (cachedFull) {
          setSearchSource('ai-full')
          useSearchStore.getState().setMode('ai')
          useResultStore.getState().setAiFullResult(word, cachedFull)
          upgradeHistory(word, 'full')
        } else if (cachedPhrase) {
          setSearchSource('phrase')
          useSearchStore.getState().setMode('ai')
          useResultStore.getState().setPhraseResult(word, cachedPhrase)
          upgradeHistory(word, 'phrase')
        } else if (cachedAi) {
          useSearchStore.getState().setMode('ai')
          useResultStore.getState().setAiAnalysis(word, cachedAi)
          upgradeHistory(word, 'analyze')
        } else if (historyAiMode === 'full') {
          setSearchSource('ai-full')
          useSearchStore.getState().setMode('ai')
          triggerFullLookup(word)
        } else if (historyAiMode === 'phrase') {
          setSearchSource('phrase')
          useSearchStore.getState().setMode('ai')
          triggerPhraseQuery(word)
        } else if (historyAiMode === 'analyze') {
          useSearchStore.getState().setMode('ai')
          triggerAi(word, result.meanings)
          upgradeHistory(word, 'analyze')
        }
        // historyAiMode === null → normal instant, no extra action
      } else {
        const store = useResultStore.getState()
        const currentMode = useSearchStore.getState().mode
        const cachedFull = store.getCachedAiFull(word)
        const cachedPhrase = store.getCachedPhrase(word)
        const cachedAi = store.getCachedAi(word)

        if (cachedFull) {
          setSearchSource('ai-full')
          useSearchStore.getState().setMode('ai')
          useResultStore.getState().setAiFullResult(word, cachedFull)
          upgradeHistory(word, 'full')
        } else if (cachedPhrase) {
          setSearchSource('phrase')
          useSearchStore.getState().setMode('ai')
          useResultStore.getState().setPhraseResult(word, cachedPhrase)
          upgradeHistory(word, 'phrase')
        } else if (cachedAi) {
          useSearchStore.getState().setMode('ai')
          useResultStore.getState().setAiAnalysis(word, cachedAi)
          upgradeHistory(word, 'analyze')
        } else if (currentMode === 'ai') {
          triggerAi(word, result.meanings)
          upgradeHistory(word, 'analyze')
        }
      }
    } else {
      localWordSnapshotRef.current = null
      if (queryType === 'phrase' || queryType === 'sentence') {
        setSearchSource('phrase')
        triggerPhraseQuery(word)
      } else {
        setSearchSource('ai-full')
        triggerFullLookup(word)
      }
    }
  }


  function handleRetry() {
    if (searchSource === 'local' && wordResult && mode === 'ai') {
      triggerAi(wordResult.word, wordResult.meanings)
    } else if (searchSource === 'phrase' && query) {
      triggerPhraseQuery(query)
    } else if (searchSource === 'ai-full' && query) {
      triggerFullLookup(query)
    }
  }

  async function handleForceAi(word: string) {
    if (!word.trim()) return
    scrollToTop()
    // Save local snapshot if we currently have a local result for this word
    const currentWordResult = useResultStore.getState().wordResult
    const currentRelatedPhrases = useResultStore.getState().relatedPhrases
    if (currentWordResult && currentWordResult.word === word) {
      localWordSnapshotRef.current = { wordResult: currentWordResult, relatedPhrases: currentRelatedPhrases }
    } else {
      localWordSnapshotRef.current = null
    }
    useSearchStore.getState().setQuery(word)
    useSearchStore.getState().setMode('ai')
    const qt = detectQueryType(word)
    if (qt === 'phrase' || qt === 'sentence') {
      setSearchSource('phrase')
      triggerPhraseQuery(word)
      if (useSettingsStore.getState().historyEnabled) addHistory(word, 'phrase')
    } else {
      setSearchSource('ai-full')
      triggerFullLookup(word)
      if (useSettingsStore.getState().historyEnabled) addHistory(word, 'full')
    }
  }

  // Virtual keyboard occlusion fix (iOS/Android 8-16)
  useEffect(() => {
    let scrollTimeout: any;
    let keyboardShowSub: any;
    let keyboardHideSub: any;
    let keyboardDidShowSub: any;
    let updateScrollFromViewport: (() => void) | null = null;

    const initKeyboardFix = async () => {
      const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor
      
      const handleFocusIn = (e: FocusEvent) => {
        const activeEl = e.target as HTMLElement
        if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA')) return
        
        clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => {
          const scrollable = getScrollableAncestor(activeEl)
          if (scrollable && !scrollable.dataset.kbPadded) {
            scrollable.style.paddingBottom = '45vh'
            scrollable.dataset.kbPadded = 'true'
          }
          activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
          setTimeout(() => activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)
        }, 300)
      }

      const handleFocusOut = () => {
        clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => {
          document.querySelectorAll<HTMLElement>('[data-kb-padded]').forEach(el => {
            el.style.paddingBottom = ''
            delete el.dataset.kbPadded
          })
        }, 150)
      }

      document.addEventListener('focusin', handleFocusIn)
      document.addEventListener('focusout', handleFocusOut)

      if (isCapacitor) {
        try {
          const updateScroll = (height: number) => {
            const activeEl = document.activeElement as HTMLElement
            if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA')) return
            
            const scrollable = getScrollableAncestor(activeEl)
            if (scrollable) {
              const viewportHeight = window.innerHeight
              const visualViewport = window.visualViewport
              const viewportKeyboardHeight = visualViewport
                ? Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)
                : 0
              const effectiveKeyboardHeight = viewportKeyboardHeight > 0 ? viewportKeyboardHeight : height
              const visibleHeight = Math.max(0, viewportHeight - effectiveKeyboardHeight)
              const computedPadding = effectiveKeyboardHeight + (visibleHeight / 2)
              const minPadding = Math.min(120, viewportHeight * 0.25)
              const maxPadding = viewportHeight * 0.6
              const targetPadding = Math.max(minPadding, Math.min(computedPadding, maxPadding))
              
              scrollable.style.paddingBottom = `${targetPadding}px`
              scrollable.dataset.kbPadded = 'true'
              
              setTimeout(() => activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
              setTimeout(() => activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
            }
          }

          updateScrollFromViewport = () => {
            const visualViewport = window.visualViewport
            if (!visualViewport) return
            const keyboardHeight = Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop)
            if (keyboardHeight > 0) updateScroll(keyboardHeight)
          }

          // Use both Will and Did events for maximum compatibility across Android 8-16
          keyboardShowSub = await Keyboard.addListener('keyboardWillShow', info => updateScroll(info.keyboardHeight))
          keyboardDidShowSub = await Keyboard.addListener('keyboardDidShow', info => updateScroll(info.keyboardHeight))
          keyboardHideSub = await Keyboard.addListener('keyboardWillHide', handleFocusOut)
          window.visualViewport?.addEventListener('resize', updateScrollFromViewport)
          window.visualViewport?.addEventListener('scroll', updateScrollFromViewport)

        } catch (e) {
          console.warn('Capacitor Keyboard listeners failed, falling back to focus events', e)
        }
      }

      ;(window as any)._kbFixCleanup = () => {
        document.removeEventListener('focusin', handleFocusIn)
        document.removeEventListener('focusout', handleFocusOut)
        keyboardShowSub?.remove()
        keyboardHideSub?.remove()
        keyboardDidShowSub?.remove()
        if (updateScrollFromViewport) {
          window.visualViewport?.removeEventListener('resize', updateScrollFromViewport)
          window.visualViewport?.removeEventListener('scroll', updateScrollFromViewport)
        }
        clearTimeout(scrollTimeout)
      }
    }

    initKeyboardFix()
    return () => { if ((window as any)._kbFixCleanup) (window as any)._kbFixCleanup() }
  }, [])

  const showPhraseView = searchSource === 'phrase'
  const showAiFullView = searchSource === 'ai-full'

  return (
    <div className={`min-h-screen bg-background text-foreground transition-colors duration-300 relative overflow-hidden ${performanceMode ? 'perf-mode' : ''}`}>
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 bg-grid opacity-[0.2] dark:opacity-[0.1] pointer-events-none" />
      
      <div
        ref={scrollContainerRef}
        className="mx-auto max-w-2xl w-full h-screen overflow-y-auto relative pb-safe selection:bg-accent/10 bg-background/50"
      >
        {/* Top bar: Elegant and minimal */}
        <header className="sticky top-0 z-20 pt-safe px-6 pb-4 glass">
          <div className="flex items-center justify-between h-14">
            <div className="flex bg-foreground/5 p-1 rounded-2xl">
              <button 
                className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-all ${view === 'dictionary' ? 'bg-background text-foreground shadow-sm' : 'text-foreground-muted hover:text-foreground'}`}
                onClick={() => setView('dictionary')}
              >
                Dictionary
              </button>
              <button 
                className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-all ${view === 'translate' ? 'bg-background text-foreground shadow-sm' : 'text-foreground-muted hover:text-foreground'}`}
                onClick={() => setView('translate')}
              >
                Image
              </button>
            </div>
            
            <button
              onClick={() => {
                setSettingsOpen(true)
                setHasSeenBadge(true)
              }}
              className="p-2 -mr-2 rounded-full hover:bg-foreground/5 text-foreground-muted transition-colors relative"
              aria-label="Settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {status === 'available' && !hasSeenBadge && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-[#0EA5E9] rounded-full ring-2 ring-background shadow-[0_0_8px_rgba(14,165,233,0.4)]" />
              )}
            </button>
          </div>
        </header>

        <main>
          {view === 'translate' ? (
            <ImageTranslateView />
          ) : (
            <div className="px-6 py-4 space-y-4">
              <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500 relative z-30">
                <div className="w-full relative z-50">
                  <SearchBar
                  onWordSelect={handleWordSelect}
                  onHistorySelect={(word) => handleWordSelect(word, true)}
                  onForceAi={handleForceAi}
                />
                </div>
                <SegmentedControl mode={mode} onModeChange={setMode} />
              </div>

              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                  <div className="flex flex-col items-center justify-center pt-32 text-foreground-muted">
                    <div className="w-16 h-16 mb-4 rounded-3xl bg-accent/10 flex items-center justify-center text-accent">
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium">Type a word to start exploring</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {status !== 'idle' && status !== 'checking' && status !== 'up-to-date' && (
        <UpdateModal onClose={() => useUpdateStore.getState().reset()} />
      )}
    </div>
  )
}
