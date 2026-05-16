import { useState, useRef, useEffect } from 'react'
import { useSettingsStore } from '../../../stores/settingsStore'
import { detectLanguage } from '../../../stores/searchStore'
import { generateExercises, evaluateAnswer } from '../../../services/ai'
import type { Exercise } from '../../../types'

type SectionStatus = 'idle' | 'generating' | 'ready' | 'error'
type ExStatus = 'idle' | 'evaluating' | 'correct' | 'incorrect'

interface ExState {
  answer: string
  status: ExStatus
  feedback: string
  correction: string
}

interface PracticeSectionProps {
  word: string
  meanings: Array<{ zh: string; en: string }>
}

export function PracticeSection({ word, meanings }: PracticeSectionProps) {
  const { maxExercises } = useSettingsStore()
  const [sectionStatus, setSectionStatus] = useState<SectionStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [exStates, setExStates] = useState<ExState[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => { abortRef.current?.abort() }, [])

  function updateExState(index: number, patch: Partial<ExState>) {
    setExStates(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s))
  }

  async function handleGenerate() {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setSectionStatus('generating')
    setErrorMsg('')
    try {
      const result = await generateExercises(word, meanings, maxExercises, abortRef.current.signal)
      setExercises(result)
      setExStates(result.map(() => ({ answer: '', status: 'idle', feedback: '', correction: '' })))
      setSectionStatus('ready')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setSectionStatus('error')
      setErrorMsg((e as Error).message)
    }
  }

  async function handleSubmit(index: number) {
    const answer = exStates[index].answer.trim()
    if (!answer) return
    updateExState(index, { status: 'evaluating' })
    try {
      const result = await evaluateAnswer(word, exercises[index].scenario, answer)
      updateExState(index, {
        status: result.correct ? 'correct' : 'incorrect',
        feedback: result.feedback,
        correction: result.correction,
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      updateExState(index, { status: 'idle' })
    }
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
        <h2 className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">练习</h2>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300">
          AI 生成
        </span>
      </div>

      {(sectionStatus === 'idle' || sectionStatus === 'error') && (
        <div>
          <button
            onClick={handleGenerate}
            className="w-full text-sm py-2.5 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-700 text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
          >
            生成练习
          </button>
          {sectionStatus === 'error' && (
            <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 text-center">{errorMsg}</p>
          )}
        </div>
      )}

      {sectionStatus === 'generating' && (
        <button
          disabled
          className="w-full text-sm py-2.5 rounded-xl border border-dashed border-indigo-200 dark:border-indigo-800 text-indigo-400 dark:text-indigo-500 flex items-center justify-center gap-2"
        >
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          生成中…
        </button>
      )}

      {sectionStatus === 'ready' && (
        <div className="space-y-3">
          {exercises.map((ex, i) => {
            const st = exStates[i]
            return (
              <div key={i} className="rounded-xl border border-gray-100 dark:border-gray-800 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span className="font-semibold text-gray-700 dark:text-gray-300 mr-1">场景 {i + 1}</span>
                  {ex.scenario}
                </p>
                <textarea
                  rows={2}
                  value={st.answer}
                  onChange={(e) => updateExState(i, { answer: e.target.value, status: 'idle', feedback: '', correction: '' })}
                  placeholder={`用${detectLanguage(word) === 'en' ? '英文' : '目标语言'}表达…`}
                  disabled={st.status === 'evaluating'}
                  className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none disabled:opacity-60"
                />

                {(st.status === 'idle' || st.status === 'evaluating') && (
                  <button
                    onClick={() => handleSubmit(i)}
                    disabled={st.status === 'evaluating' || !st.answer.trim()}
                    className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {st.status === 'evaluating' ? '评分中…' : '提交'}
                  </button>
                )}

                {st.status === 'correct' && (
                  <p className="mt-2 text-xs font-medium text-green-600 dark:text-green-400">✓ 不错！</p>
                )}

                {st.status === 'incorrect' && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs text-red-500 dark:text-red-400">{st.feedback}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium">参考：</span>{st.correction}
                    </p>
                    <button
                      onClick={() => updateExState(i, { status: 'idle', feedback: '', correction: '' })}
                      className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline"
                    >
                      重新作答
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
