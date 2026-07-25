import { useState, useRef, useEffect } from 'react'
import { useSettingsStore } from '../../../stores/settingsStore'
import { generateExercises, evaluateAnswer, evaluateMeaningCheck } from '../../../services/ai'
import type { Exercise } from '../../../types'
import { useT } from '../../../i18n'
import { SectionHeading } from '../SectionHeading'

type SectionStatus = 'idle' | 'generating' | 'ready' | 'error'
type ExStatus = 'idle' | 'evaluating' | 'correct' | 'incorrect'

interface ExState {
  answer: string
  status: ExStatus
  feedback: string
  correction: string
}

export type PracticeMode = 'meaning-check' | 'usage-output'

interface PracticeSectionProps {
  word: string
  meanings: Array<{ zh: string; en: string }>
  /** Lookup=释义核对；Core=场景造句（默认） */
  mode?: PracticeMode
}

export function PracticeSection({ word, meanings, mode = 'usage-output' }: PracticeSectionProps) {
  if (mode === 'meaning-check') {
    return <MeaningCheckPractice word={word} meanings={meanings} />
  }
  return <UsageOutputPractice word={word} meanings={meanings} />
}

function MeaningCheckPractice({
  word,
  meanings,
}: {
  word: string
  meanings: Array<{ zh: string; en: string }>
}) {
  const t = useT()
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState<ExStatus>('idle')
  const [feedback, setFeedback] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => { abortRef.current?.abort() }, [])
  useEffect(() => {
    setAnswer('')
    setStatus('idle')
    setFeedback('')
  }, [word])

  async function handleSubmit() {
    const trimmed = answer.trim()
    if (!trimmed) return
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setStatus('evaluating')
    setFeedback('')
    try {
      const result = await evaluateMeaningCheck(word, meanings, trimmed, abortRef.current.signal)
      setStatus(result.correct ? 'correct' : 'incorrect')
      setFeedback(result.feedback)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setStatus('idle')
      setFeedback((e as Error).message || t('practice.error'))
    }
  }

  return (
    <div className="mb-4">
      <SectionHeading title={t('practice.meaningHeading')} subtitle={t('practice.meaningHint')} />
      <textarea
        rows={2}
        value={answer}
        onChange={(e) => {
          setAnswer(e.target.value)
          if (status !== 'idle' && status !== 'evaluating') {
            setStatus('idle')
            setFeedback('')
          }
        }}
        placeholder={t('practice.meaningPlaceholder')}
        disabled={status === 'evaluating'}
        className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-background text-foreground placeholder-foreground-muted/50 resize-none disabled:opacity-60"
      />
      {(status === 'idle' || status === 'evaluating') && (
        <button
          onClick={() => void handleSubmit()}
          disabled={status === 'evaluating' || !answer.trim()}
          className="mt-2 text-xs px-3 py-1.5 rounded-xl bg-accent text-white font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'evaluating' ? t('practice.grading') : t('practice.submit')}
        </button>
      )}
      {status === 'correct' && (
        <p className="mt-2 text-xs font-medium text-green-600 dark:text-green-400">{t('practice.correct')}</p>
      )}
      {status === 'incorrect' && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-red-500 dark:text-red-400 whitespace-pre-line">{feedback}</p>
          <button
            onClick={() => { setStatus('idle'); setFeedback('') }}
            className="text-xs text-accent hover:underline"
          >
            {t('practice.tryAgain')}
          </button>
        </div>
      )}
    </div>
  )
}

function UsageOutputPractice({
  word,
  meanings,
}: {
  word: string
  meanings: Array<{ zh: string; en: string }>
}) {
  const t = useT()
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
      <SectionHeading title={t('practice.heading')} />

      {(sectionStatus === 'idle' || sectionStatus === 'error') && (
        <div>
          <button
            onClick={handleGenerate}
            className="w-full text-sm py-2.5 rounded-xl border border-dashed border-border text-foreground-muted hover:bg-foreground/5 transition-colors"
          >
            {t('practice.generate')}
          </button>
          {sectionStatus === 'error' && (
            <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 text-center">{errorMsg}</p>
          )}
        </div>
      )}

      {sectionStatus === 'generating' && (
        <button
          disabled
          className="w-full text-sm py-2.5 rounded-xl border border-dashed border-border text-foreground-muted flex items-center justify-center gap-2"
        >
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t('practice.generating')}
        </button>
      )}

      {sectionStatus === 'ready' && (
        <div className="space-y-3">
          {exercises.map((ex, i) => {
            const st = exStates[i]
            return (
              <div key={i} className="rounded-xl border border-border/50 p-3">
                <p className="text-xs text-foreground-muted mb-2">
                  <span className="font-semibold text-foreground mr-1">{t('practice.scenario')} {i + 1}</span>
                  {ex.scenario}
                </p>
                <textarea
                  rows={2}
                  value={st.answer}
                  onChange={(e) => updateExState(i, { answer: e.target.value, status: 'idle', feedback: '', correction: '' })}
                  placeholder={t('practice.placeholder')}
                  disabled={st.status === 'evaluating'}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-background text-foreground placeholder-foreground-muted/50 resize-none disabled:opacity-60"
                />

                {(st.status === 'idle' || st.status === 'evaluating') && (
                  <button
                    onClick={() => handleSubmit(i)}
                    disabled={st.status === 'evaluating' || !st.answer.trim()}
                    className="mt-2 text-xs px-3 py-1.5 rounded-xl bg-accent text-white font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {st.status === 'evaluating' ? t('practice.grading') : t('practice.submit')}
                  </button>
                )}

                {st.status === 'correct' && (
                  <p className="mt-2 text-xs font-medium text-green-600 dark:text-green-400">{t('practice.correct')}</p>
                )}

                {st.status === 'incorrect' && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs text-red-500 dark:text-red-400">{st.feedback}</p>
                    <p className="text-xs text-foreground-muted">
                      <span className="font-medium">{t('practice.reference')}</span>{st.correction}
                    </p>
                    <button
                      onClick={() => updateExState(i, { status: 'idle', feedback: '', correction: '' })}
                      className="text-xs text-accent hover:underline"
                    >
                      {t('practice.tryAgain')}
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
