import { useState, useRef } from 'react'
import type { Meaning, Scene } from '../../../types'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useResultStore } from '../../../stores/resultStore'
import { searchTavilyImage, generateSingleScene } from '../../../services/ai'
import { useResolvedDark } from '../../../hooks/useResolvedDark'
import { useT } from '../../../i18n'

interface MeaningListProps {
  meanings: Meaning[]
  scenes?: (Scene | undefined)[]
  word?: string
  enableSceneGenerate?: boolean
}

const COLLAPSE_THRESHOLD = 5

const POS_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  noun:   { bg: '#E6F1FB', text: '#0C447C', darkBg: '#0C2A4A', darkText: '#7BB8F0' },
  verb:   { bg: '#EAF3DE', text: '#27500A', darkBg: '#1A3309', darkText: '#8ECF5A' },
  adj:    { bg: '#FAEEDA', text: '#633806', darkBg: '#3D2104', darkText: '#F0B46A' },
  adv:    { bg: '#EEEDFE', text: '#3C3489', darkBg: '#1E1B4B', darkText: '#A09CF0' },
  phrase: { bg: '#FAECE7', text: '#712B13', darkBg: '#3D1608', darkText: '#F0906A' },
}

export function MeaningList({ meanings, scenes, word, enableSceneGenerate }: MeaningListProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const darkMode = useResolvedDark()
  const { monolingualWord, webSearchEnabled, tavilyApiKey } = useSettingsStore()
  const updateMeaningScene = useResultStore(state => state.updateMeaningScene)

  const [imageUrls, setImageUrls] = useState<Record<number, string | null>>({})
  const [loadingStates, setLoadingStates] = useState<Record<number, boolean>>({})
  const [expandedImages, setExpandedImages] = useState<Record<number, boolean>>({})

  // 本地生成的 scene 状态
  const [localScenes, setLocalScenes] = useState<Record<number, Scene>>({})
  const [sceneGenLoading, setSceneGenLoading] = useState<Record<number, boolean>>({})
  const [sceneGenErrors, setSceneGenErrors] = useState<Record<number, boolean>>({})
  const abortRefs = useRef<Record<number, AbortController>>({})

  const handleToggleImage = async (index: number, query: string) => {
    if (expandedImages[index]) {
      setExpandedImages(prev => ({ ...prev, [index]: false }))
      return
    }

    setExpandedImages(prev => ({ ...prev, [index]: true }))
    if (imageUrls[index] !== undefined) return

    setLoadingStates(prev => ({ ...prev, [index]: true }))
    try {
      const url = await searchTavilyImage(query)
      setImageUrls(prev => ({ ...prev, [index]: url }))
    } catch (e) {
      console.error('Failed to load image:', e)
    } finally {
      setLoadingStates(prev => ({ ...prev, [index]: false }))
    }
  }

  const handleGenerateScene = async (index: number, meaning: Meaning) => {
    if (sceneGenLoading[index]) return

    abortRefs.current[index]?.abort()
    const controller = new AbortController()
    abortRefs.current[index] = controller

    setSceneGenLoading(prev => ({ ...prev, [index]: true }))
    setSceneGenErrors(prev => ({ ...prev, [index]: false }))

    try {
      const scene = await generateSingleScene(
        word ?? '',
        { zh: meaning.zh, en: meaning.en },
        controller.signal
      )
      setLocalScenes(prev => ({ ...prev, [index]: scene }))
      if (word) {
        updateMeaningScene(word, index, scene)
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        console.error('Failed to generate scene:', e)
        setSceneGenErrors(prev => ({ ...prev, [index]: true }))
      }
    } finally {
      setSceneGenLoading(prev => ({ ...prev, [index]: false }))
    }
  }

  const needsCollapse = meanings.length > COLLAPSE_THRESHOLD
  const visible = needsCollapse && !expanded ? meanings.slice(0, COLLAPSE_THRESHOLD) : meanings

  return (
    <div className="mb-4 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-100">
      <h2 className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest mb-3">{t('meaning.heading')}</h2>
      <div className="space-y-3.5">
        {visible.map((m, i) => {
          const palette = POS_COLORS[m.pos ?? ''] ?? { bg: '#F3F4F6', text: '#374151', darkBg: '#1F2937', darkText: '#D1D5DB' }
          const badgeBg = darkMode ? palette.darkBg : palette.bg
          const badgeText = darkMode ? palette.darkText : palette.text

          // Scene 优先级：props 传入 > 本地生成 > meaning 本身带有
          const activeScene: Scene | undefined = scenes?.[i] ?? localScenes[i] ?? m.scene
          const hasScene = !!(activeScene && (activeScene.label || activeScene.description))
          const showGenerateBtn = enableSceneGenerate && word && !hasScene

          return (
            <div key={i} className="group relative">
              <div className="flex gap-4">
                <span className="text-sm font-bold text-accent/40 mt-0.5 shrink-0 tabular-nums">{(i + 1).toString().padStart(2, '0')}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-base font-bold text-foreground leading-snug">
                      {monolingualWord ? (m.en || m.zh) : m.zh}
                    </p>
                    {m.pos && (
                      <span
                        className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0"
                        style={{ backgroundColor: badgeBg, color: badgeText }}
                      >
                        {m.pos}
                      </span>
                    )}
                  </div>
                  {!monolingualWord && m.en && m.en !== m.zh && (
                    <p className="text-sm text-foreground-muted mt-1 leading-relaxed font-medium">{m.en}</p>
                  )}
                  
                  {/* 场景解释卡片 */}
                  {hasScene && (
                    <div className="mt-1.5 border-l-2 border-l-border bg-background-soft/40 pl-2.5 pr-2 py-1.5 rounded-r-xl">
                      {activeScene!.label && (
                        <div className="mb-0.5">
                          <span className="text-[9px] font-bold text-foreground-muted uppercase tracking-wider">
                            {activeScene!.label}
                          </span>
                        </div>
                      )}
                      <p className="text-[11px] text-foreground-muted leading-relaxed font-medium">
                        {activeScene!.description}
                      </p>
                    </div>
                  )}

                  {/* 按需生成场景按钮 */}
                  {showGenerateBtn && (
                    <div className="mt-1.5">
                      <button
                        onClick={() => handleGenerateScene(i, m)}
                        disabled={sceneGenLoading[i]}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-accent/5 dark:bg-accent/10 border border-accent/10 hover:bg-accent/10 text-[10px] font-bold text-accent transition-all duration-300 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {sceneGenLoading[i] ? (
                          <>
                            <span className="w-2.5 h-2.5 border border-accent border-t-transparent rounded-full animate-spin shrink-0" />
                            {t('meaning.generatingScene')}
                          </>
                        ) : sceneGenErrors[i] ? (
                          <>
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {t('meaning.sceneGenFailed')}
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            {t('meaning.generateScene')}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {webSearchEnabled && tavilyApiKey && m.imageQuery && (
                    <div className="mt-1.5">
                      <button
                        onClick={() => handleToggleImage(i, m.imageQuery!)}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-accent/5 dark:bg-accent/10 border border-accent/10 hover:bg-accent/10 text-[10px] font-bold text-accent transition-all duration-300 cursor-pointer"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {expandedImages[i] ? t('meaning.hideImage') : t('meaning.viewImage')}
                      </button>

                      {expandedImages[i] && (
                        <div className="mt-2 rounded-xl overflow-hidden border border-accent/10 bg-accent-soft/20 dark:bg-accent-soft/5 transition-all duration-500 animate-in fade-in slide-in-from-top-2">
                          {loadingStates[i] ? (
                            <div className="flex flex-col items-center justify-center py-6 text-foreground-muted gap-2">
                              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                              <span className="text-[10px] font-medium tracking-wide">{t('meaning.imageLoading')}</span>
                            </div>
                          ) : imageUrls[i] ? (
                            <div className="relative group/img overflow-hidden">
                              <img
                                src={imageUrls[i]!}
                                alt={`Visual helper for ${m.zh || m.en}`}
                                className="w-full max-h-48 object-cover rounded-xl transition-transform duration-500 hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 flex items-end p-2">
                                <span className="text-[8px] font-bold text-white/70 tracking-wider">{t('meaning.imageSource')}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-5 text-foreground-muted gap-1 text-[10px]">
                              <span>{t('meaning.imageNone')}</span>
                              <button
                                onClick={() => {
                                  setImageUrls(prev => {
                                    const next = { ...prev };
                                    delete next[i];
                                    return next;
                                  });
                                  handleToggleImage(i, m.imageQuery!);
                                }}
                                className="text-accent underline font-bold mt-1 cursor-pointer"
                              >
                                {t('meaning.imageRetry')}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1.5 text-xs font-bold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-2 px-1 cursor-pointer"
        >
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {expanded ? t('meaning.collapse') : `${t('meaning.showMore')} (${meanings.length - COLLAPSE_THRESHOLD})`}
        </button>
      )}
    </div>
  )
}
