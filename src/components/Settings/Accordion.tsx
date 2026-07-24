import { useState, type ReactNode } from 'react'

interface AccordionProps {
  title: string
  subtitle?: string
  icon?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function Accordion({ title, subtitle, icon, defaultOpen = false, children }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded-2xl border border-border bg-background-soft/60 dark:bg-background-soft/30 overflow-hidden transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-foreground/5 transition-colors cursor-pointer text-left select-none"
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-base shrink-0">{icon}</span>}
          <div>
            <h3 className="text-xs font-bold text-foreground tracking-wide">{title}</h3>
            {subtitle && <p className="text-[11px] text-foreground-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-foreground-muted">
          <span className="text-[10px] font-semibold uppercase">{isOpen ? '收起' : '展开'}</span>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-2 border-t border-border/50 animate-in fade-in duration-200">
          {children}
        </div>
      )}
    </div>
  )
}
