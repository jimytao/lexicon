import type { UnnaturalMindModel } from '../../../types'
import { useT } from '../../../i18n'
import { SectionHeading } from '../SectionHeading'

interface UnnaturalMindModelCardProps {
  model: UnnaturalMindModel
}

export function UnnaturalMindModelCard({ model }: UnnaturalMindModelCardProps) {
  const t = useT()
  if (!model || (!model.chineseThought && !model.nativeConcept && !model.reusablePrinciple)) {
    return null
  }

  return (
    <div className="mt-3.5 mb-2">
      <SectionHeading title={t('unnatural.title')} />

      <div className="space-y-2.5 text-xs">
        {model.chineseThought && (
          <div className="space-y-1 p-2.5 rounded-xl border border-border/50 bg-background-soft/40">
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50">
              {t('unnatural.chineseThought')}
            </span>
            <p className="text-foreground leading-relaxed">
              {model.chineseThought}
            </p>
          </div>
        )}

        {model.nativeConcept && (
          <div className="space-y-1 p-2.5 rounded-xl border border-border/50 bg-background-soft/40">
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50">
              {t('unnatural.nativeConcept')}
            </span>
            <p className="text-foreground leading-relaxed">
              {model.nativeConcept}
            </p>
          </div>
        )}

        {model.reusablePrinciple && (
          <div className="space-y-1 p-2.5 rounded-xl border border-border/50 bg-background-soft/40">
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50">
              {t('unnatural.principle')}
            </span>
            <p className="text-foreground leading-relaxed">
              {model.reusablePrinciple}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
