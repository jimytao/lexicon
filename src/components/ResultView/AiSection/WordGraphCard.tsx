import { useState } from 'react'
import type { ConceptGraph, ConceptGraphExample } from '../../../types'
import { useT } from '../../../i18n'
import { conceptGraphNeedsFill } from '../../../utils/aiCompleteness'
import {
  conceptGraphHasVisibleContent,
  shouldShowConceptGraphEmptyState,
} from '../../../utils/coreMindsetPipeline'
import { SectionHeading } from '../SectionHeading'

interface WordGraphCardProps {
  conceptGraph?: ConceptGraph
  /** 模组已开启时由父级传入 true；用于空态判断 */
  wordGraphEnabled?: boolean
  onRepairMissing?: () => Promise<void>
  /** 完全无图时的重拉（区别于只补缺失例句） */
  onRetryGenerate?: () => void
}

function normalizeExample(ex: string | ConceptGraphExample): ConceptGraphExample {
  if (typeof ex === 'string') {
    return { phrase: ex, meaning: '' }
  }
  return {
    phrase: ex.phrase || '',
    meaning: ex.meaning || '',
    mindHint: ex.mindHint,
  }
}

function isUseful(text?: string): text is string {
  if (!text) return false
  const t = text.trim()
  return t.length > 0 && t !== 'N/A' && t !== 'null' && t !== '-'
}

export function WordGraphCard({
  conceptGraph,
  wordGraphEnabled = true,
  onRepairMissing,
  onRetryGenerate,
}: WordGraphCardProps) {
  const t = useT()
  const [repairing, setRepairing] = useState(false)
  const [repairError, setRepairError] = useState<string | null>(null)

  const showEmpty = shouldShowConceptGraphEmptyState({ wordGraphEnabled, conceptGraph })
  const hasContent = conceptGraphHasVisibleContent(conceptGraph)

  if (!wordGraphEnabled) {
    return null
  }

  if (showEmpty || !hasContent) {
    return (
      <div className="mb-3.5">
        <SectionHeading title={t('graph.title')} />
        <p className="text-[11px] text-foreground-muted mb-3 leading-snug">
          {t('repair.graphEmpty')}
        </p>
        {onRetryGenerate && (
          <button
            type="button"
            onClick={onRetryGenerate}
            className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-border text-foreground hover:bg-foreground/5 cursor-pointer whitespace-nowrap"
          >
            {t('repair.retryGraph')}
          </button>
        )}
      </div>
    )
  }

  const { rootCore, branches = [] } = conceptGraph!
  const needsFill = conceptGraphNeedsFill(conceptGraph)

  async function handleRepair() {
    if (!onRepairMissing || repairing) return
    setRepairing(true)
    setRepairError(null)
    try {
      await onRepairMissing()
    } catch (e) {
      setRepairError((e as Error).message || t('repair.failed'))
    } finally {
      setRepairing(false)
    }
  }

  return (
    <div className="mb-3.5">
      <SectionHeading
        title={t('graph.title')}
        action={needsFill && onRepairMissing ? (
          <button
            type="button"
            onClick={() => void handleRepair()}
            disabled={repairing}
            className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-border text-foreground hover:bg-foreground/5 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {repairing ? t('repair.working') : t('repair.fillMissing')}
          </button>
        ) : undefined}
      />
      {needsFill && (
        <p className="text-[11px] text-foreground-muted mb-3 leading-snug">
          {t('repair.graphHint')}
        </p>
      )}
      {repairError && (
        <p className="text-[11px] text-red-500 mb-3">{repairError}</p>
      )}

      {rootCore && (
        <div className="mb-4 px-3 py-2 rounded-xl bg-background-soft/60 border border-border/50">
          <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50 mr-2">
            {t('graph.rootCore')}
          </span>
          <span className="text-sm font-semibold text-foreground">{rootCore}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {branches.map((branch, idx) => (
          <div
            key={idx}
            className="flex flex-col rounded-xl p-3 bg-background-soft/40 border border-border/50"
          >
            <div className="mb-2 pb-1.5 border-b border-border/40">
              <h3 className="text-xs font-bold text-foreground mb-1">
                {branch.category}
              </h3>
              {isUseful(branch.explanation) && (
                <p className="text-[10px] text-foreground-muted leading-snug">
                  {branch.explanation}
                </p>
              )}
            </div>

            <div className="space-y-2 mt-auto">
              {(branch.examples || []).map((raw, exIdx) => {
                const ex = normalizeExample(raw)
                if (!ex.phrase) return null
                return (
                  <div
                    key={exIdx}
                    className="px-2.5 py-2 rounded-lg bg-background border border-border/40"
                  >
                    <p className="text-xs font-semibold text-foreground leading-snug break-words [overflow-wrap:anywhere]">
                      {ex.phrase}
                    </p>
                    {isUseful(ex.meaning) && (
                      <p className="mt-0.5 text-[11px] text-foreground-muted leading-relaxed break-words [overflow-wrap:anywhere]">
                        {ex.meaning}
                      </p>
                    )}
                    {isUseful(ex.mindHint) && (
                      <p className="mt-1 text-[10px] leading-relaxed text-foreground-muted break-words [overflow-wrap:anywhere]">
                        <span className="font-semibold mr-1">{t('graph.mindHint')}</span>
                        {ex.mindHint}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
