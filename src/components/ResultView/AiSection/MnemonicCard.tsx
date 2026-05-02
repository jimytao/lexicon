import { useState, useEffect, useRef } from 'react'
import { generateMnemonic, generateMnemonicForType, generatePhraseMnemonic } from '../../../services/ai'
import type { Mnemonic } from '../../../types'

type MnemonicType = 'philology' | 'story' | 'smart'

const TYPE_LABELS: Record<MnemonicType, string> = {
  philology: '词源逻辑',
  story: '趣味故事',
  smart: '智能联想',
}

const TYPE_COLORS: Record<MnemonicType, string> = {
  philology: 'bg-blue-500 text-white',
  story: 'bg-orange-500 text-white',
  smart: 'bg-emerald-500 text-white',
}

const TYPE_ICON_BG: Record<MnemonicType, string> = {
  philology: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  story: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
  smart: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
}

interface MnemonicCardProps {
  word: string
  initialMnemonic?: Mnemonic
  isPhrase?: boolean
  onUpdateMnemonic?: (m: Mnemonic) => void
}

export function MnemonicCard({ word, initialMnemonic, isPhrase, onUpdateMnemonic }: MnemonicCardProps) {
  const [mnemonic, setMnemonic] = useState<Mnemonic | undefined>(initialMnemonic)
  const [loading, setLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<MnemonicType | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  // Lock in the initial allScores as the reference so tab scores don't jump on each switch
  const referenceScores = useRef<Mnemonic['allScores'] | undefined>(undefined)
  // Per-type content cache
  const typeCache = useRef<Partial<Record<MnemonicType, Mnemonic>>>({})
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setMnemonic(initialMnemonic)
    setLoading(false)
    setLoadingType(null)
    setSwitchError(null)
    typeCache.current = initialMnemonic ? { [initialMnemonic.type]: initialMnemonic } : {}
    referenceScores.current = initialMnemonic?.allScores
  }, [initialMnemonic, word])

  const handleGenerate = async () => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setSwitchError(null)
    try {
      const res = isPhrase
        ? await generatePhraseMnemonic(word, controller.signal)
        : await generateMnemonic(word, controller.signal)

      typeCache.current = { [res.type]: res }
      referenceScores.current = res.allScores
      setMnemonic(res)
      onUpdateMnemonic?.(res)
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      setSwitchError('生成失败，请重试')
    } finally {
      if (abortControllerRef.current === controller) setLoading(false)
    }
  }

  const handleSelectType = async (type: MnemonicType) => {
    if (mnemonic?.type === type && !loadingType) return

    const cached = typeCache.current[type]
    if (cached) {
      setMnemonic(cached)
      setSwitchError(null)
      onUpdateMnemonic?.(cached)
      return
    }

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoadingType(type)
    setSwitchError(null)
    try {
      const res = await generateMnemonicForType(word, type, controller.signal)
      typeCache.current[type] = res
      setMnemonic(res)
      onUpdateMnemonic?.(res)
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      setSwitchError(`生成${TYPE_LABELS[type]}失败，请重试`)
    } finally {
      if (abortControllerRef.current === controller) setLoadingType(null)
    }
  }

  const handleRegeneratePhrase = async () => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setSwitchError(null)
    try {
      const res = await generatePhraseMnemonic(word, controller.signal)
      typeCache.current = { [res.type]: res }
      referenceScores.current = res.allScores
      setMnemonic(res)
      onUpdateMnemonic?.(res)
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      setSwitchError('生成失败，请重试')
    } finally {
      if (abortControllerRef.current === controller) setLoading(false)
    }
  }

  useEffect(() => {
    return () => { abortControllerRef.current?.abort() }
  }, [])

  const activeType = mnemonic?.type
  const scores = referenceScores.current

  return (
    <div className="mt-6 mb-8 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">Mnemonic</h2>
        {!mnemonic && !loading && (
          <button
            type="button"
            onClick={handleGenerate}
            className="text-[10px] font-bold text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            生成助记
          </button>
        )}
      </div>

      {/* Initial generation spinner */}
      {loading && !mnemonic && (
        <div className="rounded-2xl border border-dashed border-accent/20 p-6 flex flex-col items-center justify-center gap-3 bg-accent-soft/30">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <p className="text-[11px] font-medium text-accent/60 animate-pulse">AI 正在疯狂联想中...</p>
        </div>
      )}

      {/* Initial generation error (no mnemonic yet) */}
      {switchError && !mnemonic && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/30 p-4 bg-red-50 dark:bg-red-900/10 text-center">
          <p className="text-xs text-red-500 mb-2">{switchError}</p>
          <button type="button" onClick={handleGenerate} className="text-[10px] font-bold text-red-600 dark:text-red-400 underline">重试</button>
        </div>
      )}

      {mnemonic && (
        <>
          {/* Word-mode: type selector tabs */}
          {!isPhrase && (
            <div className="flex gap-1.5 mb-3">
              {(['philology', 'story', 'smart'] as MnemonicType[]).map((type) => {
                const isActive = activeType === type && !loadingType
                const isLoading = loadingType === type
                const score = scores?.[type]
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleSelectType(type)}
                    disabled={!!loadingType}
                    className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl border transition-all duration-200 text-[10px] font-bold ${
                      isActive
                        ? `${TYPE_COLORS[type]} border-transparent shadow-sm`
                        : 'bg-background-soft border-border text-foreground-muted hover:border-foreground-muted/40 disabled:opacity-50'
                    }`}
                  >
                    {isLoading ? (
                      <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>{TYPE_LABELS[type]}</span>
                    )}
                    {score !== undefined && (
                      <span className={`text-[8px] font-medium ${isActive ? 'opacity-80' : 'opacity-50'}`}>{score}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Tab-switch or phrase-regen error (mnemonic still visible) */}
          {switchError && !loadingType && !loading && (
            <p className="text-[10px] text-red-400 dark:text-red-500 mb-2 text-center">{switchError}</p>
          )}

          {/* Mnemonic content card */}
          {!loadingType && !loading && (
            <div className="group relative rounded-2xl p-5 bg-accent-soft border border-accent/10 hover:border-accent/20 transition-all duration-300">
              <div className="flex gap-3">
                <div className="mt-1 shrink-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${TYPE_ICON_BG[activeType ?? 'smart']}`}>
                    {activeType === 'philology' ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    ) : activeType === 'story' ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-[11px] text-accent/70 italic mb-1 font-medium">推荐理由: {mnemonic.reason}</p>
                  <p className="text-sm text-foreground leading-relaxed font-semibold">{mnemonic.content}</p>
                </div>
              </div>

              {/* Phrase mode: regenerate button */}
              {isPhrase && (
                <button
                  type="button"
                  onClick={handleRegeneratePhrase}
                  className="absolute bottom-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-accent/60 hover:text-accent bg-accent-soft/50 px-2 py-1 rounded-md"
                >
                  换一个
                </button>
              )}
            </div>
          )}

          {/* Type-switch / phrase-regen loading spinner */}
          {(loadingType || (loading && mnemonic)) && (
            <div className="rounded-2xl border border-dashed border-accent/20 p-5 flex items-center justify-center gap-3 bg-accent-soft/30">
              <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <p className="text-[11px] font-medium text-accent/60">
                {loadingType ? `生成${TYPE_LABELS[loadingType]}助记...` : 'AI 正在疯狂联想中...'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
