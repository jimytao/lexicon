import { useT } from '../../../i18n'

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
    <div className="mb-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
        <h2 className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">
          {t('module.culture')}
        </h2>
      </div>

      <div className="rounded-xl p-3.5 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/20">
        {/* Header row: title tag + register badge */}
        {(lore.title || registerCfg) && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {lore.title && (
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
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

        {/* Main content */}
        {lore.content && (
          <p className="text-sm leading-relaxed text-indigo-900 dark:text-indigo-200">
            {lore.content}
          </p>
        )}

        {/* Subculture note (foreign words only) */}
        {lore.subculture && (
          <div className="mt-3 pt-3 border-t border-indigo-200/30 dark:border-indigo-800/30">
            <span className="text-[10px] font-bold tracking-wider uppercase text-indigo-500 dark:text-indigo-400 block mb-1">
              {t('culture.subculture')}
            </span>
            <p className="text-xs text-indigo-800/80 dark:text-indigo-300/80 italic">
              {lore.subculture}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
