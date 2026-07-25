import { useState, useEffect } from 'react'
import { getProfile, triggerProfileDiagnostic } from '../../services/profile'
import type { UserLanguageProfile } from '../../types'
import { useT } from '../../i18n'

interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const t = useT()
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
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-background-soft/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xl shrink-0">
              🧠
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-foreground">{t('profile.title')}</h3>
              <p className="text-[11px] text-foreground-muted mt-0.5 leading-snug">
                {t('profile.meta')
                  .replace('{count}', String(profile?.totalDiagnosticsRun || 0))
                  .replace(
                    '{date}',
                    profile?.lastUpdated
                      ? new Date(profile.lastUpdated).toLocaleDateString()
                      : t('profile.neverUpdated'),
                  )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-foreground-muted hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer shrink-0"
            aria-label={t('profile.close')}
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">🎯</span>
              <span className="text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest">
                {t('profile.activeGaps').replace('{count}', String(activeWeaknesses.length))}
              </span>
            </div>
            {activeWeaknesses.length === 0 ? (
              <div className="p-4 rounded-2xl border border-dashed border-border text-center text-xs text-foreground-muted">
                {t('profile.activeEmpty')}
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
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0 whitespace-nowrap">
                        {t('profile.exposure')
                          .replace('{track}', w.track)
                          .replace('{count}', String(w.occurrenceCount))}
                      </span>
                    </div>
                    {w.contrastExample && (
                      <div className="p-2 rounded-xl bg-amber-500/5 border border-amber-500/15 text-[11px] text-foreground-muted font-mono leading-relaxed">
                        <span className="font-bold text-amber-600 dark:text-amber-400">{t('profile.contrast')} </span>
                        {w.contrastExample}
                      </div>
                    )}
                    {w.sourceTrigger && (
                      <p className="text-[10px] text-foreground-muted/70 truncate">
                        {t('profile.source')}: {w.sourceTrigger}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {masteredWeaknesses.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">✅</span>
                <span className="text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest">
                  {t('profile.mastered').replace('{count}', String(masteredWeaknesses.length))}
                </span>
              </div>
              <div className="space-y-2">
                {masteredWeaknesses.map((w) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl bg-green-500/5 border border-green-500/10 flex items-center justify-between text-xs text-foreground-muted opacity-80 gap-2"
                  >
                    <span className="min-w-0">{w.description}</span>
                    <span className="text-[9px] font-bold text-green-600 dark:text-green-400 shrink-0">
                      {t('profile.masteredBadge')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {profile?.recentExplorationFocus && profile.recentExplorationFocus.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">🔍</span>
                <span className="text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest">
                  {t('profile.exploration')}
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

          {profile?.recommendations && profile.recommendations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">💡</span>
                <span className="text-[10px] font-black text-foreground-muted/60 uppercase tracking-widest">
                  {t('profile.recommendations')}
                </span>
              </div>
              <div className="space-y-2">
                {profile.recommendations.map((r, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-2xl bg-background border border-border/60 flex flex-col gap-1"
                  >
                    <span className="text-xs font-bold text-accent">{r.conceptOrWord}</span>
                    <p className="text-[11px] text-foreground-muted leading-snug">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-background-soft/30 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-40 transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap"
          >
            {isRefreshing ? t('profile.refreshing') : t('profile.refresh')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-accent text-white text-xs font-bold shadow-md shadow-accent/20 hover:bg-accent/90 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            {t('profile.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
