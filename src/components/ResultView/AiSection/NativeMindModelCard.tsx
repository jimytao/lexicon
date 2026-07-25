import type { NativeMindModel } from '../../../types'
import { useT } from '../../../i18n'

interface NativeMindModelCardProps {
  nativeMindModel?: NativeMindModel
}

export function NativeMindModelCard({ nativeMindModel }: NativeMindModelCardProps) {
  const t = useT()

  if (!nativeMindModel) return null

  const { mentalPicture, emotionalStance, whyChooseThisWord } = nativeMindModel

  return (
    <div className="mb-3.5 rounded-2xl p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200/60 dark:border-amber-900/40 shadow-sm animate-in fade-in duration-300 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute -top-10 -right-10 text-[100px] opacity-[0.03] pointer-events-none select-none text-amber-500 font-serif font-black italic">
        Native
      </div>
      
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 relative z-10">
        <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-sm font-bold shrink-0">
          🧠
        </div>
        <div>
          <h2 className="text-[13px] font-black text-amber-900 dark:text-amber-200 tracking-wider">
            NATIVE MIND MODEL
          </h2>
          <p className="text-[10px] font-medium text-amber-700/70 dark:text-amber-500/70">
            {t('mindmodel.subtitle')}
          </p>
        </div>
      </div>

      <div className="space-y-4 relative z-10">
        {/* Mental Picture */}
        {mentalPicture && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-amber-500 text-xs">📸</span>
              <h3 className="text-xs font-bold text-amber-950/80 dark:text-amber-100/80 uppercase tracking-widest">
                {t('mindmodel.mentalPicture')}
              </h3>
            </div>
            <p className="text-[13px] leading-relaxed text-amber-900 dark:text-amber-100 bg-white/60 dark:bg-black/20 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/50">
              {mentalPicture}
            </p>
          </div>
        )}

        {/* Emotional Stance */}
        {emotionalStance && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-orange-500 text-xs">🎭</span>
              <h3 className="text-xs font-bold text-amber-950/80 dark:text-amber-100/80 uppercase tracking-widest">
                {t('mindmodel.emotionalStance')}
              </h3>
            </div>
            <p className="text-[13px] leading-relaxed text-amber-900 dark:text-amber-100 bg-white/60 dark:bg-black/20 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/50">
              {emotionalStance}
            </p>
          </div>
        )}

        {/* Why Choose This Word */}
        {whyChooseThisWord && (
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-rose-500 text-xs">💡</span>
              <h3 className="text-xs font-bold text-amber-950/80 dark:text-amber-100/80 uppercase tracking-widest">
                {t('mindmodel.whyChoose')}
              </h3>
            </div>
            <p className="text-[13px] leading-relaxed text-amber-900 dark:text-amber-100 bg-white/60 dark:bg-black/20 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/50">
              {whyChooseThisWord}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
