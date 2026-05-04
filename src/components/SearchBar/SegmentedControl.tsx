import type { Mode } from '../../types'

interface SegmentedControlProps {
  mode: Mode
  onModeChange: (m: Mode) => void
}

export function SegmentedControl({ mode, onModeChange }: SegmentedControlProps) {
  const options = [
    { id: 'instant', label: 'Instant' },
    { id: 'ai', label: 'AI Lookup' },
  ]

  const activeIndex = options.findIndex(opt => opt.id === mode)

  return (
    <div className="segmented-control w-fit mx-auto mb-2 min-w-[200px]">
      <div 
        className="segmented-control-slider" 
        style={{ 
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(calc(${activeIndex * 100}%))`
        }} 
      />
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onModeChange(option.id as Mode)}
          className={`relative z-10 flex-1 py-1 px-4 text-xs font-bold transition-colors duration-300 whitespace-nowrap ${
            mode === option.id 
              ? 'text-accent' 
              : 'text-foreground-muted hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
