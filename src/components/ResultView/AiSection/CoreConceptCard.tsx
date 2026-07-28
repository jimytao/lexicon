import type { CoreConcept } from '../../../types'
import { useT } from '../../../i18n'
import { SectionHeading } from '../SectionHeading'

interface CoreConceptCardProps {
  coreConcept?: CoreConcept
  /** memory=Lookup 轻量锚点；usage=Core 用法意象（可含 feelAnchor / emotionalTone） */
  variant?: 'memory' | 'usage'
}

export function CoreConceptCard({ coreConcept, variant = 'memory' }: CoreConceptCardProps) {
  const t = useT()
  if (
    !coreConcept
    || (
      !coreConcept.image
      && !coreConcept.explanation
      && !coreConcept.gloss
      && !coreConcept.feelAnchor
      && !coreConcept.emotionalTone
    )
  ) {
    return null
  }

  const subtitle = variant === 'usage' ? t('coreConcept.usageHint') : t('coreConcept.memoryHint')

  return (
    <div className="mb-3.5">
      <SectionHeading title={t('module.coreConcept')} subtitle={subtitle} />

      <div className="space-y-2 border-l-2 border-l-accent/40 pl-3">
        {coreConcept.gloss && (
          <p className="text-sm font-semibold text-foreground leading-snug">
            {coreConcept.gloss}
          </p>
        )}
        {coreConcept.image && (
          <p className={`text-sm ${coreConcept.gloss ? 'font-medium text-foreground/90' : 'font-semibold text-foreground'} leading-snug`}>
            {coreConcept.image}
          </p>
        )}
        {coreConcept.explanation && (
          <p className="text-xs text-foreground-muted leading-relaxed">
            {coreConcept.explanation}
          </p>
        )}
        {variant === 'usage' && coreConcept.feelAnchor && (
          <p className="text-[11px] text-foreground-muted leading-relaxed">
            <span className="font-semibold text-foreground/80 mr-1">{t('coreConcept.feelAnchor')}</span>
            {coreConcept.feelAnchor}
          </p>
        )}
        {variant === 'usage' && coreConcept.emotionalTone && (
          <p className="text-[11px] text-foreground-muted leading-relaxed">
            <span className="font-semibold text-foreground/80 mr-1">{t('coreConcept.emotionalTone')}</span>
            {coreConcept.emotionalTone}
          </p>
        )}
      </div>
    </div>
  )
}
