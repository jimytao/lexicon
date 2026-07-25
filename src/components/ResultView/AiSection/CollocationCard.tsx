import { useState } from 'react'
import type { CollocationData, CollocationEntry } from '../../../types'
import { useT } from '../../../i18n'
import { collocationsNeedFill } from '../../../utils/aiCompleteness'
import { SectionHeading } from '../SectionHeading'

export type CollocationCardVariant = 'all' | 'chunks' | 'collocations'

interface CollocationCardProps {
  collocations?: CollocationData
  /** Word key for repairing missing notes only */
  word?: string
  onRepairMissing?: () => Promise<void>
  /** chunks=介词语组；collocations=其他常用词组；all=两栏（兼容旧调用） */
  variant?: CollocationCardVariant
}

function isUseful(text?: string): text is string {
  if (!text) return false
  const t = text.trim()
  return t.length > 0 && t !== 'N/A' && t !== 'null' && t !== '-'
}

function ChunkRow({ item }: { item: CollocationEntry }) {
  return (
    <div className="rounded-r-xl border-l-2 border-l-border pl-3 pr-2.5 py-2.5 bg-background-soft/40">
      <p className="text-xs font-semibold leading-snug break-words [overflow-wrap:anywhere] text-foreground">
        {item.chunk}
      </p>
      {isUseful(item.note) && (
        <p className="mt-1 text-[11px] leading-relaxed break-words [overflow-wrap:anywhere] text-foreground-muted">
          {item.note}
        </p>
      )}
      {isUseful(item.spatialExtension) && (
        <p className="mt-1 text-[10px] leading-relaxed text-foreground-muted/80 break-words [overflow-wrap:anywhere]">
          {item.spatialExtension}
        </p>
      )}
    </div>
  )
}

export function CollocationCard({
  collocations,
  onRepairMissing,
  variant = 'all',
}: CollocationCardProps) {
  const t = useT()
  const [repairing, setRepairing] = useState(false)
  const [repairError, setRepairError] = useState<string | null>(null)

  if (!collocations) return null

  const chunks = variant === 'collocations' ? [] : (collocations.chunks ?? [])
  const colls = variant === 'chunks' ? [] : (collocations.collocations ?? [])
  if (chunks.length === 0 && colls.length === 0) return null

  const needsFill = collocationsNeedFill({
    chunks,
    collocations: colls,
  })

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

  const heading =
    variant === 'chunks'
      ? t('collocations.headingChunks')
      : variant === 'collocations'
        ? t('collocations.headingCollocations')
        : t('collocations.heading')

  return (
    <div className="mb-3">
      <SectionHeading
        title={heading}
        action={needsFill && onRepairMissing ? (
          <button
            type="button"
            onClick={() => void handleRepair()}
            disabled={repairing}
            className="shrink-0 px-2.5 py-1 text-[10px] font-bold rounded-lg border border-border text-foreground hover:bg-foreground/5 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {repairing ? t('repair.working') : t('repair.fillMissing')}
          </button>
        ) : undefined}
      />
      {needsFill && (
        <p className="text-[11px] text-foreground-muted mb-3 leading-snug">
          {t('repair.collocationsHint')}
        </p>
      )}
      {repairError && (
        <p className="text-[11px] text-red-500 mb-3">{repairError}</p>
      )}

      <div className={variant === 'all' ? 'grid grid-cols-1 md:grid-cols-2 gap-5' : 'space-y-2'}>
        {chunks.length > 0 && (
          <div className="space-y-2.5">
            {variant === 'all' && (
              <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50 pb-1">
                {t('collocations.chunks')}
              </h3>
            )}
            <div className="space-y-2">
              {chunks.map((item, idx) => (
                <ChunkRow key={idx} item={item} />
              ))}
            </div>
          </div>
        )}

        {colls.length > 0 && (
          <div className="space-y-2.5">
            {variant === 'all' && (
              <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50 pb-1">
                {t('collocations.collocations')}
              </h3>
            )}
            <div className="space-y-2">
              {colls.map((item, idx) => (
                <ChunkRow key={idx} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
