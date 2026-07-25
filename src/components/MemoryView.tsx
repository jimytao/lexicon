/**
 * SHELVED (2026-07-25): Not mounted in App. Keep for a future Memory tab restore.
 * Do not wire into bottom nav until product decides to ship the weakness board again.
 */
import { useT } from '../i18n'
import { AILearningDigestCard } from './AILearningDigestCard'

interface MemoryViewProps {
  onSelectCoreConcept: (conceptOrWord: string) => void
}

export function MemoryView({ onSelectCoreConcept }: MemoryViewProps) {
  const t = useT()

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-nav-safe max-h-screen overflow-y-auto">
      {/* Header */}
      <div className="px-6 pt-safe pb-4">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('memory.title')}</h2>
        <p className="text-xs text-foreground-muted mt-1 leading-relaxed">{t('memory.desc')}</p>
      </div>

      <div className="px-5 space-y-6 pb-10">
        <AILearningDigestCard onSelectCoreConcept={onSelectCoreConcept} className="my-0" />
      </div>
    </div>
  )
}
