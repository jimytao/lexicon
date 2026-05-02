import { useState, useEffect, useRef } from 'react'
import { generateMnemonic, generatePhraseMnemonic } from '../../../services/ai'
import type { Mnemonic } from '../../../types'

interface MnemonicCardProps {
  word: string
  initialMnemonic?: Mnemonic
  isPhrase?: boolean
  onUpdateMnemonic?: (m: Mnemonic) => void
}

export function MnemonicCard({ word, initialMnemonic, isPhrase, onUpdateMnemonic }: MnemonicCardProps) {
  const [mnemonic, setMnemonic] = useState<Mnemonic | undefined>(initialMnemonic)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setMnemonic(initialMnemonic)
    setError(null)
    setLoading(false)
  }, [initialMnemonic, word])

  const handleGenerate = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const res = isPhrase 
        ? await generatePhraseMnemonic(word, controller.signal)
        : await generateMnemonic(word, controller.signal)
      
      setMnemonic(res)
      onUpdateMnemonic?.(res)
    } catch (err: any) {
      if (err.name === 'AbortError') return
      setError('生成失败，请重试')
      console.error(err)
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false)
      }
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return (
    <div className="mt-6 mb-8 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">Mnemonic</h2>
        {!mnemonic && !loading && (
          <button
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

      {loading && (
        <div className="rounded-2xl border border-dashed border-accent/20 p-6 flex flex-col items-center justify-center gap-3 bg-accent-soft/30">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <p className="text-[11px] font-medium text-accent/60 animate-pulse">AI 正在疯狂联想中...</p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/30 p-4 bg-red-50 dark:bg-red-900/10 text-center">
          <p className="text-xs text-red-500 mb-2">{error}</p>
          <button onClick={handleGenerate} className="text-[10px] font-bold text-red-600 dark:text-red-400 underline">重试</button>
        </div>
      )}

      {mnemonic && !loading && (
        <div className="group relative rounded-2xl p-5 bg-accent-soft border border-accent/10 hover:border-accent/20 transition-all duration-300">
          {/* Header with recommendation info */}
          <div className="flex items-center justify-between mb-4 border-b border-accent/10 pb-3">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md shadow-sm ${
                mnemonic.type === 'philology' ? 'bg-blue-500 text-white' : 
                mnemonic.type === 'story' ? 'bg-orange-500 text-white' : 
                'bg-emerald-500 text-white'
              }`}>
                {mnemonic.type === 'philology' ? '词源逻辑' : 
                 mnemonic.type === 'story' ? '趣味故事' : '智能联想'}
              </span>
              <span className="text-[10px] font-bold text-accent">推荐指数: {mnemonic.score}</span>
            </div>
            <div className="flex gap-2">
              {Object.entries(mnemonic.allScores).map(([key, val]) => (
                <div key={key} className="flex flex-col items-center">
                  <div className="w-8 h-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${key === mnemonic.type ? 'bg-accent' : 'bg-gray-400/30'}`} 
                      style={{ width: `${val}%` }} 
                    />
                  </div>
                  <span className={`text-[8px] mt-0.5 font-medium ${key === mnemonic.type ? 'text-accent' : 'text-foreground-muted/40'}`}>
                    {key === 'philology' ? '词源' : key === 'story' ? '故事' : '智能'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="mt-1 shrink-0">
              {mnemonic.type === 'philology' ? (
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
              ) : mnemonic.type === 'story' ? (
                <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-accent/70 italic mb-1 font-medium">推荐理由: {mnemonic.reason}</p>
              <p className="text-sm text-foreground leading-relaxed font-semibold">
                {mnemonic.content}
              </p>
            </div>
          </div>
          
          <button 
            onClick={handleGenerate}
            className="absolute bottom-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-accent/60 hover:text-accent bg-accent-soft/50 px-2 py-1 rounded-md"
          >
            换一个
          </button>
        </div>
      )}
    </div>
  )
}
