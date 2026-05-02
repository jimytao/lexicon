import type { Mode } from '../../types'

interface ModeToggleProps {
  mode: Mode
  onModeChange: (m: Mode) => void
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex bg-background-soft p-1 rounded-xl border border-border/50">
      <button
        onClick={() => onModeChange('instant')}
        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
          mode === 'instant'
            ? 'bg-background shadow-sm text-accent border border-border/50'
            : 'text-foreground-muted hover:text-foreground'
        }`}
      >
        Instant
      </button>
      <button
        onClick={() => onModeChange('ai')}
        className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
          mode === 'ai'
            ? 'bg-accent text-white shadow-md shadow-accent/20 border border-transparent'
            : 'text-foreground-muted hover:text-foreground'
        }`}
      >
        AI mode
      </button>
    </div>
  )
}
