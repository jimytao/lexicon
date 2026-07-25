import { useState } from 'react'
import type { Scene } from '../../../types'
import { useT } from '../../../i18n'
import { SectionHeading } from '../SectionHeading'

interface SemanticSceneProps {
  meanings: Array<{ zh: string; scene: Scene }>
  defaultCollapsed?: boolean
}

export function SemanticScene({ meanings, defaultCollapsed = false }: SemanticSceneProps) {
  const t = useT()
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  return (
    <div className="mb-4">
      <button
        type="button"
        className="w-full text-left cursor-pointer select-none group"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <SectionHeading
          title={t('semantic.heading')}
          action={(
            <span className="flex items-center gap-1 text-[10px] text-foreground-muted group-hover:text-foreground transition-colors">
              {isCollapsed ? t('semantic.expand') : t('semantic.collapse')}
              <svg
                className={`w-3 h-3 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          )}
        />
      </button>

      {!isCollapsed && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {meanings.map((m, i) => (
            <div key={i} className="rounded-lg px-3 py-2.5 bg-background-soft/60 border border-border/40">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-foreground-muted">{i + 1}</span>
                <span className="text-xs font-semibold text-foreground">{m.scene.label}</span>
              </div>
              <p className="text-xs leading-relaxed text-foreground-muted">{m.scene.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
