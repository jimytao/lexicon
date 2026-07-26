import { useState, useEffect, type ReactNode } from 'react'
import { db } from '../../services/db'
import type { UserWordMemory } from '../../types'
import { useT } from '../../i18n'
import { countUserQaMessages, getVisibleMemoryBadges } from '../../utils/memoryBadgeVisibility'

interface LexiconMemoryBadgeProps {
  word: string
  onOpenNotes?: () => void
}

function BadgeChip({
  onClick,
  className,
  children,
}: {
  onClick?: () => void
  className: string
  children: ReactNode
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${className} cursor-pointer hover:opacity-90 transition-all`}
      >
        {children}
      </button>
    )
  }
  return <span className={className}>{children}</span>
}

export function LexiconMemoryBadge({ word, onOpenNotes }: LexiconMemoryBadgeProps) {
  const t = useT()
  const [memory, setMemory] = useState<UserWordMemory | null>(null)

  useEffect(() => {
    let isMounted = true
    void db.getUserWordMemory(word).then((mem) => {
      if (isMounted) setMemory(mem)
    })
    return () => {
      isMounted = false
    }
  }, [word])

  if (!memory) return null

  const visible = getVisibleMemoryBadges({
    hasNotes: Boolean(memory.userNotes),
    qaCount: countUserQaMessages(memory.aiConversationsJson),
    hasCoreSaved: Boolean(memory.savedCoreConcept),
  })

  if (visible.length === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap text-[10px]">
      {visible.includes('notes') && (
        <BadgeChip
          onClick={onOpenNotes}
          className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1"
        >
          <span>📝</span> {t('badge.hasNotes')}
        </BadgeChip>
      )}

      {visible.includes('coreSaved') && (
        <span className="px-2.5 py-1 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1">
          <span>🌌</span> {t('badge.coreSaved')}
        </span>
      )}
    </div>
  )
}
