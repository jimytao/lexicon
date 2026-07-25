import type { Mode } from '../../types'
import { useT } from '../../i18n'

interface SegmentedControlProps {
  mode: Mode
  onModeChange: (m: Mode) => void
}

export function SegmentedControl({ mode, onModeChange }: SegmentedControlProps) {
  const t = useT()
  const options = [
    { id: 'instant' as const, label: t('mode.instant') },
    { id: 'ai' as const, label: t('mode.ai') },
    { id: 'core' as const, label: t('mode.core') },
  ]

  const activeIndex = Math.max(0, options.findIndex(opt => opt.id === mode))

  return (
    <div className="segmented-control w-fit mx-auto mb-2 min-w-[270px]">
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
          onMouseDown={(e) => {
            // Prevent input blur and keyboard collapse
            e.preventDefault()
          }}
          onClick={() => onModeChange(option.id)}
          className={`relative z-10 flex-1 py-1.5 px-4 text-xs font-bold transition-colors duration-300 whitespace-nowrap select-none active:scale-95 touch-manipulation flex items-center justify-center ${mode === option.id
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
