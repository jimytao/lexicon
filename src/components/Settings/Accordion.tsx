import { useState, type ReactNode } from 'react'
import { useT } from '../../i18n'

interface AccordionProps {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function Accordion({ title, subtitle, defaultOpen = false, children }: AccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const t = useT()

  return (
    <div className="flex flex-col w-full transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-foreground/5 transition-colors cursor-pointer text-left select-none"
      >
        <div className="flex-1 min-w-0 pr-3">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          {subtitle && <p className="text-[11px] text-foreground-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5 text-foreground-muted shrink-0">
          <span className="text-[10px] font-semibold uppercase">
            {isOpen ? t('semantic.collapse') : t('semantic.expand')}
          </span>
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
