import { useState, useEffect } from 'react'
import { getProfile, triggerProfileDiagnostic } from '../../services/profile'
import type { UserLanguageProfile } from '../../types'

interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const [profile, setProfile] = useState<UserLanguageProfile | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setProfile(getProfile())
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const updated = await triggerProfileDiagnostic('high_priority')
      if (updated) {
        setProfile(updated)
      } else {
        setProfile(getProfile())
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  const activeWeaknesses = profile?.weaknessPatterns.filter((w) => w.status !== 'mastered') ?? []
  const masteredWeaknesses = profile?.weaknessPatterns.filter((w) => w.status === 'mastered') ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-background border border-border rounded-3xl max-w-lg w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-background-soft/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xl">
              🧠
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">AI 学习诊断 & 个人画像</h3>
              <p className="text-[11px] text-foreground-muted">
                已总结 {profile?.totalDiagnosticsRun || 0} 次 · 最近更新{' '}
                {profile?.lastUpdated ? new Date(profile.lastUpdated).toLocaleDateString() : '尚未总结'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground-muted hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Weakness Patterns */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">🎯</span>
              <span className="text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest">
                Active 语言薄弱点 ({activeWeaknesses.length})
              </span>
            </div>
            {activeWeaknesses.length === 0 ? (
              <div className="p-4 rounded-2xl border border-dashed border-border text-center text-xs text-foreground-muted">
                暂无诊断出的活跃薄弱点。在搜索中发起 AI 追问或表达订正后，AI 将自动增量分析。
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeWeaknesses.map((w) => (
                  <div
                    key={w.id}
                    className="p-3.5 rounded-2xl bg-background-soft border border-border flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-foreground">{w.description}</span>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                        {w.track} · 暴露 {w.occurrenceCount} 次
                      </span>
                    </div>
                    {w.contrastExample && (
                      <div className="p-2 rounded-xl bg-amber-500/5 border border-amber-500/15 text-[11px] text-foreground-muted font-mono leading-relaxed">
                        <span className="font-bold text-amber-600 dark:text-amber-400">错例对比: </span>
                        {w.contrastExample}
                      </div>
                    )}
                    {w.sourceTrigger && (
                      <p className="text-[10px] text-foreground-muted/70 truncate">
                        来源: {w.sourceTrigger}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mastered / Resolved */}
          {masteredWeaknesses.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">✅</span>
                <span className="text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest">
                  已克服思维盲区 ({masteredWeaknesses.length})
                </span>
              </div>
              <div className="space-y-2">
                {masteredWeaknesses.map((w) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl bg-green-500/5 border border-green-500/10 flex items-center justify-between text-xs text-foreground-muted opacity-80"
                  >
                    <span>{w.description}</span>
                    <span className="text-[9px] font-bold text-green-600 dark:text-green-400">Mastered</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exploration Focus */}
          {profile?.recentExplorationFocus && profile.recentExplorationFocus.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">🔍</span>
                <span className="text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest">
                  近期探索偏好
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {profile.recentExplorationFocus.map((f, i) => (
                  <div key={i} className="p-3 rounded-2xl bg-background-soft border border-border">
                    <span className="text-xs font-bold text-accent block mb-1">{f.category}</span>
                    <div className="flex flex-wrap gap-1">
                      {f.searchedItems.map((item, j) => (
                        <span
                          key={j}
                          className="text-[10px] px-2 py-0.5 rounded-lg bg-background border border-border text-foreground-muted"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {profile?.recommendations && profile.recommendations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">💡</span>
                <span className="text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest">
                  AI 专属拓词推荐
                </span>
              </div>
              <div className="space-y-2">
                {profile.recommendations.map((r, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-2xl bg-accent/5 border border-accent/20 flex flex-col gap-1"
                  >
                    <span className="text-xs font-bold text-accent">{r.conceptOrWord}</span>
                    <p className="text-[11px] text-foreground-muted">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-background-soft/30 flex items-center justify-between shrink-0">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-2"
          >
            {isRefreshing ? 'AI 诊断蒸馏中…' : '🔄 手动触发 AI 重新蒸馏'}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-accent text-white text-xs font-bold shadow-md shadow-accent/20 hover:bg-accent/90 transition-all cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
