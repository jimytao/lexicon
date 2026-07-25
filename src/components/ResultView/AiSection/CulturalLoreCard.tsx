import { useT } from '../../../i18n'
import { SectionHeading } from '../SectionHeading'

const REGISTER_CONFIG: Record<string, { labelKey: string; color: string; darkColor: string }> = {
  formal:    { labelKey: 'culture.register.formal',    color: 'text-blue-600 bg-blue-50 border-blue-200',       darkColor: 'dark:text-blue-300 dark:bg-blue-900/20 dark:border-blue-700/30' },
  informal:  { labelKey: 'culture.register.informal',  color: 'text-emerald-600 bg-emerald-50 border-emerald-200', darkColor: 'dark:text-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700/30' },
  slang:     { labelKey: 'culture.register.slang',     color: 'text-violet-600 bg-violet-50 border-violet-200', darkColor: 'dark:text-violet-300 dark:bg-violet-900/20 dark:border-violet-700/30' },
  technical: { labelKey: 'culture.register.technical', color: 'text-amber-600 bg-amber-50 border-amber-200',   darkColor: 'dark:text-amber-300 dark:bg-amber-900/20 dark:border-amber-700/30' },
  neutral:   { labelKey: 'culture.register.neutral',   color: 'text-gray-500 bg-gray-50 border-gray-200',      darkColor: 'dark:text-gray-400 dark:bg-gray-800/30 dark:border-gray-600/30' },
}

export interface CulturalLoreData {
  title?: string
  content?: string
  register?: string
  subculture?: string
}

interface CulturalLoreCardProps {
  lore: CulturalLoreData
}

export function CulturalLoreCard({ lore }: CulturalLoreCardProps) {
  const t = useT()
  if (!lore.content && !lore.title) return null

  const registerKey = lore.register?.toLowerCase()
  const registerCfg = registerKey ? REGISTER_CONFIG[registerKey] : null

  return (
    <div className="mb-4">
      <SectionHeading title={t('module.culture')} />

      <div className="rounded-xl p-3.5 bg-background-soft/60 border border-border/50">
        {(lore.title || registerCfg) && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {lore.title && (
              <span className="text-xs font-bold text-foreground">
                {lore.title}
              </span>
            )}
            {registerCfg && (
              <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${registerCfg.color} ${registerCfg.darkColor}`}>
                {t(registerCfg.labelKey)}
              </span>
            )}
          </div>
        )}

        {lore.content && (
          <p className="text-sm leading-relaxed text-foreground">
            {lore.content}
          </p>
        )}

        {lore.subculture && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <span className="text-[10px] font-black tracking-widest uppercase text-foreground-muted/50 block mb-1">
              {t('culture.subculture')}
            </span>
            <p className="text-xs text-foreground-muted italic">
              {lore.subculture}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
