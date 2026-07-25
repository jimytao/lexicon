import type { ReactNode } from 'react'

interface SectionHeadingProps {
  title: string
  /** Optional muted line under the title (e.g. memory/usage hint). */
  subtitle?: string
  /** Right-side action slot (generate / repair / etc.). */
  action?: ReactNode
  className?: string
}

/** Unified result-page section title — no decorative dots, no AI pills. */
export function SectionHeading({ title, subtitle, action, className = '' }: SectionHeadingProps) {
  return (
    <div className={`flex items-start justify-between gap-3 mb-3 ${className}`}>
      <div className="min-w-0 flex-1">
        <h2 className="text-[10px] font-black text-foreground-muted/50 uppercase tracking-widest">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 flex items-center">{action}</div>}
    </div>
  )
}
