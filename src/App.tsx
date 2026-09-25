import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useSearchStore, detectQueryType } from './stores/searchStore'
import { useResultStore } from './stores/resultStore'
import { useSettingsStore } from './stores/settingsStore'
import { useHistoryStore } from './stores/historyStore'
import { useSearch } from './hooks/useSearch'
import { useAiLookup } from './hooks/useAiLookup'
import type { LearningRoute, Mode, WordResult, SuggestItem } from './types'
import { SearchBar } from './components/SearchBar'
import { SegmentedControl } from './components/SearchBar/SegmentedControl'
import { ResultView } from './components/ResultView'
import { AiFullView } from './components/ResultView/AiFullView'
import { PhraseView } from './components/ResultView/PhraseView'
import { CoreCognitiveView } from './components/ResultView/CoreCognitiveView'
import { SettingsView } from './components/Settings/SettingsView'
import { ImageTranslateView } from './components/ImageTranslate'
import { useUpdateStore } from './stores/updateStore'
import { UpdateModal } from './components/Settings/UpdateModal'
import {
  normalizeQuery,
  cognitiveFromSearchMode,
} from './utils/text'
import { planDictHitNormalSearch } from './utils/searchPath'
import { decideHistoryClickRoute } from './utils/historyDecisionTree'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DictionaryStatus } from './components/DictionaryStatus'
import { useDictionaryStore } from './stores/dictionaryStore'
import { subscribePendingQuery, takePendingQuery } from './services/pendingQuery'
import { mirrorDark, mirrorSelectionButton } from './services/extensionMirror'
import { warmupDictionary } from './services/db'
import { cleanCameraCacheDir } from './services/camera'
import {
  applyDocumentAppearance,
  getSystemPrefersDark,
  resolveDark,
  subscribeSystemPrefersDark,
  syncNativeWindowTheme,
} from './services/appearance'
import {
  flushPendingProfileDiagnostics,
  initProfileFlushListeners,
  recordLookupEvent,
  resolveCurrentLearningRoute,
  resumePendingProfileDiagnostics,
} from './services/profile'
import { useT } from './i18n'
import type { AiMode } from './stores/historyStore'
import type { CognitiveMode } from './types'
import {
  getModeScrollPosition,
  saveModeScrollPosition,
  type ModeScrollPositions,
} from './utils/modeScrollMemory'

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

/**
 * Old Android WebViews can take noticeably longer to restore persisted stores.
 * A search started before that point would read default modules/API settings and
 * could paint a partial result that only became complete after a history revisit.
 */
async function ensureSearchStateHydrated(): Promise<void> {
  const pending: Promise<unknown>[] = []
  if (!useSettingsStore.persist.hasHydrated()) pending.push(Promise.resolve(useSettingsStore.persist.rehydrate()))
  if (!useResultStore.persist.hasHydrated()) pending.push(Promise.resolve(useResultStore.persist.rehydrate()))
  if (pending.length > 0) await Promise.all(pending)
}

export function App() {
  const t = useT()
  const [view, setView] = useState<AppView>('dictionary')
  const [searchSource, setSearchSource] = useState<SearchSource>('none')
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const [isBottomNavVisible, setIsBottomNavVisible] = useState(true)
  const [isAtTop, setIsAtTop] = useState(true)
  const [isLargeScreen, setIsLargeScreen] = useState(typeof window !== 'undefined' && window.innerWidth >= 1024)
  // Mount-once keep-alive: first visit mounts the tab, later switches only hide it
  // (avoids tearing down SearchBar / ResultView / Settings on every nav — costly on iOS).
  const [mountedViews, setMountedViews] = useState<Record<AppView, boolean>>({
    dictionary: true,
    translate: false,
    settings: false,
  })
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const modeScrollPositionsRef = useRef<ModeScrollPositions>({})
  const pendingModeScrollRestoreRef = useRef<Mode | null>(null)
  const localWordSnapshotRef = useRef<{ wordResult: WordResult; relatedPhrases: SuggestItem[] } | null>(null)
  const lastProfileQueryRef = useRef<string>('')
  const activeLearningRouteRef = useRef<LearningRoute>('irrelevant')
  const [activeLearningRoute, setActiveLearningRoute] = useState<LearningRoute>('irrelevant')
  const lastScrollTopRef = useRef(0)
  const { mode, query, setMode } = useSearchStore()
  const {
    appearance,
    performanceMode,
    mainDictionary,
    monolingualWord,
    monolingualPhrase,
    monolingualSentence,
  } = useSettingsStore()
  const { add: addHistory, upgrade: upgradeHistoryRaw } = useHistoryStore()
  // Persist rehydrates async; applying theme before that would overwrite index.html with default `system`.
  const [settingsHydrated, setSettingsHydrated] = useState(() =>
    useSettingsStore.persist.hasHydrated(),
  )

  useEffect(() => {
    setSettingsHydrated(useSettingsStore.persist.hasHydrated())
    return useSettingsStore.persist.onFinishHydration(() => setSettingsHydrated(true))
  }, [])

  /** History upgrade always tags the current Lookup / Core track. */
  function upgradeHistory(word: string, aiMode: AiMode, cognitive?: CognitiveMode) {
    const track = cognitive ?? cognitiveFromSearchMode(useSearchStore.getState().mode)
    upgradeHistoryRaw(word, aiMode, track)
  }

  // Appearance: class-based `.dark` + optional Tauri window theme; system listens to matchMedia.
  useEffect(() => {
    if (!settingsHydrated) return
    const apply = (systemDark: boolean) => {
      const dark = resolveDark(appearance, systemDark)
      applyDocumentAppearance(dark)
      // 悬浮按钮活在宿主页里、读不到我们的 localStorage，
      // 所以深浅色要镜像出去（仅扩展；其他平台是空操作）
      mirrorDark(dark)
    }
    apply(getSystemPrefersDark())
    void syncNativeWindowTheme(appearance, resolveDark(appearance, getSystemPrefersDark()))
    if (appearance !== 'system') return
    return subscribeSystemPrefersDark((systemDark) => {
      apply(systemDark)
      void syncNativeWindowTheme(appearance, resolveDark(appearance, systemDark))
    })
  }, [appearance, settingsHydrated])

  // Prefetch current dictionary after first paint (one file only — not both).
  useEffect(() => {
    const id = window.setTimeout(() => {
      void warmupDictionary().catch(() => {})
    }, 400)
    return () => window.clearTimeout(id)
  }, [])

  // Profile diagnostic: pagehide listener + cold-start resume for leftover chat/sentence.
  useEffect(() => {
    initProfileFlushListeners()
    const id = window.setTimeout(() => {
      void resumePendingProfileDiagnostics()
    }, 2000)
    return () => window.clearTimeout(id)
  }, [])

  // Leaving dictionary tab ends the current result/chat session → flush pending profile events.
  useEffect(() => {
    if (view !== 'dictionary') {
      void flushPendingProfileDiagnostics('leave_result')
    }
  }, [view])

  // Ensure the active tab is mounted, then reset scroll so a long Settings page
  // does not leave the Dictionary tab scrolled into empty space.
  useEffect(() => {
    setMountedViews((prev) => (prev[view] ? prev : { ...prev, [view]: true }))
    // Blur before hiding previous tab — avoids iOS keyboard stuck on a display:none input.
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
    const sc = scrollContainerRef.current
    if (sc) sc.scrollTop = 0
    setIsAtTop(true)
    setIsBottomNavVisible(true)
    lastScrollTopRef.current = 0
  }, [view])

  const {
    wordResult, relatedPhrases, aiAnalysis, aiFullResult, phraseResult,
    combinedResult, combinedPhraseResult, aiStatus, aiError,
    aiPendingHalves, aiFailedHalves,
  } = useResultStore()
  const { selectWord } = useSearch()
  const { triggerCombinedLookup, triggerCombinedPhraseQuery, cancelAi } = useAiLookup()
  const { status, hasSeenBadge, checkUpdate, cleanupOldApks, setHasSeenBadge, isModalOpen, toastMessage, clearToast, openModal } = useUpdateStore()
  const routingKey = `${mainDictionary}:${monolingualWord}:${monolingualPhrase}:${monolingualSentence}`
  const previousRoutingKeyRef = useRef(routingKey)

  // A request started under the old language must never repaint after settings change.
  useEffect(() => {
    if (previousRoutingKeyRef.current === routingKey) return
    previousRoutingKeyRef.current = routingKey
    cancelAi()
  }, [routingKey, cancelAi])

  useEffect(() => {
    // Initial check and cleanup
    checkUpdate()
    cleanupOldApks()
    void cleanCameraCacheDir()

    // Legacy Android safe area fix (Android 8-10 often report 0 for env(safe-area-inset-top))
    const initSafeArea = async () => {
      const isCap = typeof window !== 'undefined' && (window as any).Capacitor
      if (isCap) {
        const { Device } = await import('@capacitor/device')
        const info = await Device.getInfo()
        if (info.platform === 'android') {
          // If env() is supported but returns 0, it usually means the WebView isn't reporting it.
          // For Android 9/10, we provide a reasonable default if it looks like it's missing.
          const testDiv = document.createElement('div')
          testDiv.style.paddingTop = 'env(safe-area-inset-top, 0px)'
          document.body.appendChild(testDiv)
          const computed = window.getComputedStyle(testDiv).paddingTop
          document.body.removeChild(testDiv)

          if (computed === '0px') {
            // Android 9-10 status bar is typically ~24-28dp. We use a safe default of 28px.
            // On high-DPI devices, it might be more, but 24-28px is a common baseline.
            document.documentElement.style.setProperty('--safe-area-inset-top', '28px')
          }
        }
      }
    }
    initSafeArea()
  }, [])

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        clearToast()
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage, clearToast])

  useEffect(() => {
    const handleResize = () => {
      setIsLargeScreen(window.innerWidth >= 1024)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!scrollContainerRef.current) return

    const sc = scrollContainerRef.current
    const handleScroll = () => {
      const top = sc.scrollTop
      const atTop = top <= 16
      const delta = top - lastScrollTopRef.current

      setIsAtTop(atTop)
      if (atTop || delta < -8) {
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

  // The three lookup modes share one outer scroll container. Restore the selected
  // mode after React has committed its result view, before the browser paints it.
  useLayoutEffect(() => {
    if (pendingModeScrollRestoreRef.current !== mode) return
    pendingModeScrollRestoreRef.current = null

    const sc = scrollContainerRef.current
    if (!sc) return
    const maxScrollTop = Math.max(0, sc.scrollHeight - sc.clientHeight)
    const top = getModeScrollPosition(modeScrollPositionsRef.current, mode, maxScrollTop)
    sc.scrollTo({ top, behavior: 'auto' })
    lastScrollTopRef.current = top
    setIsAtTop(top <= 16)
    setIsBottomNavVisible(top <= 80)
  }, [mode])

  /** 点击分段控件切换模式时立刻补齐 AI（Lookup / Pure Core 均点击即搜），不依赖 useEffect / idle 门闩 */
  function handleModeChange(next: typeof mode) {
    const prev = useSearchStore.getState().mode
    if (prev === next) return

    const sc = scrollContainerRef.current
    if (sc) {
      modeScrollPositionsRef.current = saveModeScrollPosition(
        modeScrollPositionsRef.current,
        prev,
        sc.scrollTop,
      )
    }
    pendingModeScrollRestoreRef.current = next

    // Lookup ↔ Pure Core is a different AI chat track — flush pending profile Q&A.
    if ((prev === 'ai' && next === 'core') || (prev === 'core' && next === 'ai')) {
      void flushPendingProfileDiagnostics('mode_switch')
    }

    setMode(next)

    const store = useResultStore.getState()
    const currentQuery = useSearchStore.getState().query
    const currentWord = store.wordResult
    const target = (currentQuery.trim() || currentWord?.word || '').trim()

    // → Lookup / Core with dictionary L1 on screen: keep L1, fill combined (view switch only if cached)
    if ((next === 'ai' || next === 'core') && searchSource === 'local' && currentWord) {
      const cached = store.getCachedCombined(currentWord.word)
      if (cached) {
        store.setCombinedResult(currentWord.word, cached)
        upgradeHistory(currentWord.word, 'full')
      } else if (store.aiStatus !== 'loading') {
        triggerCombinedLookup(currentWord.word, false, 'normal', activeLearningRouteRef.current)
        upgradeHistory(currentWord.word, 'full')
      }
      return
    }

    // → AI or Core (OOD / phrase / ai-full): combined call — tab flip is a view-only switch if cached
    if ((next === 'ai' || next === 'core') && target) {
      const qt = detectQueryType(target)
      if (qt === 'phrase' || qt === 'sentence') {
        setSearchSource('phrase')
        const cached = store.getCachedCombinedPhrase(target)
        if (cached) {
          store.setCombinedPhraseResult(target, cached)
        } else {
          triggerCombinedPhraseQuery(target, false, 'normal', activeLearningRouteRef.current)
        }
        upgradeHistory(target, 'phrase')
      } else {
        setSearchSource('ai-full')
        const cached = store.getCachedCombined(target)
        if (cached) {
          store.setCombinedResult(target, cached)
        } else {
          triggerCombinedLookup(target, false, 'normal', activeLearningRouteRef.current)
        }
        upgradeHistory(target, 'full')
      }
      return
    }

    // → Instant：有本地词典快照则只显示 L1（不加载 AI 展示，缓存保留）；否则清空结果区，保留搜索框
    if (next === 'instant') {
      // Abort + invalidate generation so in-flight AI cannot repopulate display
      cancelAi()
      const snap = localWordSnapshotRef.current
      if (snap) {
        store.setWordResult(snap.wordResult, false)
        store.setRelatedPhrases(snap.relatedPhrases)
        useResultStore.setState({
          aiAnalysis: null,
          aiFullResult: null,
          phraseResult: null,
          combinedResult: null,
          combinedPhraseResult: null,
          aiStatus: 'idle',
          aiError: null,
        })
        setSearchSource('local')
      } else {
        useResultStore.setState({
          wordResult: null,
          relatedPhrases: [],
          aiAnalysis: null,
          aiFullResult: null,
          phraseResult: null,
          combinedResult: null,
          combinedPhraseResult: null,
          aiStatus: 'idle',
          aiError: null,
        })
        setSearchSource('none')
      }
    }
  }

  function scrollToTop() {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetModeScrollPositions() {
    modeScrollPositionsRef.current = {}
    pendingModeScrollRestoreRef.current = null
  }

  async function handleWordSelect(word: string, fromHistory = false) {
    const directionSnapshot = useSearchStore.getState().learningDirection
    await ensureSearchStateHydrated()
    const learningRoute = resolveCurrentLearningRoute(word, directionSnapshot)
    activeLearningRouteRef.current = learningRoute
    setActiveLearningRoute(learningRoute)
    resetModeScrollPositions()
    scrollToTop()
    localWordSnapshotRef.current = null
    const nw = normalizeQuery(word)

    const prevQuery = lastProfileQueryRef.current
    if (prevQuery && normalizeQuery(prevQuery) !== nw) {
      void flushPendingProfileDiagnostics('context_change')
    }
    lastProfileQueryRef.current = word

    const { result, queryType } = await selectWord(word)

    // Record a lookup event only for genuine word/phrase-as-word lookups,
    // NOT for phrase/sentence queries (those emit richer sentence-correction events)
    // and NOT for fromHistory revisits (already counted on first lookup).
    if (!fromHistory && queryType !== 'phrase' && queryType !== 'sentence') {
      recordLookupEvent(word, result?.coreConcept?.image, learningRoute)
    }

    if (result) {
      // Save snapshot for potential AI-full → Instant restore
      localWordSnapshotRef.current = {
        wordResult: result,
        relatedPhrases: useResultStore.getState().relatedPhrases,
      }
      setSearchSource('local')

      if (fromHistory) {
        const store = useResultStore.getState()
        const hasNormal = Boolean(store.getCachedCombined(word, 'normal'))
        const hasBypass = Boolean(store.getCachedCombined(word, 'bypass'))
        const route = decideHistoryClickRoute({ hasNormalCache: hasNormal, hasBypassCache: hasBypass })

        useSearchStore.getState().setMode(route.mode)
        setSearchSource(route.searchSource)
        if (route.activeTag) {
          const cached = store.getCachedCombined(word, route.activeTag)
          if (cached) {
            store.setCombinedResult(word, cached, route.activeTag)
            upgradeHistory(word, 'full')
          }
        }
      } else {
        const store = useResultStore.getState()
        const currentMode = useSearchStore.getState().mode
        const plan = planDictHitNormalSearch(currentMode)

        if (plan.kind === 'l1-then-combined') {
          setSearchSource('local')
          const cachedCombined = store.getCachedCombined(word, 'normal')
          if (cachedCombined) {
            store.setCombinedResult(word, cachedCombined, 'normal')
            upgradeHistory(word, 'full')
          } else {
            triggerCombinedLookup(word, false, 'normal', learningRoute)
            upgradeHistory(word, 'full')
          }
        } else {
          // Instant mode
          const cognitive = cognitiveFromSearchMode(currentMode)
          const cachedFull = store.getCachedAiFull(word, cognitive)
          const cachedAi = store.getCachedAi(result.word)
          const cachedCombined = store.getCachedCombined(word, 'normal')

          if (cachedCombined) {
            // Stay Instant visually
          } else if (cachedFull) {
            setSearchSource('ai-full')
            useResultStore.getState().setAiFullResult(word, cachedFull, cognitive)
            upgradeHistory(word, 'full', cognitive)
          } else if (cachedAi) {
            useSearchStore.getState().setMode('ai')
            useResultStore.getState().setAiAnalysis(result.word, cachedAi)
            upgradeHistory(word, 'analyze', 'lookup')
          }
        }
      }
    } else {
      localWordSnapshotRef.current = null
      useResultStore.getState().setWordResult(null)

      if (fromHistory) {
        const store = useResultStore.getState()
        const hasNormal = Boolean(store.getCachedCombined(word, 'normal')) || Boolean(store.getCachedCombinedPhrase(word, 'normal'))
        const hasBypass = Boolean(store.getCachedCombined(word, 'bypass')) || Boolean(store.getCachedCombinedPhrase(word, 'bypass'))
        const route = decideHistoryClickRoute({ hasNormalCache: hasNormal, hasBypassCache: hasBypass })

        const targetMode = route.mode === 'instant' ? 'ai' : route.mode
        useSearchStore.getState().setMode(targetMode)
        const isPhraseOrSentence = queryType === 'phrase' || queryType === 'sentence'
        setSearchSource(isPhraseOrSentence ? 'phrase' : route.searchSource)
        const activeTag = route.activeTag ?? 'normal'

        if (isPhraseOrSentence) {
          const cachedPhrase = store.getCachedCombinedPhrase(word, activeTag)
          if (cachedPhrase) {
            store.setCombinedPhraseResult(word, cachedPhrase, activeTag)
          } else {
            triggerCombinedPhraseQuery(word, false, activeTag, learningRoute)
          }
        } else {
          const cachedFull = store.getCachedCombined(word, activeTag)
          if (cachedFull) {
            store.setCombinedResult(word, cachedFull, activeTag)
          } else {
            triggerCombinedLookup(word, false, activeTag, learningRoute)
          }
        }
      } else {
        const currentMode = useSearchStore.getState().mode
        if (currentMode === 'instant') {
          useSearchStore.getState().setMode('ai')
        }

        if (queryType === 'phrase' || queryType === 'sentence') {
          setSearchSource('phrase')
          const cachedPhrase = useResultStore.getState().getCachedCombinedPhrase(word, 'normal')
          if (cachedPhrase) {
            useResultStore.getState().setCombinedPhraseResult(word, cachedPhrase, 'normal')
          } else {
            triggerCombinedPhraseQuery(word, false, 'normal', learningRoute)
          }
          upgradeHistory(word, 'phrase', 'lookup')
        } else {
          setSearchSource('ai-full')
          const cachedFull = useResultStore.getState().getCachedCombined(word, 'normal')
          if (cachedFull) {
            useResultStore.getState().setCombinedResult(word, cachedFull, 'normal')
          } else {
            triggerCombinedLookup(word, false, 'normal', learningRoute)
          }
          upgradeHistory(word, 'full', 'lookup')
        }
      }
    }
  }


  function handleRetry() {
    if (searchSource === 'local' && wordResult && (mode === 'ai' || mode === 'core')) {
      triggerCombinedLookup(wordResult.word, false, 'normal', activeLearningRouteRef.current)
    } else if (searchSource === 'phrase' && query) {
      triggerCombinedPhraseQuery(query, false, 'normal', activeLearningRouteRef.current)
    } else if (searchSource === 'ai-full' && query) {
      triggerCombinedLookup(query, false, 'normal', activeLearningRouteRef.current)
    }
  }

  async function handleForceAi(word: string) {
    const nw = normalizeQuery(word)
    if (!nw) return
    const directionSnapshot = useSearchStore.getState().learningDirection
    const learningRoute = resolveCurrentLearningRoute(word, directionSnapshot)
    activeLearningRouteRef.current = learningRoute
    setActiveLearningRoute(learningRoute)
    resetModeScrollPositions()
    scrollToTop()
    // Save local snapshot if we currently have a local result for this word
    const currentWordResult = useResultStore.getState().wordResult
    const currentRelatedPhrases = useResultStore.getState().relatedPhrases
    if (currentWordResult && normalizeQuery(currentWordResult.word) === nw) {
      localWordSnapshotRef.current = { wordResult: currentWordResult, relatedPhrases: currentRelatedPhrases }
    } else {
      localWordSnapshotRef.current = null
    }
    useSearchStore.getState().setQuery(word)

    // Always switch to 'ai' and fire a combined call (covers both Lookup + Core in one round-trip)
    useSearchStore.getState().setMode('ai')

    const qt = detectQueryType(word)
    if (qt === 'phrase' || qt === 'sentence') {
      setSearchSource('phrase')
      triggerCombinedPhraseQuery(word, true, 'normal', learningRoute)
      if (useSettingsStore.getState().historyEnabled) addHistory(word, 'phrase', 'lookup')
    } else {
      setSearchSource('ai-full')
      triggerCombinedLookup(word, true, 'normal', learningRoute)
      if (useSettingsStore.getState().historyEnabled) addHistory(word, 'full', 'lookup')
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
      if ((scrollContainerRef.current?.scrollTop ?? 0) <= 16) {
        setIsAtTop(true)
        setIsBottomNavVisible(true)
      }
    }

    const initKeyboardFix = async () => {
      const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor
      let deviceInfo: any = null
      if (isCapacitor) {
        const { Device } = await import('@capacitor/device')
        deviceInfo = await Device.getInfo()
      }

      const isLegacyAndroid = isCapacitor && deviceInfo?.platform === 'android' && parseInt(deviceInfo?.osVersion) <= 10
      const isModernAndroid = isCapacitor && deviceInfo?.platform === 'android' && parseInt(deviceInfo?.osVersion) > 10
      const isIos = isCapacitor && deviceInfo?.platform === 'ios'

      const handleFocusIn = (e: FocusEvent) => {
        const activeEl = e.target as HTMLElement
        if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA')) return

        clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => {
          const scrollable = getScrollableAncestor(activeEl)
          if (scrollable && !scrollable.dataset.kbPadded) {
            // Legacy Android uses adjustPan, so we need a large padding to allow scrolling.
            // This padding is hidden behind the keyboard and prevents the "black block" bug.
            scrollable.style.paddingBottom = '45vh'
            scrollable.dataset.kbPadded = 'true'
          }
          setIsKeyboardVisible(true)
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

      // Only use the focus-based fallback on legacy Android or non-Capacitor mobile environments (if any)
      if (isLegacyAndroid || !isCapacitor) {
        document.addEventListener('focusin', handleFocusIn)
        document.addEventListener('focusout', handleFocusOut)
      }

      if (isCapacitor) {
        try {
          const { Keyboard } = await import('@capacitor/keyboard')
          const updateScroll = (height: number) => {
            // Modern Android (11+) handles adjustResize natively, often NO JS needed.
            // However, we keep visualViewport logic for iOS and as a safety for modern Android.
            if (isModernAndroid) {
              setIsKeyboardVisible(true)
              return
            }

            const activeEl = document.activeElement as HTMLElement
            if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA')) return

            setIsKeyboardVisible(true)
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

              // Center + double-scroll: first pass after padding, second after keyboard
              // animation settles (iOS timing varies). The rich-context bulb sits beside
              // the input (same row), so centering no longer scrolls it off-screen.
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

          if (isIos || isModernAndroid) {
            window.visualViewport?.addEventListener('resize', updateScrollFromViewport)
            window.visualViewport?.addEventListener('scroll', updateScrollFromViewport)
          }

        } catch (e) {
          console.warn('Capacitor Keyboard listeners failed, falling back to focus events', e)
        }
      }

      ; (window as any)._kbFixCleanup = () => {
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
  const lookupStatus = aiPendingHalves.lookup
    ? 'loading'
    : aiFailedHalves.lookup
      ? 'error'
      : aiStatus
  const coreStatus = aiPendingHalves.core
    ? 'loading'
    : aiFailedHalves.core
      ? 'error'
      : aiStatus
  const splitError = aiError ?? t('aifull.halfFailed')
  // 任意默认模式：无查询、无结果时一律显示小书空态（不被 Core 空壳抢走）
  // 词库下载/校验中：空态文案让位给进度（非扩展平台此值恒为 false）
  const dictionaryPhase = useDictionaryStore((s) => s.phase)
  const dictionaryBusy = dictionaryPhase !== 'idle' && dictionaryPhase !== 'ready'

  // 网页选词 → 侧栏（仅扩展）。
  //
  // 刻意复用 handleWordSelect —— 它就是「按 Enter / 点联想词」的入口，
  // 所以中文反查、词组/句子分流、缓存分轨、历史双轨、Profile 事件全部自动继承，
  // 这里不新写任何查词逻辑。
  const handleWordSelectRef = useRef(handleWordSelect)
  useEffect(() => {
    handleWordSelectRef.current = handleWordSelect
  })

  // 悬浮按钮开关也要镜像给 content script
  const selectionButtonEnabled = useSettingsStore((s) => s.selectionButtonEnabled)
  useEffect(() => {
    if (!settingsHydrated) return
    mirrorSelectionButton(selectionButtonEnabled)
  }, [selectionButtonEnabled, settingsHydrated])

  useEffect(() => {
    const run = (text: string) => {
      // 词到达时用户可能停在 Image / Settings 页，必须切回查词页否则结果看不见
      setView('dictionary')
      void handleWordSelectRef.current(text)
    }
    // 侧栏冷启动：消费打开之前积压的词（sidePanel.open 手势被拒时就靠这条）
    void takePendingQuery().then((text) => {
      if (text) run(text)
    })
    // 侧栏运行期间：后续选词实时到达
    return subscribePendingQuery(run)
  }, [])

  const showEmptyHome = searchSource === 'none'
    && !wordResult
    && !phraseResult
    && !aiFullResult
    && aiStatus === 'idle'
    && !normalizeQuery(query)

  const bottomNavVisible = isBottomNavVisible || isAtTop
  const bottomNavClassName = `fixed left-1/2 z-50 glass rounded-[2rem] px-2 py-2 w-[85%] max-w-[320px] bg-background/80 backdrop-blur-2xl shadow-2xl border border-border/50 transition-all duration-300 ease-out ${bottomNavVisible || isLargeScreen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`
  const bottomNavTransform = `translateX(-50%) ${bottomNavVisible || isLargeScreen ? 'translateY(0)' : 'translateY(140%)'}`

  return (
    <div className={`min-h-screen bg-background text-foreground transition-colors duration-300 relative overflow-hidden ${performanceMode ? 'perf-mode' : ''}`}>
      {/* Background Decorative Elements */}
      <div className="bg-grid opacity-[0.2] dark:opacity-[0.1]" />

      <div
        ref={scrollContainerRef}
        className={`mx-auto w-full h-screen overflow-y-auto relative pb-safe selection:bg-accent/10 bg-transparent ${view === 'translate' ? 'max-w-[92vw] lg:max-w-[90vw] xl:max-w-[85vw] 3xl:max-w-[1800px]' : 'max-w-2xl lg:max-w-3xl'}`}
      >


        <main>
          {mountedViews.dictionary && (
            <div
              className={`px-6 pb-nav-safe space-y-4 ${view === 'dictionary' ? '' : 'hidden'}`}
              aria-hidden={view !== 'dictionary'}
            >
              <div className="sticky top-0 z-30 pt-safe pb-3 bg-background/90 backdrop-blur-xl -mx-6 px-6 shadow-[0_4px_24px_transparent] transition-all">
                <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-500 mt-4 relative z-30">
                  <div className="w-full relative z-20">
                    <SearchBar
                      onWordSelect={handleWordSelect}
                      onHistorySelect={(word) => handleWordSelect(word, true)}
                      onForceAi={handleForceAi}
                    />
                  </div>
                  <SegmentedControl mode={mode} onModeChange={handleModeChange} />
                </div>
              </div>

              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <ErrorBoundary>
                {showEmptyHome ? (
                  // 整屏几何居中（任意默认模式一致；不随底部菜单滚动显隐跳动）
                  <div className="fixed inset-0 z-[5] flex flex-col items-center justify-center pointer-events-none text-foreground-muted px-6">
                    <div className="w-12 h-12 mb-4 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                    </div>
                    {/* 扩展首启下载词库时，状态接管这两行提示文案（不新增卡片，
                        见 09-ui-ux-design-system.md §2.2）；其余情况走原文案。 */}
                    {dictionaryBusy ? (
                      <DictionaryStatus />
                    ) : (
                      <p className="text-xs font-medium text-foreground-muted/70 text-center max-w-[270px] leading-relaxed mx-auto">
                        {t('home.emptyPlaceholder')}
                      </p>
                    )}
                  </div>
                ) : showPhraseView ? (
                  <PhraseView
                    phrase={query}
                    learningRoute={activeLearningRoute}
                    phraseResult={mode === 'core' ? (combinedPhraseResult?.core ?? phraseResult) : phraseResult}
                    aiStatus={mode === 'core' ? coreStatus : lookupStatus}
                    aiError={(mode === 'core' ? aiFailedHalves.core : aiFailedHalves.lookup) ? splitError : aiError}
                    onRetry={handleRetry}
                    onGoToSettings={() => setView('settings')}
                  />
                ) : mode === 'core' ? (
                  <CoreCognitiveView
                    word={query}
                    learningRoute={activeLearningRoute}
                    aiFullResult={combinedResult?.core ?? aiFullResult}
                    dictWordResult={searchSource === 'local' ? wordResult : null}
                    aiStatus={coreStatus}
                    aiError={aiFailedHalves.core ? splitError : aiError}
                    onRetry={handleRetry}
                    onWordClick={handleWordSelect}
                    onGoToSettings={() => setView('settings')}
                  />
                ) : showAiFullView ? (
                  <AiFullView
                    word={query}
                    learningRoute={activeLearningRoute}
                    aiFullResult={combinedResult?.lookup ?? aiFullResult}
                    aiStatus={lookupStatus}
                    aiError={aiFailedHalves.lookup ? splitError : aiError}
                    onRetry={handleRetry}
                    onWordClick={handleWordSelect}
                    onGoToSettings={() => setView('settings')}
                  />
                ) : wordResult ? (
                  <ResultView
                    routeQuery={query}
                    learningRoute={activeLearningRoute}
                    wordResult={wordResult}
                    relatedPhrases={relatedPhrases}
                    aiAnalysis={aiAnalysis}
                    aiStatus={mode === 'ai' ? lookupStatus : aiStatus}
                    aiError={mode === 'ai' && aiFailedHalves.lookup ? splitError : aiError}
                    mode={mode}
                    onRetry={handleRetry}
                    onWordClick={handleWordSelect}
                    onGoToSettings={() => setView('settings')}
                    profileInsight={combinedResult?.lookup?.profileInsight}
                    profileInsightDirection={combinedResult?.lookup?.profileInsightDirection}
                  />
                ) : (
                  <div className="fixed inset-0 z-[5] flex flex-col items-center justify-center pointer-events-none text-foreground-muted px-6">
                    <div className="w-12 h-12 mb-4 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                    </div>
                    {/* 扩展首启下载词库时，状态接管这两行提示文案（不新增卡片，
                        见 09-ui-ux-design-system.md §2.2）；其余情况走原文案。 */}
                    {dictionaryBusy ? (
                      <DictionaryStatus />
                    ) : (
                      <p className="text-xs font-medium text-foreground-muted/70 text-center max-w-[270px] leading-relaxed mx-auto">
                        {t('home.emptyPlaceholder')}
                      </p>
                    )}
                  </div>
                )}

                </ErrorBoundary>
              </div>
            </div>
          )}

          {mountedViews.translate && (
            <div className={view === 'translate' ? '' : 'hidden'} aria-hidden={view !== 'translate'}>
              <ImageTranslateView />
            </div>
          )}

          {mountedViews.settings && (
            <div className={view === 'settings' ? '' : 'hidden'} aria-hidden={view !== 'settings'}>
              <SettingsView />
            </div>
          )}
        </main>
      </div>

      {/* Bottom Navigation Bar - Floating iOS Pill style */}
      <nav className={bottomNavClassName} style={{ bottom: 'calc(1.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))', transform: bottomNavTransform }}>
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
            <span className={`text-[10px] font-bold ${view === 'dictionary' ? 'text-accent' : 'text-foreground-muted'}`}>{t('nav.dict')}</span>
          </button>

          <button
            className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-2xl transition-all ${view === 'translate' ? 'text-accent' : 'text-foreground-muted hover:text-foreground hover:bg-foreground/5'}`}
            onClick={() => {
              setMountedViews(prev => ({ ...prev, translate: true }))
              setView('translate')
            }}
          >
            <div className={`p-1 rounded-xl mb-0.5 transition-colors ${view === 'translate' ? 'bg-accent/10' : ''}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={view === 'translate' ? 2.5 : 2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className={`text-[10px] font-bold ${view === 'translate' ? 'text-accent' : 'text-foreground-muted'}`}>{t('nav.image')}</span>
          </button>

          <button
            onClick={() => {
              setMountedViews(prev => ({ ...prev, settings: true }))
              setView('settings')
              scrollToTop()
              setHasSeenBadge(true)
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1.5 rounded-2xl transition-all relative ${view === 'settings' ? 'text-accent' : 'text-foreground-muted hover:text-foreground hover:bg-foreground/5'}`}
            aria-label={t('nav.settings')}
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
            <span className={`text-[10px] font-bold ${view === 'settings' ? 'text-accent' : 'text-foreground-muted'}`}>{t('nav.settings')}</span>
          </button>
        </div>
      </nav>


      {toastMessage && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto cursor-pointer"
          style={{ bottom: 'calc(7.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}
          onClick={() => { if (status === 'available') { openModal(); clearToast(); } }}
        >
          <div className="glass px-5 py-2.5 rounded-full text-xs font-black shadow-2xl flex items-center gap-3 border border-accent/20">
            <div className="relative">
              <div className="w-2 h-2 bg-accent rounded-full animate-ping absolute inset-0" />
              <div className="w-2 h-2 bg-accent rounded-full relative" />
            </div>
            <span className="text-foreground tracking-tight">{toastMessage}</span>
            <svg className="w-3.5 h-3.5 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      )}

      {isModalOpen && (
        <UpdateModal />
      )}
    </div>
  )
}
