import { useT } from '../../../i18n'
import { SectionHeading } from '../SectionHeading'

interface UsageScenesCardProps {
  scenes?: Array<{ label: string; description: string }>
  /** lookup=理解向；core=交际意图向 — retained for API compat; styling is neutral */
  tone?: 'lookup' | 'core'
}

export function UsageScenesCard({ scenes }: UsageScenesCardProps) {
  const t = useT()
  if (!scenes || scenes.length === 0) return null

  return (
    <div className="mb-3">
      <SectionHeading title={t('module.usageScenes')} />
      <div className="space-y-2">
        {scenes.map((s, i) => (
          <div
            key={i}
            className="border-l-2 border-l-border bg-background-soft/40 pl-3.5 pr-3 py-2.5 rounded-r-xl"
          >
            <div className="mb-0.5">
              <span className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-xs text-foreground-muted leading-relaxed font-medium break-words [overflow-wrap:anywhere]">
              {s.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
