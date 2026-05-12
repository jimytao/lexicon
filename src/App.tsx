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
import { SettingsView } from './components/Settings/SettingsView'
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

type AppView = 'dictionary' | 'translate' | 'settings'
type SearchSource = 'local' | 'ai-full' | 'phrase' | 'none'

export function App() {
  const [view, setView] = useState<AppView>('dictionary')
  const [searchSource, setSearchSource] = useState<SearchSource>('none')
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(true)
  const [isAtTop, setIsAtTop] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const localWordSnapshotRef = useRef<{ wordResult: WordResult; relatedPhrases: SuggestItem[] } | null>(null)
  const lastScrollTopRef = useRef(0)
  const { mode, query, setMode } = useSearchStore()
  const { darkMode, performanceMode } = useSettingsStore()
  const { add: addHistory, upgrade: upgradeHistory } = useHistoryStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const { wordResult, relatedPhrases, aiAnalysis, aiFullResult, phraseResult, aiStatus, aiError } = useResultStore()
  const { selectWord } = useSearch()
  const { trigger: triggerAi, triggerFullLookup, triggerPhraseQuery } = useAiLookup()
  const { status, hasSeenBadge, checkUpdate, cleanupOldApks, setHasSeenBadge, reset } = useUpdateStore()

  useEffect(() => {
    // Initial check and cleanup
    checkUpdate()
    cleanupOldApks()
  }, [])

  useEffect(() => {
    if (!scrollContainerRef.current) return

    const sc = scrollContainerRef.current
    const handleScroll = () => {
      const top = sc.scrollTop
      const atTop = top <= 16
      const delta = top - lastScrollTopRef.current

      setIsAtTop(atTop)
      if (isKeyboardVisible) {
        setIsBottomNavVisible(false)
      } else if (atTop || delta < -8) {
        setIsBottomNavVisible(true)
      } else if (delta > 12 && top > 80) {
        setIsBottomNavVisible(false)
      }

      lastScrollTopRef.current = top
    }

    handleScroll()
    sc.addEventListener('scroll', handleScroll, { passive: true })
    return () => sc.removeEventListener('scroll', handleScroll)
  }, [isKeyboardVisible, view])

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
    let focusInHandler: ((e: FocusEvent) => void) | null = null;
    let focusOutHandler: (() => void) | null = null;

    const resetKeyboardLayout = () => {
      document.querySelectorAll<HTMLElement>('[data-kb-padded]').forEach(el => {
        el.style.paddingBottom = ''
        delete el.dataset.kbPadded
      })
      setIsKeyboardVisible(false)
      setIsBottomNavVisible(true)
      if ((scrollContainerRef.current?.scrollTop ?? 0) <= 16) {
        setIsAtTop(true)
      }
    }

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
          setIsKeyboardVisible(true)
          setIsBottomNavVisible(false)
          activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
          setTimeout(() => activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)
        }, 300)
      }

      const handleFocusOut = () => {
        clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => {
          resetKeyboardLayout()
        }, 150)
      }

      focusInHandler = handleFocusIn
      focusOutHandler = handleFocusOut

      document.addEventListener('focusin', handleFocusIn)
      document.addEventListener('focusout', handleFocusOut)

      if (isCapacitor) {
        try {
          const updateScroll = (height: number) => {
            const activeEl = document.activeElement as HTMLElement
            if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA')) return
            
            setIsKeyboardVisible(true)
            setIsBottomNavVisible(false)
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
            else resetKeyboardLayout()
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
        if (focusInHandler) document.removeEventListener('focusin', focusInHandler)
        if (focusOutHandler) document.removeEventListener('focusout', focusOutHandler)
        keyboardShowSub?.remove()
        keyboardHideSub?.remove()
        keyboardDidShowSub?.remove()
        if (updateScrollFromViewport) {
          window.visualViewport?.removeEventListener('resize', updateScrollFromViewport)
          window.visualViewport?.removeEventListener('scroll', updateScrollFromViewport)
        }
        clearTimeout(scrollTimeout)
        resetKeyboardLayout()
      }
    }

    initKeyboardFix()
    return () => { if ((window as any)._kbFixCleanup) (window as any)._kbFixCleanup() }
  }, [])

  const showPhraseView = searchSource === 'phrase'
  const showAiFullView = searchSource === 'ai-full'

  const shouldShowUpdateModal = status === 'available' || status === 'downloading' || status === 'ready'
  const bottomNavVisible = !isKeyboardVisible && (isBottomNavVisible || isAtTop)

  return (
    <div className={`min-h-screen text-foreground transition-colors duration-300 relative overflow-hidden ${performanceMode ? 'perf-mode' : ''}`}>
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 bg-grid opacity-[0.2] dark:opacity-[0.1] pointer-events-none" />
      
      <div
        ref={scrollContainerRef}
        className="mx-auto max-w-2xl w-full h-screen overflow-y-auto relative pb-safe selection:bg-accent/10 bg-transparent"
      >


        <main>
          {view === 'translate' ? (
            <ImageTranslateView />
          ) : view === 'settings' ? (
            <SettingsView />
          ) : (
            <div className="px-6 pb-24 space-y-4">
              <div className="sticky top-0 z-30 pt-safe pb-3 bg-background/90 backdrop-blur-xl -mx-6 px-6 shadow-[0_4px_24px_transparent] transition-all">
                <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500 mt-4 relative z-30">
                  <div className="w-full relative z-50">
                    <SearchBar
                      onWordSelect={handleWordSelect}
                      onHistorySelect={(word) => handleWordSelect(word, true)}
                      onForceAi={handleForceAi}
                    />
                  </div>
                  <SegmentedControl mode={mode} onModeChange={setMode} />
                </div>
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

      {/* Bottom Navigation Bar - Floating iOS Pill style */}
      <nav className={`fixed left-1/2 z-50 glass rounded-[2rem] px-2 py-2 w-[85%] max-w-[320px] bg-background/80 backdrop-blur-2xl shadow-2xl border border-border/50 transition-transform duration-300 ease-out ${bottomNavVisible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-[140%] opacity-0 pointer-events-none'}`} style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))', transform: `translateX(-50%) ${bottomNavVisible ? 'translateY(0)' : 'translateY(140%)}` }}>
        <div className="flex items-center justify-between">
          
          <button 
            className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-2xl transition-all ${view === 'dictionary' ? 'text-accent' : 'text-foreground-muted hover:text-foreground hover:bg-foreground/5'}`}
            onClick={() => { setView('dictionary'); scrollToTop() }}
          >
            <div className={`p-1 rounded-xl mb-0.5 transition-colors ${view === 'dictionary' ? 'bg-accent/10' : ''}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={view === 'dictionary' ? 2.5 : 2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <span className={`text-[10px] font-bold ${view === 'dictionary' ? 'text-accent' : 'text-foreground-muted'}`}>Dict</span>
          </button>

          <button 
            className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-2xl transition-all ${view === 'translate' ? 'text-accent' : 'text-foreground-muted hover:text-foreground hover:bg-foreground/5'}`}
            onClick={() => setView('translate')}
          >
            <div className={`p-1 rounded-xl mb-0.5 transition-colors ${view === 'translate' ? 'bg-accent/10' : ''}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={view === 'translate' ? 2.5 : 2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className={`text-[10px] font-bold ${view === 'translate' ? 'text-accent' : 'text-foreground-muted'}`}>Image</span>
          </button>
          
          <button
            onClick={() => {
              setView('settings')
              scrollToTop()
              setHasSeenBadge(true)
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-2xl transition-all relative ${view === 'settings' ? 'text-accent' : 'text-foreground-muted hover:text-foreground hover:bg-foreground/5'}`}
            aria-label="Settings"
          >
            <div className={`p-1 rounded-xl mb-0.5 relative transition-colors ${view === 'settings' ? 'bg-accent/10' : ''}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {status === 'available' && !hasSeenBadge && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-[#0EA5E9] rounded-full ring-2 ring-background shadow-[0_0_8px_rgba(14,165,233,0.4)]" />
              )}
            </div>
            <span className={`text-[10px] font-bold ${view === 'settings' ? 'text-accent' : 'text-foreground-muted'}`}>Settings</span>
          </button>
        </div>
      </nav>


      {shouldShowUpdateModal && (
        <UpdateModal onClose={reset} />
      )}
    </div>
  )
}
