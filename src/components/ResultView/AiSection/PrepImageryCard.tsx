import { useState, useEffect, useRef } from 'react'
import { generatePrepImagery, regenerateSinglePrepItem } from '../../../services/ai'
import type { PrepSpatialData } from '../../../types'
import { useT } from '../../../i18n'

interface PrepImageryCardProps {
  phrase: string
  prepositions: string[]
}

export function PrepImageryCard({ phrase, prepositions }: PrepImageryCardProps) {
  const t = useT()
  const [data, setData] = useState<PrepSpatialData | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [singleLoading, setSingleLoading] = useState<Record<string, boolean>>({}) // key is preposition
  const abortControllerRef = useRef<AbortController | null>(null)

  const prevPhraseRef = useRef(phrase)

  useEffect(() => {
    const phraseChanged = prevPhraseRef.current !== phrase
    prevPhraseRef.current = phrase

    if (phraseChanged) {
      setData(undefined)
      setLoading(false)
      setError(null)
      setSingleLoading({})
    }
  }, [phrase])

  useEffect(() => {
    return () => { abortControllerRef.current?.abort() }
  }, [])

  const handleGenerate = async () => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const res = await generatePrepImagery(phrase, prepositions, controller.signal)
      setData(res)
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      setError(t('prep.failed'))
    } finally {
      if (abortControllerRef.current === controller) setLoading(false)
    }
  }

  const handleRegenerateSingle = async (preposition: string) => {
    if (!data) return

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setSingleLoading(prev => ({ ...prev, [preposition]: true }))
    setError(null)
    try {
      const currentItem = data.items.find(item => item.preposition === preposition)
      const newItem = await regenerateSinglePrepItem(
        phrase,
        preposition,
        currentItem?.phraseExplanation,
        controller.signal
      )

      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          items: prev.items.map(item => item.preposition === preposition ? newItem : item)
        }
      })
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      setError(t('prep.failed'))
    } finally {
      setSingleLoading(prev => ({ ...prev, [preposition]: false }))
    }
  }

  return (
    <div className="mt-1 mb-3 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">{t('prep.heading')}</h2>
        {!data && !loading && (
          <button
            type="button"
            onClick={handleGenerate}
            className="text-[10px] font-bold text-accent hover:text-accent-hover transition-colors flex items-center gap-1 cursor-pointer"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            {t('prep.generate')}
          </button>
        )}
      </div>

      {/* Loading State */}
      {loading && !data && (
        <div className="rounded-2xl border border-dashed border-accent/20 p-6 flex flex-col items-center justify-center gap-3 bg-accent-soft/30 animate-in fade-in duration-300">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <p className="text-[11px] font-medium text-accent/60 animate-pulse">{t('prep.generating')}</p>
        </div>
      )}

      {/* Error State */}
      {error && !data && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/30 p-4 bg-red-50 dark:bg-red-900/10 text-center">
          <p className="text-xs text-red-500 mb-2">{error}</p>
          <button type="button" onClick={handleGenerate} className="text-[10px] font-bold text-red-600 dark:text-red-400 underline cursor-pointer">{t('prep.retry')}</button>
        </div>
      )}

      {/* Data display cards */}
      {data && (
        <div className="flex flex-col gap-4">
          {error && (
            <p className="text-[10px] text-red-400 dark:text-red-500 text-center">{error}</p>
          )}
          {data.items.map((item) => {
            const isItemLoading = singleLoading[item.preposition]
            return (
              <div
                key={item.preposition}
                className="group relative rounded-xl p-3.5 bg-accent-soft border border-accent/10 hover:border-accent/20 transition-all duration-300 animate-in fade-in duration-300"
              >
                {isItemLoading && (
                  <div className="absolute inset-0 bg-background/50 dark:bg-background-soft/50 backdrop-blur-[1px] rounded-xl flex flex-col items-center justify-center gap-2 z-10 animate-in fade-in duration-200">
                    <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                    <p className="text-[10px] font-medium text-accent/70 animate-pulse">{t('prep.generating')}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <div className="mt-1 shrink-0">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-accent/10 text-accent font-black text-xs">
                      {item.preposition}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-foreground-muted/60 font-semibold mb-1 uppercase tracking-wider">
                      {item.coreIdea}
                    </p>
                    <p className="text-sm text-foreground leading-relaxed font-semibold mb-2">
                      {item.phraseExplanation}
                    </p>
                    <p className="text-[11px] text-accent/80 italic font-medium flex items-center gap-1">
                      <span>🧭</span>
                      <span>{item.smartAssoc}</span>
                    </p>

                    <div className="mt-4 flex items-center justify-end gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => handleRegenerateSingle(item.preposition)}
                        className="font-bold text-accent/70 hover:text-accent bg-accent-soft/50 hover:bg-accent-soft/80 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                      >
                        {t('prep.regenerate')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
