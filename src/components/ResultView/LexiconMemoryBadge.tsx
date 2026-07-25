import { useState, useEffect } from 'react'
import { db } from '../../services/db'
import type { UserWordMemory } from '../../types'

interface LexiconMemoryBadgeProps {
  word: string
  onOpenNotes?: () => void
}

export function LexiconMemoryBadge({ word, onOpenNotes }: LexiconMemoryBadgeProps) {
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

  // Count conversation turns (user messages only), not total message count
  const qaCount = (() => {
    try {
      return memory.aiConversationsJson
        ? (JSON.parse(memory.aiConversationsJson) as any[]).filter((m: any) => m.role === 'user').length
        : 0
    } catch {
      return 0
    }
  })()

  return (
    <div className="flex items-center gap-2 flex-wrap text-[10px]">
      <span className="px-2.5 py-1 rounded-xl bg-background-soft border border-border text-foreground-muted font-medium flex items-center gap-1">
        <span>👁️</span> {memory.searchCount || 1} 次查询
      </span>

      {memory.userNotes && (
        <button
          onClick={onOpenNotes}
          className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 cursor-pointer hover:bg-amber-500/20 transition-all"
        >
          <span>📝</span> 已存笔记
        </button>
      )}

      {qaCount > 0 && (
        <button
          onClick={onOpenNotes}
          className="px-2.5 py-1 rounded-xl bg-accent/10 border border-accent/20 text-accent font-medium flex items-center gap-1 cursor-pointer hover:bg-accent/20 transition-all"
        >
          <span>💬</span> {qaCount} 条 AI 追问历史
        </button>
      )}

      {memory.savedCoreConcept && (
        <span className="px-2.5 py-1 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 font-medium flex items-center gap-1">
          <span>🌌</span> 核心意象已沉淀
        </span>
      )}
    </div>
  )
}
