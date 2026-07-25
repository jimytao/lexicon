import type { NativeMindModel } from '../../../types'
import { useT } from '../../../i18n'
import { SectionHeading } from '../SectionHeading'

interface NativeMindModelCardProps {
  nativeMindModel?: NativeMindModel
}

export function NativeMindModelCard({ nativeMindModel }: NativeMindModelCardProps) {
  const t = useT()

  if (!nativeMindModel) return null

  const { mentalPicture, emotionalStance, whyChooseThisWord } = nativeMindModel

  return (
    <div className="mb-3.5">
      <SectionHeading title={t('mindmodel.title')} subtitle={t('mindmodel.subtitle')} />

      <div className="space-y-3">
        {mentalPicture && (
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50 mb-1.5">
              {t('mindmodel.mentalPicture')}
            </h3>
            <p className="text-[13px] leading-relaxed text-foreground bg-background-soft/60 p-2.5 rounded-xl border border-border/50">
              {mentalPicture}
            </p>
          </div>
        )}

        {emotionalStance && (
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50 mb-1.5">
              {t('mindmodel.emotionalStance')}
            </h3>
            <p className="text-[13px] leading-relaxed text-foreground bg-background-soft/60 p-2.5 rounded-xl border border-border/50">
              {emotionalStance}
            </p>
          </div>
        )}

        {whyChooseThisWord && (
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground-muted/50 mb-1.5">
              {t('mindmodel.whyChoose')}
            </h3>
            <p className="text-[13px] leading-relaxed text-foreground bg-background-soft/60 p-2.5 rounded-xl border border-border/50">
              {whyChooseThisWord}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
