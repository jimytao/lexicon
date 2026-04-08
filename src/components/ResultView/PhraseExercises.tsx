import { useState } from 'react'
import { evaluateAnswer } from '../../services/ai'
import type { Exercise } from '../../types'

type ExStatus = 'idle' | 'evaluating' | 'correct' | 'incorrect'

interface ExState {
  answer: string
  status: ExStatus
  feedback: string
  correction: string
}

interface PhraseExercisesProps {
  phrase: string
  exercises: Exercise[]
}

export function PhraseExercises({ phrase, exercises }: PhraseExercisesProps) {
  const [exStates, setExStates] = useState<ExState[]>(
    () => exercises.map(() => ({ answer: '', status: 'idle', feedback: '', correction: '' }))
  )

  function updateExState(index: number, patch: Partial<ExState>) {
    setExStates((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  async function handleSubmit(index: number) {
    const answer = exStates[index].answer.trim()
    if (!answer) return
    updateExState(index, { status: 'evaluating' })
    try {
      const result = await evaluateAnswer(phrase, exercises[index].scenario, answer)
      updateExState(index, {
        status: result.correct ? 'correct' : 'incorrect',
        feedback: result.feedback,
        correction: result.correction,
      })
    } catch {
      updateExState(index, { status: 'idle' })
    }
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
        <h2 className="text-xs font-semibold text-teal-900 dark:text-teal-300">练习</h2>
      </div>
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
                placeholder="用英文表达…"
                disabled={st.status === 'evaluating'}
                className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:border-teal-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none disabled:opacity-60"
              />
              {(st.status === 'idle' || st.status === 'evaluating') && (
                <button
                  onClick={() => handleSubmit(i)}
                  disabled={st.status === 'evaluating' || !st.answer.trim()}
                  className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {st.status === 'evaluating' ? '评分中…' : '提交'}
                </button>
              )}
              {st.status === 'correct' && (
                <p className="mt-2 text-xs font-medium text-green-600 dark:text-green-400">不错！</p>
              )}
              {st.status === 'incorrect' && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-xs text-red-500 dark:text-red-400">{st.feedback}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium">参考：</span>{st.correction}
                  </p>
                  <button
                    onClick={() => updateExState(i, { status: 'idle', feedback: '', correction: '' })}
                    className="text-xs text-teal-500 dark:text-teal-400 hover:underline"
                  >
                    重新作答
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
