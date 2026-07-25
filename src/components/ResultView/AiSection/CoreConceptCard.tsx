import type { CoreConcept } from '../../../types'
import { useT } from '../../../i18n'
import { SectionHeading } from '../SectionHeading'

interface CoreConceptCardProps {
  coreConcept?: CoreConcept
  /** memory=Lookup 轻量锚点；usage=Core 用法意象 */
  variant?: 'memory' | 'usage'
}

export function CoreConceptCard({ coreConcept, variant = 'memory' }: CoreConceptCardProps) {
  const t = useT()
  if (!coreConcept || (!coreConcept.image && !coreConcept.explanation)) {
    return null
  }

  const subtitle = variant === 'usage' ? t('coreConcept.usageHint') : t('coreConcept.memoryHint')

  return (
    <div className="mb-3.5">
      <SectionHeading title={t('module.coreConcept')} subtitle={subtitle} />

      <div className="space-y-2 border-l-2 border-l-accent/40 pl-3">
        {coreConcept.image && (
          <p className="text-sm font-semibold text-foreground leading-snug">
            {coreConcept.image}
          </p>
        )}
        {coreConcept.explanation && (
          <p className="text-xs text-foreground-muted leading-relaxed">
            {coreConcept.explanation}
          </p>
        )}
      </div>
    </div>
  )
}
