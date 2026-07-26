import type { WordChoiceContrastItem } from '../../../types'
import { useT } from '../../../i18n'
import { SectionHeading } from '../SectionHeading'

interface WordChoiceCardProps {
  wordChoiceContrast?: WordChoiceContrastItem[]
  whyChooseFallback?: string
}

export function WordChoiceCard({ wordChoiceContrast, whyChooseFallback }: WordChoiceCardProps) {
  const t = useT()
  const rows = (wordChoiceContrast ?? []).filter((r) => r.vs?.trim() && r.reason?.trim())
  const fallback = whyChooseFallback?.trim()

  if (rows.length === 0 && !fallback) {
    return (
      <div className="mb-3.5">
        <SectionHeading title={t('module.wordChoice')} subtitle={t('wordChoice.subtitle')} />
        <p className="text-[11px] text-foreground-muted leading-snug">{t('wordChoice.empty')}</p>
      </div>
    )
  }

  return (
    <div className="mb-3.5">
      <SectionHeading title={t('module.wordChoice')} subtitle={t('wordChoice.subtitle')} />
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li
              key={`${row.vs}-${i}`}
              className="rounded-xl border border-border/50 bg-background-soft/40 px-3 py-2.5"
            >
              <p className="text-xs font-semibold text-foreground">
                <span className="text-foreground-muted font-bold mr-1.5">{t('wordChoice.vs')}</span>
                {row.vs}
              </p>
              <p className="mt-1 text-[11px] text-foreground-muted leading-relaxed">{row.reason}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-foreground-muted leading-relaxed whitespace-pre-line">
          {fallback}
        </p>
      )}
    </div>
  )
}
