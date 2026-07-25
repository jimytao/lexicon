import type { Etymology } from '../../../types'
import { useT } from '../../../i18n'
import { SectionHeading } from '../SectionHeading'

interface EtymologyCardProps {
  etymology: Etymology
}

export function EtymologyCard({ etymology }: EtymologyCardProps) {
  const t = useT()
  if (!etymology?.parts) return null
  const anchorParts = etymology.parts.filter(p => p.anchor)

  return (
    <div className="mb-4">
      <SectionHeading title={t('etymology.heading')} />
      <div className="flex flex-wrap gap-1.5 mb-2">
        {etymology.parts.map((part, i) => (
          <div key={i} className="rounded-lg px-2.5 py-1 text-xs bg-background-soft border border-border/50 text-foreground">
            <span className="font-semibold">{part.segment}</span>
            <span className="mx-1 text-foreground-muted/50">·</span>
            <span className="text-foreground-muted">{part.meaning}</span>
            {part.sourceForm && (
              <>
                <span className="mx-1 text-foreground-muted/30">·</span>
                <span className="text-foreground-muted/60 italic">{part.sourceForm}</span>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-foreground-muted leading-relaxed mb-2">{etymology.story}</p>
      {anchorParts.length > 0 && (
        <div className="mb-3 px-2.5 py-2 rounded-lg bg-background-soft/60 border border-border/50">
          <div className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50 mb-1.5">{t('etymology.anchors')}</div>
          <div className="space-y-1.5">
            {anchorParts.map((part, i) => (
              <div key={i} className="text-xs">
                <span className="font-semibold text-foreground">{part.anchor}</span>
                <span className="text-foreground-muted/50 mx-1">←</span>
                <span className="text-foreground-muted italic mr-1.5">{part.segment}</span>
                {part.anchorNote && (
                  <span className="text-foreground-muted">{part.anchorNote}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {etymology.derivedWords && etymology.derivedWords.length > 0 && (
        <div className="space-y-1">
          {etymology.derivedWords.map((dw, i) => (
            <div key={i} className="flex items-baseline gap-2 text-xs">
              <span className="font-semibold text-foreground w-28 shrink-0">{dw.word}</span>
              <span className="text-foreground-muted w-10 shrink-0">{dw.pos}</span>
              <span className="text-foreground-muted">{dw.meaning}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
